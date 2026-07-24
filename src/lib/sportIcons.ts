const SPORT_ICONS: Record<string, string> = {
  NFL: "🏈",
  NCAAF: "🏈",
  NBA: "🏀",
  NCAAB: "🏀",
  MLB: "⚾",
  NHL: "🏒",
  Golf: "⛳",
};

export function sportIcon(sport: string): string {
  return SPORT_ICONS[sport] ?? "🏆";
}
