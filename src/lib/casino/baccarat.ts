import "server-only";
import { rollForcedLoss } from "./rig";
import { type Card, randomCard, baccaratHandValue, baccaratCardValue } from "./cards";

export type BaccaratBetType = "player" | "banker" | "tie";
type HandResult = "player" | "banker" | "tie";

type Hand = { playerCards: Card[]; bankerCards: Card[]; result: HandResult };

// Plays one full hand under real baccarat rules — no player decisions
// exist in real baccarat, it's entirely mechanical draw rules.
function playHand(): Hand {
  const playerCards = [randomCard(), randomCard()];
  const bankerCards = [randomCard(), randomCard()];

  const playerNatural = baccaratHandValue(playerCards) >= 8;
  const bankerNatural = baccaratHandValue(bankerCards) >= 8;

  if (!playerNatural && !bankerNatural) {
    let playerThird: Card | null = null;
    if (baccaratHandValue(playerCards) <= 5) {
      playerThird = randomCard();
      playerCards.push(playerThird);
    }

    const bankerTotal = baccaratHandValue(bankerCards);
    let bankerShouldDraw: boolean;
    if (!playerThird) {
      bankerShouldDraw = bankerTotal <= 5;
    } else {
      const p = baccaratCardValue(playerThird);
      if (bankerTotal <= 2) bankerShouldDraw = true;
      else if (bankerTotal === 3) bankerShouldDraw = p !== 8;
      else if (bankerTotal === 4) bankerShouldDraw = p >= 2 && p <= 7;
      else if (bankerTotal === 5) bankerShouldDraw = p >= 4 && p <= 7;
      else if (bankerTotal === 6) bankerShouldDraw = p === 6 || p === 7;
      else bankerShouldDraw = false; // banker total 7 always stands
    }
    if (bankerShouldDraw) bankerCards.push(randomCard());
  }

  const playerTotal = baccaratHandValue(playerCards);
  const bankerTotal = baccaratHandValue(bankerCards);
  const result: HandResult =
    playerTotal === bankerTotal ? "tie" : playerTotal > bankerTotal ? "player" : "banker";

  return { playerCards, bankerCards, result };
}

export type BaccaratRoundResult = {
  playerCards: Card[];
  bankerCards: Card[];
  result: HandResult;
  outcome: "win" | "loss" | "push";
  payoutMultiplier: number; // total return, multiple of wager
};

// Baccarat has no player decisions, so instead of hand-crafting cards to
// force an outcome, we just replay real, fully-random hands under the rig
// (rejecting only ones where the player's bet would win) until the
// constraint is met — the hand that ships is always a genuine one under
// real rules. Real 3-way odds (~45.8/44.6/9.6) mean this almost never
// takes more than a couple of tries; the attempt cap is just a safety net.
export function playBaccaratRound(betType: BaccaratBetType): BaccaratRoundResult {
  const forcedLoss = rollForcedLoss();
  let hand = playHand();

  if (forcedLoss) {
    let attempts = 0;
    while (hand.result === betType && attempts < 1000) {
      hand = playHand();
      attempts++;
    }
  }

  const { result, playerCards, bankerCards } = hand;
  let outcome: "win" | "loss" | "push";
  let payoutMultiplier: number;

  if (betType === "tie") {
    if (result === "tie") {
      outcome = "win";
      payoutMultiplier = 9; // 8:1
    } else {
      outcome = "loss";
      payoutMultiplier = 0;
    }
  } else if (result === "tie") {
    // A tie voids Player/Banker bets under standard rules — stake back, no profit.
    outcome = "push";
    payoutMultiplier = 1;
  } else if (result === betType) {
    outcome = "win";
    payoutMultiplier = betType === "banker" ? 1.95 : 2; // 5% commission on banker wins
  } else {
    outcome = "loss";
    payoutMultiplier = 0;
  }

  return { playerCards, bankerCards, result, outcome, payoutMultiplier };
}
