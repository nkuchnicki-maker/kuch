import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { syncAllTrackedSports } from "@/lib/sync";

// Called either by the admin's "Sync now" button or an external cron
// (see .github/workflows/sync-odds.yml). Protected by a shared secret so
// it can't be triggered by anyone who finds the URL.
export async function GET(request: NextRequest) {
  const secret = process.env.SYNC_SECRET;
  const provided = request.headers.get("x-sync-secret");

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summaries = await syncAllTrackedSports(db);

  return NextResponse.json({ summaries });
}
