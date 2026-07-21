"use client";

import { useState, useTransition } from "react";
import { deleteUserAction } from "./actions";

export default function DeleteUserButton({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (
      !window.confirm(
        `Delete ${displayName}? This permanently removes their account and every pick, parlay, and transaction they've ever made. This can't be undone.`,
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await deleteUserAction(userId);
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
        className="whitespace-nowrap rounded-lg bg-red-900/40 px-3 py-1 text-red-300 hover:bg-red-900/70 disabled:opacity-50"
      >
        {isPending ? "Deleting..." : "Delete"}
      </button>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
