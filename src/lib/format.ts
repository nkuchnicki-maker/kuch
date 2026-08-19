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

// Same fix as formatGameTime, for timestamps like "Placed" on a bet —
// naive toLocaleString() on these server components renders in the
// server's own UTC time, not the viewer's, which is what made a bet
// placed shortly before a fight card started look like it was placed
// after the card started (or even "tomorrow") to an Eastern-time viewer.
// Includes the year since a placed timestamp can be months old, unlike a
// game time which is always near-term.
export function formatDateTime(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${formatted} EST`;
}

// Turns a pick into a short, plain-English label — "Chicago White Sox ML",
// "Chicago White Sox -3.5", "Over 8.5", "Draw" — instead of the raw
// pick_type/pick_side jargon ("moneyline — home"). Used anywhere admins/
// agents need to scan a lot of bets quickly (e.g. the Bets tab).
export function describePick(params: {
  pickType: string;
  pickSide: string;
  homeTeam: string | null;
  awayTeam: string | null;
  spread: number | null;
  total: number | null;
}): string {
  const { pickType, pickSide, homeTeam, awayTeam, spread, total } = params;

  if (pickType === "moneyline") {
    if (pickSide === "draw") return "Draw";
    const team = pickSide === "home" ? homeTeam : awayTeam;
    return `${team ?? "?"} ML`;
  }
  if (pickType === "spread" && spread != null) {
    const teamSpread = pickSide === "home" ? spread : -spread;
    const team = pickSide === "home" ? homeTeam : awayTeam;
    return `${team ?? "?"} ${teamSpread > 0 ? "+" : ""}${teamSpread}`;
  }
  if (pickType === "total" && total != null) {
    return `${pickSide === "over" ? "Over" : "Under"} ${total}`;
  }
  if (pickType === "outright") {
    return pickSide; // pick_side IS the participant/team name for outrights
  }
  return `${pickType} — ${pickSide}`;
}
