const SPORT_ICONS: Record<string, string> = {
  NFL: "🏈",
  "NFL Preseason": "🏈",
  NCAAF: "🏈",
  NBA: "🏀",
  NCAAB: "🏀",
  WNBA: "🏀",
  MLB: "⚾",
  NHL: "🏒",
  MMA: "🥊",
  Boxing: "🥊",
  Golf: "⛳",
  EPL: "⚽",
  MLS: "⚽",
  "La Liga": "⚽",
  "Serie A": "⚽",
  Bundesliga: "⚽",
  "Ligue 1": "⚽",
  "Liga MX": "⚽",
  "UEFA Champions League": "⚽",
  "UEFA Europa League": "⚽",
  "Brazil Serie A": "⚽",
  "Argentina Primera": "⚽",
  "Copa Libertadores": "⚽",
  "Copa Sudamericana": "⚽",
};

export function sportIcon(sport: string): string {
  if (SPORT_ICONS[sport]) return SPORT_ICONS[sport];
  if (sport.startsWith("ATP") || sport.startsWith("WTA")) return "🎾";
  if (sport.includes("Open Championship") || sport.includes("Masters") || sport.includes("PGA")) {
    return "⛳";
  }
  return "🏆";
}
