-- Free play: a separate spendable currency managers/agents can grant per
-- user. A winning free-play bet only turns the profit (payout minus the
-- free stake) into real coin_balance — the stake itself was never real
-- money, so it's never returned on a loss and never "cashes out" whole on
-- a win. Carries over indefinitely (no automatic weekly reset).
--
-- is_agent flags an account allowed to view the restricted /users page —
-- limited to the users recruited under that account's own agent code
-- (admins see everyone).
alter table users add column if not exists free_play numeric not null default 0;
alter table users add column if not exists is_agent boolean not null default false;

alter table picks add column if not exists is_free_play boolean not null default false;
alter table parlays add column if not exists is_free_play boolean not null default false;
