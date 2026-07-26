import "server-only";
import type { Pool } from "pg";

// How far a number has to move before it counts as a "big" move — tune
// these if they feel too twitchy or too loose once this is running for
// real games.
export const BIG_MOVE_THRESHOLDS = {
  spread: 1.5,
  total: 1.5,
  moneyline: 40,
} as const;

export function isBigMove(
  previous: number | null | undefined,
  next: number | null | undefined,
  kind: keyof typeof BIG_MOVE_THRESHOLDS,
): boolean {
  if (previous == null || next == null) return false;
  return Math.abs(next - previous) >= BIG_MOVE_THRESHOLDS[kind];
}

// How long a market stays locked after a big play (a score change) or a
// sharp odds move — long enough for the odds provider to catch up and for
// any bet already mid-hold to see the lock on its re-check.
export const LOCK_DURATION_SECONDS = 60;

// How long a live bet is held before it's actually placed, re-checking the
// line and lock state right before committing. Pre-match bets skip this
// entirely — only bets on a currently-live game get held.
export const BET_HOLD_SECONDS = 10;

export function lockedUntilTimestamp(): Date {
  return new Date(Date.now() + LOCK_DURATION_SECONDS * 1000);
}

export function isCurrentlyLocked(lockedUntil: Date | string | null): boolean {
  if (!lockedUntil) return false;
  return new Date(lockedUntil).getTime() > Date.now();
}

export type LineSnapshot = {
  spread: number | null;
  total: number | null;
  moneylineHome: number | null;
  moneylineAway: number | null;
  moneylineDraw: number | null;
  lockedUntil: string | null;
};

export async function fetchLineSnapshot(db: Pool, lineId: string): Promise<LineSnapshot | null> {
  const { rows } = await db.query<{
    spread: string | null;
    total: string | null;
    moneyline_home: number | null;
    moneyline_away: number | null;
    moneyline_draw: number | null;
    locked_until: string | null;
  }>(
    "select spread, total, moneyline_home, moneyline_away, moneyline_draw, locked_until from lines where id = $1",
    [lineId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    spread: row.spread != null ? Number(row.spread) : null,
    total: row.total != null ? Number(row.total) : null,
    moneylineHome: row.moneyline_home,
    moneylineAway: row.moneyline_away,
    moneylineDraw: row.moneyline_draw,
    lockedUntil: row.locked_until,
  };
}

function moveKindFor(pickType: string): keyof typeof BIG_MOVE_THRESHOLDS | null {
  if (pickType === "spread") return "spread";
  if (pickType === "total") return "total";
  if (pickType === "moneyline") return "moneyline";
  return null; // outright — never live, no movement check needed
}

function relevantValue(
  snapshot: LineSnapshot,
  pickType: string,
  pickSide: string,
): number | null {
  if (pickType === "spread") return snapshot.spread;
  if (pickType === "total") return snapshot.total;
  if (pickType === "moneyline") {
    if (pickSide === "draw") return snapshot.moneylineDraw;
    return pickSide === "home" ? snapshot.moneylineHome : snapshot.moneylineAway;
  }
  return null;
}

export type LiveBetLeg = {
  lineId: string;
  gameStatus: string;
  pickType: string;
  pickSide: string;
  before: LineSnapshot;
};

// Holds a live bet for BET_HOLD_SECONDS before it's actually placed, then
// re-checks the line hasn't locked or moved big in the meantime — exactly
// the window a "big play" (a score change, or the sportsbook itself
// yanking the line) needs to show up before the bet commits. A no-op for
// picks/legs on a game that isn't currently live — pre-match bets place
// instantly, same as always. Throws (rejecting the whole bet, single pick
// or parlay) if any live leg locked or moved past tolerance.
export async function holdForLiveBet(db: Pool, legs: LiveBetLeg[]): Promise<void> {
  const liveLegs = legs.filter((l) => l.gameStatus === "live");
  if (liveLegs.length === 0) return;

  for (const leg of liveLegs) {
    if (isCurrentlyLocked(leg.before.lockedUntil)) {
      throw new Error(
        "Bet rejected: market locked 🔒 — a big play just happened, try again in a moment",
      );
    }
  }

  await new Promise((resolve) => setTimeout(resolve, BET_HOLD_SECONDS * 1000));

  for (const leg of liveLegs) {
    const after = await fetchLineSnapshot(db, leg.lineId);
    if (!after) throw new Error("Bet rejected: this line is no longer available");
    if (isCurrentlyLocked(after.lockedUntil)) {
      throw new Error(
        "Bet rejected: market locked 🔒 — a big play happened while your bet was processing",
      );
    }

    const kind = moveKindFor(leg.pickType);
    if (!kind) continue;
    const beforeValue = relevantValue(leg.before, leg.pickType, leg.pickSide);
    const afterValue = relevantValue(after, leg.pickType, leg.pickSide);
    if (isBigMove(beforeValue, afterValue, kind)) {
      throw new Error("Bet rejected: the line moved while your bet was processing");
    }
  }
}
