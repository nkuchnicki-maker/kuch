"use client";

import { useEffect, useState, useTransition } from "react";
import { useBetSlip } from "./BetSlipContext";
import { placeParlayAction } from "./actions";
import { americanToDecimal } from "@/lib/odds";
import { formatMoney } from "@/lib/format";

export default function BetSlip() {
  const { legs, removeLeg, clear } = useBetSlip();
  const [wager, setWager] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Auto-dismiss the success message a few seconds after a placed parlay
  // clears the slip, instead of it being unreachable (legs.length === 0
  // would otherwise hide the panel before the user ever sees it).
  useEffect(() => {
    if (!success) return;
    const timeout = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(timeout);
  }, [success]);

  if (legs.length === 0 && !success) return null;

  const combinedDecimal = legs.reduce(
    (acc, l) => acc * americanToDecimal(l.odds),
    1,
  );
  const wagerNum = Number(wager) || 0;
  const potentialPayout = wagerNum > 0 ? wagerNum * combinedDecimal : 0;

  function handleSubmit() {
    setError(null);
    setSuccess(null);

    if (legs.length < 2) {
      setError("Add at least 2 picks to build a parlay");
      return;
    }
    if (!wagerNum || wagerNum <= 0) {
      setError("Enter a wager amount");
      return;
    }

    startTransition(async () => {
      try {
        await placeParlayAction(
          legs.map(({ gameId, lineId, pickType, pickSide }) => ({
            gameId,
            lineId,
            pickType,
            pickSide,
          })),
          wagerNum,
        );
        setSuccess("Parlay placed!");
        clear();
        setWager("");
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  if (legs.length === 0 && success) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <p className="text-sm text-emerald-400">{success}</p>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-emerald-400">
          Parlay ({legs.length} {legs.length === 1 ? "pick" : "picks"})
        </h3>
        <button
          type="button"
          onClick={clear}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          Clear
        </button>
      </div>

      <ul className="mb-3 max-h-48 space-y-2 overflow-y-auto">
        {legs.map((leg) => (
          <li
            key={leg.key}
            className="flex items-center justify-between gap-2 rounded-lg bg-slate-950 p-2 text-xs"
          >
            <span>{leg.label}</span>
            <button
              type="button"
              onClick={() => removeLeg(leg.key)}
              className="text-slate-500 hover:text-red-400"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {legs.length < 2 && (
        <p className="mb-2 text-xs text-amber-400">
          Add at least 2 picks to place a parlay.
        </p>
      )}

      <div className="mb-2 text-xs text-slate-400">
        Combined odds: {combinedDecimal.toFixed(2)}x
      </div>

      <input
        type="number"
        min={1}
        placeholder="$ wager"
        value={wager}
        onChange={(e) => setWager(e.target.value)}
        className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
      />

      {wagerNum > 0 && (
        <div className="mb-2 text-xs text-slate-400">
          To win: {formatMoney(potentialPayout)}
        </div>
      )}

      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || legs.length < 2}
        className="w-full rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {isPending ? "Placing..." : "Place Parlay"}
      </button>
    </div>
  );
}
