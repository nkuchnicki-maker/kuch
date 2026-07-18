-- Adds parlays: a single wager combining 2+ picks from different games,
-- paying out at combined odds only if every leg wins. Safe to run multiple
-- times.

create table if not exists parlays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  wager numeric not null check (wager > 0),
  potential_payout numeric not null,
  status text not null default 'pending',
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists parlay_legs (
  id uuid primary key default gen_random_uuid(),
  parlay_id uuid not null references parlays(id) on delete cascade,
  game_id uuid not null references games(id) on delete cascade,
  line_id uuid not null references lines(id),
  pick_type text not null,
  pick_side text not null,
  odds integer not null,
  status text not null default 'pending',
  settled_at timestamptz
);

create index if not exists parlay_legs_game_id_pending_idx
  on parlay_legs (game_id) where status = 'pending';
create index if not exists parlay_legs_parlay_id_idx on parlay_legs (parlay_id);

alter table coin_transactions add column if not exists related_parlay_id uuid;

alter table coin_transactions
  drop constraint if exists coin_transactions_parlay_fk;
alter table coin_transactions
  add constraint coin_transactions_parlay_fk
  foreign key (related_parlay_id) references parlays(id) on delete set null;
