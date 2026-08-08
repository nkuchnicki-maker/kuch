-- Sports picks/parlays no longer debit the stake at placement time - it
-- stays in the user's balance and is only actually taken if the bet
-- loses, with a win paying out profit only (the stake was never removed,
-- so there's nothing to "return"). This column tracks which model a given
-- row was placed under: true for every existing row (their stake WAS
-- already taken under the old immediate-debit model, so settlement must
-- keep crediting/refunding the full amount for them) and for all
-- free-play bets going forward (free_play is still debited immediately,
-- unchanged). New real-money picks/parlays are inserted with this false.
-- Casino games are unaffected - they resolve instantly with no pending
-- window, so the old immediate debit-then-credit model still applies there.
alter table picks add column if not exists stake_debited boolean not null default true;
alter table parlays add column if not exists stake_debited boolean not null default true;
