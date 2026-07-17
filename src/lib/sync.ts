import "server-only";
import type { Pool } from "pg";
import { fetchOdds, fetchScores, pickBookmaker } from "./oddsApi";
import { settlePicksForGame } from "./settle";

// The Odds API "sport key" -> label we store in games.sport.
// Add/remove entries here to change what gets auto-synced. This covers
// the major US sports; out-of-season ones just sync zero games until
// their season starts, at no extra cost.
export const TRACKED_SPORTS: { key: string; label: string }[] = [
  { key: "americanfootball_nfl", label: "NFL" },
  { key: "americanfootball_ncaaf", label: "NCAAF" },
  { key: "basketball_nba", label: "NBA" },
  { key: "basketball_ncaab", label: "NCAAB" },
  { key: "baseball_mlb", label: "MLB" },
  { key: "icehockey_nhl", label: "NHL" },
];

export type SyncSummary = {
  sport: string;
  gamesUpserted: number;
  gamesSettled: number;
  errors: string[];
};

export async function syncOddsForSport(
  db: Pool,
  sportKey: string,
  sportLabel: string,
): Promise<{ gamesUpserted: number; errors: string[] }> {
  const errors: string[] = [];
  let gamesUpserted = 0;

  const events = await fetchOdds(sportKey);

  for (const event of events) {
    let game: { id: string; status: string };
    try {
      const { rows } = await db.query<{ id: string; status: string }>(
        `insert into games (external_id, sport, home_team, away_team, start_time)
         values ($1, $2, $3, $4, $5)
         on conflict (external_id) do update set
           sport = excluded.sport,
           home_team = excluded.home_team,
           away_team = excluded.away_team,
           start_time = excluded.start_time
         returning id, status`,
        [event.id, sportLabel, event.home_team, event.away_team, event.commence_time],
      );
      game = rows[0];
    } catch (err) {
      errors.push(`${event.away_team} @ ${event.home_team}: ${(err as Error).message}`);
      continue;
    }

    // Don't move the line once the game has gone live/final — picks were
    // placed against the pre-game number.
    if (game.status !== "scheduled") continue;

    const bookmaker = pickBookmaker(event.bookmakers);
    if (!bookmaker) continue;

    const h2h = bookmaker.markets.find((m) => m.key === "h2h");
    const spreads = bookmaker.markets.find((m) => m.key === "spreads");
    const totals = bookmaker.markets.find((m) => m.key === "totals");

    const homeSpread = spreads?.outcomes.find((o) => o.name === event.home_team)?.point;
    const total = totals?.outcomes[0]?.point;
    const moneylineHome = h2h?.outcomes.find((o) => o.name === event.home_team)?.price;
    const moneylineAway = h2h?.outcomes.find((o) => o.name === event.away_team)?.price;

    try {
      await db.query(
        `insert into lines (game_id, spread, total, moneyline_home, moneyline_away, updated_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (game_id) do update set
           spread = excluded.spread,
           total = excluded.total,
           moneyline_home = excluded.moneyline_home,
           moneyline_away = excluded.moneyline_away,
           updated_at = now()`,
        [
          game.id,
          homeSpread ?? null,
          total ?? null,
          moneylineHome ?? null,
          moneylineAway ?? null,
        ],
      );
    } catch (err) {
      errors.push(`${event.away_team} @ ${event.home_team} line: ${(err as Error).message}`);
      continue;
    }

    gamesUpserted++;
  }

  return { gamesUpserted, errors };
}

export async function syncScoresForSport(
  db: Pool,
  sportKey: string,
): Promise<{ gamesSettled: number; errors: string[] }> {
  const errors: string[] = [];
  let gamesSettled = 0;

  const scores = await fetchScores(sportKey);

  for (const entry of scores) {
    const { rows } = await db.query<{
      id: string;
      status: string;
      home_team: string;
      away_team: string;
    }>(
      "select id, status, home_team, away_team from games where external_id = $1",
      [entry.id],
    );
    const game = rows[0];

    if (!game || game.status === "final" || !entry.scores) continue;

    const homeScore = entry.scores.find((s) => s.name === game.home_team)?.score;
    const awayScore = entry.scores.find((s) => s.name === game.away_team)?.score;
    if (homeScore == null || awayScore == null) continue;

    if (entry.completed) {
      try {
        await settlePicksForGame(db, game.id, Number(homeScore), Number(awayScore));
        gamesSettled++;
      } catch (err) {
        errors.push(`${game.away_team} @ ${game.home_team}: ${(err as Error).message}`);
      }
    } else if (game.status === "scheduled") {
      await db.query(
        "update games set status = 'live', home_score = $1, away_score = $2 where id = $3",
        [Number(homeScore), Number(awayScore), game.id],
      );
    } else {
      await db.query(
        "update games set home_score = $1, away_score = $2 where id = $3",
        [Number(homeScore), Number(awayScore), game.id],
      );
    }
  }

  return { gamesSettled, errors };
}

export async function syncAllTrackedSports(db: Pool): Promise<SyncSummary[]> {
  const summaries: SyncSummary[] = [];

  for (const { key, label } of TRACKED_SPORTS) {
    const errors: string[] = [];
    let gamesUpserted = 0;
    let gamesSettled = 0;

    try {
      const oddsResult = await syncOddsForSport(db, key, label);
      gamesUpserted = oddsResult.gamesUpserted;
      errors.push(...oddsResult.errors);
    } catch (err) {
      errors.push(`odds: ${(err as Error).message}`);
    }

    try {
      const scoresResult = await syncScoresForSport(db, key);
      gamesSettled = scoresResult.gamesSettled;
      errors.push(...scoresResult.errors);
    } catch (err) {
      errors.push(`scores: ${(err as Error).message}`);
    }

    summaries.push({ sport: label, gamesUpserted, gamesSettled, errors });
  }

  return summaries;
}
