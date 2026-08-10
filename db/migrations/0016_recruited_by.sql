-- Tracks each user's DIRECT recruiter, distinct from the existing `agent`
-- column (which only records the top-level OWN/MJ branch). Needed for the
-- Weekly Recap commission breakdown, which has to know exactly which
-- subagent (not just which top-level agent) a given player belongs to.
-- Null = recruited directly by the owner (an admin created them), meaning
-- there's no agent above them to take a cut.
alter table users add column if not exists recruited_by uuid references users(id) on delete set null;

-- Backfill: before this column existed, only the two top-level buckets
-- ('OWN'/'MJ') were tracked and no subagents existed yet, so every
-- non-agent, non-admin user currently under the 'MJ' bucket was in fact
-- recruited directly by MJ.
update users
set recruited_by = (select id from users where username = 'MJ')
where agent = 'MJ' and username <> 'MJ' and not is_agent and not is_admin;
