import "server-only";
import type { Pool } from "pg";
import { fetchOdds, fetchOutrights, fetchScores, pickBookmaker, pickMarket } from "./oddsApi";
import { settlePicksForGame } from "./settle";
import { isBigMove, lockedUntilTimestamp } from "./marketLock";

// The Odds API "sport key" -> label we store in games.sport.
// Add/remove entries here to change what gets auto-synced. This covers
// the major US sports; out-of-season ones just sync zero games until
// their season starts, at no extra cost.
export const TRACKED_SPORTS: { key: string; label: string }[] = [
  { key: "americanfootball_nfl", label: "NFL" },
  { key: "americanfootball_ncaaf", label: "NCAAF" },
  { key: "basketball_nba", label: "NBA" },
  { key: "basketball_ncaab", label: "NCAAB" },
  { key: "basketball_wnba", label: "WNBA" },
  { key: "baseball_mlb", label: "MLB" },
  { key: "icehockey_nhl", label: "NHL" },
  { key: "mma_mixed_martial_arts", label: "MMA" },
  { key: "soccer_epl", label: "EPL" },
  { key: "soccer_usa_mls", label: "MLS" },
  { key: "soccer_brazil_campeonato", label: "Brazil Serie A" },
  { key: "soccer_argentina_primera_division", label: "Argentina Primera" },
  { key: "soccer_conmebol_copa_libertadores", label: "Copa Libertadores" },
  { key: "soccer_conmebol_copa_sudamericana", label: "Copa Sudamericana" },
  { key: "tennis_atp_aus_open_singles", label: "ATP Australian Open" },
  { key: "tennis_atp_french_open", label: "ATP French Open" },
  { key: "tennis_atp_wimbledon", label: "ATP Wimbledon" },
  { key: "tennis_atp_us_open", label: "ATP US Open" },
  { key: "tennis_atp_canadian_open", label: "ATP Canadian Open" },
  { key: "tennis_atp_cincinnati_open", label: "ATP Cincinnati Open" },
  { key: "tennis_wta_aus_open_singles", label: "WTA Australian Open" },
  { key: "tennis_wta_french_open", label: "WTA French Open" },
  { key: "tennis_wta_wimbledon", label: "WTA Wimbledon" },
  { key: "tennis_wta_us_open", label: "WTA US Open" },
  { key: "tennis_wta_canadian_open", label: "WTA Canadian Open" },
  { key: "tennis_wta_cincinnati_open", label: "WTA Cincinnati Open" },
];

// Golf works as "outright" events (a whole field of players, one winner)
// rather than two-team matchups, so it's synced separately — no live
// scores exist for these; the admin declares the winner manually.
export const GOLF_TOURNAMENTS: { key: string; label: string; sport: string }[] = [
  { key: "golf_masters_tournament_winner", label: "The Masters", sport: "Golf" },
  { key: "golf_the_open_championship_winner", label: "The Open Championship", sport: "Golf" },
  { key: "golf_pga_championship_winner", label: "PGA Championship", sport: "Golf" },
  { key: "golf_us_open_winner", label: "US Open", sport: "Golf" },
];

// Championship/title futures — same outright shape as golf (a whole field,
// one eventual winner), but grouped under the same sport label as the
// regular-season games (e.g. "NFL") so they show up together in the sport
// filter instead of needing their own bucket.
export const FUTURES_EVENTS: { key: string; label: string; sport: string }[] = [
  { key: "americanfootball_nfl_super_bowl_winner", label: "Super Bowl Winner", sport: "NFL" },
  {
    key: "americanfootball_ncaaf_championship_winner",
    label: "NCAAF Championship Winner",
    sport: "NCAAF",
  },
  { key: "basketball_nba_championship_winner", label: "NBA Championship Winner", sport: "NBA" },
  {
    key: "basketball_ncaab_championship_winner",
    label: "NCAAB Championship Winner",
    sport: "NCAAB",
  },
  { key: "baseball_mlb_world_series_winner", label: "World Series Winner", sport: "MLB" },
  { key: "icehockey_nhl_championship_winner", label: "NHL Championship Winner", sport: "NHL" },
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

    if (!event.bookmakers.length) continue;

    // Picked independently per market (not from a single bookmaker) since
    // a top-preference book often has moneyline for a game before it has
    // spreads/totals, especially for smaller soccer leagues — see
    // pickMarket's comment in oddsApi.ts.
    const h2h = pickMarket(event.bookmakers, "h2h");
    const spreads = pickMarket(event.bookmakers, "spreads");
    const totals = pickMarket(event.bookmakers, "totals");

    const homeSpread = spreads?.outcomes.find((o) => o.name === event.home_team)?.point;
    const total = totals?.outcomes[0]?.point;
    const moneylineHome = h2h?.outcomes.find((o) => o.name === event.home_team)?.price;
    const moneylineAway = h2h?.outcomes.find((o) => o.name === event.away_team)?.price;
    // Soccer's h2h market has a third "Draw" outcome; other sports simply
    // won't have one, leaving this null.
    const moneylineDraw = h2h?.outcomes.find((o) => o.name === "Draw")?.price;

    try {
      const { rows: existingRows } = await db.query<{
        spread: string | null;
        total: string | null;
        moneyline_home: number | null;
        moneyline_away: number | null;
      }>(
        "select spread, total, moneyline_home, moneyline_away from lines where game_id = $1",
        [game.id],
      );
      const existing = existingRows[0];

      const bigMove =
        !!existing &&
        (isBigMove(
          existing.spread != null ? Number(existing.spread) : null,
          homeSpread ?? null,
          "spread",
        ) ||
          isBigMove(existing.total != null ? Number(existing.total) : null, total ?? null, "total") ||
          isBigMove(existing.moneyline_home, moneylineHome ?? null, "moneyline") ||
          isBigMove(existing.moneyline_away, moneylineAway ?? null, "moneyline"));

      // A big move on a live game pauses betting on it briefly so no one
      // can wager against a number that's about to change; a prematch move
      // just gets flagged for visibility — no lock needed before kickoff.
      const shouldLock = bigMove && game.status === "live";

      await db.query(
        `insert into lines (
           game_id, spread, total, moneyline_home, moneyline_away, moneyline_draw,
           updated_at, last_big_move_at, locked_until
         )
         values ($1, $2, $3, $4, $5, $6, now(), $7, $8)
         on conflict (game_id) do update set
           spread = excluded.spread,
           total = excluded.total,
           moneyline_home = excluded.moneyline_home,
           moneyline_away = excluded.moneyline_away,
           moneyline_draw = excluded.moneyline_draw,
           updated_at = now(),
           last_big_move_at = coalesce(excluded.last_big_move_at, lines.last_big_move_at),
           locked_until = coalesce(excluded.locked_until, lines.locked_until)`,
        [
          game.id,
          homeSpread ?? null,
          total ?? null,
          moneylineHome ?? null,
          moneylineAway ?? null,
          moneylineDraw ?? null,
          bigMove ? new Date() : null,
          shouldLock ? lockedUntilTimestamp() : null,
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

export async function syncOutrightEvents(
  db: Pool,
  tournaments: { key: string; label: string; sport: string }[],
): Promise<{ gamesUpserted: number; errors: string[] }> {
  const errors: string[] = [];
  let gamesUpserted = 0;

  for (const { key, label, sport } of tournaments) {
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
           values ($1, $2, 'outright', $3, $4)
           on conflict (external_id) do update set
             event_name = excluded.event_name,
             start_time = excluded.start_time
           returning id, status`,
          [event.id, sport, label, event.commence_time],
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
      home_score: number | null;
      away_score: number | null;
    }>(
      "select id, status, home_team, away_team, home_score, away_score from games where external_id = $1",
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
      // A score change while already live means a scoring play just
      // happened — lock this game's market briefly so no one can bet
      // against a number that's about to move.
      const scoreChanged =
        game.home_score !== Number(homeScore) || game.away_score !== Number(awayScore);

      await db.query(
        "update games set home_score = $1, away_score = $2 where id = $3",
        [Number(homeScore), Number(awayScore), game.id],
      );

      if (scoreChanged) {
        await db.query(
          "update lines set locked_until = $1 where game_id = $2",
          [lockedUntilTimestamp(), game.id],
        );
      }
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

// Called synchronously at live-bet placement time (not just from cron) —
// forces an authoritative, on-demand score check for this one game's sport
// before we decide whether the bet can proceed. Closes the gap where a
// game has actually ended (or a big play just happened) but the periodic
// poll hasn't run yet: this makes that check happen right now instead of
// trusting a DB row that could be stale by however long it's been since
// the last cron tick. No-op (and no API cost) for anything not currently
// 'live' in our DB, so prematch bets pay nothing extra.
export async function refreshLiveGameIfNeeded(db: Pool, gameId: string): Promise<void> {
  const { rows } = await db.query<{ status: string; sport: string }>(
    "select status, sport from games where id = $1",
    [gameId],
  );
  const game = rows[0];
  if (!game || game.status !== "live") return;

  const sportKey = TRACKED_SPORTS.find((s) => s.label === game.sport)?.key;
  if (!sportKey) return; // golf/outrights never go live, nothing to refresh

  try {
    await syncScoresForSport(db, sportKey);
  } catch {
    // Fail closed — better to ask the bettor to retry than to accept a
    // live bet we couldn't actually verify against a fresh score.
    throw new Error(
      "Couldn't confirm this game's current status — try again in a moment",
    );
  }
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
    const golfResult = await syncOutrightEvents(db, GOLF_TOURNAMENTS);
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

  const futuresErrors: string[] = [];
  let futuresGamesUpserted = 0;
  try {
    const futuresResult = await syncOutrightEvents(db, FUTURES_EVENTS);
    futuresGamesUpserted = futuresResult.gamesUpserted;
    futuresErrors.push(...futuresResult.errors);
  } catch (err) {
    futuresErrors.push(`futures: ${(err as Error).message}`);
  }
  summaries.push({
    sport: "Futures",
    gamesUpserted: futuresGamesUpserted,
    gamesSettled: 0,
    errors: futuresErrors,
  });

  return summaries;
}
