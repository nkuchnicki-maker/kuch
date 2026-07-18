import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { STANDARD_JUICE } from "@/lib/odds";
import { formatMoney } from "@/lib/format";
import SportFilter from "./SportFilter";
import { BetSlipProvider } from "./BetSlipContext";
import BetSlip from "./BetSlip";
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
  status: string;
  home_score: number | null;
  away_score: number | null;
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
  searchParams: Promise<{ sport?: string; view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { sport: selectedSport = "", view = "upcoming" } = await searchParams;
  const selectedView = view === "live" ? "live" : "upcoming";

  const { rows: allGames } = await db.query<GameLineRow>(`
    select g.id, g.sport, g.event_type, g.home_team, g.away_team, g.event_name, g.start_time,
           g.status, g.home_score, g.away_score,
           l.id as line_id, l.spread, l.total, l.moneyline_home, l.moneyline_away, l.outrights
    from games g
    join lines l on l.game_id = g.id
    where g.status in ('scheduled', 'live')
    order by g.start_time
  `);

  const sportFilteredGames = selectedSport
    ? allGames.filter((g) => g.sport === selectedSport)
    : allGames;

  const liveCount = sportFilteredGames.filter((g) => g.status === "live").length;
  const upcomingCount = sportFilteredGames.filter((g) => g.status === "scheduled").length;

  const sports = [...new Set(allGames.map((g) => g.sport))].sort();
  const games = sportFilteredGames.filter((g) =>
    selectedView === "live" ? g.status === "live" : g.status === "scheduled",
  );

  const sportQuery = selectedSport ? `&sport=${encodeURIComponent(selectedSport)}` : "";

  return (
    <BetSlipProvider>
      <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
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
            </div>
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          <Link
            href={`/lines?view=upcoming${sportQuery}`}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              selectedView === "upcoming"
                ? "bg-emerald-500 text-slate-950"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Upcoming ({upcomingCount})
          </Link>
          <Link
            href={`/lines?view=live${sportQuery}`}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              selectedView === "live"
                ? "bg-red-500 text-slate-950"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Live ({liveCount})
          </Link>
        </div>

        <div className="grid gap-4">
          {games.length ? (
            games.map((g) => {
              if (g.event_type === "outright") {
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
                        <h2 className="text-lg font-semibold">{g.event_name}</h2>
                      </div>
                      <span className="text-xs text-slate-500">
                        {new Date(g.start_time).toLocaleString()}
                      </span>
                    </div>
                    <OutrightPickForm
                      gameId={g.id}
                      lineId={g.line_id}
                      eventName={g.event_name ?? g.sport}
                      participants={g.outrights ?? []}
                    />
                  </div>
                );
              }

              const spread = g.spread != null ? Number(g.spread) : null;
              const total = g.total != null ? Number(g.total) : null;
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
                        {g.status === "live" && (
                          <span className="ml-2 rounded bg-red-500/90 px-1.5 py-0.5 align-middle text-xs font-bold uppercase text-white">
                            Live
                          </span>
                        )}
                      </h2>
                      {g.status === "live" && g.home_score != null && g.away_score != null && (
                        <div className="text-sm font-mono text-slate-300">
                          {g.away_team} {g.away_score} — {g.home_team} {g.home_score}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {g.status === "live"
                        ? "In progress"
                        : new Date(g.start_time).toLocaleString()}
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
                            label: `${g.home_team} ${spread > 0 ? "+" : ""}${spread}`,
                            odds: STANDARD_JUICE,
                          },
                          {
                            value: "away",
                            label: `${g.away_team} ${-spread > 0 ? "+" : ""}${-spread}`,
                            odds: STANDARD_JUICE,
                          },
                        ]}
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
                      />
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-slate-400">
              {selectedView === "live"
                ? selectedSport
                  ? `No ${selectedSport} games live right now.`
                  : "No games live right now."
                : selectedSport
                  ? `No upcoming ${selectedSport} games right now.`
                  : "No upcoming games right now — ask your admin to add some."}
            </p>
          )}
        </div>
      </div>
      <BetSlip />
    </BetSlipProvider>
  );
}
