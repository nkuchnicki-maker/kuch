import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { runWeeklyResetIfDue } from "@/lib/weeklyReset";

// Meant to be polled frequently (e.g. every 15 min, every day) by
// .github/workflows/reset-week.yml — it's a no-op (one cheap query, no
// external API calls) except on the first check after Sunday midnight
// America/New_York, so polling often costs nothing. Protected by the same
// shared secret as the other sync routes.
export async function GET(request: NextRequest) {
  const secret = process.env.SYNC_SECRET;
  const provided = request.headers.get("x-sync-secret");

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runWeeklyResetIfDue(db);

  return NextResponse.json(result);
}
