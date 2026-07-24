import "server-only";

// The raw probability, per round, of forcing a "not a win" (loss or push)
// regardless of what the player bet — this is NOT the same number as the
// final observed house win rate. Each game still applies its own real odds
// in the non-forced branch, and real casino odds already favor the house,
// so the two effects compound. This value was reverse-engineered by
// simulation (see the sweep in the PR/commit that added this) to land the
// overall house win rate at roughly the target 70% for TYPICAL bets —
// measured empirically at roughly:
//   roulette (red/black/even/odd/high/low): ~31% player win
//   baccarat (banker):                      ~30% player win
//   blackjack (reasonable play):             ~27% player win
// Long-shot bets (a straight roulette number, a tie in baccarat) end up
// even harder than that — same mechanism, just compounding on top of
// already-worse real odds, which is the correct/expected direction (a
// riskier bet should still pay out less often than a safer one, even in a
// rigged casino). Do not "fix" this by setting it to literally 0.7 —
// that overshoots to roughly an 85-90% house win rate, since it stacks on
// top of the real per-game odds instead of accounting for them.
export const CASINO_HOUSE_EDGE = 0.35;

// callers use this to bias a round toward a player loss (or at least "not
// a win") while still resolving the round through each game's real rules,
// not a hand-picked fake result.
export function rollForcedLoss(): boolean {
  return Math.random() < CASINO_HOUSE_EDGE;
}
