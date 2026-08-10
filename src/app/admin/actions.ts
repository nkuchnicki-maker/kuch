"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin, requireAdminOrAgent, hashPassword } from "@/lib/auth";
import { isAgent } from "@/lib/agents";
import { settlePicksForGame, settleOutrightEvent, voidGame } from "@/lib/settle";
import { syncAllTrackedSports, type SyncSummary } from "@/lib/sync";
import { forceWeeklyReset, type WeeklyResetResult } from "@/lib/weeklyReset";

export async function createUserAction(formData: FormData) {
  const viewer = await requireAdminOrAgent();

  const password = String(formData.get("password"));
  const username = String(formData.get("username")).trim();
  const displayName = String(formData.get("displayName")).trim();
  const startingCoins = Number(formData.get("startingCoins")) || 0;

  // The simplified form agents get on /users omits this field entirely —
  // formData.get returns null then, which Number() coerces to 0 (a *valid*
  // finite number), so this has to check for absence explicitly rather
  // than just falling back on non-finite values.
  const minBalanceField = formData.get("minBalance");
  const minBalance =
    minBalanceField !== null && minBalanceField !== "" && Number.isFinite(Number(minBalanceField))
      ? Number(minBalanceField)
      : -200;

  // Non-admin agents can only recruit under their own agent code — stays an
  // admin-only decision, enforced here regardless of what a request might
  // submit for that field.
  const agent = viewer.is_admin ? String(formData.get("agent")) : viewer.agent;

  // Admins make full agents; a full agent (can_create_agents) can recruit
  // subagents — same is_agent capabilities everywhere else in the app, but
  // a subagent's own can_create_agents is always false, so they can't chain
  // further agent/subagent creation themselves.
  const canGrantAgent = viewer.is_admin || viewer.can_create_agents;
  const isAgentAccount = canGrantAgent && formData.get("isAgent") === "true";
  const canCreateAgents = viewer.is_admin;

  if (!isAgent(agent)) {
    throw new Error("Pick a valid agent");
  }

  // Login is username/password only — email is just a placeholder to
  // satisfy the column's unique/not-null constraint, never shown or used.
  const email = `${username.toLowerCase()}@bettoredge.local`;
  const passwordHash = await hashPassword(password);

  // Direct recruiter for the Weekly Recap commission breakdown — distinct
  // from the OWN/MJ `agent` bucket above, which only tracks the top-level
  // branch. Null means recruited directly by an admin, i.e. no agent above
  // them to take a cut. A non-admin agent/subagent always sets this to
  // their own id, whether they're creating a player or a subagent.
  const recruitedBy = viewer.is_admin ? null : viewer.id;

  try {
    await db.query(
      `insert into users (
         email, password_hash, username, display_name, coin_balance, starting_balance,
         min_balance, agent, is_agent, can_create_agents, recruited_by
       )
       values ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10)`,
      [
        email,
        passwordHash,
        username,
        displayName,
        startingCoins,
        minBalance,
        agent,
        isAgentAccount,
        isAgentAccount ? canCreateAgents : true,
        recruitedBy,
      ],
    );
  } catch (err) {
    const message = (err as { code?: string; message: string }).code === "23505"
      ? "That username is already taken"
      : (err as Error).message;
    throw new Error(message);
  }

  revalidatePath("/admin");
  revalidatePath("/users");
}

export async function adjustCoinsAction(formData: FormData) {
  const adminUser = await requireAdmin();

  const userId = String(formData.get("userId"));
  const amount = Number(formData.get("amount"));
  const reason = String(formData.get("reason") || "admin_grant");

  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("Amount must be a non-zero number");
  }

  const client = await db.connect();
  try {
    await client.query("begin");

    const { rows } = await client.query(
      `update users set coin_balance = coin_balance + $1
       where id = $2 and coin_balance + $1 >= min_balance
       returning coin_balance`,
      [amount, userId],
    );

    if (rows.length === 0) {
      throw new Error("User not found, or that would put them below their minimum balance");
    }

    await client.query(
      `insert into coin_transactions (user_id, amount, reason, created_by)
       values ($1, $2, $3, $4)`,
      [userId, amount, reason, adminUser.id],
    );

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  revalidatePath("/admin");
  revalidatePath("/leaderboard");
  revalidatePath("/users");
  revalidatePath("/history");
}

export async function setMinBalanceAction(formData: FormData) {
  const viewer = await requireAdminOrAgent();

  const userId = String(formData.get("userId"));
  const minBalance = Number(formData.get("minBalance"));

  if (!Number.isFinite(minBalance) || minBalance > 0) {
    throw new Error("Minimum balance must be zero or a negative number");
  }

  // Agents (non-admins) can only tune the floor for their own recruited
  // users — enforced here, not just hidden in the UI.
  if (!viewer.is_admin) {
    const { rows } = await db.query<{ agent: string }>(
      "select agent from users where id = $1",
      [userId],
    );
    if (rows[0]?.agent !== viewer.agent) {
      throw new Error("You can only adjust min balance for your own recruited users");
    }
  }

  await db.query("update users set min_balance = $1 where id = $2", [minBalance, userId]);

  revalidatePath("/admin");
  revalidatePath("/users");
}

export async function setIsAgentAction(formData: FormData) {
  await requireAdmin();

  const userId = String(formData.get("userId"));
  const isAgentAccount = formData.get("isAgent") === "true";

  await db.query("update users set is_agent = $1 where id = $2", [isAgentAccount, userId]);

  revalidatePath("/admin");
}

// Called directly from a client component (not a <form action>) so a
// confirm() dialog can gate it before the request ever fires. Cascades to
// the user's picks, parlays, and coin_transactions (existing FK
// constraints) — this permanently erases their history, not just their
// login.
export async function deleteUserAction(userId: string) {
  const adminUser = await requireAdmin();

  if (userId === adminUser.id) {
    throw new Error("You can't delete your own account");
  }

  await db.query("delete from users where id = $1", [userId]);

  revalidatePath("/admin");
  revalidatePath("/leaderboard");
  revalidatePath("/history");
  revalidatePath("/users");
}

export async function createGameAction(formData: FormData) {
  const adminUser = await requireAdmin();

  const sport = String(formData.get("sport"));
  const homeTeam = String(formData.get("homeTeam"));
  const awayTeam = String(formData.get("awayTeam"));
  const startTime = String(formData.get("startTime"));
  const spreadRaw = formData.get("spread");
  const totalRaw = formData.get("total");
  const mlHomeRaw = formData.get("moneylineHome");
  const mlAwayRaw = formData.get("moneylineAway");

  const { rows } = await db.query<{ id: string }>(
    `insert into games (sport, home_team, away_team, start_time, created_by)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [sport, homeTeam, awayTeam, new Date(startTime).toISOString(), adminUser.id],
  );

  const game = rows[0];
  if (!game) throw new Error("Failed to create game");

  await db.query(
    `insert into lines (game_id, spread, total, moneyline_home, moneyline_away, updated_by)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      game.id,
      spreadRaw ? Number(spreadRaw) : null,
      totalRaw ? Number(totalRaw) : null,
      mlHomeRaw ? Number(mlHomeRaw) : null,
      mlAwayRaw ? Number(mlAwayRaw) : null,
      adminUser.id,
    ],
  );

  revalidatePath("/admin");
  revalidatePath("/lines");
}

export async function settleGameAction(formData: FormData) {
  await requireAdmin();

  const gameId = String(formData.get("gameId"));
  const homeScore = Number(formData.get("homeScore"));
  const awayScore = Number(formData.get("awayScore"));

  await settlePicksForGame(db, gameId, homeScore, awayScore);

  revalidatePath("/admin");
  revalidatePath("/leaderboard");
  revalidatePath("/lines");
}

export async function settleOutrightAction(formData: FormData) {
  await requireAdmin();

  const gameId = String(formData.get("gameId"));
  const winnerName = String(formData.get("winnerName"));
  if (!winnerName) throw new Error("Pick the tournament winner");

  await settleOutrightEvent(db, gameId, winnerName);

  revalidatePath("/admin");
  revalidatePath("/leaderboard");
  revalidatePath("/lines");
}

// For a game that got postponed/cancelled in real life — refunds every
// pending pick/parlay leg on it in full rather than leaving them stuck
// pending forever with no way to ever settle. Called directly from a
// client component (not a <form action>) so a confirm() dialog can gate
// it first, same pattern as deleteUserAction.
export async function voidGameAction(gameId: string) {
  await requireAdmin();

  await voidGame(db, gameId);

  revalidatePath("/admin");
  revalidatePath("/leaderboard");
  revalidatePath("/lines");
  revalidatePath("/picks");
}

export async function syncNowAction(): Promise<SyncSummary[]> {
  await requireAdmin();

  const summaries = await syncAllTrackedSports(db);

  revalidatePath("/admin");
  revalidatePath("/lines");
  revalidatePath("/leaderboard");

  return summaries;
}

export async function resetWeekAction(): Promise<WeeklyResetResult> {
  await requireAdmin();

  const result = await forceWeeklyReset(db);

  revalidatePath("/admin");
  revalidatePath("/leaderboard");
  revalidatePath("/picks");

  return result;
}
