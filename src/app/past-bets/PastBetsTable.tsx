"use client";

import { useMemo, useState } from "react";
import { formatMoney, formatDateTime } from "@/lib/format";
import StatusBadge from "../components/StatusBadge";

type LegDisplay = { label: string; matchup: string };

export type PastBet =
  | {
      id: string;
      kind: "pick";
      displayName: string;
      wager: number;
      potentialPayout: number;
      status: string;
      createdAt: string;
      leg: LegDisplay;
    }
  | {
      id: string;
      kind: "parlay";
      displayName: string;
      wager: number;
      potentialPayout: number;
      status: string;
      createdAt: string;
      legs: LegDisplay[];
    };

type SortKey = "displayName" | "wager" | "potentialPayout" | "status" | "createdAt";

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

export default function PastBetsTable({ bets }: { bets: PastBet[] }) {
  const players = useMemo(
    () => [...new Set(bets.map((b) => b.displayName))].sort(),
    [bets],
  );

  const [playerFilter, setPlayerFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "displayName" ? "asc" : "desc");
    }
  }

  const filtered = useMemo(
    () => (playerFilter ? bets.filter((b) => b.displayName === playerFilter) : bets),
    [bets, playerFilter],
  );

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp: number;
      if (sortKey === "displayName" || sortKey === "status") {
        cmp = a[sortKey].localeCompare(b[sortKey]);
      } else if (sortKey === "createdAt") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else {
        cmp = a[sortKey] - b[sortKey];
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="player-filter" className="text-sm text-slate-400">
          Player
        </label>
        <select
          id="player-filter"
          value={playerFilter}
          onChange={(e) => setPlayerFilter(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm"
        >
          <option value="">All players</option>
          {players.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">
          {sorted.length} bet{sorted.length === 1 ? "" : "s"}
        </span>
      </div>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400">
            <SortHeader
              label="Player"
              sortKeyName="displayName"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <th className="py-2">Bet</th>
            <SortHeader
              label="Wager"
              sortKeyName="wager"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <SortHeader
              label="To win"
              sortKeyName="potentialPayout"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <SortHeader
              label="Status"
              sortKeyName="status"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <SortHeader
              label="Placed"
              sortKeyName="createdAt"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
          </tr>
        </thead>
        <tbody>
          {sorted.length ? (
            sorted.map((bet) => (
              <tr key={bet.id} className="border-b border-slate-800/50 align-top">
                <td className="py-2 pr-4 font-medium text-slate-200">{bet.displayName}</td>
                <td className="py-2 pr-4">
                  {bet.kind === "pick" ? (
                    <>
                      <span className="font-semibold">{bet.leg.label}</span>
                      <div className="text-xs text-slate-500">{bet.leg.matchup}</div>
                    </>
                  ) : (
                    <div>
                      <div className="mb-1 text-xs font-semibold text-slate-400">
                        {bet.legs.length}-leg parlay
                      </div>
                      <ul className="space-y-1">
                        {bet.legs.map((leg, i) => (
                          <li key={i}>
                            <span className="font-semibold text-slate-200">{leg.label}</span>
                            <span className="ml-2 text-xs text-slate-500">{leg.matchup}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </td>
                <td className="py-2 pr-4 font-mono">{formatMoney(bet.wager)}</td>
                <td className="py-2 pr-4 font-mono text-slate-400">
                  {formatMoney(bet.potentialPayout)}
                </td>
                <td className="py-2 pr-4">
                  <StatusBadge status={bet.status} />
                </td>
                <td className="py-2 text-xs text-slate-500">
                  {formatDateTime(bet.createdAt)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                No bets found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
