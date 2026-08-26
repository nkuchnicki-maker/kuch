import { signOutAction } from "../actions";

export default function LockedPage() {
  return (
    <div className="app-bg flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center text-slate-100">
      <div className="text-4xl">🔒</div>
      <h1 className="text-xl font-bold text-emerald-400">Bettor Edge is temporarily locked</h1>
      <p className="max-w-sm text-sm text-slate-400">
        Access is paused right now. Check back soon.
      </p>
      <form action={signOutAction}>
        <button
          type="submit"
          className="mt-2 rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
