import "server-only";

export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export type Card = { rank: Rank; suit: Suit };

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

function randomSuit(): Suit {
  return SUITS[Math.floor(Math.random() * SUITS.length)];
}

// Simulates drawing from a continuously-reshuffled shoe (each draw
// independent) rather than tracking a finite 52-card deck depleting across
// a hand — a standard simplification for casual/online table games, and
// what lets a hand's state travel as a small encrypted token instead of a
// whole remaining-deck array.
export function randomCard(): Card {
  return { rank: RANKS[Math.floor(Math.random() * RANKS.length)], suit: randomSuit() };
}

// A card of a specific blackjack point value, for display purposes when
// the value itself is already decided (see blackjack.ts's rigged dealer
// draws) — e.g. value 10 might show as '10', 'J', 'Q', or 'K'.
export function cardForValue(value: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11): Card {
  const suit = randomSuit();
  if (value === 11 || value === 1) return { rank: "A", suit };
  if (value === 10) {
    const tenRanks: Rank[] = ["10", "J", "Q", "K"];
    return { rank: tenRanks[Math.floor(Math.random() * tenRanks.length)], suit };
  }
  return { rank: String(value) as Rank, suit };
}

// Blackjack point value for a single card, Ace counted high (11) — total
// hand value handles downgrading Aces to 1 as needed (see handValue below).
function blackjackCardValue(card: Card): number {
  if (card.rank === "A") return 11;
  if (card.rank === "J" || card.rank === "Q" || card.rank === "K") return 10;
  return Number(card.rank);
}

export function blackjackHandValue(cards: Card[]): { total: number; soft: boolean } {
  let total = cards.reduce((sum, c) => sum + blackjackCardValue(c), 0);
  let aces = cards.filter((c) => c.rank === "A").length;
  let soft = aces > 0;
  while (total > 21 && aces > 0) {
    total -= 10; // downgrade one Ace from 11 to 1
    aces--;
  }
  if (aces === 0) soft = false;
  return { total, soft };
}

export function isNaturalBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && blackjackHandValue(cards).total === 21;
}

// Baccarat point value: 10/J/Q/K = 0, Ace = 1, others = face value. Hand
// total is the sum mod 10 (never busts). Exported separately from
// baccaratHandValue because the banker's third-card draw rule keys off a
// single card's point value, not a hand total.
export function baccaratCardValue(card: Card): number {
  if (card.rank === "A") return 1;
  if (card.rank === "10" || card.rank === "J" || card.rank === "Q" || card.rank === "K") return 0;
  return Number(card.rank);
}

export function baccaratHandValue(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + baccaratCardValue(c), 0) % 10;
}
