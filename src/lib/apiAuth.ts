import "server-only";
import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

// Plain !== leaks how many leading bytes matched via response timing —
// low-value target here (an internal cron trigger, not account access),
// but a constant-time compare costs nothing and removes the class of bug.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Shared guard for /api/sync, /api/sync/live, /api/reset-week — triggered
// by Vercel Cron (see vercel.json), the admin's manual buttons, or a
// manual GitHub Actions workflow_dispatch run, none of which are a browser
// session. Accepts either our own x-sync-secret header (manual/GH Actions)
// or Vercel Cron's own Authorization: Bearer $CRON_SECRET (which Vercel
// attaches automatically to its scheduled invocations when that env var
// is set — see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
// Returns an unauthorized response to return immediately, or null if the
// request checks out.
export function checkSyncSecret(request: NextRequest): NextResponse | null {
  const syncSecret = process.env.SYNC_SECRET;
  const providedSyncSecret = request.headers.get("x-sync-secret");
  if (syncSecret && providedSyncSecret && safeEqual(providedSyncSecret, syncSecret)) {
    return null;
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (cronSecret && authHeader && safeEqual(authHeader, `Bearer ${cronSecret}`)) {
    return null;
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
