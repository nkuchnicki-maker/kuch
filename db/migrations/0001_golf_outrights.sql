-- Adds support for "outright" events (a whole field of players competing
-- for one winner, e.g. golf tournaments) alongside the existing two-team
-- matchup events. Safe to run multiple times.

alter table games alter column home_team drop not null;
alter table games alter column away_team drop not null;
alter table games add column if not exists event_type text not null default 'matchup';
alter table games add column if not exists event_name text;
alter table games add column if not exists winner_name text;

alter table lines add column if not exists outrights jsonb;
