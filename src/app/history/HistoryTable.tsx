"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";

type Row = {
  userId: string;
  username: string;
  displayName: string;
  weekEnding: string;
  endingBalance: number;
  netChange: number;
};

type SortKey = "displayName" | "endingBalance" | "netChange";

function formatWeekEnding(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function SortHeader({
  label,
  sortKeyName,
  activeKey,
  sortDir,
  onSort,
}: {
  label: string;
  sortKeyName: SortKey;
  activeKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const active = activeKey === sortKeyName;
  return (
    <th
      onClick={() => onSort(sortKeyName)}
      className="cursor-pointer select-none py-2 hover:text-white"
    >
      {label} {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
    </th>
  );
}

export default function HistoryTable({ rows }: { rows: Row[] }) {
  // Distinct week-ending timestamps, most recent first — this also becomes
  // the dropdown's option list.
  const weeks = useMemo(() => {
    const distinct = [...new Set(rows.map((r) => r.weekEnding))];
    distinct.sort((a, b) => b.localeCompare(a));
    return distinct;
  }, [rows]);

  const [selectedWeek, setSelectedWeek] = useState(weeks[0] ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("displayName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const weekRows = useMemo(
    () => rows.filter((r) => r.weekEnding === selectedWeek),
    [rows, selectedWeek],
  );

  const sorted = useMemo(() => {
    const copy = [...weekRows];
    copy.sort((a, b) => {
      const cmp =
        sortKey === "displayName"
          ? a.displayName.localeCompare(b.displayName)
          : a[sortKey] - b[sortKey];
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [weekRows, sortKey, sortDir]);

  if (weeks.length === 0) {
    return (
      <p className="py-6 text-center text-slate-500">
        No completed weeks yet — this fills in after the first weekly reset.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="week-select" className="text-sm text-slate-400">
          Week ending
        </label>
        <select
          id="week-select"
          value={selectedWeek}
          onChange={(e) => setSelectedWeek(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm"
        >
          {weeks.map((w) => (
            <option key={w} value={w}>
              {formatWeekEnding(w)}
            </option>
          ))}
        </select>
      </div>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400">
            <SortHeader
              label="Name"
              sortKeyName="displayName"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <SortHeader
              label="Balance"
              sortKeyName="endingBalance"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <SortHeader
              label="Net that week"
              sortKeyName="netChange"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.userId} className="border-b border-slate-800/50">
              <td className="py-2 text-slate-300">{r.displayName}</td>
              <td className="font-mono text-emerald-400">{formatMoney(r.endingBalance)}</td>
              <td
                className={`font-mono ${r.netChange >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {r.netChange >= 0 ? "+" : ""}
                {formatMoney(r.netChange)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
