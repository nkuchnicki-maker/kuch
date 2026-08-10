import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getWeeklyRecap } from "@/lib/weeklyRecap";
import WeeklyRecapView from "./WeeklyRecapView";

// Admin-only: this is the owner's own payout ledger — what every subagent
// and agent keeps, and what's left for the owner, week by week. Not shown
// to agents/subagents even though they're the ones being described here.
export default async function WeeklyRecapPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/api/session-expired");

  if (!viewer.is_admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        You don&apos;t have access to this page.
      </div>
    );
  }

  const entries = await getWeeklyRecap(db);

  return (
    <div className="app-bg min-h-screen p-6 text-slate-100">
      <h1 className="mb-2 text-2xl font-bold text-emerald-400">Weekly Recap</h1>
      <p className="mb-6 max-w-2xl text-sm text-slate-400">
        Commission breakdown by week. A subagent keeps 20% of what their own
        players are down (nothing if their players are up). An agent keeps
        30% of their own direct players plus a 10% override on each of
        their subagents&apos; downside. The owner gets whatever&apos;s left —
        70% of a subagent&apos;s or agent&apos;s downside, and 100% of
        anyone recruited with no agent above them. If a group&apos;s
        players are net up instead of down, nobody downstream takes a cut —
        that payout lands entirely on the owner.
      </p>
      <WeeklyRecapView entries={entries} />
    </div>
  );
}
