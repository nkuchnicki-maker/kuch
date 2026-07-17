"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { settlePicksForGame, settleOutrightEvent } from "@/lib/settle";
import { syncAllTrackedSports, type SyncSummary } from "@/lib/sync";

export async function createUserAction(formData: FormData) {
  await requireAdmin();

  const email = String(formData.get("email")).trim().toLowerCase();
  const password = String(formData.get("password"));
  const username = String(formData.get("username")).trim();
  const displayName = String(formData.get("displayName")).trim();
  const startingCoins = Number(formData.get("startingCoins")) || 1000;

  const passwordHash = await hashPassword(password);

  try {
    await db.query(
      `insert into users (email, password_hash, username, display_name, coin_balance)
       values ($1, $2, $3, $4, $5)`,
      [email, passwordHash, username, displayName, startingCoins],
    );
  } catch (err) {
    const message = (err as { code?: string; message: string }).code === "23505"
      ? "That email or username is already taken"
      : (err as Error).message;
    throw new Error(message);
  }

  revalidatePath("/admin");
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
       where id = $2 and coin_balance + $1 >= 0
       returning coin_balance`,
      [amount, userId],
    );

    if (rows.length === 0) {
      throw new Error("User not found, or balance cannot go negative");
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

export async function syncNowAction(): Promise<SyncSummary[]> {
  await requireAdmin();

  const summaries = await syncAllTrackedSports(db);

  revalidatePath("/admin");
  revalidatePath("/lines");
  revalidatePath("/leaderboard");

  return summaries;
}
