import "server-only";
import type { Pool } from "pg";

const RESET_TIMEZONE = "America/New_York";

// Uses Intl's IANA timezone support rather than a fixed UTC offset, so this
// stays correct across the EST/EDT switch automatically (no hardcoded
// UTC-4/UTC-5 math to get wrong).
//
// Checks for Monday, not Sunday — the reset is meant to land "going into
// Sunday night" (i.e. right as Sunday ends and Monday begins), not at the
// start of Sunday. The cron in vercel.json fires early Monday morning ET
// to match.
function isMondayInTimeZone(now: Date): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: RESET_TIMEZONE,
    weekday: "short",
  }).format(now);
  return weekday === "Mon";
}

// yyyy-mm-dd in the target timezone — en-CA formats that way directly.
function calendarDateInTimeZone(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: RESET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export type WeeklyResetResult = {
  ran: boolean;
  reason: string;
  usersReset?: number;
};

// The actual reset: every user's coin_balance snaps back to their
// starting_balance MINUS whatever they currently have tied up in
// still-pending picks/parlays. That wager was already debited when they
// placed the bet, so simply resetting to a flat starting_balance would
// silently "forgive" it; subtracting it instead means the eventual
// win/loss/push still lands correctly against the new week once it
// settles, using the exact same settlement code as any other pick — a
// loss really costs the new week's balance, a win nets out to the right
// profit, and this can legitimately leave someone starting the week
// negative if they had a big bet outstanding.
async function resetAllBalances(db: Pool): Promise<number> {
  const client = await db.connect();
  let usersReset = 0;
  try {
    await client.query("begin");

    const { rows: users } = await client.query<{
      id: string;
      coin_balance: string;
      starting_balance: string;
    }>("select id, coin_balance, starting_balance from users");

    for (const u of users) {
      const { rows: exposureRows } = await client.query<{ pending_exposure: string }>(
        `select
           coalesce((select sum(wager) from picks where user_id = $1 and status = 'pending'), 0)
           + coalesce((select sum(wager) from parlays where user_id = $1 and status = 'pending'), 0)
           as pending_exposure`,
        [u.id],
      );
      const pendingExposure = Number(exposureRows[0]?.pending_exposure ?? 0);
      const target = Number(u.starting_balance) - pendingExposure;
      const delta = target - Number(u.coin_balance);

      await client.query(
        `insert into coin_transactions (user_id, amount, reason) values ($1, $2, 'weekly_reset')`,
        [u.id, delta],
      );
      await client.query("update users set coin_balance = $1 where id = $2", [target, u.id]);
      usersReset++;
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  return usersReset;
}

// Resets every user's coin_balance back to their starting_balance once per
// week, at the first check that lands on a Monday (America/New_York) after
// the previous reset — i.e. going into Sunday night, not the start of
// Sunday. Idempotent — safe to call as often as you like; it only actually
// resets once per Monday, determined by the most recent 'weekly_reset'
// coin_transaction across all users. This is the automated path (see
// /api/reset-week and .github/workflows/reset-week.yml).
export async function runWeeklyResetIfDue(db: Pool): Promise<WeeklyResetResult> {
  const now = new Date();

  if (!isMondayInTimeZone(now)) {
    return { ran: false, reason: "not Monday in America/New_York" };
  }

  const todayEt = calendarDateInTimeZone(now);

  const { rows } = await db.query<{ last_reset: string | null }>(
    `select max(created_at) as last_reset from coin_transactions where reason = 'weekly_reset'`,
  );
  const lastResetEt = rows[0]?.last_reset
    ? calendarDateInTimeZone(new Date(rows[0].last_reset))
    : null;

  if (lastResetEt === todayEt) {
    return { ran: false, reason: "already reset today" };
  }

  const usersReset = await resetAllBalances(db);
  return { ran: true, reason: "reset complete", usersReset };
}

// Unconditional reset for the admin's manual "Reset week now" button —
// ignores the day-of-week/idempotency gating that the automated path uses.
export async function forceWeeklyReset(db: Pool): Promise<WeeklyResetResult> {
  const usersReset = await resetAllBalances(db);
  return { ran: true, reason: "manual reset", usersReset };
}
