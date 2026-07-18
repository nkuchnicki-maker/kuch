// American-odds payout math, shared by pick creation and settlement.
// Standard -110 juice is assumed for spread/total picks since lines
// only store a number (spread/total), not per-side odds.
export const STANDARD_JUICE = -110;

// Returns the TOTAL amount returned to the user if they win, wager included.
export function payoutForOdds(odds: number, wager: number): number {
  if (odds > 0) return wager + wager * (odds / 100);
  return wager + wager * (100 / Math.abs(odds));
}

// Decimal odds = payout multiple per $1 wagered (e.g. -110 -> ~1.909,
// +150 -> 2.5). Parlay legs combine by multiplying decimal odds together.
export function americanToDecimal(odds: number): number {
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}
