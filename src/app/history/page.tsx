import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getWeeklyHistory, getCurrentWeekRows, getAgentSummaries } from "@/lib/history";
import { formatMoney } from "@/lib/format";
import HistoryTable from "./HistoryTable";
import AgentBreakdown from "./AgentBreakdown";

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/session-expired");

  if (!user.is_admin && !user.is_agent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        You don&apos;t have access to this page.
      </div>
    );
  }

  const [pastRows, currentRows] = await Promise.all([
    getWeeklyHistory(db),
    getCurrentWeekRows(db),
  ]);
  const rows = [...currentRows, ...pastRows];
  // Includes this week's net-so-far, not just completed weeks — otherwise
  // "all-time" would understate whatever's happened since the last reset.
  const agentSummaries = await getAgentSummaries(db, rows);
  const grandTotal = agentSummaries.reduce((sum, s) => sum + s.totalBalance, 0);

  return (
    <div className="app-bg min-h-screen p-6 text-slate-100">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-emerald-400">History</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Every user&apos;s balance for the current week in progress, plus
            each past week (right before that week&apos;s reset), and a
            current-balance breakdown by recruiting agent. Pick a week from
            the dropdown below (defaults to the current one) and click a
            column to sort within it.
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-6 py-4 text-right">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Total balance
          </div>
          <div
            className={`font-mono text-2xl font-semibold ${grandTotal >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {grandTotal >= 0 ? "+" : ""}
            {formatMoney(grandTotal)}
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">By agent</h2>
        <AgentBreakdown summaries={agentSummaries} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-6">
        <HistoryTable rows={rows} />
      </div>
    </div>
  );
}
