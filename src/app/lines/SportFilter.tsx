"use client";

import { useRouter } from "next/navigation";
import { sportIcon } from "@/lib/sportIcons";

export default function SportFilter({
  sports,
  selected,
  basePath = "/lines",
}: {
  sports: string[];
  selected: string;
  basePath?: string;
}) {
  const router = useRouter();

  return (
    <select
      value={selected}
      onChange={(e) => {
        const value = e.target.value;
        router.push(value ? `${basePath}?sport=${encodeURIComponent(value)}` : basePath);
      }}
      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
    >
      <option value="">🏆 All sports</option>
      {sports.map((s) => (
        <option key={s} value={s}>
          {sportIcon(s)} {s}
        </option>
      ))}
    </select>
  );
}
