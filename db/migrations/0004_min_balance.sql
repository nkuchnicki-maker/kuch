-- Everyone now starts each week at $0 instead of $1000, and each user gets
-- a per-user "min balance" floor (how far into the negative they're allowed
-- to wager) so a losing streak can't spiral indefinitely. Managers tune the
-- floor per person in Admin (e.g. -200 or -500). This only changes the
-- *starting_balance* baseline used by the weekly reset and future signups —
-- current live balances are left untouched.

alter table users add column if not exists min_balance numeric not null default -200;

alter table users alter column coin_balance set default 0;
alter table users alter column starting_balance set default 0;

update users set starting_balance = 0;
