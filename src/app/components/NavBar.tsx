import Link from "next/link";
import { getCurrentUser, isAgentOnly } from "@/lib/auth";
import { signOutAction } from "../actions";
import Logo from "./Logo";

export default async function NavBar() {
  const user = await getCurrentUser();

  if (!user) return null;

  const agentOnly = isAgentOnly(user);
  const linkClass =
    "flex items-center gap-1.5 rounded-md px-2 py-1 transition hover:bg-slate-800/80 hover:text-white";

  return (
    <nav className="relative border-b border-slate-800/80 bg-slate-950/95 px-6 py-3 text-sm text-slate-300 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href="/leaderboard"
            className="mr-4 flex items-center gap-2 text-base font-bold text-emerald-400"
          >
            <Logo size={22} />
            Bettor Edge
          </Link>
          <Link href="/leaderboard" className={linkClass}>
            🏆 Leaderboard
          </Link>
          {!agentOnly && (
            <>
              <Link href="/lines" className={linkClass}>
                📈 Lines
              </Link>
              <Link href="/live-sports" className={linkClass}>
                🔴 Live Sports
              </Link>
              <Link href="/picks" className={linkClass}>
                📋 My Picks
              </Link>
              <Link href="/casino" className={linkClass}>
                🎰 Casino
              </Link>
            </>
          )}
          {user.is_admin && (
            <Link href="/admin" className={linkClass}>
              ⚙️ Admin
            </Link>
          )}
          {(user.is_admin || user.is_agent) && (
            <Link href="/history" className={linkClass}>
              📜 History
            </Link>
          )}
          {(user.is_admin || user.is_agent) && (
            <Link href="/users" className={linkClass}>
              👥 Users
            </Link>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-500">{user.display_name}</span>
          <form action={signOutAction}>
            <button className="rounded-lg bg-slate-800 px-3 py-1 transition hover:bg-slate-700">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <div className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
    </nav>
  );
}
