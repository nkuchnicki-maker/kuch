import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { syncAllTrackedSports } from "@/lib/sync";
import { checkSyncSecret } from "@/lib/apiAuth";

// Called either by the admin's "Sync now" button or an external cron
// (see .github/workflows/sync-odds.yml). Protected by a shared secret so
// it can't be triggered by anyone who finds the URL.
export async function GET(request: NextRequest) {
  const unauthorized = checkSyncSecret(request);
  if (unauthorized) return unauthorized;

  const summaries = await syncAllTrackedSports(db);

  return NextResponse.json({ summaries });
}
