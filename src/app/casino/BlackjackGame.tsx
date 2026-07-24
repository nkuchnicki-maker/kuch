"use client";

import { useState } from "react";
import { dealBlackjackAction, hitBlackjackAction, standBlackjackAction } from "./actions";
import { formatMoney } from "@/lib/format";
import type { Card } from "@/lib/casino/cards";
import { MAX_CASINO_WAGER } from "@/lib/casino/limits";

function CardView({ card, hidden }: { card?: Card; hidden?: boolean }) {
  if (hidden || !card) {
    return (
      <span className="inline-flex h-16 w-11 items-center justify-center rounded border border-slate-600 bg-slate-700 text-slate-500">
        ?
      </span>
    );
  }
  const isRed = card.suit === "♥" || card.suit === "♦";
  return (
    <span
      className={`inline-flex h-16 w-11 items-center justify-center rounded border border-slate-600 bg-white text-base font-bold ${
        isRed ? "text-red-600" : "text-slate-900"
      }`}
    >
      {card.rank}
      {card.suit}
    </span>
  );
}

type Phase = "betting" | "playing" | "resolved";
type Outcome = "win" | "loss" | "push";

export default function BlackjackGame({ freePlayBalance }: { freePlayBalance: number }) {
  const [wager, setWager] = useState("");
  const [useFreePlay, setUseFreePlay] = useState(false);
  const [phase, setPhase] = useState<Phase>("betting");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [playerCards, setPlayerCards] = useState<Card[]>([]);
  const [dealerCards, setDealerCards] = useState<Card[]>([]);
  const [dealerHidden, setDealerHidden] = useState(true);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [payoutMultiplier, setPayoutMultiplier] = useState(0);

  async function handleDeal() {
    const w = Number(wager);
    if (!Number.isFinite(w) || w <= 0) return;
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const r = await dealBlackjackAction(w, useFreePlay);
      setPlayerCards(r.playerCards);
      if (r.finished) {
        setDealerCards(r.dealerCards);
        setDealerHidden(false);
        setOutcome(r.outcome);
        setPayoutMultiplier(r.payoutMultiplier);
        setPhase("resolved");
      } else {
        setToken(r.token);
        setDealerCards([r.dealerUpCard]);
        setDealerHidden(true);
        setPhase("playing");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleHit() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const r = await hitBlackjackAction(token);
      setPlayerCards(r.playerCards);
      if (r.finished) {
        setDealerCards(r.dealerCards);
        setDealerHidden(false);
        setOutcome(r.outcome);
        setPayoutMultiplier(r.payoutMultiplier);
        setPhase("resolved");
        setToken(null);
      } else {
        setToken(r.token);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleStand() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const r = await standBlackjackAction(token);
      setDealerCards(r.dealerCards);
      setDealerHidden(false);
      setOutcome(r.outcome);
      setPayoutMultiplier(r.payoutMultiplier);
      setPhase("resolved");
      setToken(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleNewHand() {
    setPhase("betting");
    setToken(null);
    setPlayerCards([]);
    setDealerCards([]);
    setOutcome(null);
    setWager("");
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-4 text-lg font-semibold">Blackjack</h2>

      {phase === "betting" && (
        <>
          <div className="flex gap-2">
            <input
              value={wager}
              onChange={(e) => setWager(e.target.value)}
              type="number"
              min={1}
              max={MAX_CASINO_WAGER}
              placeholder="$ amount"
              className="w-32 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1"
            />
            <button
              onClick={handleDeal}
              disabled={busy || !wager}
              className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {busy ? "Dealing..." : "Deal"}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">${MAX_CASINO_WAGER} max per hand</p>
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
        </>
      )}

      {phase !== "betting" && (
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-xs uppercase text-slate-500">Dealer</div>
            <div className="flex gap-1">
              {dealerCards.map((c, i) => (
                <CardView key={i} card={c} />
              ))}
              {dealerHidden && <CardView hidden />}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs uppercase text-slate-500">You</div>
            <div className="flex gap-1">
              {playerCards.map((c, i) => (
                <CardView key={i} card={c} />
              ))}
            </div>
          </div>

          {phase === "playing" && (
            <div className="flex gap-2">
              <button
                onClick={handleHit}
                disabled={busy}
                className="rounded-lg bg-slate-700 px-4 py-2 hover:bg-slate-600 disabled:opacity-50"
              >
                Hit
              </button>
              <button
                onClick={handleStand}
                disabled={busy}
                className="rounded-lg bg-slate-700 px-4 py-2 hover:bg-slate-600 disabled:opacity-50"
              >
                Stand
              </button>
            </div>
          )}

          {phase === "resolved" && (
            <>
              <p
                className={`font-semibold ${
                  outcome === "win"
                    ? "text-emerald-400"
                    : outcome === "push"
                      ? "text-yellow-400"
                      : "text-red-400"
                }`}
              >
                {outcome === "win"
                  ? `You won! Paid ${payoutMultiplier}x`
                  : outcome === "push"
                    ? "Push — stake back"
                    : "You lost"}
              </p>
              <button
                onClick={handleNewHand}
                className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-400"
              >
                New hand
              </button>
            </>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
