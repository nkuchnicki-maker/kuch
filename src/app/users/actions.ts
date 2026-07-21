"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

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
