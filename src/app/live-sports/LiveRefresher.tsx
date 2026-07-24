"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Silently re-fetches this page's server data on an interval so live
// scores, odds, market locks, and the game clock update on their own
// instead of requiring a manual reload. Renders nothing.
export default function LiveRefresher({
  intervalMs = 20000,
}: {
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
