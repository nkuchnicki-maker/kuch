import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  adjustCoinsAction,
  createGameAction,
  createUserAction,
  settleGameAction,
  settleOutrightAction,
} from "./actions";
import SyncButton from "./SyncButton";
import { formatMoney } from "@/lib/format";

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  coin_balance: string;
  is_admin: boolean;
};

type GameRow = {
  id: string;
  sport: string;
  event_type: string;
  home_team: string | null;
  away_team: string | null;
  event_name: string | null;
  winner_name: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  spread: string | null;
  total: string | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
  outrights: { name: string; odds: number }[] | null;
};

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!user.is_admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        You don&apos;t have admin access.
      </div>
    );
  }

  const [{ rows: users }, { rows: games }] = await Promise.all([
    db.query<UserRow>(
      "select id, username, display_name, coin_balance, is_admin from users order by display_name",
    ),
    db.query<GameRow>(`
      select g.id, g.sport, g.event_type, g.home_team, g.away_team, g.event_name,
             g.winner_name, g.status, g.home_score, g.away_score,
             l.spread, l.total, l.moneyline_home, l.moneyline_away, l.outrights
      from games g
      left join lines l on l.game_id = g.id
      order by g.start_time desc
    `),
  ]);

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <h1 className="mb-8 text-2xl font-bold text-emerald-400">
        Bettor Edge — Admin
      </h1>

      <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">Create a new user</h2>
        <form action={createUserAction} className="grid gap-3 sm:grid-cols-5">
          <input name="email" type="email" placeholder="Email" required
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 sm:col-span-2" />
          <input name="password" type="text" placeholder="Temp password" required
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2" />
          <input name="username" type="text" placeholder="Username" required
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2" />
          <input name="displayName" type="text" placeholder="Display name" required
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2" />
          <input name="startingCoins" type="number" defaultValue={1000} placeholder="Starting balance ($)"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 sm:col-span-2" />
          <button type="submit"
            className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-400">
            Create user
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          They log in with their <strong>username</strong> and password
          (not email) — share those with them directly. There is no public
          sign-up.
        </p>
      </section>

      <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">
          Users &amp; balances <span className="text-xs font-normal text-slate-500">(play money)</span>
        </h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="py-2">Name</th>
              <th>Username</th>
              <th>Balance</th>
              <th>Admin</th>
              <th>Adjust coins</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-800/50">
                <td className="py-2">{u.display_name}</td>
                <td className="text-slate-400">@{u.username}</td>
                <td className="font-mono text-emerald-400">{formatMoney(u.coin_balance)}</td>
                <td>{u.is_admin ? "Yes" : ""}</td>
                <td>
                  <form action={adjustCoinsAction} className="flex gap-2">
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
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">Live odds sync</h2>
        <p className="mb-4 text-sm text-slate-400">
          Pulls current lines from The Odds API for {" "}
          <span className="text-slate-300">
            NFL, NCAAF, NBA, NCAAB, MLB, NHL &amp; Golf majors
          </span>{" "}
          and settles any finished games using live scores (golf tournament
          winners are settled manually below instead). Requires{" "}
          <code className="rounded bg-slate-800 px-1">ODDS_API_KEY</code> to
          be set. For hands-off updates, set up the scheduled sync in the
          README instead of clicking this every time.
        </p>
        <SyncButton />
      </section>

      <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">
          Add a game &amp; line manually
        </h2>
        <form action={createGameAction} className="grid gap-3 sm:grid-cols-4">
          <input name="sport" placeholder="Sport (NFL, NBA...)" required
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2" />
          <input name="homeTeam" placeholder="Home team" required
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2" />
          <input name="awayTeam" placeholder="Away team" required
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2" />
          <input name="startTime" type="datetime-local" required
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2" />
          <input name="spread" type="number" step="0.5" placeholder="Home spread (e.g. -3.5)"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2" />
          <input name="total" type="number" step="0.5" placeholder="Total (O/U)"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2" />
          <input name="moneylineHome" type="number" placeholder="ML home (e.g. -150)"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2" />
          <input name="moneylineAway" type="number" placeholder="ML away (e.g. +130)"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2" />
          <button type="submit"
            className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-400 sm:col-span-4">
            Add game
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">Games</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="py-2">Matchup</th>
              <th>Line</th>
              <th>Status</th>
              <th>Settle (final score)</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g) => {
              const isOutright = g.event_type === "outright";
              return (
                <tr key={g.id} className="border-b border-slate-800/50">
                  <td className="py-2">
                    {isOutright ? g.event_name : `${g.away_team} @ ${g.home_team}`}
                    <div className="text-xs text-slate-500">{g.sport}</div>
                  </td>
                  <td className="text-xs text-slate-400">
                    {isOutright ? (
                      <div>{g.outrights?.length ?? 0} players</div>
                    ) : (
                      <>
                        {g.spread != null && <div>Spread: {g.spread}</div>}
                        {g.total != null && <div>Total: {g.total}</div>}
                        {g.moneyline_home != null && (
                          <div>
                            ML: {g.moneyline_home} / {g.moneyline_away}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td>{g.status}</td>
                  <td>
                    {g.status === "final" ? (
                      <span className="text-slate-400">
                        {isOutright ? `Winner: ${g.winner_name}` : `${g.home_score} - ${g.away_score}`}
                      </span>
                    ) : isOutright ? (
                      <form action={settleOutrightAction} className="flex gap-2">
                        <input type="hidden" name="gameId" value={g.id} />
                        <select
                          name="winnerName"
                          required
                          className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1"
                        >
                          <option value="">Winner…</option>
                          {g.outrights?.map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-lg bg-slate-700 px-3 py-1 hover:bg-slate-600"
                        >
                          Settle
                        </button>
                      </form>
                    ) : (
                      <form action={settleGameAction} className="flex gap-2">
                        <input type="hidden" name="gameId" value={g.id} />
                        <input
                          name="homeScore"
                          type="number"
                          placeholder="Home"
                          required
                          className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1"
                        />
                        <input
                          name="awayScore"
                          type="number"
                          placeholder="Away"
                          required
                          className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-slate-700 px-3 py-1 hover:bg-slate-600"
                        >
                          Settle
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
