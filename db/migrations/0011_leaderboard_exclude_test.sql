-- Also hide the "Test" account from the leaderboard, same reasoning as
-- staff accounts - it's not a real player.
create or replace view weekly_standings as
select
  u.id as user_id,
  u.username,
  u.display_name,
  u.coin_balance,
  coalesce(sum(ct.amount) filter (
    where ct.created_at > coalesce(
      (select max(ct2.created_at) from coin_transactions ct2
       where ct2.user_id = u.id and ct2.reason = 'weekly_reset'),
      u.created_at
    )
  ), 0) as net_this_week
from users u
left join coin_transactions ct on ct.user_id = u.id
where not u.is_admin and not u.is_agent and u.username <> 'Test'
group by u.id, u.username, u.display_name, u.coin_balance, u.created_at;
