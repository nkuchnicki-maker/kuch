import "server-only";
import type { Pool } from "pg";
import { fetchOdds, fetchOutrights, fetchScores, pickBookmaker } from "./oddsApi";
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

// Golf works as "outright" events (a whole field of players, one winner)
// rather than two-team matchups, so it's synced separately — no live
// scores exist for these; the admin declares the winner manually.
export const GOLF_TOURNAMENTS: { key: string; label: string }[] = [
  { key: "golf_masters_tournament_winner", label: "The Masters" },
  { key: "golf_the_open_championship_winner", label: "The Open Championship" },
  { key: "golf_pga_championship_winner", label: "PGA Championship" },
  { key: "golf_us_open_winner", label: "US Open" },
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

    // Keep refreshing the line while the game is scheduled or live so
    // in-play betting has current odds. Once final, stop — existing picks
    // already captured their own odds/payout at placement time regardless,
    // so updating this table never changes a past pick's payout.
    if (game.status !== "scheduled" && game.status !== "live") continue;

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

export async function syncGolfOutrights(
  db: Pool,
): Promise<{ gamesUpserted: number; errors: string[] }> {
  const errors: string[] = [];
  let gamesUpserted = 0;

  for (const { key, label } of GOLF_TOURNAMENTS) {
    let events;
    try {
      events = await fetchOutrights(key);
    } catch (err) {
      errors.push(`${label}: ${(err as Error).message}`);
      continue;
    }

    for (const event of events) {
      let game: { id: string; status: string };
      try {
        const { rows } = await db.query<{ id: string; status: string }>(
          `insert into games (external_id, sport, event_type, event_name, start_time)
           values ($1, 'Golf', 'outright', $2, $3)
           on conflict (external_id) do update set
             event_name = excluded.event_name,
             start_time = excluded.start_time
           returning id, status`,
          [event.id, label, event.commence_time],
        );
        game = rows[0];
      } catch (err) {
        errors.push(`${label}: ${(err as Error).message}`);
        continue;
      }

      if (game.status !== "scheduled") continue;

      const bookmaker = pickBookmaker(event.bookmakers);
      const outrights = bookmaker?.markets.find((m) => m.key === "outrights");
      if (!outrights) continue;

      const participants = outrights.outcomes.map((o) => ({
        name: o.name,
        odds: o.price,
      }));

      try {
        await db.query(
          `insert into lines (game_id, outrights, updated_at)
           values ($1, $2::jsonb, now())
           on conflict (game_id) do update set
             outrights = excluded.outrights,
             updated_at = now()`,
          [game.id, JSON.stringify(participants)],
        );
      } catch (err) {
        errors.push(`${label} field: ${(err as Error).message}`);
        continue;
      }

      gamesUpserted++;
    }
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

// Refreshes odds only for sports that currently have at least one live
// game in our database — skips The Odds API entirely for everything else,
// so this costs ~0 credits on days with nothing in progress. Meant to be
// run frequently (e.g. every 10-15 min) alongside the twice-daily full sync,
// to keep in-play odds current without paying for a full sync at that cadence.
export async function syncLiveOdds(db: Pool): Promise<SyncSummary[]> {
  const { rows: liveSports } = await db.query<{ sport: string }>(
    "select distinct sport from games where status = 'live'",
  );
  const liveSportLabels = new Set(liveSports.map((r) => r.sport));
  const relevantSports = TRACKED_SPORTS.filter((s) => liveSportLabels.has(s.label));

  const summaries: SyncSummary[] = [];
  for (const { key, label } of relevantSports) {
    const errors: string[] = [];
    let gamesUpserted = 0;
    let gamesSettled = 0;

    try {
      const oddsResult = await syncOddsForSport(db, key, label);
      gamesUpserted = oddsResult.gamesUpserted;
      errors.push(...oddsResult.errors);
    } catch (err) {
      errors.push(`live odds: ${(err as Error).message}`);
    }

    // Also check scores so games that just finished settle promptly
    // instead of waiting for the next twice-daily full sync.
    try {
      const scoresResult = await syncScoresForSport(db, key);
      gamesSettled = scoresResult.gamesSettled;
      errors.push(...scoresResult.errors);
    } catch (err) {
      errors.push(`live scores: ${(err as Error).message}`);
    }

    summaries.push({ sport: label, gamesUpserted, gamesSettled, errors });
  }

  return summaries;
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

  const golfErrors: string[] = [];
  let golfGamesUpserted = 0;
  try {
    const golfResult = await syncGolfOutrights(db);
    golfGamesUpserted = golfResult.gamesUpserted;
    golfErrors.push(...golfResult.errors);
  } catch (err) {
    golfErrors.push(`golf: ${(err as Error).message}`);
  }
  summaries.push({
    sport: "Golf",
    gamesUpserted: golfGamesUpserted,
    gamesSettled: 0,
    errors: golfErrors,
  });

  return summaries;
}
