"use client";

import { useRef, useState, useTransition } from "react";

// Wraps adjustFreePlayAction in a client component so a rejected grant
// (e.g. an agent hitting their 40%-of-balance weekly cap) shows an inline
// error instead of crashing to Next's default error page — plain <form
// action={...}> has no way to catch a thrown Error itself.
export default function AdjustFreePlayForm({
  userId,
  action,
  placeholder,
}: {
  userId: string;
  action: (formData: FormData) => Promise<void>;
  placeholder: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await action(formData);
        formRef.current?.reset();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className="mt-1 flex flex-col items-end gap-1">
      <form ref={formRef} onSubmit={handleSubmit} className="flex justify-end gap-1">
        <input type="hidden" name="userId" value={userId} />
        <input
          name="amount"
          type="number"
          placeholder={placeholder}
          required
          disabled={isPending}
          className="w-24 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-slate-700 px-2 py-0.5 text-xs hover:bg-slate-600 disabled:opacity-50"
        >
          {isPending ? "..." : "Apply"}
        </button>
      </form>
      {error && <p className="max-w-40 text-right text-xs text-red-400">{error}</p>}
    </div>
  );
}
