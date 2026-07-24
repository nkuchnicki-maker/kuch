"use client";

import { useState } from "react";
import { placeRouletteBetAction } from "./actions";
import { formatMoney } from "@/lib/format";
import type { RouletteBetType } from "@/lib/casino/roulette";

const OUTSIDE_BETS: { value: RouletteBetType; label: string }[] = [
  { value: "red", label: "Red" },
  { value: "black", label: "Black" },
  { value: "even", label: "Even" },
  { value: "odd", label: "Odd" },
  { value: "low", label: "1-18" },
  { value: "high", label: "19-36" },
];

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function numberColor(n: number): string {
  if (n === 0) return "bg-emerald-600";
  return RED_NUMBERS.has(n) ? "bg-red-600" : "bg-slate-950";
}

type SpinResult = { winningNumber: number; outcome: "win" | "loss"; payoutMultiplier: number };

export default function RouletteGame({ freePlayBalance }: { freePlayBalance: number }) {
  const [betType, setBetType] = useState<RouletteBetType>("red");
  const [betNumber, setBetNumber] = useState(0);
  const [wager, setWager] = useState("");
  const [useFreePlay, setUseFreePlay] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSpin() {
    const w = Number(wager);
    if (!Number.isFinite(w) || w <= 0) return;
    setSpinning(true);
    setError(null);
    setResult(null);
    try {
      const r = await placeRouletteBetAction(
        betType,
        betType === "number" ? betNumber : undefined,
        w,
        useFreePlay,
      );
      setResult(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSpinning(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-4 text-lg font-semibold">Roulette</h2>

      <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {OUTSIDE_BETS.map((b) => (
          <button
            key={b.value}
            onClick={() => setBetType(b.value)}
            className={`rounded-lg px-3 py-2 text-sm ${
              betType === b.value
                ? "bg-emerald-500 text-slate-950"
                : "bg-slate-800 hover:bg-slate-700"
            }`}
          >
            {b.label}
            <span className="block text-xs opacity-70">2x</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setBetType("number")}
          className={`rounded-lg px-3 py-2 text-sm ${
            betType === "number"
              ? "bg-emerald-500 text-slate-950"
              : "bg-slate-800 hover:bg-slate-700"
          }`}
        >
          Straight number <span className="opacity-70">36x</span>
        </button>
        {betType === "number" && (
          <input
            type="number"
            min={0}
            max={36}
            value={betNumber}
            onChange={(e) => setBetNumber(Number(e.target.value))}
            className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1"
          />
        )}
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
          onClick={handleSpin}
          disabled={spinning || !wager}
          className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {spinning ? "Spinning..." : "Spin"}
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
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-950 p-4">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full font-bold text-white ${numberColor(result.winningNumber)}`}
          >
            {result.winningNumber}
          </div>
          <p
            className={`font-semibold ${result.outcome === "win" ? "text-emerald-400" : "text-red-400"}`}
          >
            {result.outcome === "win"
              ? `You won! Paid ${result.payoutMultiplier}x`
              : "No luck this spin"}
          </p>
        </div>
      )}
    </div>
  );
}
