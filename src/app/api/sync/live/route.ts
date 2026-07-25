import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { syncLiveOdds } from "@/lib/sync";
import { checkSyncSecret } from "@/lib/apiAuth";

// Vercel Cron's finest granularity is 1 minute (see vercel.json), so this
// runs syncLiveOdds twice per invocation ~25s apart to get closer to a
// real-time feel without needing infrastructure beyond Vercel Cron. Only
// spends API credits on sports that currently have a live game, so it
// costs ~0 when nothing is in progress. Protected by the same shared
// secret as /api/sync.
export const maxDuration = 100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  const unauthorized = checkSyncSecret(request);
  if (unauthorized) return unauthorized;

  const first = await syncLiveOdds(db);
  await sleep(25_000);
  const second = await syncLiveOdds(db);

  return NextResponse.json({ summaries: second, previousPass: first });
}
