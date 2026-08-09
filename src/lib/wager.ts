import "server-only";
import type { Pool, PoolClient } from "pg";
import { formatMoney } from "./format";

// Minimum gap between a user's bet placements — cheap guardrail against a
// script hammering placePickAction/placeParlayAction, which is worse than
// usual here since a live bet also holds a 10-second server-side wait.
const MIN_SECONDS_BETWEEN_BETS = 2;

export async function enforceBetRateLimit(
  db: Pool | PoolClient,
  userId: string,
): Promise<void> {
  const { rows } = await db.query<{ last_at: Date | null }>(
    `select max(created_at) as last_at from (
       select created_at from picks where user_id = $1
       union all
       select created_at from parlays where user_id = $1
       union all
       select created_at from casino_rounds where user_id = $1
     ) recent`,
    [userId],
  );
  const lastAt = rows[0]?.last_at;
  if (lastAt && Date.now() - new Date(lastAt).getTime() < MIN_SECONDS_BETWEEN_BETS * 1000) {
    throw new Error("Bet rejected: you're placing bets too quickly — wait a couple seconds");
  }
}

// Debits a wager from a user's balance, enforcing their per-user min_balance
// floor instead of a hard floor of $0 — balances can go negative from a
// losing pick, but not past the limit a manager set for that person. Must
// be called inside an open transaction on `client` (uses a row lock so
// concurrent wagers from the same user can't both pass the check).
export async function debitForWager(
  client: PoolClient,
  userId: string,
  wager: number,
): Promise<void> {
  const { rows } = await client.query<{ coin_balance: string; min_balance: string }>(
    "select coin_balance, min_balance from users where id = $1 for update",
    [userId],
  );
  const user = rows[0];
  if (!user) throw new Error("User not found");

  const balance = Number(user.coin_balance);
  const minBalance = Number(user.min_balance);

  if (balance - wager < minBalance) {
    throw new Error(
      `Bet rejected: balance too low — that wager would put you below your minimum of ${formatMoney(minBalance)}`,
    );
  }

  await client.query("update users set coin_balance = coin_balance - $1 where id = $2", [
    wager,
    userId,
  ]);
}

// Sports picks/parlays no longer debit the stake up front (see settle.ts —
// a loss takes the stake at settlement time instead, and a win pays out
// profit only). This validates affordability without touching balance:
// the CURRENT balance must still cover this wager plus every other
// not-yet-debited pending wager, all losing at once, without dropping
// below min_balance. Casino games are unaffected — they resolve instantly
// with no pending window, so they still use debitForWager above. Must be
// called inside an open transaction (uses a row lock so concurrent wagers
// from the same user can't both pass the check using stale numbers).
export async function reserveWager(
  client: PoolClient,
  userId: string,
  wager: number,
): Promise<void> {
  const { rows } = await client.query<{ coin_balance: string; min_balance: string }>(
    "select coin_balance, min_balance from users where id = $1 for update",
    [userId],
  );
  const user = rows[0];
  if (!user) throw new Error("User not found");

  const balance = Number(user.coin_balance);
  const minBalance = Number(user.min_balance);

  const { rows: exposureRows } = await client.query<{ total: string }>(
    `select coalesce(sum(wager), 0) as total from (
       select wager from picks
        where user_id = $1 and status = 'pending' and not is_free_play and not stake_debited
       union all
       select wager from parlays
        where user_id = $1 and status = 'pending' and not is_free_play and not stake_debited
     ) exposure`,
    [userId],
  );
  const existingExposure = Number(exposureRows[0].total);

  if (balance - existingExposure - wager < minBalance) {
    throw new Error(
      `Bet rejected: balance too low — if this and your other pending bets all lost, you'd drop below your minimum of ${formatMoney(minBalance)}`,
    );
  }
}

// Debits a wager from a user's free_play balance instead of coin_balance —
// no min_balance floor applies since free play was never real money;
// it simply can't go negative. Must be called inside an open transaction.
export async function debitFreePlay(
  client: PoolClient,
  userId: string,
  wager: number,
): Promise<void> {
  const { rows } = await client.query(
    "update users set free_play = free_play - $1 where id = $2 and free_play >= $1 returning free_play",
    [wager, userId],
  );
  if (rows.length === 0) {
    throw new Error("Bet rejected: not enough free play for that wager");
  }
}
