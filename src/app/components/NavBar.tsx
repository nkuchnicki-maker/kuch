import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { signOutAction } from "../actions";
import Logo from "./Logo";

export default async function NavBar() {
  const user = await getCurrentUser();

  if (!user) return null;

  return (
    <nav className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-3 text-sm text-slate-300">
      <div className="flex items-center gap-6">
        <Link href="/leaderboard" className="flex items-center gap-2 font-bold text-emerald-400">
          <Logo size={22} />
          Bettor Edge
        </Link>
        <Link href="/leaderboard" className="hover:text-white">
          Leaderboard
        </Link>
        <Link href="/lines" className="hover:text-white">
          Lines
        </Link>
        <Link href="/picks" className="hover:text-white">
          My Picks
        </Link>
        {user.is_admin && (
          <Link href="/admin" className="hover:text-white">
            Admin
          </Link>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-slate-500">{user.display_name}</span>
        <form action={signOutAction}>
          <button className="rounded-lg bg-slate-800 px-3 py-1 hover:bg-slate-700">
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
