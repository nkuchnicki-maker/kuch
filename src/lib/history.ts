import "server-only";
import type { Pool } from "pg";

export type WeeklyHistoryRow = {
  userId: string;
  username: string;
  displayName: string;
  weekEnding: string; // ISO timestamp of the reset that closed this week
  endingBalance: number;
  netChange: number;
};

// Reconstructs every user's balance at the end of every past (already
// reset) week, purely from the coin_transactions audit log — no separate
// history table needed. Each weekly_reset writes the same created_at for
// every user (single transaction, and now() is stable within it), so those
// distinct timestamps are the week boundaries.
//
// A user's balance right before boundary T = their current coin_balance
// minus everything that happened at-or-after T (working backwards from the
// one number we know is authoritative). That sidesteps needing to know
// what a user's balance was when they were first created.
export async function getWeeklyHistory(db: Pool): Promise<WeeklyHistoryRow[]> {
  const { rows: boundaryRows } = await db.query<{ boundary_at: Date }>(
    `select distinct created_at as boundary_at
     from coin_transactions
     where reason = 'weekly_reset'
     order by boundary_at asc`,
  );
  const boundaries = boundaryRows.map((r) => r.boundary_at.getTime());
  if (boundaries.length === 0) return [];

  const { rows: users } = await db.query<{
    id: string;
    username: string;
    display_name: string;
    coin_balance: string;
    created_at: Date;
  }>("select id, username, display_name, coin_balance, created_at from users order by display_name");

  const { rows: txns } = await db.query<{
    user_id: string;
    amount: string;
    created_at: Date;
  }>("select user_id, amount, created_at from coin_transactions order by created_at asc");

  const txnsByUser = new Map<string, { amount: number; createdAt: number }[]>();
  for (const t of txns) {
    const list = txnsByUser.get(t.user_id) ?? [];
    list.push({ amount: Number(t.amount), createdAt: t.created_at.getTime() });
    txnsByUser.set(t.user_id, list);
  }

  const history: WeeklyHistoryRow[] = [];
  for (const u of users) {
    const userTxns = txnsByUser.get(u.id) ?? [];
    const currentBalance = Number(u.coin_balance);

    let prevBoundary = u.created_at.getTime();
    for (const boundary of boundaries) {
      const endingBalance =
        currentBalance -
        userTxns
          .filter((t) => t.createdAt >= boundary)
          .reduce((sum, t) => sum + t.amount, 0);

      const netChange = userTxns
        .filter((t) => t.createdAt > prevBoundary && t.createdAt < boundary)
        .reduce((sum, t) => sum + t.amount, 0);

      history.push({
        userId: u.id,
        username: u.username,
        displayName: u.display_name,
        weekEnding: new Date(boundary).toISOString(),
        endingBalance,
        netChange,
      });

      prevBoundary = boundary;
    }
  }

  return history;
}
