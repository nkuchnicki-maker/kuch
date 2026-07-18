"use client";

import { placePickAction } from "./actions";
import { useBetSlip } from "./BetSlipContext";

export default function PickForm({
  gameId,
  lineId,
  pickType,
  label,
  options,
}: {
  gameId: string;
  lineId: string;
  pickType: string;
  label: string;
  options: { value: string; label: string; odds: number }[];
}) {
  const { addLeg } = useBetSlip();

  return (
    <form
      action={placePickAction}
      className="rounded-lg border border-slate-800 bg-slate-950 p-3"
    >
      <input type="hidden" name="gameId" value={gameId} />
      <input type="hidden" name="lineId" value={lineId} />
      <input type="hidden" name="pickType" value={pickType} />
      <div className="mb-2 text-xs font-semibold uppercase text-slate-500">
        {label}
      </div>
      <div className="mb-2 space-y-1">
        {options.map((opt) => (
          <div key={opt.value} className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="pickSide"
                value={opt.value}
                required
                className="accent-emerald-500"
              />
              {opt.label}
            </label>
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
              className="whitespace-nowrap text-xs text-emerald-400 hover:text-emerald-300"
            >
              + Parlay
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          name="wager"
          type="number"
          min={1}
          placeholder="$ amount"
          required
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="whitespace-nowrap rounded-lg bg-emerald-500 px-3 py-1 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
        >
          Place
        </button>
      </div>
    </form>
  );
}
