"use client";

import { useActionState } from "react";
import Image from "next/image";
import Logo from "../components/Logo";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

// Real action photos (Pexels free license, saved locally in /public/hero) —
// football matchup, mid-air dunk, golf swing follow-through.
const HERO_PANELS = [
  { src: "/hero/football.jpg", alt: "Football players facing off mid-play" },
  { src: "/hero/basketball.jpg", alt: "Basketball player rising for a dunk" },
  { src: "/hero/golf.jpg", alt: "Golfer in a full swing follow-through" },
];

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4">
      <div className="absolute inset-0 grid grid-cols-1 sm:grid-cols-3">
        {HERO_PANELS.map((p) => (
          <div key={p.src} className="relative hidden sm:block first:block">
            <Image
              src={p.src}
              alt={p.alt}
              fill
              priority
              sizes="(max-width: 640px) 100vw, 34vw"
              className="object-cover saturate-[0.85]"
            />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-950/40" />

      <div className="relative w-full max-w-sm rounded-2xl border border-slate-700/60 bg-slate-900/80 p-8 shadow-2xl shadow-emerald-950/50 backdrop-blur-sm">
        <div className="mb-1 flex items-center justify-center gap-2">
          <Logo size={28} />
          <h1 className="text-2xl font-bold text-emerald-400">Bettor Edge</h1>
        </div>
        <p className="mb-6 text-center text-sm text-slate-400">
          Play-money picks with your friends
        </p>

        <form action={formAction} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-300">
              Username
            </label>
            <input
              type="text"
              name="username"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-300">
              Password
            </label>
            <input
              type="password"
              name="password"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-emerald-500"
            />
          </div>

          {state.error && <p className="text-sm text-red-400">{state.error}</p>}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 py-2 font-semibold text-slate-950 transition hover:from-emerald-400 hover:to-emerald-300 disabled:opacity-50"
          >
            {isPending ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Don&apos;t have an account? Ask your league admin to create one for
          you.
        </p>
      </div>
    </div>
  );
}
