"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, blockIfAgentOnly } from "@/lib/auth";
import { debitForWager, debitFreePlay, enforceBetRateLimit } from "@/lib/wager";
import { spinRoulette, type RouletteBetType } from "@/lib/casino/roulette";
import { playBaccaratRound, type BaccaratBetType } from "@/lib/casino/baccarat";
import {
  dealBlackjackHand,
  hitBlackjackHand,
  standBlackjackHand,
  type BlackjackDealResult,
  type BlackjackHitResult,
  type BlackjackResolution,
} from "@/lib/casino/blackjack";

function validateWager(wager: number) {
  if (!Number.isFinite(wager) || wager <= 0) {
    throw new Error("Wager must be a positive number");
  }
}

type CasinoGame = "blackjack" | "roulette" | "baccarat";
type CasinoOutcome = "win" | "loss" | "push";

// Debits the wager only — used by both the instant games (which debit and
// resolve in a single call) and blackjack's deal step, which has to commit
// the bet up front even though the hand might not resolve for another
// call or two.
async function debitCasinoWager(userId: string, wager: number, isFreePlay: boolean): Promise<void> {
  const client = await db.connect();
  try {
    await client.query("begin");
    if (isFreePlay) {
      await debitFreePlay(client, userId, wager);
      // Free-play wagers don't touch coin_balance, so no coin_transactions
      // entry — that table's amounts must sum exactly to coin_balance
      // changes (weeklyReset/history reconstruct balances from it).
    } else {
      await debitForWager(client, userId, wager);
      await client.query(
        `insert into coin_transactions (user_id, amount, reason) values ($1, $2, 'casino_wager')`,
        [userId, -wager],
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

// Records the finished round and credits any payout. Assumes the wager
// was already debited (by debitCasinoWager, above) — never debits again.
async function creditCasinoRound(
  userId: string,
  game: CasinoGame,
  wager: number,
  isFreePlay: boolean,
  outcome: CasinoOutcome,
  payoutMultiplier: number,
  detail: unknown,
): Promise<void> {
  const payout = wager * payoutMultiplier;

  const client = await db.connect();
  try {
    await client.query("begin");

    const { rows } = await client.query<{ id: string }>(
      `insert into casino_rounds (user_id, game, wager, payout, outcome, is_free_play, detail)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [userId, game, wager, payout, outcome, isFreePlay, JSON.stringify(detail)],
    );
    const roundId = rows[0].id;

    if (!isFreePlay) {
      if (payout > 0) {
        await client.query(
          `insert into coin_transactions (user_id, amount, reason, related_casino_round_id)
           values ($1, $2, 'casino_payout', $3)`,
          [userId, payout, roundId],
        );
        await client.query("update users set coin_balance = coin_balance + $1 where id = $2", [
          payout,
          userId,
        ]);
      }
    } else if (outcome === "push") {
      // Free play mirrors the sports-betting rule: a push just gives the
      // free-play stake back, not real coins.
      await client.query("update users set free_play = free_play + $1 where id = $2", [
        wager,
        userId,
      ]);
    } else if (payout > 0) {
      // A free-play win only turns the PROFIT into real coin_balance.
      const profit = payout - wager;
      if (profit > 0) {
        await client.query(
          `insert into coin_transactions (user_id, amount, reason, related_casino_round_id)
           values ($1, $2, 'casino_fp_payout', $3)`,
          [userId, profit, roundId],
        );
        await client.query("update users set coin_balance = coin_balance + $1 where id = $2", [
          profit,
          userId,
        ]);
      }
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  revalidatePath("/casino");
  revalidatePath("/leaderboard");
}

// Instant games (roulette, baccarat): debit and resolve in one call.
async function playInstantRound(
  userId: string,
  game: CasinoGame,
  wager: number,
  isFreePlay: boolean,
  outcome: CasinoOutcome,
  payoutMultiplier: number,
  detail: unknown,
): Promise<void> {
  await debitCasinoWager(userId, wager, isFreePlay);
  await creditCasinoRound(userId, game, wager, isFreePlay, outcome, payoutMultiplier, detail);
}

export async function placeRouletteBetAction(
  betType: RouletteBetType,
  betNumber: number | undefined,
  wager: number,
  isFreePlay = false,
) {
  const user = await requireUser();
  await blockIfAgentOnly(user);
  validateWager(wager);
  await enforceBetRateLimit(db, user.id);

  if (
    betType === "number" &&
    (betNumber == null || !Number.isInteger(betNumber) || betNumber < 0 || betNumber > 36)
  ) {
    throw new Error("Pick a number from 0-36");
  }

  const result = spinRoulette(betType, betType === "number" ? betNumber : undefined);

  await playInstantRound(user.id, "roulette", wager, isFreePlay, result.outcome, result.payoutMultiplier, {
    betType,
    betNumber: betType === "number" ? betNumber : null,
    winningNumber: result.winningNumber,
  });

  return result;
}

export async function placeBaccaratBetAction(
  betType: BaccaratBetType,
  wager: number,
  isFreePlay = false,
) {
  const user = await requireUser();
  await blockIfAgentOnly(user);
  validateWager(wager);
  await enforceBetRateLimit(db, user.id);

  const result = playBaccaratRound(betType);

  await playInstantRound(user.id, "baccarat", wager, isFreePlay, result.outcome, result.payoutMultiplier, {
    betType,
    result: result.result,
    playerCards: result.playerCards,
    bankerCards: result.bankerCards,
  });

  return result;
}

export async function dealBlackjackAction(
  wager: number,
  isFreePlay = false,
): Promise<BlackjackDealResult> {
  const user = await requireUser();
  await blockIfAgentOnly(user);
  validateWager(wager);
  await enforceBetRateLimit(db, user.id);

  // The wager is committed the moment cards are dealt, same as a real
  // casino bet — win/loss is decided later (possibly a call or two from
  // now), but the stake is already on the table.
  await debitCasinoWager(user.id, wager, isFreePlay);

  const result = dealBlackjackHand(user.id, wager, isFreePlay);

  if (result.finished) {
    await creditCasinoRound(user.id, "blackjack", wager, isFreePlay, result.outcome, result.payoutMultiplier, {
      playerCards: result.playerCards,
      dealerCards: result.dealerCards,
    });
  }

  return result;
}

export async function hitBlackjackAction(token: string): Promise<BlackjackHitResult> {
  const user = await requireUser();
  await blockIfAgentOnly(user);

  const result = hitBlackjackHand(token, user.id);
  if (!result) throw new Error("This hand is no longer valid — start a new one");

  if (result.finished) {
    await creditCasinoRound(
      user.id,
      "blackjack",
      result.wager,
      result.isFreePlay,
      result.outcome,
      result.payoutMultiplier,
      { playerCards: result.playerCards, dealerCards: result.dealerCards },
    );
  }

  return result;
}

export async function standBlackjackAction(token: string): Promise<BlackjackResolution> {
  const user = await requireUser();
  await blockIfAgentOnly(user);

  const result = standBlackjackHand(token, user.id);
  if (!result) throw new Error("This hand is no longer valid — start a new one");

  await creditCasinoRound(
    user.id,
    "blackjack",
    result.wager,
    result.isFreePlay,
    result.outcome,
    result.payoutMultiplier,
    { playerCards: result.playerCards, dealerCards: result.dealerCards },
  );

  return result;
}
