import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Redirects signed-out visitors to /login. Runs on the edge, so it only
// verifies the JWT signature/expiry — it doesn't hit the database (that
// happens in getCurrentUser() inside pages/actions, which also re-checks
// is_admin from the DB for anything sensitive).
export async function proxy(request: NextRequest) {
  // Stamped on every request so the root layout (a Server Component, no
  // direct access to the URL) can tell what page it's rendering — used to
  // avoid redirect-looping /locked back to itself when the site is locked.
  request.headers.set("x-pathname", request.nextUrl.pathname);

  // API routes handle their own auth (e.g. /api/sync checks a shared
  // secret so an external cron can call it without a browser session).
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next({ request });
  }

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (session && isLoginPage) {
    // Same destination as loginAction's post-login redirect — Leaderboard
    // is a hidden tab now. This runs at the edge and can't check is_agent
    // (no DB access here), but that's fine: an agent-only account landing
    // on /lines gets redirected again to /users by the page itself, same
    // harmless extra hop loginAction already produces for that case.
    const url = request.nextUrl.clone();
    url.pathname = "/lines";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
