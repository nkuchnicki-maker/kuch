import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { runWeeklyResetIfDue } from "@/lib/weeklyReset";
import { checkSyncSecret } from "@/lib/apiAuth";

// Runs once a week via Vercel Cron (see vercel.json) — Sunday 05:00 UTC,
// which is at/shortly after Sunday midnight America/New_York depending on
// DST. Vercel's Hobby plan caps cron jobs at once/day, so this can't poll
// more often than weekly the way it used to; the route itself is still a
// harmless no-op if somehow called outside that window. Protected by the
// same shared secret as the other sync routes.
export async function GET(request: NextRequest) {
  const unauthorized = checkSyncSecret(request);
  if (unauthorized) return unauthorized;

  const result = await runWeeklyResetIfDue(db);

  return NextResponse.json(result);
}
