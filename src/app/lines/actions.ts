"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { payoutForOdds, STANDARD_JUICE } from "@/lib/odds";

export async function placePickAction(formData: FormData) {
  const user = await requireUser();

  const gameId = String(formData.get("gameId"));
  const lineId = String(formData.get("lineId"));
  const pickType = String(formData.get("pickType")); // spread | total | moneyline
  const pickSide = String(formData.get("pickSide")); // home | away | over | under
  const wager = Number(formData.get("wager"));

  if (!Number.isFinite(wager) || wager <= 0) {
    throw new Error("Wager must be a positive number");
  }

  const { rows: gameRows } = await db.query<{ status: string }>(
    "select status from games where id = $1",
    [gameId],
  );
  if (!gameRows[0] || gameRows[0].status !== "scheduled") {
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

    const { rows: debited } = await client.query(
      `update users set coin_balance = coin_balance - $1
       where id = $2 and coin_balance >= $1
       returning coin_balance`,
      [wager, user.id],
    );
    if (debited.length === 0) {
      throw new Error("Not enough coins for that wager");
    }

    const { rows: pickRows } = await client.query<{ id: string }>(
      `insert into picks (user_id, game_id, line_id, pick_type, pick_side, wager, potential_payout)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [user.id, gameId, lineId, pickType, pickSide, wager, potentialPayout],
    );

    await client.query(
      `insert into coin_transactions (user_id, amount, reason, related_pick_id)
       values ($1, $2, 'pick_wager', $3)`,
      [user.id, -wager, pickRows[0].id],
    );

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

    const { rows: debited } = await client.query(
      `update users set coin_balance = coin_balance - $1
       where id = $2 and coin_balance >= $1
       returning coin_balance`,
      [wager, user.id],
    );
    if (debited.length === 0) {
      throw new Error("Not enough coins for that wager");
    }

    const { rows: pickRows } = await client.query<{ id: string }>(
      `insert into picks (user_id, game_id, line_id, pick_type, pick_side, wager, potential_payout)
       values ($1, $2, $3, 'outright', $4, $5, $6)
       returning id`,
      [user.id, gameId, lineId, participantName, wager, potentialPayout],
    );

    await client.query(
      `insert into coin_transactions (user_id, amount, reason, related_pick_id)
       values ($1, $2, 'pick_wager', $3)`,
      [user.id, -wager, pickRows[0].id],
    );

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
