"use client";

import { useState, useTransition } from "react";
import { useBetSlip } from "./BetSlipContext";
import { placeParlayAction } from "./actions";
import { americanToDecimal, decimalToAmerican, formatAmericanOdds } from "@/lib/odds";
import { formatMoney } from "@/lib/format";
import BetStatusModal, { type BetPhase } from "./BetStatusModal";

export default function BetSlip({ freePlayBalance = 0 }: { freePlayBalance?: number }) {
  const { legs, removeLeg, clear } = useBetSlip();
  const [wager, setWager] = useState("");
  const [useFreePlay, setUseFreePlay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<BetPhase | null>(null);
  const [message, setMessage] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  const combinedDecimal = legs.reduce(
    (acc, l) => acc * americanToDecimal(l.odds),
    1,
  );
  const wagerNum = Number(wager) || 0;
  // Profit only, not total payout — the stake stays in the balance and is
  // only taken if the parlay loses (see settle.ts), so a win only ever
  // adds this amount, not the stake back on top of itself.
  const profit = wagerNum > 0 ? wagerNum * (combinedDecimal - 1) : 0;

  function handleSubmit() {
    setError(null);

    if (legs.length < 2) {
      setError("Add at least 2 picks to build a parlay");
      return;
    }
    if (!wagerNum || wagerNum <= 0) {
      setError("Enter a wager amount");
      return;
    }

    setPhase("processing");
    setMessage(undefined);

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
          useFreePlay,
        );
        setPhase("accepted");
        setMessage("Parlay placed!");
        clear();
        setWager("");
        setUseFreePlay(false);
        setTimeout(() => setPhase(null), 2000);
      } catch (err) {
        setPhase("rejected");
        setMessage((err as Error).message);
      }
    });
  }

  return (
    <>
      {legs.length > 0 && (
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

          {legs.length >= 2 && (
            <div className="mb-2 text-sm font-semibold text-emerald-400">
              Parlay odds: {formatAmericanOdds(decimalToAmerican(combinedDecimal))}{" "}
              <span className="font-normal text-slate-500">
                ({combinedDecimal.toFixed(2)}x)
              </span>
            </div>
          )}

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
              {formatMoney(wagerNum)} to win{" "}
              <span className="font-semibold text-emerald-400">
                {formatMoney(profit)}
              </span>
            </div>
          )}

          {freePlayBalance > 0 && (
            <label className="mb-2 flex items-center gap-1.5 text-xs text-amber-400">
              <input
                type="checkbox"
                checked={useFreePlay}
                onChange={(e) => setUseFreePlay(e.target.checked)}
                className="accent-amber-400"
              />
              Use free play ({formatMoney(freePlayBalance)} available)
            </label>
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
      )}
      <BetStatusModal phase={phase} message={message} onClose={() => setPhase(null)} />
    </>
  );
}
