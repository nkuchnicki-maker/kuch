import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { cancelPickAction, cancelParlayAction } from "../users/actions";
import CancelBetButton from "../users/CancelBetButton";

type PendingPickRow = {
  id: string;
  display_name: string;
  wager: string;
  is_free_play: boolean;
  pick_type: string;
  pick_side: string;
  description: string;
  created_at: string;
};

type PendingParlayLegRow = {
  parlay_id: string;
  display_name: string;
  wager: string;
  is_free_play: boolean;
  created_at: string;
  pick_type: string;
  pick_side: string;
  description: string;
};

type PendingBet =
  | {
      id: string;
      kind: "pick";
      display_name: string;
      wager: string;
      is_free_play: boolean;
      created_at: string;
      description: string;
    }
  | {
      id: string;
      kind: "parlay";
      display_name: string;
      wager: string;
      is_free_play: boolean;
      created_at: string;
      legs: { pick_type: string; pick_side: string; description: string }[];
    };

// Admin/agent-only: every pending bet across every user, in one place, with
// a cancel/refund button — same mechanics as the pending-bets list on the
// Users page, just as its own dedicated tab instead of buried per-row there.
// Agents can see everyone's bets here same as on Users, but cancelPickAction/
// cancelParlayAction still enforce agent-can-only-cancel-own-recruits
// server-side via assertCanManageUser, same as before.
export default async function BetsPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/api/session-expired");

  if (!viewer.is_admin && !viewer.is_agent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        You don&apos;t have access to this page.
      </div>
    );
  }

  const [{ rows: pendingPicks }, { rows: pendingParlayLegs }] = await Promise.all([
    db.query<PendingPickRow>(`
      select p.id, u.display_name, p.wager, p.is_free_play, p.pick_type, p.pick_side, p.created_at,
             coalesce(g.event_name, g.away_team || ' @ ' || g.home_team) as description
      from picks p
      join users u on u.id = p.user_id
      join games g on g.id = p.game_id
      where p.status = 'pending'
      order by p.created_at desc
    `),
    db.query<PendingParlayLegRow>(`
      select pa.id as parlay_id, u.display_name, pa.wager, pa.is_free_play, pa.created_at,
             pl.pick_type, pl.pick_side,
             coalesce(g.event_name, g.away_team || ' @ ' || g.home_team) as description
      from parlays pa
      join users u on u.id = pa.user_id
      join parlay_legs pl on pl.parlay_id = pa.id
      join games g on g.id = pl.game_id
      where pa.status = 'pending'
      order by pa.created_at desc, pl.id
    `),
  ]);

  const parlaysById = new Map<string, Extract<PendingBet, { kind: "parlay" }>>();
  for (const row of pendingParlayLegs) {
    let parlay = parlaysById.get(row.parlay_id);
    if (!parlay) {
      parlay = {
        id: row.parlay_id,
        kind: "parlay",
        display_name: row.display_name,
        wager: row.wager,
        is_free_play: row.is_free_play,
        created_at: row.created_at,
        legs: [],
      };
      parlaysById.set(row.parlay_id, parlay);
    }
    parlay.legs.push({
      pick_type: row.pick_type,
      pick_side: row.pick_side,
      description: row.description,
    });
  }

  const bets: PendingBet[] = [
    ...pendingPicks.map(
      (p): PendingBet => ({
        id: p.id,
        kind: "pick",
        display_name: p.display_name,
        wager: p.wager,
        is_free_play: p.is_free_play,
        description: `${p.pick_type} — ${p.pick_side} · ${p.description}`,
        created_at: p.created_at,
      }),
    ),
    ...parlaysById.values(),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="app-bg min-h-screen p-6 text-slate-100">
      <h1 className="mb-6 text-2xl font-bold text-emerald-400">Bets</h1>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="px-4 py-3">Player</th>
              <th>Bet</th>
              <th>Wager</th>
              <th>Placed</th>
              <th className="pr-4 text-right">Cancel</th>
            </tr>
          </thead>
          <tbody>
            {bets.length ? (
              bets.map((bet) => (
                <tr key={bet.id} className="border-b border-slate-800/50 align-top">
                  <td className="px-4 py-3 font-medium">{bet.display_name}</td>
                  <td>
                    {bet.kind === "pick" ? (
                      <>
                        {bet.description}
                        {bet.is_free_play && (
                          <span className="ml-2 text-xs text-amber-400">(FP)</span>
                        )}
                      </>
                    ) : (
                      <div>
                        <div className="mb-1 text-xs font-semibold text-slate-400">
                          {bet.legs.length}-leg parlay
                          {bet.is_free_play && (
                            <span className="ml-2 text-amber-400">(FP)</span>
                          )}
                        </div>
                        <ul className="space-y-0.5">
                          {bet.legs.map((leg, i) => (
                            <li key={i} className="text-slate-300">
                              {leg.pick_type} — {leg.pick_side} · {leg.description}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </td>
                  <td className="font-mono">{formatMoney(bet.wager)}</td>
                  <td className="text-xs text-slate-500">
                    {new Date(bet.created_at).toLocaleString()}
                  </td>
                  <td className="pr-4 text-right">
                    <CancelBetButton
                      action={bet.kind === "pick" ? cancelPickAction : cancelParlayAction}
                      betId={bet.id}
                    />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No pending bets right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
