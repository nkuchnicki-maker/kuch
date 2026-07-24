import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { runWeeklyResetIfDue } from "@/lib/weeklyReset";
import { checkSyncSecret } from "@/lib/apiAuth";

// Meant to be polled frequently (e.g. every 15 min, every day) by
// .github/workflows/reset-week.yml — it's a no-op (one cheap query, no
// external API calls) except on the first check after Sunday midnight
// America/New_York, so polling often costs nothing. Protected by the same
// shared secret as the other sync routes.
export async function GET(request: NextRequest) {
  const unauthorized = checkSyncSecret(request);
  if (unauthorized) return unauthorized;

  const result = await runWeeklyResetIfDue(db);

  return NextResponse.json(result);
}
