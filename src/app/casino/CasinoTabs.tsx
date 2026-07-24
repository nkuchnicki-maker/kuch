"use client";

import { useState } from "react";
import BlackjackGame from "./BlackjackGame";
import RouletteGame from "./RouletteGame";
import BaccaratGame from "./BaccaratGame";

const TABS = ["Blackjack", "Roulette", "Baccarat"] as const;
type Tab = (typeof TABS)[number];

export default function CasinoTabs({ freePlayBalance }: { freePlayBalance: number }) {
  const [tab, setTab] = useState<Tab>("Blackjack");

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              tab === t
                ? "bg-emerald-500 text-slate-950"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Blackjack" && <BlackjackGame freePlayBalance={freePlayBalance} />}
      {tab === "Roulette" && <RouletteGame freePlayBalance={freePlayBalance} />}
      {tab === "Baccarat" && <BaccaratGame freePlayBalance={freePlayBalance} />}
    </div>
  );
}
