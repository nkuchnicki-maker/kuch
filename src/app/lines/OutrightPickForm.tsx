"use client";

import { useState } from "react";
import { placeOutrightPickAction } from "./actions";
import { useBetSlip } from "./BetSlipContext";

export default function OutrightPickForm({
  gameId,
  lineId,
  eventName,
  participants,
}: {
  gameId: string;
  lineId: string;
  eventName: string;
  participants: { name: string; odds: number }[];
}) {
  const { addLeg } = useBetSlip();
  const [selected, setSelected] = useState("");

  const selectedParticipant = participants.find((p) => p.name === selected);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <form
        action={placeOutrightPickAction}
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="gameId" value={gameId} />
        <input type="hidden" name="lineId" value={lineId} />
        <select
          name="participantName"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          required
          className="min-w-[220px] flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
        >
          <option value="">Pick a player to win…</option>
          {participants.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name} ({p.odds > 0 ? "+" : ""}
              {p.odds})
            </option>
          ))}
        </select>
        <input
          name="wager"
          type="number"
          min={1}
          placeholder="$ amount"
          required
          className="w-28 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="whitespace-nowrap rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
        >
          Place
        </button>
      </form>
      <button
        type="button"
        disabled={!selectedParticipant}
        onClick={() => {
          if (!selectedParticipant) return;
          addLeg({
            key: `${gameId}:outright`,
            gameId,
            lineId,
            pickType: "outright",
            pickSide: selectedParticipant.name,
            label: `${eventName}: ${selectedParticipant.name}`,
            odds: selectedParticipant.odds,
          });
        }}
        className="mt-2 whitespace-nowrap text-xs text-emerald-400 hover:text-emerald-300 disabled:text-slate-600"
      >
        + Add to parlay
      </button>
    </div>
  );
}
