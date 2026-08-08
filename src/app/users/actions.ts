"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin, requireAdminOrAgent, hashPassword, type CurrentUser } from "@/lib/auth";

// Agents can only cancel bets for their own recruited users — same
// ownership rule as setMinBalanceAction.
async function assertCanManageUser(viewer: CurrentUser, targetUserId: string) {
  if (viewer.is_admin) return;
  const { rows } = await db.query<{ agent: string }>(
    "select agent from users where id = $1",
    [targetUserId],
  );
  if (rows[0]?.agent !== viewer.agent) {
    throw new Error("You can only cancel bets for your own recruited users");
  }
}

// Cancels a single pending pick and refunds the wager in full — same
// math as a push (stake back, no profit). Lets an admin/agent clean up
// a mistaken or unwanted bet without waiting for the game to settle.
export async function cancelPickAction(pickId: string) {
  const viewer = await requireAdminOrAgent();

  const client = await db.connect();
  try {
    await client.query("begin");

    const { rows } = await client.query<{
      user_id: string;
      wager: string;
      is_free_play: boolean;
      stake_debited: boolean;
      status: string;
    }>(
      "select user_id, wager, is_free_play, stake_debited, status from picks where id = $1 for update",
      [pickId],
    );
    const pick = rows[0];
    if (!pick) throw new Error("Pick not found");
    if (pick.status !== "pending") throw new Error("Only pending picks can be cancelled");

    await assertCanManageUser(viewer, pick.user_id);

    await client.query(
      "update picks set status = 'cancelled', settled_at = now() where id = $1",
      [pickId],
    );

    if (pick.is_free_play) {
      await client.query("update users set free_play = free_play + $1 where id = $2", [
        pick.wager,
        pick.user_id,
      ]);
    } else if (pick.stake_debited) {
      // Old model: the stake was already taken at placement, so give it back.
      await client.query(
        `insert into coin_transactions (user_id, amount, reason, related_pick_id)
         values ($1, $2, 'pick_refund', $3)`,
        [pick.user_id, pick.wager, pickId],
      );
      await client.query("update users set coin_balance = coin_balance + $1 where id = $2", [
        pick.wager,
        pick.user_id,
      ]);
    }
    // else: stake was never taken (new model) — nothing to refund.

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  revalidatePath("/users");
  revalidatePath("/admin");
  revalidatePath("/leaderboard");
  revalidatePath("/picks");
  revalidatePath("/bets");
}

// Cancels a whole pending parlay (all its legs) and refunds the wager —
// same reasoning as cancelPickAction, just for the parlay/leg tables.
export async function cancelParlayAction(parlayId: string) {
  const viewer = await requireAdminOrAgent();

  const client = await db.connect();
  try {
    await client.query("begin");

    const { rows } = await client.query<{
      user_id: string;
      wager: string;
      is_free_play: boolean;
      stake_debited: boolean;
      status: string;
    }>(
      "select user_id, wager, is_free_play, stake_debited, status from parlays where id = $1 for update",
      [parlayId],
    );
    const parlay = rows[0];
    if (!parlay) throw new Error("Parlay not found");
    if (parlay.status !== "pending") throw new Error("Only pending parlays can be cancelled");

    await assertCanManageUser(viewer, parlay.user_id);

    await client.query(
      "update parlays set status = 'cancelled', settled_at = now() where id = $1",
      [parlayId],
    );
    await client.query(
      "update parlay_legs set status = 'cancelled', settled_at = now() where parlay_id = $1 and status = 'pending'",
      [parlayId],
    );

    if (parlay.is_free_play) {
      await client.query("update users set free_play = free_play + $1 where id = $2", [
        parlay.wager,
        parlay.user_id,
      ]);
    } else if (parlay.stake_debited) {
      // Old model: the stake was already taken at placement, so give it back.
      await client.query(
        `insert into coin_transactions (user_id, amount, reason, related_parlay_id)
         values ($1, $2, 'pick_refund', $3)`,
        [parlay.user_id, parlay.wager, parlayId],
      );
      await client.query("update users set coin_balance = coin_balance + $1 where id = $2", [
        parlay.wager,
        parlay.user_id,
      ]);
    }
    // else: stake was never taken (new model) — nothing to refund.

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  revalidatePath("/users");
  revalidatePath("/admin");
  revalidatePath("/leaderboard");
  revalidatePath("/picks");
  revalidatePath("/bets");
}

// Passwords are stored as one-way bcrypt hashes — there is no "current
// password" to show anyone, not even us. This sets a NEW known password
// instead, which is the actual fix for "I need to help someone log in".
// Same ownership rule as cancelling bets/setting min balance.
export async function resetPasswordAction(formData: FormData) {
  const viewer = await requireAdminOrAgent();

  const userId = String(formData.get("userId"));
  const newPassword = String(formData.get("newPassword") || "");

  if (newPassword.length < 4) {
    throw new Error("Password must be at least 4 characters");
  }

  await assertCanManageUser(viewer, userId);

  const passwordHash = await hashPassword(newPassword);
  const { rowCount } = await db.query(
    "update users set password_hash = $1 where id = $2",
    [passwordHash, userId],
  );
  if (!rowCount) throw new Error("User not found");

  revalidatePath("/users");
}

// Free play is admin-only to grant/adjust — agents can view balances and
// add new players, but not hand out free play themselves.
export async function adjustFreePlayAction(formData: FormData) {
  await requireAdmin();

  const userId = String(formData.get("userId"));
  const amount = Number(formData.get("amount"));

  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("Amount must be a non-zero number");
  }

  const { rows } = await db.query(
    `update users set free_play = free_play + $1
     where id = $2 and free_play + $1 >= 0
     returning free_play`,
    [amount, userId],
  );

  if (rows.length === 0) {
    throw new Error("User not found, or free play cannot go negative");
  }

  revalidatePath("/users");
}
