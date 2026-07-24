-- Casino tab: blackjack, roulette, baccarat. Each round is instantly
-- resolved (no pending state) — see src/lib/casino/ for the game logic.

create table if not exists casino_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  game text not null check (game in ('blackjack', 'roulette', 'baccarat')),
  wager numeric not null check (wager > 0),
  payout numeric not null default 0,
  outcome text not null check (outcome in ('win', 'loss', 'push')),
  is_free_play boolean not null default false,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists casino_rounds_user_id_idx on casino_rounds (user_id);

alter table coin_transactions
  add column if not exists related_casino_round_id uuid;

alter table coin_transactions
  drop constraint if exists coin_transactions_casino_round_fk;
alter table coin_transactions
  add constraint coin_transactions_casino_round_fk
  foreign key (related_casino_round_id) references casino_rounds(id) on delete set null;
