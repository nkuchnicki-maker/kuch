"use client";

import { useState, useTransition } from "react";

export default function CancelBetButton({
  action,
  betId,
}: {
  action: (id: string) => Promise<void>;
  betId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!window.confirm("Cancel this bet? The wager is refunded in full, like a push.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await action(betId);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className="shrink-0">
      <button
        onClick={handleClick}
        disabled={isPending}
        title="Cancel and refund this bet"
        className="rounded bg-red-900/40 px-2 py-1 text-xs text-red-300 hover:bg-red-900/70 disabled:opacity-50"
      >
        {isPending ? "..." : "✕"}
      </button>
      {error && <p className="mt-1 max-w-32 text-xs text-red-400">{error}</p>}
    </div>
  );
}
