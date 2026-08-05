-- Lets agents recruit "subagents" — accounts with full agent capabilities
-- (view/manage their own recruited users' bets, History, etc. — anything
-- already gated on is_agent) except the ability to create further agent
-- accounts themselves. Defaults to true so every existing agent is
-- grandfathered in as a full (can-recruit-more-agents) agent; new accounts
-- created by a non-admin agent get this explicitly set to false in code.
alter table users add column if not exists can_create_agents boolean not null default true;
