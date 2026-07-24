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

// Shared guard for /api/sync, /api/sync/live, /api/reset-week — all three
// are triggered by cron (or the admin's manual buttons) via a shared
// secret header rather than a browser session. Returns an unauthorized
// response to return immediately, or null if the request checks out.
export function checkSyncSecret(request: NextRequest): NextResponse | null {
  const secret = process.env.SYNC_SECRET;
  const provided = request.headers.get("x-sync-secret");

  if (!secret || !provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
