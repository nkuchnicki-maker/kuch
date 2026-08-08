import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { AGENTS } from "@/lib/agents";
import { createUserAction, setMinBalanceAction, adjustCoinsAction } from "../admin/actions";
import {
  adjustFreePlayAction,
  cancelPickAction,
  cancelParlayAction,
  resetPasswordAction,
} from "./actions";
import CancelBetButton from "./CancelBetButton";

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  agent: string;
  coin_balance: string;
  min_balance: string;
  free_play: string;
};

type PendingPickRow = {
  id: string;
  user_id: string;
  wager: string;
  is_free_play: boolean;
  pick_type: string;
  pick_side: string;
  description: string;
};

type PendingParlayRow = {
  id: string;
  user_id: string;
  wager: string;
  is_free_play: boolean;
  leg_count: string;
};

type PendingBet = {
  id: string;
  kind: "pick" | "parlay";
  wager: string;
  is_free_play: boolean;
  description: string;
};

export default async function UsersPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/api/session-expired");

  if (!viewer.is_admin && !viewer.is_agent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        You don&apos;t have access to this page.
      </div>
    );
  }

  const [{ rows: users }, { rows: pendingPicks }, { rows: pendingParlays }] = await Promise.all([
    db.query<UserRow>(
      "select id, username, display_name, agent, coin_balance, min_balance, free_play from users order by display_name",
    ),
    db.query<PendingPickRow>(`
      select p.id, p.user_id, p.wager, p.is_free_play, p.pick_type, p.pick_side,
             coalesce(g.event_name, g.away_team || ' @ ' || g.home_team) as description
      from picks p
      join games g on g.id = p.game_id
      where p.status = 'pending'
      order by p.created_at desc
    `),
    db.query<PendingParlayRow>(`
      select pa.id, pa.user_id, pa.wager, pa.is_free_play, count(pl.id) as leg_count
      from parlays pa
      join parlay_legs pl on pl.parlay_id = pa.id
      where pa.status = 'pending'
      group by pa.id
      order by pa.created_at desc
    `),
  ]);

  const pendingByUser = new Map<string, PendingBet[]>();
  for (const p of pendingPicks) {
    const list = pendingByUser.get(p.user_id) ?? [];
    list.push({
      id: p.id,
      kind: "pick",
      wager: p.wager,
      is_free_play: p.is_free_play,
      description: `${p.pick_type} — ${p.pick_side} · ${p.description}`,
    });
    pendingByUser.set(p.user_id, list);
  }
  for (const p of pendingParlays) {
    const list = pendingByUser.get(p.user_id) ?? [];
    list.push({
      id: p.id,
      kind: "parlay",
      wager: p.wager,
      is_free_play: p.is_free_play,
      description: `${p.leg_count}-leg parlay`,
    });
    pendingByUser.set(p.user_id, list);
  }

  return (
    <div className="app-bg min-h-screen p-6 text-slate-100">
      <h1 className="mb-2 text-2xl font-bold text-emerald-400">Users</h1>
      <p className="mb-8 max-w-2xl text-sm text-slate-400">
        Everyone&apos;s balance, minimum balance, free play, and anything
        they still have riding — cancel a pending pick or parlay to refund
        it in full (like a push) without waiting for the game to settle.
        Passwords are one-way hashed, so there&apos;s nothing to display —
        use &quot;Reset password&quot; to set a new one instead. Only the
        admin can grant or adjust free play; min balance, resetting
        passwords, and cancelling bets can be done by the admin or by an
        agent for their own recruited users.
      </p>

      <section className="mb-8 rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg shadow-black/20">
        <h2 className="mb-4 text-lg font-semibold">Add a new player</h2>
        <form action={createUserAction} className="grid gap-3 sm:grid-cols-5">
          <input name="password" type="text" placeholder="Temp password" required
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2" />
          <input name="username" type="text" placeholder="Username" required
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2" />
          <input name="displayName" type="text" placeholder="Display name" required
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2" />
          {viewer.is_admin ? (
            <select name="agent" defaultValue="OWN" required
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
              {AGENTS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          ) : (
            <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-500">
              Agent: {viewer.agent}
            </div>
          )}
          <button type="submit"
            className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-400">
            Create user
          </button>
          {(viewer.is_admin || viewer.can_create_agents) && (
            <label className="flex items-center gap-2 text-sm text-slate-300 sm:col-span-5">
              <input type="checkbox" name="isAgent" value="true" className="accent-emerald-500" />
              {viewer.is_admin
                ? "Is agent (can view Users page)"
                : "Make this a subagent (same permissions as you, but can't recruit more agents)"}
            </label>
          )}
        </form>
        <p className="mt-2 text-xs text-slate-500">
          New players start at a $0 balance with a -$200 min balance (tune
          those from Admin if needed). They log in with the username and
          password above.
        </p>
      </section>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/80 shadow-lg shadow-black/20">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Player &amp; pending bets</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3 text-right">Min balance</th>
              <th className="px-4 py-3 text-right">Free play</th>
            </tr>
          </thead>
          <tbody>
            {users.length ? (
              users.map((u, i) => {
                const canAdjustFreePlay = viewer.is_admin;
                const canAdjustBalance = viewer.is_admin;
                const canAdjustMinBalance = viewer.is_admin || u.agent === viewer.agent;
                const canManageBets = viewer.is_admin || u.agent === viewer.agent;
                const pending = pendingByUser.get(u.id) ?? [];
                return (
                  <tr
                    key={u.id}
                    className={`border-b border-slate-800/50 align-top ${
                      i % 2 === 0 ? "bg-transparent" : "bg-slate-950/30"
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{u.agent}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{u.display_name}</div>
                      <div className="text-xs text-slate-500">@{u.username}</div>
                      {canManageBets && (
                        <form action={resetPasswordAction} className="mt-1 flex gap-1">
                          <input type="hidden" name="userId" value={u.id} />
                          <input
                            name="newPassword"
                            type="text"
                            placeholder="Reset password"
                            required
                            className="w-32 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs"
                          />
                          <button
                            type="submit"
                            className="rounded bg-slate-700 px-2 py-0.5 text-xs hover:bg-slate-600"
                          >
                            Set
                          </button>
                        </form>
                      )}
                      <div className="mt-2">
                        {pending.length ? (
                          <ul className="space-y-1.5">
                            {pending.map((bet) => (
                              <li
                                key={`${bet.kind}-${bet.id}`}
                                className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1"
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-xs text-slate-300">
                                    {bet.description}
                                  </div>
                                  <div className="font-mono text-xs text-slate-500">
                                    {formatMoney(bet.wager)}
                                    {bet.is_free_play && (
                                      <span className="ml-1 text-amber-400">(FP)</span>
                                    )}
                                  </div>
                                </div>
                                {canManageBets && (
                                  <CancelBetButton
                                    action={bet.kind === "pick" ? cancelPickAction : cancelParlayAction}
                                    betId={bet.id}
                                  />
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-xs text-slate-600">No pending bets</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-mono tabular-nums text-emerald-400">
                        {formatMoney(u.coin_balance)}
                      </div>
                      {canAdjustBalance && (
                        <form action={adjustCoinsAction} className="mt-1 flex justify-end gap-1">
                          <input type="hidden" name="userId" value={u.id} />
                          <input
                            name="amount"
                            type="number"
                            placeholder="+/- $"
                            required
                            className="w-24 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs"
                          />
                          <button
                            type="submit"
                            className="rounded bg-slate-700 px-2 py-0.5 text-xs hover:bg-slate-600"
                          >
                            Apply
                          </button>
                        </form>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-mono tabular-nums text-red-400">
                        {formatMoney(u.min_balance)}
                      </div>
                      {canAdjustMinBalance && (
                        <form action={setMinBalanceAction} className="mt-1 flex justify-end gap-1">
                          <input type="hidden" name="userId" value={u.id} />
                          <input
                            name="minBalance"
                            type="number"
                            max={0}
                            defaultValue={u.min_balance}
                            placeholder="e.g. -200"
                            required
                            className="w-24 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs"
                          />
                          <button
                            type="submit"
                            className="rounded bg-slate-700 px-2 py-0.5 text-xs hover:bg-slate-600"
                          >
                            Set
                          </button>
                        </form>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-mono tabular-nums text-amber-400">
                        {formatMoney(u.free_play)}
                      </div>
                      {canAdjustFreePlay && (
                        <form action={adjustFreePlayAction} className="mt-1 flex justify-end gap-1">
                          <input type="hidden" name="userId" value={u.id} />
                          <input
                            name="amount"
                            type="number"
                            placeholder="+/- $"
                            required
                            className="w-24 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs"
                          />
                          <button
                            type="submit"
                            className="rounded bg-slate-700 px-2 py-0.5 text-xs hover:bg-slate-600"
                          >
                            Apply
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
