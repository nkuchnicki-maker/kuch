// Per-round cap for every casino game — a hand of blackjack, a spin, or a
// baccarat deal. Sports picks/parlays aren't affected by this. Plain
// constant, not "server-only" — the UI imports it too, to set input max
// attributes and show the limit, though the server action is what
// actually enforces it.
export const MAX_CASINO_WAGER = 100;
