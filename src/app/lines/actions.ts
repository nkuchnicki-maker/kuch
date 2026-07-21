"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { americanToDecimal, payoutForOdds, STANDARD_JUICE } from "@/lib/odds";
import { debitForWager, debitFreePlay } from "@/lib/wager";

export async function placePickAction(formData: FormData) {
  const user = await requireUser();

  const gameId = String(formData.get("gameId"));
  const lineId = String(formData.get("lineId"));
  const pickType = String(formData.get("pickType")); // spread | total | moneyline
  const pickSide = String(formData.get("pickSide")); // home | away | over | under
  const wager = Number(formData.get("wager"));
  const isFreePlay = formData.get("isFreePlay") === "true";

  if (!Number.isFinite(wager) || wager <= 0) {
    throw new Error("Wager must be a positive number");
  }

  const { rows: gameRows } = await db.query<{ status: string }>(
    "select status from games where id = $1",
    [gameId],
  );
  if (!gameRows[0] || !["scheduled", "live"].includes(gameRows[0].status)) {
    throw new Error("This game is no longer open for picks");
  }

  const { rows: lineRows } = await db.query<{
    moneyline_home: number | null;
    moneyline_away: number | null;
  }>("select moneyline_home, moneyline_away from lines where id = $1", [lineId]);
  const line = lineRows[0];
  if (!line) throw new Error("Line not found");

  const odds =
    pickType === "moneyline"
      ? pickSide === "home"
        ? line.moneyline_home
        : line.moneyline_away
      : STANDARD_JUICE;

  if (odds == null) throw new Error("Odds unavailable for that pick");

  const potentialPayout = payoutForOdds(odds, wager);

  const client = await db.connect();
  try {
    await client.query("begin");

    if (isFreePlay) {
      await debitFreePlay(client, user.id, wager);
    } else {
      await debitForWager(client, user.id, wager);
    }

    const { rows: pickRows } = await client.query<{ id: string }>(
      `insert into picks (user_id, game_id, line_id, pick_type, pick_side, wager, potential_payout, is_free_play)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [user.id, gameId, lineId, pickType, pickSide, wager, potentialPayout, isFreePlay],
    );

    // Free-play wagers don't touch coin_balance, so no coin_transactions
    // entry — that table's amounts must sum exactly to coin_balance changes
    // (weeklyReset/history reconstruct balances from it).
    if (!isFreePlay) {
      await client.query(
        `insert into coin_transactions (user_id, amount, reason, related_pick_id)
         values ($1, $2, 'pick_wager', $3)`,
        [user.id, -wager, pickRows[0].id],
      );
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  revalidatePath("/lines");
  revalidatePath("/leaderboard");
  revalidatePath("/picks");
}

export type ParlayLegInput = {
  gameId: string;
  lineId: string;
  pickType: string;
  pickSide: string;
};

// Called directly from the bet slip client component (not a <form action>),
// so it takes a plain argument rather than FormData.
export async function placeParlayAction(
  legs: ParlayLegInput[],
  wager: number,
  isFreePlay = false,
) {
  const user = await requireUser();

  if (!Array.isArray(legs) || legs.length < 2) {
    throw new Error("A parlay needs at least 2 picks");
  }
  if (!Number.isFinite(wager) || wager <= 0) {
    throw new Error("Wager must be a positive number");
  }
  if (new Set(legs.map((l) => l.gameId)).size !== legs.length) {
    throw new Error("Can't include two picks from the same game in a parlay");
  }

  // Re-derive real odds server-side for every leg — never trust odds from
  // the client, same principle as the single-pick actions above.
  const resolvedLegs: (ParlayLegInput & { odds: number })[] = [];
  for (const leg of legs) {
    const { rows: gameRows } = await db.query<{ status: string }>(
      "select status from games where id = $1",
      [leg.gameId],
    );
    if (!gameRows[0] || !["scheduled", "live"].includes(gameRows[0].status)) {
      throw new Error("One of your picks is no longer open");
    }

    let odds: number | null;
    if (leg.pickType === "outright") {
      const { rows } = await db.query<{
        outrights: { name: string; odds: number }[] | null;
      }>("select outrights from lines where id = $1", [leg.lineId]);
      odds = rows[0]?.outrights?.find((p) => p.name === leg.pickSide)?.odds ?? null;
    } else if (leg.pickType === "moneyline") {
      const { rows } = await db.query<{
        moneyline_home: number | null;
        moneyline_away: number | null;
      }>("select moneyline_home, moneyline_away from lines where id = $1", [
        leg.lineId,
      ]);
      const line = rows[0];
      odds = line ? (leg.pickSide === "home" ? line.moneyline_home : line.moneyline_away) : null;
    } else {
      odds = STANDARD_JUICE;
    }

    if (odds == null) throw new Error("Odds unavailable for one of your picks");
    resolvedLegs.push({ ...leg, odds });
  }

  const combinedDecimal = resolvedLegs.reduce(
    (acc, l) => acc * americanToDecimal(l.odds),
    1,
  );
  const potentialPayout = wager * combinedDecimal;

  const client = await db.connect();
  try {
    await client.query("begin");

    if (isFreePlay) {
      await debitFreePlay(client, user.id, wager);
    } else {
      await debitForWager(client, user.id, wager);
    }

    const { rows: parlayRows } = await client.query<{ id: string }>(
      `insert into parlays (user_id, wager, potential_payout, is_free_play)
       values ($1, $2, $3, $4)
       returning id`,
      [user.id, wager, potentialPayout, isFreePlay],
    );
    const parlayId = parlayRows[0].id;

    for (const leg of resolvedLegs) {
      await client.query(
        `insert into parlay_legs (parlay_id, game_id, line_id, pick_type, pick_side, odds)
         values ($1, $2, $3, $4, $5, $6)`,
        [parlayId, leg.gameId, leg.lineId, leg.pickType, leg.pickSide, leg.odds],
      );
    }

    if (!isFreePlay) {
      await client.query(
        `insert into coin_transactions (user_id, amount, reason, related_parlay_id)
         values ($1, $2, 'pick_wager', $3)`,
        [user.id, -wager, parlayId],
      );
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  revalidatePath("/lines");
  revalidatePath("/leaderboard");
  revalidatePath("/picks");
}

export async function placeOutrightPickAction(formData: FormData) {
  const user = await requireUser();

  const gameId = String(formData.get("gameId"));
  const lineId = String(formData.get("lineId"));
  const participantName = String(formData.get("participantName"));
  const wager = Number(formData.get("wager"));
  const isFreePlay = formData.get("isFreePlay") === "true";

  if (!participantName) throw new Error("Pick a player");
  if (!Number.isFinite(wager) || wager <= 0) {
    throw new Error("Wager must be a positive number");
  }

  const { rows: gameRows } = await db.query<{ status: string }>(
    "select status from games where id = $1",
    [gameId],
  );
  if (!gameRows[0] || gameRows[0].status !== "scheduled") {
    throw new Error("This event is no longer open for picks");
  }

  const { rows: lineRows } = await db.query<{
    outrights: { name: string; odds: number }[] | null;
  }>("select outrights from lines where id = $1", [lineId]);
  const participant = lineRows[0]?.outrights?.find(
    (p) => p.name === participantName,
  );
  if (!participant) throw new Error("Player not found in this field");

  const potentialPayout = payoutForOdds(participant.odds, wager);

  const client = await db.connect();
  try {
    await client.query("begin");

    if (isFreePlay) {
      await debitFreePlay(client, user.id, wager);
    } else {
      await debitForWager(client, user.id, wager);
    }

    const { rows: pickRows } = await client.query<{ id: string }>(
      `insert into picks (user_id, game_id, line_id, pick_type, pick_side, wager, potential_payout, is_free_play)
       values ($1, $2, $3, 'outright', $4, $5, $6, $7)
       returning id`,
      [user.id, gameId, lineId, participantName, wager, potentialPayout, isFreePlay],
    );

    if (!isFreePlay) {
      await client.query(
        `insert into coin_transactions (user_id, amount, reason, related_pick_id)
         values ($1, $2, 'pick_wager', $3)`,
        [user.id, -wager, pickRows[0].id],
      );
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  revalidatePath("/lines");
  revalidatePath("/leaderboard");
  revalidatePath("/picks");
}
