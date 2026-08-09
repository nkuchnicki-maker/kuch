import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { describePick } from "@/lib/format";
import PastBetsTable, { type PastBet } from "./PastBetsTable";

type PickRow = {
  id: string;
  display_name: string;
  wager: string;
  potential_payout: string;
  status: string;
  created_at: string;
  pick_type: string;
  pick_side: string;
  home_team: string | null;
  away_team: string | null;
  event_name: string | null;
  spread: string | null;
  total: string | null;
};

type ParlayLegRow = {
  parlay_id: string;
  display_name: string;
  wager: string;
  potential_payout: string;
  parlay_status: string;
  created_at: string;
  pick_type: string;
  pick_side: string;
  home_team: string | null;
  away_team: string | null;
  event_name: string | null;
  spread: string | null;
  total: string | null;
};

function matchupFor(row: { home_team: string | null; away_team: string | null; event_name: string | null }) {
  return row.event_name ?? `${row.away_team} @ ${row.home_team}`;
}

// Admin/agent-only: a full, filterable/sortable record of every bet ever
// placed by anyone — pending or settled — unlike the Bets tab (pending
// only) or My Picks (a single user's own history). Read-only; no
// cancel/refund here, this is a record, not a management tool.
export default async function PastBetsPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/api/session-expired");

  if (!viewer.is_admin && !viewer.is_agent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        You don&apos;t have access to this page.
      </div>
    );
  }

  const [{ rows: pickRows }, { rows: parlayLegRows }] = await Promise.all([
    db.query<PickRow>(`
      select p.id, u.display_name, p.wager, p.potential_payout, p.status, p.created_at,
             p.pick_type, p.pick_side,
             g.home_team, g.away_team, g.event_name, l.spread, l.total
      from picks p
      join users u on u.id = p.user_id
      join games g on g.id = p.game_id
      join lines l on l.id = p.line_id
      order by p.created_at desc
    `),
    db.query<ParlayLegRow>(`
      select pa.id as parlay_id, u.display_name, pa.wager, pa.potential_payout,
             pa.status as parlay_status, pa.created_at,
             pl.pick_type, pl.pick_side,
             g.home_team, g.away_team, g.event_name, l.spread, l.total
      from parlays pa
      join users u on u.id = pa.user_id
      join parlay_legs pl on pl.parlay_id = pa.id
      join games g on g.id = pl.game_id
      join lines l on l.id = pl.line_id
      order by pa.created_at desc, pl.id
    `),
  ]);

  const parlaysById = new Map<string, PastBet & { kind: "parlay" }>();
  for (const row of parlayLegRows) {
    let parlay = parlaysById.get(row.parlay_id);
    if (!parlay) {
      parlay = {
        id: row.parlay_id,
        kind: "parlay",
        displayName: row.display_name,
        wager: Number(row.wager),
        // Profit only, not total payout — matches what a win actually
        // credits under the deferred-stake-debit model (see settle.ts).
        potentialPayout: Number(row.potential_payout) - Number(row.wager),
        status: row.parlay_status,
        createdAt: row.created_at,
        legs: [],
      };
      parlaysById.set(row.parlay_id, parlay);
    }
    parlay.legs.push({
      label: describePick({
        pickType: row.pick_type,
        pickSide: row.pick_side,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        spread: row.spread != null ? Number(row.spread) : null,
        total: row.total != null ? Number(row.total) : null,
      }),
      matchup: matchupFor(row),
    });
  }

  const bets: PastBet[] = [
    ...pickRows.map(
      (p): PastBet => ({
        id: p.id,
        kind: "pick",
        displayName: p.display_name,
        wager: Number(p.wager),
        // Profit only, not total payout — matches what a win actually
        // credits under the deferred-stake-debit model (see settle.ts).
        potentialPayout: Number(p.potential_payout) - Number(p.wager),
        status: p.status,
        createdAt: p.created_at,
        leg: {
          label: describePick({
            pickType: p.pick_type,
            pickSide: p.pick_side,
            homeTeam: p.home_team,
            awayTeam: p.away_team,
            spread: p.spread != null ? Number(p.spread) : null,
            total: p.total != null ? Number(p.total) : null,
          }),
          matchup: matchupFor(p),
        },
      }),
    ),
    ...parlaysById.values(),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="app-bg min-h-screen p-6 text-slate-100">
      <h1 className="mb-2 text-2xl font-bold text-emerald-400">Past Bets</h1>
      <p className="mb-6 max-w-2xl text-sm text-slate-400">
        Every bet ever placed, pending or settled. Filter to one player or
        sort any column — this is a read-only record, not a management tool
        (cancel pending bets from the Bets tab instead).
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-6">
        <PastBetsTable bets={bets} />
      </div>
    </div>
  );
}
