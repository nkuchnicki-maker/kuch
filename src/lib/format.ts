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

// Formats a game start time in US Eastern, 12-hour clock, always labeled
// "EST" regardless of DST — these pages render server-side, so leaving it
// to toLocaleString() would show the server's own locale/timezone (24-hour,
// not necessarily Eastern) instead of something meaningful to users.
export function formatGameTime(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${formatted} EST`;
}
