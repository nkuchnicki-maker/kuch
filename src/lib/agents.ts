// Recruiting agents: each friend who signs up is credited to whichever
// agent recruited them, purely for reporting on the History page — has no
// effect on balances, picks, or settlement.
export const AGENTS = ["OWN", "MJ"] as const;
export type Agent = (typeof AGENTS)[number];

export function isAgent(value: string): value is Agent {
  return (AGENTS as readonly string[]).includes(value);
}
