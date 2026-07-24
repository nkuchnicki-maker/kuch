"use client";

import { useState, useTransition } from "react";
import { voidGameAction } from "./actions";

export default function VoidGameButton({
  gameId,
  label,
}: {
  gameId: string;
  label: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (
      !window.confirm(
        `Cancel ${label}? This refunds every pending pick and parlay leg on this game in full (like a push) and marks it cancelled. This can't be undone.`,
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await voidGameAction(gameId);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={isPending}
        className="whitespace-nowrap rounded-lg bg-amber-900/40 px-3 py-1 text-amber-300 hover:bg-amber-900/70 disabled:opacity-50"
      >
        {isPending ? "Cancelling..." : "Cancel/void"}
      </button>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
