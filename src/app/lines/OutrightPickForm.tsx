"use client";

import { useState } from "react";
import { placeOutrightPickAction } from "./actions";
import { useBetSlip } from "./BetSlipContext";
import { formatMoney } from "@/lib/format";
import { payoutForOdds } from "@/lib/odds";
import BetStatusModal, { type BetPhase } from "./BetStatusModal";

export default function OutrightPickForm({
  gameId,
  lineId,
  eventName,
  participants,
  freePlayBalance = 0,
}: {
  gameId: string;
  lineId: string;
  eventName: string;
  participants: { name: string; odds: number }[];
  freePlayBalance?: number;
}) {
  const { addLeg } = useBetSlip();
  const [selected, setSelected] = useState("");
  const [wager, setWager] = useState("");
  const [useFreePlay, setUseFreePlay] = useState(false);
  const [phase, setPhase] = useState<BetPhase | null>(null);
  const [message, setMessage] = useState<string | undefined>();

  const selectedParticipant = participants.find((p) => p.name === selected);
  const wagerNum = Number(wager);
  const toWin =
    selectedParticipant && wagerNum > 0
      ? payoutForOdds(selectedParticipant.odds, wagerNum)
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !wager) return;

    setPhase("processing");
    setMessage(undefined);

    const formData = new FormData();
    formData.set("gameId", gameId);
    formData.set("lineId", lineId);
    formData.set("participantName", selected);
    formData.set("wager", wager);
    if (useFreePlay) formData.set("isFreePlay", "true");

    try {
      await placeOutrightPickAction(formData);
      setPhase("accepted");
      setSelected("");
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
      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            required
            className="min-w-[220px] flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
          >
            <option value="">Pick a winner…</option>
            {participants.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({p.odds > 0 ? "+" : ""}
                {p.odds})
              </option>
            ))}
          </select>
          <input
            value={wager}
            onChange={(e) => setWager(e.target.value)}
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
          {toWin != null && (
            <p className="w-full text-sm text-slate-400">
              {formatMoney(wagerNum)} to win{" "}
              <span className="font-semibold text-emerald-400">{formatMoney(toWin)}</span>
            </p>
          )}
          {freePlayBalance > 0 && (
            <label className="flex w-full items-center gap-1.5 text-xs text-amber-400">
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
      <BetStatusModal phase={phase} message={message} onClose={() => setPhase(null)} />
    </>
  );
}
