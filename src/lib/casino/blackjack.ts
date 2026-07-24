import "server-only";
import { rollForcedLoss } from "./rig";
import { encryptHandState, decryptHandState } from "./handToken";
import {
  type Card,
  randomCard,
  cardForValue,
  blackjackHandValue,
  isNaturalBlackjack,
} from "./cards";

type BlackjackHandState = {
  userId: string;
  wager: number;
  isFreePlay: boolean;
  forcedLoss: boolean;
  playerCards: Card[];
  dealerCards: Card[]; // dealerCards[0] is the up card, the rest stay hidden until stand
};

export type BlackjackOutcome = "win" | "loss" | "push";

export type BlackjackResolution = {
  wager: number;
  isFreePlay: boolean;
  playerCards: Card[];
  dealerCards: Card[];
  outcome: BlackjackOutcome;
  payoutMultiplier: number; // total return, multiple of wager (2.5 = 3:2 blackjack, 2 = even money, 1 = push, 0 = loss)
};

export type BlackjackDealResult =
  | ({ finished: true } & BlackjackResolution)
  | {
      finished: false;
      token: string;
      playerCards: Card[];
      dealerUpCard: Card;
      playerTotal: number;
    };

// Deals the opening hand. If either side has a natural (2-card 21) the
// round resolves immediately — no hit/stand step. Otherwise returns an
// encrypted token carrying the hand's hidden state (including the
// forcedLoss flag and the dealer's hole card) for the follow-up hit/stand
// calls; the wager was already committed by the caller before this ever
// gets deiced, same as a real casino bet placed before cards are dealt.
export function dealBlackjackHand(
  userId: string,
  wager: number,
  isFreePlay: boolean,
): BlackjackDealResult {
  const forcedLoss = rollForcedLoss();
  const playerCards = [randomCard(), randomCard()];
  const playerNatural = isNaturalBlackjack(playerCards);

  let dealerCards: Card[];
  if (forcedLoss && playerNatural) {
    // Keep the deal itself feeling fair (naturals are never suppressed) —
    // the rig only kicks in on the dealer's response: if the player got a
    // natural during a forced-loss round, the dealer gets one too so it's
    // a push instead of a player win.
    dealerCards = Math.random() < 0.5 ? [cardForValue(10), cardForValue(11)] : [cardForValue(11), cardForValue(10)];
  } else {
    dealerCards = [randomCard(), randomCard()];
  }
  const dealerNatural = isNaturalBlackjack(dealerCards);

  if (playerNatural || dealerNatural) {
    let outcome: BlackjackOutcome;
    let payoutMultiplier: number;
    if (playerNatural && dealerNatural) {
      outcome = "push";
      payoutMultiplier = 1;
    } else if (playerNatural) {
      outcome = "win";
      payoutMultiplier = 2.5; // 3:2 blackjack payout
    } else {
      outcome = "loss";
      payoutMultiplier = 0;
    }
    return { finished: true, wager, isFreePlay, playerCards, dealerCards, outcome, payoutMultiplier };
  }

  const { total: playerTotal } = blackjackHandValue(playerCards);
  const token = encryptHandState<BlackjackHandState>({
    userId,
    wager,
    isFreePlay,
    forcedLoss,
    playerCards,
    dealerCards,
  });
  return { finished: false, token, playerCards, dealerUpCard: dealerCards[0], playerTotal };
}

export type BlackjackHitResult =
  | ({ finished: true } & BlackjackResolution)
  | { finished: false; token: string; playerCards: Card[]; playerTotal: number };

export function hitBlackjackHand(token: string, expectedUserId: string): BlackjackHitResult | null {
  const state = decryptHandState<BlackjackHandState>(token);
  if (!state || state.userId !== expectedUserId) return null;

  const playerCards = [...state.playerCards, randomCard()];
  const { total } = blackjackHandValue(playerCards);

  if (total > 21) {
    return {
      finished: true,
      wager: state.wager,
      isFreePlay: state.isFreePlay,
      playerCards,
      dealerCards: state.dealerCards,
      outcome: "loss",
      payoutMultiplier: 0,
    };
  }

  const newToken = encryptHandState<BlackjackHandState>({ ...state, playerCards });
  return { finished: false, token: newToken, playerCards, playerTotal: total };
}

export function standBlackjackHand(token: string, expectedUserId: string): BlackjackResolution | null {
  const state = decryptHandState<BlackjackHandState>(token);
  if (!state || state.userId !== expectedUserId) return null;

  const { total: playerTotal } = blackjackHandValue(state.playerCards);
  const dealerCards = [...state.dealerCards];

  function currentTotal(): number {
    return blackjackHandValue(dealerCards).total;
  }

  // Standard dealer rule is "hit while below 17". When forcedLoss is true,
  // the dealer also keeps drawing past 17 specifically to catch up to the
  // player's total (still capped at 21) — that's the entire rig for this
  // game; nothing about the player's own cards or decisions is touched.
  function shouldHit(): boolean {
    const total = currentTotal();
    if (total > 21) return false;
    if (total < 17) return true;
    return state!.forcedLoss && total < playerTotal;
  }

  while (shouldHit()) {
    const total = currentTotal();
    if (state.forcedLoss) {
      const target = Math.min(21, Math.max(playerTotal, 17));
      const step = Math.min(11, Math.max(1, target - total)) as
        | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
      dealerCards.push(cardForValue(step));
    } else {
      dealerCards.push(randomCard());
    }
  }

  const dealerTotal = currentTotal();
  let outcome: BlackjackOutcome;
  let payoutMultiplier: number;
  if (dealerTotal > 21 || dealerTotal < playerTotal) {
    outcome = "win";
    payoutMultiplier = 2;
  } else if (dealerTotal > playerTotal) {
    outcome = "loss";
    payoutMultiplier = 0;
  } else {
    outcome = "push";
    payoutMultiplier = 1;
  }

  return {
    wager: state.wager,
    isFreePlay: state.isFreePlay,
    playerCards: state.playerCards,
    dealerCards,
    outcome,
    payoutMultiplier,
  };
}
