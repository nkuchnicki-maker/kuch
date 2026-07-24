"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, blockIfAgentOnly } from "@/lib/auth";
import { americanToDecimal, payoutForOdds, STANDARD_JUICE } from "@/lib/odds";
import {
  debitForWager,
  debitFreePlay,
  enforceBetRateLimit,
  hasOpenPickOnGame,
} from "@/lib/wager";
import { fetchLineSnapshot, holdForLiveBet, type LineSnapshot } from "@/lib/marketLock";
import { refreshLiveGameIfNeeded } from "@/lib/sync";

export async function placePickAction(formData: FormData) {
  const user = await requireUser();
  await blockIfAgentOnly(user);
  await enforceBetRateLimit(db, user.id);

  const gameId = String(formData.get("gameId"));
  const lineId = String(formData.get("lineId"));
  const pickType = String(formData.get("pickType")); // spread | total | moneyline
  const pickSide = String(formData.get("pickSide")); // home | away | over | under
  const wager = Number(formData.get("wager"));
  const isFreePlay = formData.get("isFreePlay") === "true";

  if (!Number.isFinite(wager) || wager <= 0) {
    throw new Error("Bet rejected: wager must be a positive number");
  }

  // Forces a fresh, authoritative score check right now if this game is
  // currently 'live' in our DB — closes the gap where the game actually
  // ended (or a big play just happened) before the next periodic sync
  // would have noticed. No-op/no cost for anything not currently live.
  await refreshLiveGameIfNeeded(db, gameId);

  const { rows: gameRows } = await db.query<{ status: string; start_time: string }>(
    "select status, start_time from games where id = $1",
    [gameId],
  );
  const game = gameRows[0];
  if (!game || !["scheduled", "live"].includes(game.status)) {
    throw new Error("Bet rejected: this game is no longer open for picks");
  }
  // Belt-and-suspenders alongside the /lines page's start_time filter — a
  // stale-rendered pre-match form could otherwise still submit right after
  // kickoff, before the next sync flips status to 'live'.
  if (game.status === "scheduled" && new Date(game.start_time) <= new Date()) {
    throw new Error("Bet rejected: this game already started — check Live Sports for the current line");
  }
  const gameStatus = game.status;

  // Fail fast before wasting a live bet's 10-second hold on a bet that's
  // doomed anyway — re-checked again inside the transaction below.
  if (await hasOpenPickOnGame(db, user.id, gameId)) {
    throw new Error("Bet rejected: you already have an open pick on this game");
  }

  const line = await fetchLineSnapshot(db, lineId);
  if (!line) throw new Error("Bet rejected: line not found");

  const odds =
    pickType === "moneyline"
      ? pickSide === "home"
        ? line.moneylineHome
        : line.moneylineAway
      : STANDARD_JUICE;

  if (odds == null) throw new Error("Bet rejected: odds unavailable for that pick");

  const potentialPayout = payoutForOdds(odds, wager);
  const spreadAtPick = pickType === "spread" ? line.spread : null;
  const totalAtPick = pickType === "total" ? line.total : null;

  // No-op for a pre-match pick — only holds/re-verifies bets on a game
  // that's currently live, since that's the only window where a big play
  // could change the number out from under the bettor.
  await holdForLiveBet(db, [
    { lineId, gameStatus, pickType, pickSide, before: line },
  ]);

  // The game could have finished during the 10-second hold itself — catch
  // that here rather than inserting a pick that would otherwise never get
  // picked up by settlement again (syncs skip games already 'final').
  if (gameStatus === "live") {
    await refreshLiveGameIfNeeded(db, gameId);
    const { rows: postHoldRows } = await db.query<{ status: string }>(
      "select status from games where id = $1",
      [gameId],
    );
    if (postHoldRows[0]?.status !== "live") {
      throw new Error("Bet rejected: this game just ended while your bet was processing");
    }
  }

  const client = await db.connect();
  try {
    await client.query("begin");

    if (isFreePlay) {
      await debitFreePlay(client, user.id, wager);
    } else {
      await debitForWager(client, user.id, wager);
    }

    if (await hasOpenPickOnGame(client, user.id, gameId)) {
      throw new Error("Bet rejected: you already have an open pick on this game");
    }

    const { rows: pickRows } = await client.query<{ id: string }>(
      `insert into picks (
         user_id, game_id, line_id, pick_type, pick_side, wager, potential_payout,
         is_free_play, spread_at_pick, total_at_pick
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id`,
      [
        user.id,
        gameId,
        lineId,
        pickType,
        pickSide,
        wager,
        potentialPayout,
        isFreePlay,
        spreadAtPick,
        totalAtPick,
      ],
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
  await blockIfAgentOnly(user);
  await enforceBetRateLimit(db, user.id);

  if (!Array.isArray(legs) || legs.length < 2) {
    throw new Error("Bet rejected: a parlay needs at least 2 picks");
  }
  if (!Number.isFinite(wager) || wager <= 0) {
    throw new Error("Bet rejected: wager must be a positive number");
  }
  if (new Set(legs.map((l) => l.gameId)).size !== legs.length) {
    throw new Error("Bet rejected: can't include two picks from the same game in a parlay");
  }

  // Re-derive real odds server-side for every leg — never trust odds from
  // the client, same principle as the single-pick actions above.
  const resolvedLegs: (ParlayLegInput & {
    odds: number;
    gameStatus: string;
    spreadAtPick: number | null;
    totalAtPick: number | null;
    snapshot: LineSnapshot;
  })[] = [];

  for (const leg of legs) {
    await refreshLiveGameIfNeeded(db, leg.gameId);

    const { rows: gameRows } = await db.query<{ status: string; start_time: string }>(
      "select status, start_time from games where id = $1",
      [leg.gameId],
    );
    const legGame = gameRows[0];
    if (!legGame || !["scheduled", "live"].includes(legGame.status)) {
      throw new Error("Bet rejected: one of your picks is no longer open");
    }
    if (legGame.status === "scheduled" && new Date(legGame.start_time) <= new Date()) {
      throw new Error("Bet rejected: one of your picks already started — check Live Sports for the current line");
    }
    const gameStatus = legGame.status;

    if (await hasOpenPickOnGame(db, user.id, leg.gameId)) {
      throw new Error("Bet rejected: you already have an open pick on one of these games");
    }

    let odds: number | null;
    let snapshot: LineSnapshot;

    if (leg.pickType === "outright") {
      const { rows } = await db.query<{
        outrights: { name: string; odds: number }[] | null;
      }>("select outrights from lines where id = $1", [leg.lineId]);
      odds = rows[0]?.outrights?.find((p) => p.name === leg.pickSide)?.odds ?? null;
      // Golf never goes live, so there's nothing to hold/lock for it.
      snapshot = {
        spread: null,
        total: null,
        moneylineHome: null,
        moneylineAway: null,
        lockedUntil: null,
      };
    } else {
      const snap = await fetchLineSnapshot(db, leg.lineId);
      if (!snap) throw new Error("Bet rejected: line not found for one of your picks");
      snapshot = snap;
      odds =
        leg.pickType === "moneyline"
          ? leg.pickSide === "home"
            ? snap.moneylineHome
            : snap.moneylineAway
          : STANDARD_JUICE;
    }

    if (odds == null) throw new Error("Bet rejected: odds unavailable for one of your picks");

    resolvedLegs.push({
      ...leg,
      odds,
      gameStatus,
      spreadAtPick: leg.pickType === "spread" ? snapshot.spread : null,
      totalAtPick: leg.pickType === "total" ? snapshot.total : null,
      snapshot,
    });
  }

  const combinedDecimal = resolvedLegs.reduce(
    (acc, l) => acc * americanToDecimal(l.odds),
    1,
  );
  const potentialPayout = wager * combinedDecimal;

  // No-op unless at least one leg is on a currently-live game — holds once
  // for the whole parlay (not once per leg) and re-verifies every live leg
  // after the single wait.
  await holdForLiveBet(
    db,
    resolvedLegs.map((l) => ({
      lineId: l.lineId,
      gameStatus: l.gameStatus,
      pickType: l.pickType,
      pickSide: l.pickSide,
      before: l.snapshot,
    })),
  );

  // Same mid-hold-completion check as the single-pick path, per live leg —
  // reject the whole parlay if any live leg's game just ended.
  for (const leg of resolvedLegs) {
    if (leg.gameStatus !== "live") continue;
    await refreshLiveGameIfNeeded(db, leg.gameId);
    const { rows: postHoldRows } = await db.query<{ status: string }>(
      "select status from games where id = $1",
      [leg.gameId],
    );
    if (postHoldRows[0]?.status !== "live") {
      throw new Error("Bet rejected: one of your live picks' games just ended while your bet was processing");
    }
  }

  const client = await db.connect();
  try {
    await client.query("begin");

    if (isFreePlay) {
      await debitFreePlay(client, user.id, wager);
    } else {
      await debitForWager(client, user.id, wager);
    }

    for (const leg of resolvedLegs) {
      if (await hasOpenPickOnGame(client, user.id, leg.gameId)) {
        throw new Error("Bet rejected: you already have an open pick on one of these games");
      }
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
        `insert into parlay_legs (
           parlay_id, game_id, line_id, pick_type, pick_side, odds,
           spread_at_pick, total_at_pick
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          parlayId,
          leg.gameId,
          leg.lineId,
          leg.pickType,
          leg.pickSide,
          leg.odds,
          leg.spreadAtPick,
          leg.totalAtPick,
        ],
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
  await blockIfAgentOnly(user);
  await enforceBetRateLimit(db, user.id);

  const gameId = String(formData.get("gameId"));
  const lineId = String(formData.get("lineId"));
  const participantName = String(formData.get("participantName"));
  const wager = Number(formData.get("wager"));
  const isFreePlay = formData.get("isFreePlay") === "true";

  if (!participantName) throw new Error("Bet rejected: pick a player");
  if (!Number.isFinite(wager) || wager <= 0) {
    throw new Error("Bet rejected: wager must be a positive number");
  }

  const { rows: gameRows } = await db.query<{ status: string }>(
    "select status from games where id = $1",
    [gameId],
  );
  if (!gameRows[0] || gameRows[0].status !== "scheduled") {
    throw new Error("Bet rejected: this event is no longer open for picks");
  }

  if (await hasOpenPickOnGame(db, user.id, gameId)) {
    throw new Error("Bet rejected: you already have an open pick on this event");
  }

  const { rows: lineRows } = await db.query<{
    outrights: { name: string; odds: number }[] | null;
  }>("select outrights from lines where id = $1", [lineId]);
  const participant = lineRows[0]?.outrights?.find(
    (p) => p.name === participantName,
  );
  if (!participant) throw new Error("Bet rejected: player not found in this field");

  const potentialPayout = payoutForOdds(participant.odds, wager);

  const client = await db.connect();
  try {
    await client.query("begin");

    if (isFreePlay) {
      await debitFreePlay(client, user.id, wager);
    } else {
      await debitForWager(client, user.id, wager);
    }

    if (await hasOpenPickOnGame(client, user.id, gameId)) {
      throw new Error("Bet rejected: you already have an open pick on this event");
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
