import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { placePickAction } from "./actions";

type GameLineRow = {
  id: string;
  sport: string;
  home_team: string;
  away_team: string;
  start_time: string;
  line_id: string;
  spread: string | null;
  total: string | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
};

export default async function LinesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { rows: games } = await db.query<GameLineRow>(`
    select g.id, g.sport, g.home_team, g.away_team, g.start_time,
           l.id as line_id, l.spread, l.total, l.moneyline_home, l.moneyline_away
    from games g
    join lines l on l.game_id = g.id
    where g.status = 'scheduled'
    order by g.start_time
  `);

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-emerald-400">Bettor Edge</h1>
        <div className="text-sm text-slate-300">
          Your balance:{" "}
          <span className="font-mono text-emerald-400">
            {user.coin_balance} coins
          </span>
        </div>
      </div>

      <div className="grid gap-4">
        {games.length ? (
          games.map((g) => {
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
                    </h2>
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(g.start_time).toLocaleString()}
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
                        },
                        {
                          value: "away",
                          label: `${g.away_team} ${-spread > 0 ? "+" : ""}${-spread}`,
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
                        { value: "over", label: `Over ${total}` },
                        { value: "under", label: `Under ${total}` },
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
                        },
                        {
                          value: "away",
                          label: `${g.away_team} ${g.moneyline_away > 0 ? "+" : ""}${g.moneyline_away}`,
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
            No games open right now — ask your admin to add some.
          </p>
        )}
      </div>
    </div>
  );
}

function PickForm({
  gameId,
  lineId,
  pickType,
  label,
  options,
}: {
  gameId: string;
  lineId: string;
  pickType: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <form
      action={placePickAction}
      className="rounded-lg border border-slate-800 bg-slate-950 p-3"
    >
      <input type="hidden" name="gameId" value={gameId} />
      <input type="hidden" name="lineId" value={lineId} />
      <input type="hidden" name="pickType" value={pickType} />
      <div className="mb-2 text-xs font-semibold uppercase text-slate-500">
        {label}
      </div>
      <div className="mb-2 space-y-1">
        {options.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="pickSide"
              value={opt.value}
              required
              className="accent-emerald-500"
            />
            {opt.label}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          name="wager"
          type="number"
          min={1}
          placeholder="Coins"
          required
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="whitespace-nowrap rounded-lg bg-emerald-500 px-3 py-1 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
        >
          Place
        </button>
      </div>
    </form>
  );
}
