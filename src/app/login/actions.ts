"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword, setSessionCookie } from "@/lib/auth";

export type LoginState = { error?: string };

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const { rows } = await db.query<{
    id: string;
    password_hash: string;
    is_admin: boolean;
  }>("select id, password_hash, is_admin from users where email = $1", [email]);

  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { error: "Invalid email or password" };
  }

  await setSessionCookie({ sub: user.id, isAdmin: user.is_admin });
  redirect("/leaderboard");
}
