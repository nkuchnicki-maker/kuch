import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, isAgentOnly } from "@/lib/auth";
import { STANDARD_JUICE, formatAmericanOdds } from "@/lib/odds";
import { formatMoney, formatGameTime } from "@/lib/format";
import { sportIcon } from "@/lib/sportIcons";
import SportFilter from "./SportFilter";
import PickForm from "./PickForm";
import OutrightPickForm from "./OutrightPickForm";

type GameLineRow = {
  id: string;
  sport: string;
  event_type: string;
  home_team: string | null;
  away_team: string | null;
  event_name: string | null;
  start_time: string;
  line_id: string;
  spread: string | null;
  total: string | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
  outrights: { name: string; odds: number }[] | null;
};

export default async function LinesPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session-expired");
  if (isAgentOnly(user)) redirect("/users");

  const { sport: selectedSport = "" } = await searchParams;

  // start_time > now() on top of status = 'scheduled' — a game that's
  // kicked off but hasn't had its status flipped to 'live' by the next
  // sync yet (that only runs every so often) shouldn't keep showing here
  // with stale pre-match odds; it reappears on Live Sports as soon as the
  // sync catches up.
  const { rows: allGames } = await db.query<GameLineRow>(`
    select g.id, g.sport, g.event_type, g.home_team, g.away_team, g.event_name, g.start_time,
           l.id as line_id, l.spread, l.total, l.moneyline_home, l.moneyline_away, l.outrights
    from games g
    join lines l on l.game_id = g.id
    where g.status = 'scheduled' and g.start_time > now()
    order by g.start_time
  `);

  const sports = [...new Set(allGames.map((g) => g.sport))].sort();
  const games = selectedSport
    ? allGames.filter((g) => g.sport === selectedSport)
    : allGames;

  return (
    <div className="app-bg min-h-screen p-6 text-slate-100">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-emerald-400">Bettor Edge</h1>
        <div className="flex items-center gap-4">
          <SportFilter sports={sports} selected={selectedSport} />
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
            if (g.event_type === "outright") {
              return (
                <div
                  key={g.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-black/20 transition hover:border-slate-700"
                >
                  <div className="mb-3 flex items-baseline justify-between">
                    <div>
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        {sportIcon(g.sport)} {g.sport}
                      </span>
                      <h2 className="text-lg font-semibold">{g.event_name}</h2>
                    </div>
                    <span className="text-xs text-slate-500">
                      {formatGameTime(g.start_time)}
                    </span>
                  </div>
                  <OutrightPickForm
                    gameId={g.id}
                    lineId={g.line_id}
                    eventName={g.event_name ?? g.sport}
                    participants={g.outrights ?? []}
                    freePlayBalance={Number(user.free_play)}
                  />
                </div>
              );
            }

            const spread = g.spread != null ? Number(g.spread) : null;
            const total = g.total != null ? Number(g.total) : null;
            return (
              <div
                key={g.id}
                className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-black/20 transition hover:border-slate-700"
              >
                <div className="mb-3 flex items-baseline justify-between">
                  <div>
                    <span className="text-xs uppercase tracking-wide text-slate-500">
                      {sportIcon(g.sport)} {g.sport}
                    </span>
                    <h2 className="text-lg font-semibold">
                      {g.away_team} @ {g.home_team}
                    </h2>
                  </div>
                  <span className="text-xs text-slate-500">
                    {formatGameTime(g.start_time)}
                  </span>
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
                          label: `${g.home_team} ${spread > 0 ? "+" : ""}${spread} (${formatAmericanOdds(STANDARD_JUICE)})`,
                          odds: STANDARD_JUICE,
                        },
                        {
                          value: "away",
                          label: `${g.away_team} ${-spread > 0 ? "+" : ""}${-spread} (${formatAmericanOdds(STANDARD_JUICE)})`,
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
                        {
                          value: "over",
                          label: `Over ${total} (${formatAmericanOdds(STANDARD_JUICE)})`,
                          odds: STANDARD_JUICE,
                        },
                        {
                          value: "under",
                          label: `Under ${total} (${formatAmericanOdds(STANDARD_JUICE)})`,
                          odds: STANDARD_JUICE,
                        },
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
              ? `No upcoming ${selectedSport} games right now.`
              : "No upcoming games right now — ask your admin to add some."}
          </p>
        )}
      </div>
    </div>
  );
}
