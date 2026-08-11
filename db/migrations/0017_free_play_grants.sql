-- Audit log of free play grants made by an agent/subagent (not admin —
-- admin grants aren't capped and aren't logged here). Needed to enforce a
-- rolling weekly cap: an agent can grant a player free play up to 40% of
-- that player's current balance, but that's a cap on the TOTAL granted
-- since the last weekly reset, not per individual grant — otherwise an
-- agent could just make several 40% grants back to back. See
-- adjustFreePlayAction in src/app/users/actions.ts.
create table if not exists free_play_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  granted_by uuid not null references users(id),
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists free_play_grants_user_id_idx on free_play_grants (user_id);
