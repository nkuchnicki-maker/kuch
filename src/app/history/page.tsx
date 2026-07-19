import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getWeeklyHistory } from "@/lib/history";
import HistoryTable from "./HistoryTable";

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!user.is_admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        You don&apos;t have admin access.
      </div>
    );
  }

  const rows = await getWeeklyHistory(db);

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <h1 className="mb-2 text-2xl font-bold text-emerald-400">History</h1>
      <p className="mb-8 text-sm text-slate-400">
        Every user&apos;s balance at the end of each past week (right before
        that week&apos;s reset). Click a column to sort. The week still in
        progress is on the{" "}
        <a href="/leaderboard" className="text-emerald-400 hover:underline">
          Leaderboard
        </a>{" "}
        instead.
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-6">
        <HistoryTable rows={rows} />
      </div>
    </div>
  );
}
