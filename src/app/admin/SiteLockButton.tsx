"use client";

import { useState, useTransition } from "react";
import { toggleSiteLockAction } from "./actions";

export default function SiteLockButton({ initiallyLocked }: { initiallyLocked: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [locked, setLocked] = useState(initiallyLocked);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    const next = !locked;
    if (
      !window.confirm(
        next
          ? "Lock Bettor Edge for everyone except admins right now? Anyone currently on the site (including already-logged-in users) will be bounced to a locked page immediately."
          : "Unlock Bettor Edge and restore access for everyone?",
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await toggleSiteLockAction(next);
        setLocked(next);
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
        className={`rounded-lg px-4 py-2 font-semibold text-slate-950 disabled:opacity-50 ${
          locked ? "bg-emerald-500 hover:bg-emerald-400" : "bg-red-500 hover:bg-red-400"
        }`}
      >
        {isPending ? "Working..." : locked ? "Unlock site" : "Lock site (non-admins)"}
      </button>
      <p className="mt-2 text-sm text-slate-400">
        Status: {locked ? "🔒 Locked — only admins can use the site" : "🔓 Unlocked — normal access"}
      </p>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
