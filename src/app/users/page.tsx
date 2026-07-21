import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getWeeklyHistory } from "@/lib/history";
import { formatMoney } from "@/lib/format";
import { adjustFreePlayAction } from "./actions";

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  agent: string;
  coin_balance: string;
  free_play: string;
};

export default async function UsersPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  if (!viewer.is_admin && !viewer.is_agent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        You don&apos;t have access to this page.
      </div>
    );
  }

  const [{ rows: allUsers }, history] = await Promise.all([
    db.query<UserRow>(
      "select id, username, display_name, agent, coin_balance, free_play from users order by display_name",
    ),
    getWeeklyHistory(db),
  ]);

  const users = viewer.is_admin
    ? allUsers
    : allUsers.filter((u) => u.agent === viewer.agent);

  // getWeeklyHistory pushes each user's weeks in ascending order, so the
  // last write per user ends up being their most recently completed week.
  const lastWeekBalanceByUser = new Map<string, number>();
  for (const row of history) {
    lastWeekBalanceByUser.set(row.userId, row.endingBalance);
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <h1 className="mb-2 text-2xl font-bold text-emerald-400">Users</h1>
      <p className="mb-8 max-w-2xl text-sm text-slate-400">
        {viewer.is_admin
          ? "Every user's balance from last week and current free play."
          : "Your recruited users' balance from last week and current free play."}{" "}
        Free play is a separate spendable currency — a winning free-play
        pick only credits the profit to the real balance, a loss doesn&apos;t
        touch it.
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-6">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="py-2">Name</th>
              <th>Username</th>
              {viewer.is_admin && <th>Agent</th>}
              <th>Balance last week</th>
              <th>Current balance</th>
              <th>Free play</th>
              <th>Adjust free play</th>
            </tr>
          </thead>
          <tbody>
            {users.length ? (
              users.map((u) => {
                const lastWeek = lastWeekBalanceByUser.get(u.id);
                return (
                  <tr key={u.id} className="border-b border-slate-800/50">
                    <td className="py-2">{u.display_name}</td>
                    <td className="text-slate-400">@{u.username}</td>
                    {viewer.is_admin && <td className="text-slate-400">{u.agent}</td>}
                    <td className="font-mono text-slate-300">
                      {lastWeek != null ? formatMoney(lastWeek) : "—"}
                    </td>
                    <td className="font-mono text-emerald-400">
                      {formatMoney(u.coin_balance)}
                    </td>
                    <td className="font-mono text-amber-400">{formatMoney(u.free_play)}</td>
                    <td>
                      <form action={adjustFreePlayAction} className="flex gap-2">
                        <input type="hidden" name="userId" value={u.id} />
                        <input
                          name="amount"
                          type="number"
                          placeholder="+/- $"
                          required
                          className="w-32 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-slate-700 px-3 py-1 hover:bg-slate-600"
                        >
                          Apply
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={viewer.is_admin ? 7 : 6} className="py-6 text-center text-slate-500">
                  No recruited users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
