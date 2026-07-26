import { NextResponse, type NextRequest, after } from "next/server";
import { db } from "@/lib/db";
import { syncAllTrackedSports } from "@/lib/sync";
import { checkSyncSecret } from "@/lib/apiAuth";

// Called by an external cron-ping service (free tiers of these typically
// time out a request after 10-30s, well under the ~14 sports' worth of
// real sync time this needs) — see README "Adding live odds". Responds
// immediately and runs the actual sync via after() so the caller sees a
// fast 200 instead of reporting a false failure. The admin's "Sync now"
// button calls syncAllTrackedSports directly (see admin/actions.ts) and
// isn't affected by this. Protected by a shared secret so it can't be
// triggered by anyone who finds the URL.
export const maxDuration = 280;

export async function GET(request: NextRequest) {
  const unauthorized = checkSyncSecret(request);
  if (unauthorized) return unauthorized;

  after(() => syncAllTrackedSports(db));

  return NextResponse.json({ status: "started" });
}
