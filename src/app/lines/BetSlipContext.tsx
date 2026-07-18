"use client";

import { createContext, useCallback, useContext, useState } from "react";

export type Leg = {
  key: string;
  gameId: string;
  lineId: string;
  pickType: string;
  pickSide: string;
  label: string;
  odds: number;
};

type BetSlipContextValue = {
  legs: Leg[];
  addLeg: (leg: Leg) => void;
  removeLeg: (key: string) => void;
  clear: () => void;
};

const BetSlipContext = createContext<BetSlipContextValue | null>(null);

export function BetSlipProvider({ children }: { children: React.ReactNode }) {
  const [legs, setLegs] = useState<Leg[]>([]);

  const addLeg = useCallback((leg: Leg) => {
    setLegs((prev) => {
      // No same-game parlays: adding a leg from a game already in the slip
      // replaces the previous selection for that game instead of stacking.
      const withoutSameGame = prev.filter((l) => l.gameId !== leg.gameId);
      return [...withoutSameGame, leg];
    });
  }, []);

  const removeLeg = useCallback((key: string) => {
    setLegs((prev) => prev.filter((l) => l.key !== key));
  }, []);

  const clear = useCallback(() => setLegs([]), []);

  return (
    <BetSlipContext.Provider value={{ legs, addLeg, removeLeg, clear }}>
      {children}
    </BetSlipContext.Provider>
  );
}

export function useBetSlip() {
  const ctx = useContext(BetSlipContext);
  if (!ctx) throw new Error("useBetSlip must be used within a BetSlipProvider");
  return ctx;
}
