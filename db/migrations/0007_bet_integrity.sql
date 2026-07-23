-- Sportsbook-style live-betting integrity:
-- - lines.locked_until: a game's market pauses for a short window after a
--   big play (a score change) or a sharp odds move, so no one can bet
--   against a number that's about to change.
-- - lines.last_big_move_at: just a visibility marker for when odds last
--   moved sharply, independent of locking.
-- - picks/parlay_legs *_at_pick: freezes the spread/total a bet was
--   actually placed against, so a line moving later (including the lock
--   mechanism itself) never changes what a pending bet is graded on.
--   Moneyline picks already freeze their odds via potential_payout, so
--   they don't need this.
alter table lines add column if not exists locked_until timestamptz;
alter table lines add column if not exists last_big_move_at timestamptz;

alter table picks add column if not exists spread_at_pick numeric;
alter table picks add column if not exists total_at_pick numeric;

alter table parlay_legs add column if not exists spread_at_pick numeric;
alter table parlay_legs add column if not exists total_at_pick numeric;
