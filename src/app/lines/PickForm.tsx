"use client";

import { useState } from "react";
import { placePickAction } from "./actions";
import { useBetSlip } from "./BetSlipContext";
import { formatMoney } from "@/lib/format";
import { profitForOdds } from "@/lib/odds";
import BetStatusModal, { type BetPhase } from "./BetStatusModal";

export default function PickForm({
  gameId,
  lineId,
  pickType,
  label,
  options,
  freePlayBalance = 0,
  locked = false,
}: {
  gameId: string;
  lineId: string;
  pickType: string;
  label: string;
  options: { value: string; label: string; odds: number }[];
  freePlayBalance?: number;
  locked?: boolean;
}) {
  const { addLeg } = useBetSlip();
  const [pickSide, setPickSide] = useState("");
  const [wager, setWager] = useState("");
  const [useFreePlay, setUseFreePlay] = useState(false);
  const [phase, setPhase] = useState<BetPhase | null>(null);
  const [message, setMessage] = useState<string | undefined>();

  const wagerNum = Number(wager);
  const hasWager = wagerNum > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pickSide || !wager || locked) return;

    setPhase("processing");
    setMessage(undefined);

    const formData = new FormData();
    formData.set("gameId", gameId);
    formData.set("lineId", lineId);
    formData.set("pickType", pickType);
    formData.set("pickSide", pickSide);
    formData.set("wager", wager);
    if (useFreePlay) formData.set("isFreePlay", "true");

    try {
      await placePickAction(formData);
      setPhase("accepted");
      setPickSide("");
      setWager("");
      setUseFreePlay(false);
      setTimeout(() => setPhase(null), 2000);
    } catch (err) {
      setPhase("rejected");
      setMessage((err as Error).message);
    }
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-slate-800 bg-slate-950 p-3"
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase text-slate-500">
            {label}
          </span>
          {locked && (
            <span
              title="Market locked after a big play"
              className="text-xs font-semibold text-amber-400"
            >
              🔒 Locked
            </span>
          )}
        </div>

        <div className="relative mb-2">
          <input
            value={wager}
            onChange={(e) => setWager(e.target.value)}
            type="number"
            min={1}
            placeholder={locked ? "Market locked" : "$ amount to bet"}
            required
            disabled={locked}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 pr-7 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          />
          {locked && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm"
            >
              🔒
            </span>
          )}
        </div>

        <div className="mb-2 space-y-1">
          {options.map((opt) => {
            const toWin = hasWager ? profitForOdds(opt.odds, wagerNum) : null;
            return (
              <div
                key={opt.value}
                className="flex items-center justify-between gap-2 rounded-lg px-1 py-0.5 hover:bg-slate-900"
              >
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="pickSide"
                    checked={pickSide === opt.value}
                    onChange={() => setPickSide(opt.value)}
                    required
                    className="accent-emerald-500"
                  />
                  {opt.label}
                </label>
                <div className="flex items-center gap-2">
                  {toWin != null && (
                    <span className="whitespace-nowrap text-xs font-semibold text-emerald-400">
                      to win {formatMoney(toWin)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      addLeg({
                        key: `${gameId}:${pickType}`,
                        gameId,
                        lineId,
                        pickType,
                        pickSide: opt.value,
                        label: `${label}: ${opt.label}`,
                        odds: opt.odds,
                      })
                    }
                    className="whitespace-nowrap text-xs text-emerald-400/80 hover:text-emerald-300"
                  >
                    + Parlay
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="submit"
          disabled={locked}
          className="w-full whitespace-nowrap rounded-lg bg-emerald-500 px-3 py-1 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
        >
          Place
        </button>

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
      </form>
      <BetStatusModal phase={phase} message={message} onClose={() => setPhase(null)} />
    </>
  );
}
