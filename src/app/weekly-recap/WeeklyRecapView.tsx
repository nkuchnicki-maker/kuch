"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";

// Duplicated rather than imported from "@/lib/weeklyRecap" — that module
// pulls in "server-only", which can't be imported from a Client Component
// even for just the type/constant (same reason HistoryTable.tsx keeps its
// own local copy of this sentinel instead of importing it).
const CURRENT_WEEK_SENTINEL = "current";

type SubagentRecap = {
  userId: string;
  username: string;
  displayName: string;
  parentAgentId: string | null;
  playersNet: number;
  keeps: number;
};

type AgentRecap = {
  userId: string;
  username: string;
  displayName: string;
  directNet: number;
  directKeeps: number;
  subagentOverride: number;
  totalKeeps: number;
  subagents: SubagentRecap[];
};

type OwnerRecap = {
  fromOwnDirect: number;
  fromAgents: number;
  fromSubagents: number;
  total: number;
};

type WeeklyRecapEntry = {
  week: string;
  agents: AgentRecap[];
  owner: OwnerRecap;
};

function formatWeek(iso: string): string {
  if (iso === CURRENT_WEEK_SENTINEL) return "This week (in progress)";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function NetAmount({ amount }: { amount: number }) {
  return (
    <span className={`font-mono ${amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
      {amount >= 0 ? "+" : ""}
      {formatMoney(amount)}
    </span>
  );
}

function KeepsAmount({ amount }: { amount: number }) {
  return <span className="font-mono text-amber-400">{formatMoney(amount)}</span>;
}

export default function WeeklyRecapView({ entries }: { entries: WeeklyRecapEntry[] }) {
  const [selectedWeek, setSelectedWeek] = useState(entries[0]?.week ?? "");

  const entry = useMemo(
    () => entries.find((e) => e.week === selectedWeek) ?? entries[0],
    [entries, selectedWeek],
  );

  if (!entry) {
    return (
      <p className="py-6 text-center text-slate-500">
        No weeks to show yet — this fills in once there&apos;s betting activity.
      </p>
    );
  }

  const allSubagents = entry.agents.flatMap((a) =>
    a.subagents.map((s) => ({ ...s, parentAgentName: a.displayName })),
  );

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <label htmlFor="recap-week-select" className="text-sm text-slate-400">
          Week
        </label>
        <select
          id="recap-week-select"
          value={entry.week}
          onChange={(e) => setSelectedWeek(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm"
        >
          {entries.map((e) => (
            <option key={e.week} value={e.week}>
              {formatWeek(e.week)}
            </option>
          ))}
        </select>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-200">Subagents</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="px-4 py-3">Subagent</th>
                <th className="px-4 py-3">Reports to</th>
                <th className="px-4 py-3 text-right">Players up/down</th>
                <th className="px-4 py-3 text-right">Keeps (20%)</th>
              </tr>
            </thead>
            <tbody>
              {allSubagents.length ? (
                allSubagents.map((s) => (
                  <tr key={s.userId} className="border-b border-slate-800/50">
                    <td className="px-4 py-3 font-medium text-slate-200">{s.displayName}</td>
                    <td className="px-4 py-3 text-slate-400">{s.parentAgentName}</td>
                    <td className="px-4 py-3 text-right">
                      <NetAmount amount={s.playersNet} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <KeepsAmount amount={s.keeps} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    No subagents yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-200">Agents</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {entry.agents.length ? (
            entry.agents.map((a) => (
              <div key={a.userId} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-200">{a.displayName}</h3>
                  <KeepsAmount amount={a.totalKeeps} />
                </div>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Own players up/down</dt>
                    <dd>
                      <NetAmount amount={a.directNet} />
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Keeps from own players (30%)</dt>
                    <dd>
                      <KeepsAmount amount={a.directKeeps} />
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">
                      Override from {a.subagents.length || 0} subagent
                      {a.subagents.length === 1 ? "" : "s"} (10%)
                    </dt>
                    <dd>
                      <KeepsAmount amount={a.subagentOverride} />
                    </dd>
                  </div>
                </dl>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No agents yet.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-200">Owner</h2>
        <div className="max-w-md rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-slate-200">Total</h3>
            <NetAmount amount={entry.owner.total} />
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Own direct players (100%)</dt>
              <dd>
                <NetAmount amount={entry.owner.fromOwnDirect} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Left over from agents (70%)</dt>
              <dd>
                <NetAmount amount={entry.owner.fromAgents} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Left over from subagents (70%)</dt>
              <dd>
                <NetAmount amount={entry.owner.fromSubagents} />
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
