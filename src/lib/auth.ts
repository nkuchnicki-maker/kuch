import "server-only";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "./db";
import {
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
  createSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "./session";

export type { SessionPayload };
export { SESSION_COOKIE, verifySessionToken };

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export type CurrentUser = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  is_admin: boolean;
  is_agent: boolean;
  agent: string;
  coin_balance: string;
  free_play: string;
};

// Full DB-backed lookup: use in Server Components/Actions where you need
// up-to-date balance/admin status, not just the JWT's claims.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await verifySessionToken(token);
  if (!session) return null;

  const { rows } = await db.query<CurrentUser>(
    `select id, email, username, display_name, is_admin, is_agent, agent, coin_balance, free_play
     from users where id = $1`,
    [session.sub],
  );

  return rows[0] ?? null;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.is_admin) throw new Error("Not an admin");
  return user;
}

export async function requireAdminOrAgent(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.is_admin && !user.is_agent) throw new Error("Not an admin or agent");
  return user;
}

// Agent-only accounts (recruiting agents like MJ/BO who aren't also
// admins) are restricted to Leaderboard/History/Users — no betting pages.
export function isAgentOnly(user: CurrentUser): boolean {
  return user.is_agent && !user.is_admin;
}

export async function blockIfAgentOnly(user: CurrentUser) {
  if (isAgentOnly(user)) throw new Error("Agent accounts can't place picks");
}
