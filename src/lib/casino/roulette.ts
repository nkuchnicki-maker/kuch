import "server-only";
import { rollForcedLoss } from "./rig";

export type RouletteBetType = "number" | "red" | "black" | "even" | "odd" | "low" | "high";

// Standard European/American red numbers (0 and its complement are never red).
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function isRed(n: number): boolean {
  return RED_NUMBERS.has(n);
}
function isBlack(n: number): boolean {
  return n !== 0 && !RED_NUMBERS.has(n);
}

export function matchesRouletteBet(
  n: number,
  betType: RouletteBetType,
  betNumber?: number,
): boolean {
  switch (betType) {
    case "number":
      return n === betNumber;
    case "red":
      return isRed(n);
    case "black":
      return isBlack(n);
    case "even":
      return n !== 0 && n % 2 === 0;
    case "odd":
      return n !== 0 && n % 2 === 1;
    case "low":
      return n >= 1 && n <= 18;
    case "high":
      return n >= 19 && n <= 36;
  }
}

// Total return, multiple of wager — a straight number pays 35:1, every
// other bet here pays even money (1:1).
export function rouletteBetMultiplier(betType: RouletteBetType): number {
  return betType === "number" ? 36 : 2;
}

export type RouletteSpinResult = {
  winningNumber: number;
  outcome: "win" | "loss";
  payoutMultiplier: number;
};

export function spinRoulette(
  betType: RouletteBetType,
  betNumber?: number,
): RouletteSpinResult {
  const forcedLoss = rollForcedLoss();
  let winningNumber: number;

  if (forcedLoss) {
    // Real odds never make this loop meaningfully long — worst case
    // (a straight-number bet) still has a 36/37 chance to land a non-match
    // on any single spin.
    do {
      winningNumber = Math.floor(Math.random() * 37); // 0-36
    } while (matchesRouletteBet(winningNumber, betType, betNumber));
  } else {
    winningNumber = Math.floor(Math.random() * 37);
  }

  const win = matchesRouletteBet(winningNumber, betType, betNumber);
  return {
    winningNumber,
    outcome: win ? "win" : "loss",
    payoutMultiplier: win ? rouletteBetMultiplier(betType) : 0,
  };
}
