-- BO was never actually used (no user has agent='BO'), so this is a
-- straightforward tightening of the allowed values, no data migration
-- needed.
alter table users drop constraint if exists users_agent_check;
alter table users add constraint users_agent_check check (agent in ('OWN', 'MJ'));
