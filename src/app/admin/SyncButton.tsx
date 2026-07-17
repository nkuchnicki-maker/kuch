"use client";

import { useState, useTransition } from "react";
import { syncNowAction } from "./actions";
import type { SyncSummary } from "@/lib/sync";

export default function SyncButton() {
  const [isPending, startTransition] = useTransition();
  const [summaries, setSummaries] = useState<SyncSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await syncNowAction();
        setSummaries(result);
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
        className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {isPending ? "Syncing..." : "Sync live odds now"}
      </button>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {summaries && (
        <ul className="mt-3 space-y-1 text-sm text-slate-400">
          {summaries.map((s) => (
            <li key={s.sport}>
              <span className="font-semibold text-slate-300">{s.sport}</span>:{" "}
              {s.gamesUpserted} game{s.gamesUpserted === 1 ? "" : "s"} synced,{" "}
              {s.gamesSettled} settled
              {s.errors.length > 0 && (
                <span className="text-red-400"> — {s.errors.join("; ")}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
