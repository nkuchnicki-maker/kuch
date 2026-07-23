import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, isAgentOnly } from "@/lib/auth";
import { STANDARD_JUICE } from "@/lib/odds";
import { formatMoney } from "@/lib/format";
import { isCurrentlyLocked } from "@/lib/marketLock";
import SportFilter from "../lines/SportFilter";
import PickForm from "../lines/PickForm";

type LiveGameRow = {
  id: string;
  sport: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  line_id: string;
  spread: string | null;
  total: string | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
  locked_until: string | null;
};

export default async function LiveSportsPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isAgentOnly(user)) redirect("/users");

  const { sport: selectedSport = "" } = await searchParams;

  // Golf never goes "live" (there's no such thing as a live score for a
  // tournament winner), so this only ever deals with two-team matchups.
  const { rows: allGames } = await db.query<LiveGameRow>(`
    select g.id, g.sport, g.home_team, g.away_team, g.home_score, g.away_score,
           l.id as line_id, l.spread, l.total, l.moneyline_home, l.moneyline_away,
           l.locked_until
    from games g
    join lines l on l.game_id = g.id
    where g.status = 'live'
    order by g.start_time
  `);

  const sports = [...new Set(allGames.map((g) => g.sport))].sort();
  const games = selectedSport
    ? allGames.filter((g) => g.sport === selectedSport)
    : allGames;

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-emerald-400">
          Bettor Edge — Live
        </h1>
        <div className="flex items-center gap-4">
          <SportFilter sports={sports} selected={selectedSport} basePath="/live-sports" />
          <div className="text-sm text-slate-300">
            Your balance:{" "}
            <span className="font-mono text-emerald-400">
              {formatMoney(user.coin_balance)}
            </span>{" "}
            <span className="text-xs text-slate-500">(play money)</span>
            {Number(user.free_play) > 0 && (
              <>
                {" "}
                · Free play:{" "}
                <span className="font-mono text-amber-400">
                  {formatMoney(user.free_play)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {games.length ? (
          games.map((g) => {
            const spread = g.spread != null ? Number(g.spread) : null;
            const total = g.total != null ? Number(g.total) : null;
            const locked = isCurrentlyLocked(g.locked_until);
            return (
              <div
                key={g.id}
                className="rounded-xl border border-slate-800 bg-slate-900 p-5"
              >
                <div className="mb-3 flex items-baseline justify-between">
                  <div>
                    <span className="text-xs uppercase text-slate-500">
                      {g.sport}
                    </span>
                    <h2 className="text-lg font-semibold">
                      {g.away_team} @ {g.home_team}
                      <span className="ml-2 rounded bg-red-500/90 px-1.5 py-0.5 align-middle text-xs font-bold uppercase text-white">
                        Live
                      </span>
                      {locked && (
                        <span className="ml-2 rounded bg-amber-500/90 px-1.5 py-0.5 align-middle text-xs font-bold uppercase text-slate-950">
                          Market Locked
                        </span>
                      )}
                    </h2>
                    {g.home_score != null && g.away_score != null && (
                      <div className="text-sm font-mono text-slate-300">
                        {g.away_team} {g.away_score} — {g.home_team} {g.home_score}
                      </div>
                    )}
                    {locked && (
                      <p className="mt-1 text-xs text-amber-400">
                        Big play just happened — betting is paused briefly while the line catches up.
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">In progress</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {spread != null && (
                    <PickForm
                      gameId={g.id}
                      lineId={g.line_id}
                      pickType="spread"
                      label="Spread"
                      options={[
                        {
                          value: "home",
                          label: `${g.home_team} ${spread > 0 ? "+" : ""}${spread}`,
                          odds: STANDARD_JUICE,
                        },
                        {
                          value: "away",
                          label: `${g.away_team} ${-spread > 0 ? "+" : ""}${-spread}`,
                          odds: STANDARD_JUICE,
                        },
                      ]}
                      freePlayBalance={Number(user.free_play)}
                    />
                  )}
                  {total != null && (
                    <PickForm
                      gameId={g.id}
                      lineId={g.line_id}
                      pickType="total"
                      label="Total"
                      options={[
                        { value: "over", label: `Over ${total}`, odds: STANDARD_JUICE },
                        { value: "under", label: `Under ${total}`, odds: STANDARD_JUICE },
                      ]}
                      freePlayBalance={Number(user.free_play)}
                    />
                  )}
                  {g.moneyline_home != null && g.moneyline_away != null && (
                    <PickForm
                      gameId={g.id}
                      lineId={g.line_id}
                      pickType="moneyline"
                      label="Moneyline"
                      options={[
                        {
                          value: "home",
                          label: `${g.home_team} ${g.moneyline_home > 0 ? "+" : ""}${g.moneyline_home}`,
                          odds: g.moneyline_home,
                        },
                        {
                          value: "away",
                          label: `${g.away_team} ${g.moneyline_away > 0 ? "+" : ""}${g.moneyline_away}`,
                          odds: g.moneyline_away,
                        },
                      ]}
                      freePlayBalance={Number(user.free_play)}
                    />
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-slate-400">
            {selectedSport
              ? `No ${selectedSport} games live right now.`
              : "No games live right now."}
          </p>
        )}
      </div>
    </div>
  );
}
