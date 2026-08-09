// American-odds payout math, shared by pick creation and settlement.
// Standard -110 juice is assumed for spread/total picks since lines
// only store a number (spread/total), not per-side odds.
export const STANDARD_JUICE = -110;

// Returns the TOTAL amount returned to the user if they win, wager included.
// Still the right figure for anything that pays out the full total on a
// win — casino games, and settling an old stake_debited=true pick/parlay.
export function payoutForOdds(odds: number, wager: number): number {
  if (odds > 0) return wager + wager * (odds / 100);
  return wager + wager * (100 / Math.abs(odds));
}

// Profit only (payout minus stake) — what a sports pick/parlay actually
// pays out under the deferred-stake-debit model (see settle.ts): the
// stake was never removed from the balance, so a win only ever adds the
// profit, not the stake back on top of itself.
export function profitForOdds(odds: number, wager: number): number {
  if (odds > 0) return wager * (odds / 100);
  return wager * (100 / Math.abs(odds));
}

// Decimal odds = payout multiple per $1 wagered (e.g. -110 -> ~1.909,
// +150 -> 2.5). Parlay legs combine by multiplying decimal odds together.
export function americanToDecimal(odds: number): number {
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

// "+150" / "-110" — American odds always show an explicit sign.
export function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

// Inverse of americanToDecimal — used to show a parlay's combined decimal
// odds (product of every leg) back in the American format bettors expect,
// e.g. combined decimal 3.5 -> "+250".
export function decimalToAmerican(decimal: number): number {
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
}
