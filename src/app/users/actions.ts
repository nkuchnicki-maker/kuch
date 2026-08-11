"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminOrAgent, hashPassword, type CurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/format";

// An agent/subagent can grant a player at most 40% of that player's
// CURRENT balance in free play — but that's a cap on the total granted
// since the last weekly reset, not per grant (see adjustFreePlayAction).
const AGENT_WEEKLY_FREE_PLAY_CAP_FRACTION = 0.4;

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

// Admin can freely grant OR take back free play, no cap. An agent/subagent
// can only GRANT (never remove) free play to their own recruited users,
// capped at 40% of the absolute value of that player's min_balance (their
// credit floor, e.g. 40% of $200 for the -$200 default) — deliberately
// NOT their current coin_balance, which is commonly zero or negative and
// would make the cap useless most of the time. That cap is on the TOTAL
// granted since the last weekly reset, not per grant, so an agent can't
// just make several 40%-sized grants back to back. It resets naturally
// along with everyone else's balance at each weekly reset, since it's
// measured from that same boundary.
export async function adjustFreePlayAction(formData: FormData) {
  const viewer = await requireAdminOrAgent();

  const userId = String(formData.get("userId"));
  const amount = Number(formData.get("amount"));

  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("Amount must be a non-zero number");
  }

  if (viewer.is_admin) {
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
    return;
  }

  // Non-admin agent/subagent path — capped grant only.
  if (amount < 0) {
    throw new Error("You can only add free play, not take it away");
  }

  await assertCanManageUser(viewer, userId);

  const { rows: userRows } = await db.query<{
    display_name: string;
    min_balance: string;
    created_at: Date;
  }>("select display_name, min_balance, created_at from users where id = $1", [userId]);
  const target = userRows[0];
  if (!target) throw new Error("User not found");

  const { rows: resetRows } = await db.query<{ last_reset: Date | null }>(
    "select max(created_at) as last_reset from coin_transactions where reason = 'weekly_reset'",
  );
  const weekStart = resetRows[0]?.last_reset ?? target.created_at;

  const { rows: grantedRows } = await db.query<{ total: string }>(
    "select coalesce(sum(amount), 0) as total from free_play_grants where user_id = $1 and created_at > $2",
    [userId, weekStart],
  );
  const alreadyGranted = Number(grantedRows[0].total);

  const cap = Math.abs(Number(target.min_balance)) * AGENT_WEEKLY_FREE_PLAY_CAP_FRACTION;
  const remaining = Math.max(0, cap - alreadyGranted);

  if (amount > remaining) {
    throw new Error(
      `Free play rejected: you can grant ${target.display_name} at most 40% of their minimum balance ` +
        `(${formatMoney(cap)}) in free play per week. ` +
        (alreadyGranted > 0
          ? `You've already given them ${formatMoney(alreadyGranted)} this week — ${formatMoney(remaining)} left.`
          : `You can give up to ${formatMoney(remaining)}.`),
    );
  }

  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query("update users set free_play = free_play + $1 where id = $2", [
      amount,
      userId,
    ]);
    await client.query(
      "insert into free_play_grants (user_id, granted_by, amount) values ($1, $2, $3)",
      [userId, viewer.id, amount],
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  revalidatePath("/users");
}
