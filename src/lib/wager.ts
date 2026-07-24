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
    throw new Error("You're placing bets too quickly — wait a couple seconds and try again");
  }
}

// True if the user already has a pending straight pick or parlay leg on
// this game — blocks stacking correlated bets (e.g. spread + moneyline on
// the same side) across separate tickets, not just within one parlay.
export async function hasOpenPickOnGame(
  db: Pool | PoolClient,
  userId: string,
  gameId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ exists: boolean }>(
    `select exists(
       select 1 from picks where user_id = $1 and game_id = $2 and status = 'pending'
       union all
       select 1 from parlay_legs pl
       join parlays p on p.id = pl.parlay_id
       where p.user_id = $1 and pl.game_id = $2 and pl.status = 'pending'
     ) as exists`,
    [userId, gameId],
  );
  return rows[0]?.exists ?? false;
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
      `That wager would take you below your minimum balance of ${formatMoney(minBalance)}`,
    );
  }

  await client.query("update users set coin_balance = coin_balance - $1 where id = $2", [
    wager,
    userId,
  ]);
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
    throw new Error("Not enough free play for that wager");
  }
}
