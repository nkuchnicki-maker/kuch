-- 'reset_correction' rows (one-off fixes for an erroneous weekly reset,
-- see weeklyReset.ts) are administrative balance adjustments, not real
-- betting results — same category as 'weekly_reset' itself. Excluding
-- weekly_reset from net_this_week already worked by coincidence (it's
-- always dated exactly at the boundary, so the strict `>` excludes it),
-- but a reset_correction lands slightly after the boundary and was
-- getting summed into the current week's net, double-counting whatever
-- week it was correcting.
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
    and ct.reason <> 'reset_correction'
  ), 0) as net_this_week
from users u
left join coin_transactions ct on ct.user_id = u.id
where not u.is_admin and not u.is_agent and u.username <> 'Test'
group by u.id, u.username, u.display_name, u.coin_balance, u.created_at;
