"use client";

import { useState, useTransition } from "react";
import { resetWeekAction } from "./actions";
import type { WeeklyResetResult } from "@/lib/weeklyReset";

export default function ResetWeekButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<WeeklyResetResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (
      !window.confirm(
        "Reset everyone's balance back to their starting amount right now? This can't be undone.",
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const res = await resetWeekAction();
        setResult(res);
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
        className="rounded-lg bg-red-500 px-4 py-2 font-semibold text-slate-950 hover:bg-red-400 disabled:opacity-50"
      >
        {isPending ? "Resetting..." : "Reset week now"}
      </button>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {result && (
        <p className="mt-2 text-sm text-slate-400">
          Reset {result.usersReset} user{result.usersReset === 1 ? "" : "s"} back
          to their starting balance.
        </p>
      )}
    </div>
  );
}
