import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import StatusBadge from "../components/StatusBadge";
import { formatMoney } from "@/lib/format";

type StandingRow = {
  user_id: string;
  display_name: string;
  coin_balance: string;
  net_this_week: string;
};

type FeedRow = {
  id: string;
  pick_type: string;
  pick_side: string;
  wager: string;
  potential_payout: string;
  status: string;
  created_at: string;
  display_name: string;
  home_team: string | null;
  away_team: string | null;
  event_name: string | null;
};

type ParlayFeedRow = {
  id: string;
  wager: string;
  potential_payout: string;
  status: string;
  created_at: string;
  display_name: string;
  leg_count: string;
};

type FeedItem = {
  id: string;
  kind: "pick" | "parlay";
  display_name: string;
  status: string;
  created_at: string;
  wager: string;
  potential_payout: string;
  description: string;
};

export default async function LeaderboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session-expired");

  const [{ rows: standings }, { rows: pickFeed }, { rows: parlayFeed }] =
    await Promise.all([
      db.query<StandingRow>(
        "select * from weekly_standings order by net_this_week desc",
      ),
      db.query<FeedRow>(`
        select p.id, p.pick_type, p.pick_side, p.wager, p.potential_payout, p.status, p.created_at,
               u.display_name, g.home_team, g.away_team, g.event_name
        from picks p
        join users u on u.id = p.user_id
        join games g on g.id = p.game_id
        order by p.created_at desc
        limit 20
      `),
      db.query<ParlayFeedRow>(`
        select pa.id, pa.wager, pa.potential_payout, pa.status, pa.created_at,
               u.display_name, count(pl.id) as leg_count
        from parlays pa
        join users u on u.id = pa.user_id
        join parlay_legs pl on pl.parlay_id = pa.id
        group by pa.id, u.display_name
        order by pa.created_at desc
        limit 20
      `),
    ]);

  const feed: FeedItem[] = [
    ...pickFeed.map((p) => ({
      id: p.id,
      kind: "pick" as const,
      display_name: p.display_name,
      status: p.status,
      created_at: p.created_at,
      wager: p.wager,
      potential_payout: p.potential_payout,
      description: `${p.pick_type} — ${p.pick_side} · ${p.event_name ?? `${p.away_team} @ ${p.home_team}`}`,
    })),
    ...parlayFeed.map((p) => ({
      id: p.id,
      kind: "parlay" as const,
      display_name: p.display_name,
      status: p.status,
      created_at: p.created_at,
      wager: p.wager,
      potential_payout: p.potential_payout,
      description: `${p.leg_count}-leg parlay`,
    })),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <h1 className="mb-8 text-2xl font-bold text-emerald-400">
        Bettor Edge — Leaderboard
      </h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-lg font-semibold">This week</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2">Player</th>
                <th>Net this week</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.user_id} className="border-b border-slate-800/50">
                  <td className="py-2">
                    <span className="mr-2 text-slate-500">#{i + 1}</span>
                    {s.display_name}
                  </td>
                  <td
                    className={
                      Number(s.net_this_week) >= 0
                        ? "font-mono text-emerald-400"
                        : "font-mono text-red-400"
                    }
                  >
                    {Number(s.net_this_week) >= 0 ? "+" : ""}
                    {formatMoney(s.net_this_week)}
                  </td>
                  <td className="font-mono text-slate-300">
                    {formatMoney(s.coin_balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-lg font-semibold">Recent picks</h2>
          <ul className="space-y-3 text-sm">
            {feed.map((item) => (
              <li
                key={`${item.kind}-${item.id}`}
                className="rounded-lg border border-slate-800 bg-slate-950 p-3"
              >
                <div className="flex justify-between">
                  <span className="font-semibold">{item.display_name}</span>
                  <StatusBadge status={item.status} />
                </div>
                <div className="text-slate-400">{item.description}</div>
                <div className="text-xs text-slate-500">
                  Wagered {formatMoney(item.wager)} to win{" "}
                  {formatMoney(item.potential_payout)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
