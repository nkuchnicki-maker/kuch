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
  }>(
    // Admin/Test are utility accounts, not real players — same exclusion
    // as the leaderboard, so they don't skew an agent's all-time net with
    // dev/testing activity.
    "select id, username, display_name, coin_balance, created_at from users where not is_admin and username <> 'Test' order by display_name",
  );

  const { rows: txns } = await db.query<{
    user_id: string;
    amount: string;
    reason: string;
    created_at: Date;
  }>("select user_id, amount, reason, created_at from coin_transactions order by created_at asc");

  const txnsByUser = new Map<string, { amount: number; reason: string; createdAt: number }[]>();
  for (const t of txns) {
    const list = txnsByUser.get(t.user_id) ?? [];
    list.push({ amount: Number(t.amount), reason: t.reason, createdAt: t.created_at.getTime() });
    txnsByUser.set(t.user_id, list);
  }

  const history: WeeklyHistoryRow[] = [];
  for (const u of users) {
    const userTxns = txnsByUser.get(u.id) ?? [];
    const currentBalance = Number(u.coin_balance);

    let prevBoundary = u.created_at.getTime();
    for (const boundary of boundaries) {
      // Every transaction at-or-after the boundary, including corrective
      // ones, must be unwound to reconstruct the real balance at that
      // point in time.
      const endingBalance =
        currentBalance -
        userTxns
          .filter((t) => t.createdAt >= boundary)
          .reduce((sum, t) => sum + t.amount, 0);

      // Net change excludes 'reset_correction' as well as 'weekly_reset' —
      // both are administrative balance adjustments, not real betting
      // results, so they shouldn't count toward a week's (or all-time)
      // net. weekly_reset entries land exactly on a boundary already and
      // get excluded by the time filter below; reset_correction rows are
      // timestamped slightly after and need an explicit exclusion or they
      // double-count whatever week they were correcting.
      const netChange = userTxns
        .filter(
          (t) =>
            t.createdAt > prevBoundary &&
            t.createdAt < boundary &&
            t.reason !== "reset_correction",
        )
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

// The week currently in progress (since the last reset, or ever if none
// yet) — used to be shown on the Leaderboard tab, which is now hidden from
// nav, so History surfaces it too instead of only ever showing completed
// past weeks. Reuses weekly_standings, which already has the same
// Admin/Test/agent exclusions as the rest of this file.
export const CURRENT_WEEK_SENTINEL = "current";

export async function getCurrentWeekRows(db: Pool): Promise<WeeklyHistoryRow[]> {
  const { rows } = await db.query<{
    user_id: string;
    username: string;
    display_name: string;
    coin_balance: string;
    net_this_week: string;
  }>("select user_id, username, display_name, coin_balance, net_this_week from weekly_standings");

  return rows.map((r) => ({
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    weekEnding: CURRENT_WEEK_SENTINEL,
    endingBalance: Number(r.coin_balance),
    netChange: Number(r.net_this_week),
  }));
}

export type AgentSummary = {
  agent: string;
  // Sum of the agent's users' CURRENT balances — "how much does this
  // agent's crew have right now," which is what the headline figure on
  // the History page means by an agent's "balance." Resets weekly along
  // with everyone else's balance.
  totalBalance: number;
  // All-time net summed from the same per-week net figures shown in the
  // weekly table, ignoring weekly resets entirely. This intentionally
  // does NOT match totalBalance — it still counts a loss from a week
  // that's since been wiped by a reset, whereas totalBalance doesn't.
  // Kept for anyone who wants historical performance rather than a
  // live balance.
  totalNet: number;
  users: {
    userId: string;
    username: string;
    displayName: string;
    balance: number;
  }[];
};

// Groups every user by recruiting agent, with each agent's current total
// balance (the headline figure), all-time net, and each user's current
// balance.
export async function getAgentSummaries(
  db: Pool,
  history: WeeklyHistoryRow[],
): Promise<AgentSummary[]> {
  const { rows: users } = await db.query<{
    id: string;
    username: string;
    display_name: string;
    coin_balance: string;
    agent: string;
  }>(
    "select id, username, display_name, coin_balance, agent from users where not is_admin and username <> 'Test' order by display_name",
  );

  const netByUser = new Map<string, number>();
  for (const row of history) {
    netByUser.set(row.userId, (netByUser.get(row.userId) ?? 0) + row.netChange);
  }

  const byAgent = new Map<string, AgentSummary>();
  for (const u of users) {
    let summary = byAgent.get(u.agent);
    if (!summary) {
      summary = { agent: u.agent, totalBalance: 0, totalNet: 0, users: [] };
      byAgent.set(u.agent, summary);
    }
    const balance = Number(u.coin_balance);
    summary.totalBalance += balance;
    summary.totalNet += netByUser.get(u.id) ?? 0;
    summary.users.push({
      userId: u.id,
      username: u.username,
      displayName: u.display_name,
      balance,
    });
  }

  return [...byAgent.values()];
}
