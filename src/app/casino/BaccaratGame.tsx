"use client";

import { useState } from "react";
import { placeBaccaratBetAction } from "./actions";
import { formatMoney } from "@/lib/format";
import type { BaccaratBetType } from "@/lib/casino/baccarat";
import type { Card } from "@/lib/casino/cards";

function CardView({ card }: { card: Card }) {
  const isRed = card.suit === "♥" || card.suit === "♦";
  return (
    <span
      className={`inline-flex h-12 w-9 items-center justify-center rounded border border-slate-600 bg-white text-sm font-bold ${
        isRed ? "text-red-600" : "text-slate-900"
      }`}
    >
      {card.rank}
      {card.suit}
    </span>
  );
}

type BetType = BaccaratBetType;
type RoundResult = {
  playerCards: Card[];
  bankerCards: Card[];
  result: string;
  outcome: "win" | "loss" | "push";
  payoutMultiplier: number;
};

const BET_LABELS: { value: BetType; label: string; payout: string }[] = [
  { value: "player", label: "Player", payout: "2x" },
  { value: "banker", label: "Banker", payout: "1.95x" },
  { value: "tie", label: "Tie", payout: "9x" },
];

export default function BaccaratGame({ freePlayBalance }: { freePlayBalance: number }) {
  const [betType, setBetType] = useState<BetType>("banker");
  const [wager, setWager] = useState("");
  const [useFreePlay, setUseFreePlay] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDeal() {
    const w = Number(wager);
    if (!Number.isFinite(w) || w <= 0) return;
    setDealing(true);
    setError(null);
    setResult(null);
    try {
      const r = await placeBaccaratBetAction(betType, w, useFreePlay);
      setResult(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDealing(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-4 text-lg font-semibold">Baccarat</h2>

      <div className="mb-4 flex gap-2">
        {BET_LABELS.map((b) => (
          <button
            key={b.value}
            onClick={() => setBetType(b.value)}
            className={`rounded-lg px-4 py-2 text-sm ${
              betType === b.value
                ? "bg-emerald-500 text-slate-950"
                : "bg-slate-800 hover:bg-slate-700"
            }`}
          >
            {b.label} <span className="opacity-70">({b.payout})</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={wager}
          onChange={(e) => setWager(e.target.value)}
          type="number"
          min={1}
          placeholder="$ amount"
          className="w-32 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1"
        />
        <button
          onClick={handleDeal}
          disabled={dealing || !wager}
          className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {dealing ? "Dealing..." : "Deal"}
        </button>
      </div>

      {freePlayBalance > 0 && (
        <label className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
          <input
            type="checkbox"
            checked={useFreePlay}
            onChange={(e) => setUseFreePlay(e.target.checked)}
            className="accent-amber-400"
          />
          Use free play ({formatMoney(freePlayBalance)} available)
        </label>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {result && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs uppercase text-slate-500">Player</div>
            <div className="flex gap-1">
              {result.playerCards.map((c, i) => (
                <CardView key={i} card={c} />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs uppercase text-slate-500">Banker</div>
            <div className="flex gap-1">
              {result.bankerCards.map((c, i) => (
                <CardView key={i} card={c} />
              ))}
            </div>
          </div>
          <p
            className={`font-semibold sm:col-span-2 ${
              result.outcome === "win"
                ? "text-emerald-400"
                : result.outcome === "push"
                  ? "text-yellow-400"
                  : "text-red-400"
            }`}
          >
            {result.result} wins —{" "}
            {result.outcome === "win"
              ? `you won, paid ${result.payoutMultiplier}x`
              : result.outcome === "push"
                ? "push, stake back"
                : "you lost"}
          </p>
        </div>
      )}
    </div>
  );
}
