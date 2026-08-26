import "server-only";
import { db } from "./db";

// Site-wide lock: checked live from the DB on every page load (via the root
// layout), not cached in the JWT — so flipping this takes effect immediately
// for everyone already logged in, not just new logins. Admins always pass.
export async function isSiteLocked(): Promise<boolean> {
  const { rows } = await db.query<{ site_locked: boolean }>(
    "select site_locked from app_settings where id = 1",
  );
  return rows[0]?.site_locked ?? false;
}

export async function setSiteLocked(locked: boolean, adminId: string): Promise<void> {
  await db.query(
    `update app_settings
     set site_locked = $1, locked_by = $2, locked_at = case when $1 then now() else locked_at end
     where id = 1`,
    [locked, adminId],
  );
}
