import "server-only";
import type { PoolClient } from "pg";
import { formatMoney } from "./format";

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
