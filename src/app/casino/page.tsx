import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, isAgentOnly } from "@/lib/auth";
import { formatMoney, formatDateTime } from "@/lib/format";
import CasinoTabs from "./CasinoTabs";

type CasinoRoundRow = {
  id: string;
  game: string;
  wager: string;
  payout: string;
  outcome: string;
  is_free_play: boolean;
  created_at: string;
};

export default async function CasinoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session-expired");
  if (isAgentOnly(user)) redirect("/users");

  const { rows: recentRounds } = await db.query<CasinoRoundRow>(
    `select id, game, wager, payout, outcome, is_free_play, created_at
     from casino_rounds where user_id = $1 order by created_at desc limit 15`,
    [user.id],
  );

  return (
    <div className="app-bg min-h-screen p-6 text-slate-100">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-emerald-400">Bettor Edge — Casino</h1>
        <div className="text-sm text-slate-300">
          Your balance:{" "}
          <span className="font-mono text-emerald-400">{formatMoney(user.coin_balance)}</span>{" "}
          <span className="text-xs text-slate-500">(play money)</span>
          {Number(user.free_play) > 0 && (
            <>
              {" "}
              · Free play:{" "}
              <span className="font-mono text-amber-400">{formatMoney(user.free_play)}</span>
            </>
          )}
        </div>
      </div>

      <CasinoTabs freePlayBalance={Number(user.free_play)} />

      <section className="mt-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">Recent rounds</h2>
        {recentRounds.length ? (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2">Game</th>
                <th>Wager</th>
                <th>Payout</th>
                <th>Result</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recentRounds.map((r) => (
                <tr key={r.id} className="border-b border-slate-800/50">
                  <td className="py-2 capitalize">{r.game}</td>
                  <td className="font-mono">
                    {formatMoney(r.wager)}
                    {r.is_free_play && <span className="ml-1 text-xs text-amber-400">(FP)</span>}
                  </td>
                  <td className="font-mono">{formatMoney(r.payout)}</td>
                  <td
                    className={
                      r.outcome === "win"
                        ? "text-emerald-400"
                        : r.outcome === "push"
                          ? "text-yellow-400"
                          : "text-red-400"
                    }
                  >
                    {r.outcome}
                  </td>
                  <td className="text-xs text-slate-500">
                    {formatDateTime(r.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-slate-400">No rounds played yet.</p>
        )}
      </section>
    </div>
  );
}
