import { formatMoney } from "@/lib/format";
import type { AgentSummary } from "@/lib/history";

function NetAmount({ amount }: { amount: number }) {
  return (
    <span className={`font-mono ${amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
      {amount >= 0 ? "+" : ""}
      {formatMoney(amount)}
    </span>
  );
}

// Renders exactly the buckets the caller passed in — the page already
// scopes `summaries` to just the viewer's own agent bucket for non-admin
// agents/subagents, so this never needs to know about other agents that
// exist elsewhere in the system.
export default function AgentBreakdown({ summaries }: { summaries: AgentSummary[] }) {
  if (summaries.length === 0) {
    return <p className="text-sm text-slate-500">No recruits yet.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {summaries.map((summary) => (
        <div key={summary.agent} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-200">{summary.agent}</h3>
            <NetAmount amount={summary.totalBalance} />
          </div>
          {summary.users.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {summary.users.map((u) => (
                <li key={u.userId} className="flex items-center justify-between">
                  <span className="text-slate-400">{u.displayName}</span>
                  <span className="font-mono text-slate-300">{formatMoney(u.balance)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No recruits yet.</p>
          )}
        </div>
      ))}
    </div>
  );
}
