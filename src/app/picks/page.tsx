import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import StatusBadge from "../components/StatusBadge";

type PickRow = {
  id: string;
  pick_type: string;
  pick_side: string;
  wager: string;
  potential_payout: string;
  status: string;
  created_at: string;
  home_team: string;
  away_team: string;
  sport: string;
};

export default async function MyPicksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { rows: picks } = await db.query<PickRow>(
    `select p.id, p.pick_type, p.pick_side, p.wager, p.potential_payout, p.status, p.created_at,
            g.home_team, g.away_team, g.sport
     from picks p
     join games g on g.id = p.game_id
     where p.user_id = $1
     order by p.created_at desc`,
    [user.id],
  );

  const settled = picks.filter((p) => p.status !== "pending");
  const netAllTime = settled.reduce((sum, p) => {
    if (p.status === "win") return sum + (Number(p.potential_payout) - Number(p.wager));
    if (p.status === "loss") return sum - Number(p.wager);
    return sum; // push/cancelled: no net change
  }, 0);

  const record = settled.reduce(
    (acc, p) => {
      if (p.status === "win") acc.wins++;
      else if (p.status === "loss") acc.losses++;
      else if (p.status === "push") acc.pushes++;
      return acc;
    },
    { wins: 0, losses: 0, pushes: 0 },
  );

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-emerald-400">My Picks</h1>
        <div className="flex gap-6 text-sm text-slate-300">
          <div>
            Record:{" "}
            <span className="font-mono">
              {record.wins}-{record.losses}-{record.pushes}
            </span>
          </div>
          <div>
            All-time net:{" "}
            <span
              className={`font-mono font-semibold ${netAllTime >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {netAllTime >= 0 ? "+" : ""}
              {netAllTime}
            </span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="px-4 py-3">Game</th>
              <th>Pick</th>
              <th>Wager</th>
              <th>To win</th>
              <th>Status</th>
              <th className="pr-4">Placed</th>
            </tr>
          </thead>
          <tbody>
            {picks.length ? (
              picks.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/50">
                  <td className="px-4 py-3">
                    <div>
                      {p.away_team} @ {p.home_team}
                    </div>
                    <div className="text-xs text-slate-500">{p.sport}</div>
                  </td>
                  <td className="capitalize text-slate-300">
                    {p.pick_type} — {p.pick_side}
                  </td>
                  <td className="font-mono">{p.wager}</td>
                  <td className="font-mono text-slate-400">
                    {p.potential_payout}
                  </td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="pr-4 text-xs text-slate-500">
                    {new Date(p.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  No picks yet — head to Lines to make your first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
