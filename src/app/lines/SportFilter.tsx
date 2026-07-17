"use client";

import { useRouter } from "next/navigation";

export default function SportFilter({
  sports,
  selected,
}: {
  sports: string[];
  selected: string;
}) {
  const router = useRouter();

  return (
    <select
      value={selected}
      onChange={(e) => {
        const value = e.target.value;
        router.push(value ? `/lines?sport=${encodeURIComponent(value)}` : "/lines");
      }}
      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
    >
      <option value="">All sports</option>
      {sports.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
