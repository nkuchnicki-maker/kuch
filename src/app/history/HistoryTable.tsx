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

type SortKey = "weekEnding" | "displayName" | "endingBalance" | "netChange";

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
  const [sortKey, setSortKey] = useState<SortKey>("weekEnding");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "weekEnding" ? "desc" : "asc");
    }
  }

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp: number;
      if (sortKey === "displayName") cmp = a.displayName.localeCompare(b.displayName);
      else if (sortKey === "weekEnding") cmp = a.weekEnding.localeCompare(b.weekEnding);
      else cmp = a[sortKey] - b[sortKey];
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-slate-800 text-slate-400">
          <SortHeader
            label="Week ending"
            sortKeyName="weekEnding"
            activeKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
          />
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
        {sorted.length ? (
          sorted.map((r) => (
            <tr key={`${r.userId}-${r.weekEnding}`} className="border-b border-slate-800/50">
              <td className="py-2">{formatWeekEnding(r.weekEnding)}</td>
              <td className="text-slate-300">{r.displayName}</td>
              <td className="font-mono text-emerald-400">{formatMoney(r.endingBalance)}</td>
              <td
                className={`font-mono ${r.netChange >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {r.netChange >= 0 ? "+" : ""}
                {formatMoney(r.netChange)}
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={4} className="py-6 text-center text-slate-500">
              No completed weeks yet — this fills in after the first weekly reset.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
