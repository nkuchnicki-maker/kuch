import { redirect } from "next/navigation";
import { clearSessionCookie } from "@/lib/auth";

// A protected page can have a cryptographically valid session cookie (not
// expired, correctly signed) for a user that no longer exists — e.g. an
// admin deletes someone while they're still logged in, or a stale cookie
// survives a dev-db reset. proxy.ts only checks JWT validity (it's edge
// middleware, no DB access) so it can't tell the difference and would keep
// bouncing an already-signed-out-looking visit between /login and
// /leaderboard forever. Server Components can't clear cookies themselves
// (only Server Actions/Route Handlers can), so protected pages redirect
// here instead of straight to /login when getCurrentUser() comes back
// null — this actually clears the stale cookie before sending them on,
// breaking the loop for good.
export async function GET() {
  await clearSessionCookie();
  redirect("/login");
}
