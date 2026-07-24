import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { syncLiveOdds } from "@/lib/sync";
import { checkSyncSecret } from "@/lib/apiAuth";

// Meant to be called frequently (e.g. every 10-15 min) by a separate cron
// from the twice-daily full sync — see .github/workflows/sync-live-odds.yml.
// Only spends API credits on sports that currently have a live game, so it
// costs ~0 on days with nothing in progress. Protected by the same shared
// secret as /api/sync.
export async function GET(request: NextRequest) {
  const unauthorized = checkSyncSecret(request);
  if (unauthorized) return unauthorized;

  const summaries = await syncLiveOdds(db);

  return NextResponse.json({ summaries });
}
