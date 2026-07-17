const COLORS: Record<string, string> = {
  pending: "bg-slate-700 text-slate-200",
  win: "bg-emerald-500 text-slate-950",
  loss: "bg-red-500/80 text-slate-950",
  push: "bg-yellow-500/80 text-slate-950",
  cancelled: "bg-slate-600 text-slate-200",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-semibold ${COLORS[status] ?? COLORS.pending}`}
    >
      {status}
    </span>
  );
}
