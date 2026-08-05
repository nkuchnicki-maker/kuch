"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword, setSessionCookie } from "@/lib/auth";

export type LoginState = { error?: string };

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    return { error: "Username and password are required" };
  }

  const { rows } = await db.query<{
    id: string;
    password_hash: string;
    is_admin: boolean;
  }>("select id, password_hash, is_admin from users where username = $1", [username]);

  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { error: "Invalid username or password" };
  }

  await setSessionCookie({ sub: user.id, isAdmin: user.is_admin });
  redirect("/lines");
}
