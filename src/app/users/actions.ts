"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminOrAgent } from "@/lib/auth";

export async function adjustFreePlayAction(formData: FormData) {
  const viewer = await requireAdminOrAgent();

  const userId = String(formData.get("userId"));
  const amount = Number(formData.get("amount"));

  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("Amount must be a non-zero number");
  }

  // Agents (non-admins) can only grant free play to their own recruited
  // users — enforced here, not just hidden in the UI.
  if (!viewer.is_admin) {
    const { rows } = await db.query<{ agent: string }>(
      "select agent from users where id = $1",
      [userId],
    );
    if (rows[0]?.agent !== viewer.agent) {
      throw new Error("You can only adjust free play for your own recruited users");
    }
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
