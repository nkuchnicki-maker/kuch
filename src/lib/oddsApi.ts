import "server-only";

const BASE_URL = "https://api.the-odds-api.com/v4";

export type OddsApiOutcome = {
  name: string;
  price: number;
  point?: number;
};

export type OddsApiMarket = {
  key: "h2h" | "spreads" | "totals" | "outrights";
  outcomes: OddsApiOutcome[];
};

export type OddsApiBookmaker = {
  key: string;
  title: string;
  markets: OddsApiMarket[];
};

export type OddsApiEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string | null; // null for outright events (e.g. golf tournaments)
  away_team: string | null;
  bookmakers: OddsApiBookmaker[];
};

export type OddsApiScoreEntry = {
  id: string;
  sport_key: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
};

function apiKey() {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new Error("ODDS_API_KEY is not set");
  return key;
}

export async function fetchOdds(sportKey: string): Promise<OddsApiEvent[]> {
  const url = `${BASE_URL}/sports/${sportKey}/odds?apiKey=${apiKey()}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`The Odds API odds request failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function fetchOutrights(sportKey: string): Promise<OddsApiEvent[]> {
  const url = `${BASE_URL}/sports/${sportKey}/odds?apiKey=${apiKey()}&regions=us&markets=outrights&oddsFormat=american`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`The Odds API outrights request failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function fetchScores(
  sportKey: string,
  daysFrom = 2,
): Promise<OddsApiScoreEntry[]> {
  const url = `${BASE_URL}/sports/${sportKey}/scores?apiKey=${apiKey()}&daysFrom=${daysFrom}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`The Odds API scores request failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// Prefer well-known, reliably-populated books; fall back to whatever is first.
const PREFERRED_BOOKMAKERS = ["draftkings", "fanduel", "betmgm", "caesars"];

export function pickBookmaker(
  bookmakers: OddsApiBookmaker[],
): OddsApiBookmaker | undefined {
  for (const key of PREFERRED_BOOKMAKERS) {
    const match = bookmakers.find((b) => b.key === key);
    if (match) return match;
  }
  return bookmakers[0];
}
