import "server-only";
import type { Pool } from "pg";
import { getWeeklyHistory, getCurrentWeekRows, CURRENT_WEEK_SENTINEL } from "./history";

export { CURRENT_WEEK_SENTINEL };

// Three-tier commission breakdown for a given week:
//   Subagent keeps 20% of what their own players are down (0 if up).
//   Agent keeps 30% of what their own direct players are down, PLUS a 10%
//     override of what each of their subagents' players are down.
//   Owner gets whatever's left: 70% of a subagent's downside (100% - 20%
//     subagent - 10% agent), 70% of an agent's direct downside (100% - 30%
//     agent), and 100% of any player recruited with no agent above them at
//     all. When a group's players are net UP instead of down, nobody
//     downstream takes a cut — the whole liability (a negative number)
//     lands on the Owner, since only the Owner backs the book.
//
// All figures are framed from the "house" side (positive = the house/
// office made money that week, i.e. players are net down) so percentages
// can be applied directly; only playersNet is shown in the reversed,
// player-facing sign (positive = players up).

export type SubagentRecap = {
  userId: string;
  username: string;
  displayName: string;
  parentAgentId: string | null;
  playersNet: number; // + = players up, - = players down
  keeps: number; // always >= 0
};

export type AgentRecap = {
  userId: string;
  username: string;
  displayName: string;
  directNet: number; // players recruited directly by this agent
  directKeeps: number; // always >= 0
  subagentOverride: number; // always >= 0, summed 10% cut across their subagents
  totalKeeps: number;
  subagents: SubagentRecap[];
};

export type OwnerRecap = {
  fromOwnDirect: number; // players with no agent above them at all — 100%, either sign
  fromAgents: number; // residual from every agent's direct downline
  fromSubagents: number; // residual from every subagent's downline
  total: number;
};

export type WeeklyRecapEntry = {
  week: string; // ISO timestamp of the week-ending reset, or CURRENT_WEEK_SENTINEL
  agents: AgentRecap[];
  owner: OwnerRecap;
};

function houseResultFor(playersNet: number): number {
  return -playersNet;
}

// Player's share of the pot upstream of whatever their own subagent/agent
// keeps: 70% if the house is up (players down), or the full loss if the
// house is down (players up) — nobody above the immediate recruiter shares
// in the downside voluntarily either, so 100% of it still has to land
// somewhere, and that's the Owner.
function residualAfterCut(houseResult: number, cutFraction: number): number {
  return houseResult > 0 ? houseResult * (1 - cutFraction) : houseResult;
}

export async function getWeeklyRecap(db: Pool): Promise<WeeklyRecapEntry[]> {
  const [pastRows, currentRows, { rows: allUsers }] = await Promise.all([
    getWeeklyHistory(db),
    getCurrentWeekRows(db),
    db.query<{
      id: string;
      username: string;
      display_name: string;
      is_agent: boolean;
      can_create_agents: boolean;
      recruited_by: string | null;
      is_admin: boolean;
    }>(
      "select id, username, display_name, is_agent, can_create_agents, recruited_by, is_admin from users",
    ),
  ]);

  const players = allUsers.filter((u) => !u.is_agent && !u.is_admin);
  const agents = allUsers.filter((u) => u.is_agent && u.can_create_agents);
  const subagents = allUsers.filter((u) => u.is_agent && !u.can_create_agents);
  const agentIds = new Set(agents.map((a) => a.id));

  const allRows = [...currentRows, ...pastRows];
  // "current" sorts first lexicographically ('c' > digits), same trick
  // HistoryTable relies on, so this naturally lists newest-first.
  const weeks = [...new Set(allRows.map((r) => r.weekEnding))].sort((a, b) =>
    b.localeCompare(a),
  );

  return weeks.map((week) => {
    const netByPlayerId = new Map(
      allRows.filter((r) => r.weekEnding === week).map((r) => [r.userId, r.netChange]),
    );
    const netFor = (recruiterId: string) =>
      players
        .filter((p) => p.recruited_by === recruiterId)
        .reduce((sum, p) => sum + (netByPlayerId.get(p.id) ?? 0), 0);

    const subagentRecaps: SubagentRecap[] = subagents.map((s) => {
      const playersNet = netFor(s.id);
      const house = houseResultFor(playersNet);
      return {
        userId: s.id,
        username: s.username,
        displayName: s.display_name,
        parentAgentId: s.recruited_by,
        playersNet,
        keeps: house > 0 ? house * 0.2 : 0,
      };
    });

    let ownerFromAgents = 0;
    let ownerFromSubagents = 0;

    const agentRecaps: AgentRecap[] = agents.map((a) => {
      const directNet = netFor(a.id);
      const directHouse = houseResultFor(directNet);
      const directKeeps = directHouse > 0 ? directHouse * 0.3 : 0;
      ownerFromAgents += residualAfterCut(directHouse, 0.3);

      const mine = subagentRecaps.filter((s) => s.parentAgentId === a.id);
      let subagentOverride = 0;
      for (const s of mine) {
        const sHouse = houseResultFor(s.playersNet);
        if (sHouse > 0) subagentOverride += sHouse * 0.1;
        ownerFromSubagents += residualAfterCut(sHouse, 0.3); // 20% subagent + 10% agent = 30%
      }

      return {
        userId: a.id,
        username: a.username,
        displayName: a.display_name,
        directNet,
        directKeeps,
        subagentOverride,
        totalKeeps: directKeeps + subagentOverride,
        subagents: mine,
      };
    });

    // Subagents whose recruiter isn't a recognized agent (shouldn't happen
    // in practice — only full agents can create subagents — but handled
    // defensively): they still keep their 20%, and since there's no agent
    // above to take the 10% override, the Owner absorbs the rest (80%
    // instead of 70%) directly.
    for (const s of subagentRecaps) {
      if (!s.parentAgentId || !agentIds.has(s.parentAgentId)) {
        const sHouse = houseResultFor(s.playersNet);
        ownerFromSubagents += residualAfterCut(sHouse, 0.2);
      }
    }

    // Players with no agent above them at all (recruited directly by an
    // admin, or their recruiter reference is missing/not an agent) — 100%
    // to the Owner, either sign, since there's no one else in the chain.
    let ownerDirect = 0;
    for (const p of players) {
      const hasAgentAbove = !!p.recruited_by && (agentIds.has(p.recruited_by) ||
        subagentRecaps.some((s) => s.userId === p.recruited_by));
      if (!hasAgentAbove) {
        ownerDirect += houseResultFor(netByPlayerId.get(p.id) ?? 0);
      }
    }

    const owner: OwnerRecap = {
      fromOwnDirect: ownerDirect,
      fromAgents: ownerFromAgents,
      fromSubagents: ownerFromSubagents,
      total: ownerDirect + ownerFromAgents + ownerFromSubagents,
    };

    return { week, agents: agentRecaps, owner };
  });
}
