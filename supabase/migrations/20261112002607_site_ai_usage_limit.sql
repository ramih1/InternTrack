-- InternTrack — site-wide daily limit for free-plan AI use.
-- Returns how many free-plan AI uses were recorded in the last 24 hours across all users,
-- so the app can pause free AI features once a daily total is reached. Users can read only
-- their own usage rows, so this runs as security definer and returns just the total.
-- Users insert their own usage events, so each user counts for at most 20 (about the most
-- one free account can legitimately use in a day); one account can't exhaust the limit.

create index usage_events_created_at_idx on public.usage_events (created_at);

create function public.ai_usage_last_24h()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(least(per_user.n, 20)), 0)::integer
  from (
    select ue.user_id, count(*) as n
    from public.usage_events ue
    where ue.created_at > now() - interval '24 hours'
      and not exists (
        select 1 from public.entitlements e
        where e.user_id = ue.user_id and e.plan = 'unlimited'
      )
    group by ue.user_id
  ) per_user;
$$;

revoke execute on function public.ai_usage_last_24h() from public, anon;
grant execute on function public.ai_usage_last_24h() to authenticated, service_role;
