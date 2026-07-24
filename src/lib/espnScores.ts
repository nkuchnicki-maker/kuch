import "server-only";

// ESPN's public scoreboard endpoint — no API key, not officially documented
// or guaranteed stable, but widely relied on for exactly this (live period/
// clock display). Used purely as a display enhancement on Live Sports:
// never feeds odds, scores, or settlement — those all still come from The
// Odds API, unchanged. If ESPN is slow/down/reshapes its response, this
// just quietly shows nothing extra rather than breaking the page.
const ESPN_LEAGUE_PATHS: Record<string, string> = {
  NFL: "football/nfl",
  NCAAF: "football/college-football",
  NBA: "basketball/nba",
  NCAAB: "basketball/mens-college-basketball",
  MLB: "baseball/mlb",
  NHL: "hockey/nhl",
};

export type EspnGameState = {
  detail: string; // e.g. "8:42 - 3rd Quarter", "Bot 5th", "Halftime"
};

function normalizeTeamName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function espnGameKey(homeTeam: string, awayTeam: string): string {
  return `${normalizeTeamName(homeTeam)}|${normalizeTeamName(awayTeam)}`;
}

type EspnEvent = {
  status?: { type?: { shortDetail?: string; state?: string } };
  competitions?: {
    competitors?: {
      homeAway?: string;
      team?: { displayName?: string };
    }[];
  }[];
};

// One fetch covers every game currently on ESPN's board for that league —
// call once per sport with a live game, not once per game.
export async function fetchEspnGameStates(
  sportLabel: string,
): Promise<Map<string, EspnGameState>> {
  const states = new Map<string, EspnGameState>();
  const leaguePath = ESPN_LEAGUE_PATHS[sportLabel];
  if (!leaguePath) return states;

  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${leaguePath}/scoreboard`,
      { cache: "no-store" },
    );
    if (!res.ok) return states;

    const data: { events?: EspnEvent[] } = await res.json();
    for (const event of data.events ?? []) {
      // Only trust ESPN's "in progress" state — our own games query already
      // filters to status = 'live', so a pregame/final mismatch here would
      // otherwise show a confusing "TBD"/final line on a game we know is live.
      if (event.status?.type?.state !== "in") continue;

      const competitors = event.competitions?.[0]?.competitors ?? [];
      const home = competitors.find((c) => c.homeAway === "home");
      const away = competitors.find((c) => c.homeAway === "away");
      const detail = event.status?.type?.shortDetail;
      const homeName = home?.team?.displayName;
      const awayName = away?.team?.displayName;
      if (!homeName || !awayName || !detail) continue;

      states.set(espnGameKey(homeName, awayName), { detail });
    }
  } catch {
    // Best-effort only — swallow and show nothing extra.
  }

  return states;
}
