import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, isAgentOnly } from "@/lib/auth";
import StatusBadge from "../components/StatusBadge";
import { formatMoney, formatDateTime } from "@/lib/format";

type PickRow = {
  id: string;
  pick_type: string;
  pick_side: string;
  wager: string;
  potential_payout: string;
  status: string;
  created_at: string;
  home_team: string | null;
  away_team: string | null;
  event_name: string | null;
  sport: string;
};

type ParlayLegRow = {
  parlay_id: string;
  wager: string;
  potential_payout: string;
  parlay_status: string;
  created_at: string;
  leg_status: string;
  pick_type: string;
  pick_side: string;
  home_team: string | null;
  away_team: string | null;
  event_name: string | null;
  sport: string;
};

type Parlay = {
  id: string;
  wager: number;
  potential_payout: number;
  status: string;
  created_at: string;
  legs: {
    status: string;
    pick_type: string;
    pick_side: string;
    description: string;
    sport: string;
  }[];
};

export default async function MyPicksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session-expired");
  if (isAgentOnly(user)) redirect("/users");

  const [{ rows: picks }, { rows: parlayLegRows }] = await Promise.all([
    db.query<PickRow>(
      `select p.id, p.pick_type, p.pick_side, p.wager, p.potential_payout, p.status, p.created_at,
              g.home_team, g.away_team, g.event_name, g.sport
       from picks p
       join games g on g.id = p.game_id
       where p.user_id = $1
       order by p.created_at desc`,
      [user.id],
    ),
    db.query<ParlayLegRow>(
      `select pa.id as parlay_id, pa.wager, pa.potential_payout, pa.status as parlay_status, pa.created_at,
              pl.status as leg_status, pl.pick_type, pl.pick_side,
              g.home_team, g.away_team, g.event_name, g.sport
       from parlays pa
       join parlay_legs pl on pl.parlay_id = pa.id
       join games g on g.id = pl.game_id
       where pa.user_id = $1
       order by pa.created_at desc`,
      [user.id],
    ),
  ]);

  const parlaysById = new Map<string, Parlay>();
  for (const row of parlayLegRows) {
    let parlay = parlaysById.get(row.parlay_id);
    if (!parlay) {
      parlay = {
        id: row.parlay_id,
        wager: Number(row.wager),
        potential_payout: Number(row.potential_payout),
        status: row.parlay_status,
        created_at: row.created_at,
        legs: [],
      };
      parlaysById.set(row.parlay_id, parlay);
    }
    parlay.legs.push({
      status: row.leg_status,
      pick_type: row.pick_type,
      pick_side: row.pick_side,
      description: row.event_name ?? `${row.away_team} @ ${row.home_team}`,
      sport: row.sport,
    });
  }
  const parlays = [...parlaysById.values()];

  const settledPicks = picks.filter((p) => p.status !== "pending");
  const settledParlays = parlays.filter((p) => p.status !== "pending");

  const netAllTime =
    settledPicks.reduce((sum, p) => {
      if (p.status === "win") return sum + (Number(p.potential_payout) - Number(p.wager));
      if (p.status === "loss") return sum - Number(p.wager);
      return sum; // push/cancelled: no net change
    }, 0) +
    settledParlays.reduce((sum, p) => {
      if (p.status === "win") return sum + (p.potential_payout - p.wager);
      if (p.status === "loss") return sum - p.wager;
      return sum;
    }, 0);

  const record = [...settledPicks, ...settledParlays].reduce(
    (acc, p) => {
      if (p.status === "win") acc.wins++;
      else if (p.status === "loss") acc.losses++;
      else if (p.status === "push") acc.pushes++;
      return acc;
    },
    { wins: 0, losses: 0, pushes: 0 },
  );

  return (
    <div className="app-bg min-h-screen p-6 text-slate-100">
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
              {formatMoney(netAllTime)}
            </span>
          </div>
        </div>
      </div>

      {parlays.length > 0 && (
        <div className="mb-6 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-300">
            Parlays
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="px-4 py-3">Legs</th>
                <th>Wager</th>
                <th>To win</th>
                <th>Status</th>
                <th className="pr-4">Placed</th>
              </tr>
            </thead>
            <tbody>
              {parlays.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/50 align-top">
                  <td className="px-4 py-3">
                    <ul className="space-y-1">
                      {p.legs.map((leg, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <StatusBadge status={leg.status} />
                          <span>
                            {leg.description}{" "}
                            <span className="text-slate-500">
                              ({leg.pick_type} — {leg.pick_side})
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="font-mono">{formatMoney(p.wager)}</td>
                  <td className="font-mono text-slate-400">
                    {formatMoney(p.potential_payout - p.wager)}
                  </td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="pr-4 text-xs text-slate-500">
                    {formatDateTime(p.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
                    <div>{p.event_name ?? `${p.away_team} @ ${p.home_team}`}</div>
                    <div className="text-xs text-slate-500">{p.sport}</div>
                  </td>
                  <td className="capitalize text-slate-300">
                    {p.pick_type} — {p.pick_side}
                  </td>
                  <td className="font-mono">{formatMoney(p.wager)}</td>
                  <td className="font-mono text-slate-400">
                    {formatMoney(Number(p.potential_payout) - Number(p.wager))}
                  </td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="pr-4 text-xs text-slate-500">
                    {formatDateTime(p.created_at)}
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
