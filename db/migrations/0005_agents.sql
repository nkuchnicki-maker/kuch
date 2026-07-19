-- Tracks which recruiting agent (OWN/MJ/BO) brought in each user, for the
-- agent breakdown on the History page. Existing users default to 'OWN'.

alter table users add column if not exists agent text not null default 'OWN'
  check (agent in ('OWN', 'MJ', 'BO'));
