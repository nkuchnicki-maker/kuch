"use client";

export type BetPhase = "processing" | "accepted" | "rejected";

export default function BetStatusModal({
  phase,
  message,
  onClose,
}: {
  phase: BetPhase | null;
  message?: string;
  onClose: () => void;
}) {
  if (!phase) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60">
      <div className="w-80 rounded-xl border border-slate-700 bg-slate-900 p-6 text-center shadow-2xl">
        {phase === "processing" && (
          <>
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400" />
            <p className="text-sm font-semibold text-slate-200">Processing your bet…</p>
            <p className="mt-1 text-xs text-slate-500">
              Confirming the line hasn&apos;t moved
            </p>
          </>
        )}
        {phase === "accepted" && (
          <>
            <p className="text-lg font-semibold text-emerald-400">Bet Accepted</p>
            {message && <p className="mt-1 text-xs text-slate-400">{message}</p>}
          </>
        )}
        {phase === "rejected" && (
          <>
            <p className="text-lg font-semibold text-red-400">Bet Rejected</p>
            {message && <p className="mt-2 text-sm text-slate-300">{message}</p>}
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-lg bg-slate-700 px-4 py-1.5 text-sm hover:bg-slate-600"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
