import { NextResponse, type NextRequest, after } from "next/server";
import { db } from "@/lib/db";
import { syncLiveOdds } from "@/lib/sync";
import { checkSyncSecret } from "@/lib/apiAuth";

// Called every ~1 min by an external cron-ping service (see README "Adding
// live odds"). Responds immediately and runs two passes of syncLiveOdds
// ~25s apart via after(), so a real-time feel doesn't depend on the
// caller's own timeout (free cron-ping tiers are often 10-30s) — the
// caller just sees a fast 200 while the actual sync keeps running
// server-side. Only spends API credits on sports that currently have a
// live game, so it costs ~0 when nothing is in progress. Protected by the
// same shared secret as /api/sync.
export const maxDuration = 100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  const unauthorized = checkSyncSecret(request);
  if (unauthorized) return unauthorized;

  after(async () => {
    await syncLiveOdds(db);
    await sleep(25_000);
    await syncLiveOdds(db);
  });

  return NextResponse.json({ status: "started" });
}
