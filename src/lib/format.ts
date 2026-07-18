// Formats a play-money balance/wager/payout as a dollar amount for display.
// Purely cosmetic — the underlying value is still play money with no cash
// value, never purchased or redeemed for real currency.
export function formatMoney(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
