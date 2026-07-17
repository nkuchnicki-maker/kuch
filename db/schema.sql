-- Bettor Edge schema (self-contained Postgres, no external auth provider).
-- Run this against your Postgres database (e.g. via Vercel's Query tab, or
-- `psql "$DATABASE_URL" -f db/schema.sql`).
-- Play-money only: "coins" have no cash value, cannot be purchased or redeemed.

create extension if not exists pgcrypto;

-- ============================================================
-- users: one row per login. Passwords are bcrypt hashes, created
-- by the admin (createUserAction) — there is no public sign-up.
-- ============================================================
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  username text unique not null,
  display_name text not null,
  is_admin boolean not null default false,
  coin_balance numeric not null default 1000,
  created_at timestamptz not null default now()
);

-- ============================================================
-- coin_transactions: audit log of every balance change
-- ============================================================
create table if not exists coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  amount numeric not null, -- positive = credit, negative = debit
  reason text not null, -- 'admin_grant', 'pick_wager', 'pick_payout', 'pick_refund'
  related_pick_id uuid,
  created_by uuid references users(id), -- admin who made the change, null for system/settlement
  created_at timestamptz not null default now()
);

-- ============================================================
-- games: sporting events, manually entered or synced from The Odds API
-- ============================================================
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  sport text not null, -- 'NFL', 'NBA', 'NCAAF', etc.
  home_team text not null,
  away_team text not null,
  start_time timestamptz not null,
  status text not null default 'scheduled', -- scheduled | live | final | cancelled
  home_score integer,
  away_score integer,
  external_id text unique, -- The Odds API event id, null for manually-entered games
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- lines: odds/spread/total for a game (one current line per game)
-- ============================================================
create table if not exists lines (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null unique references games(id) on delete cascade,
  spread numeric, -- e.g. -3.5 means home favored by 3.5
  total numeric, -- over/under
  moneyline_home integer,
  moneyline_away integer,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- picks: a user's wager against a line
-- ============================================================
create table if not exists picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  game_id uuid not null references games(id) on delete cascade,
  line_id uuid not null references lines(id),
  pick_type text not null, -- 'spread' | 'total' | 'moneyline'
  pick_side text not null, -- 'home' | 'away' | 'over' | 'under'
  wager numeric not null check (wager > 0),
  potential_payout numeric not null,
  status text not null default 'pending', -- pending | win | loss | push | cancelled
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

alter table coin_transactions
  drop constraint if exists coin_transactions_pick_fk;
alter table coin_transactions
  add constraint coin_transactions_pick_fk
  foreign key (related_pick_id) references picks(id) on delete set null;

-- ============================================================
-- Helpful view: current week standings (Mon-Sun, server tz = UTC)
-- ============================================================
create or replace view weekly_standings as
select
  u.id as user_id,
  u.username,
  u.display_name,
  u.coin_balance,
  coalesce(sum(ct.amount) filter (
    where ct.created_at >= date_trunc('week', now())
  ), 0) as net_this_week
from users u
left join coin_transactions ct on ct.user_id = u.id
group by u.id, u.username, u.display_name, u.coin_balance;
