-- InternTrack — plans and usage metering for AI features.
-- `entitlements` holds each user's plan (free unless set by the service role — users can
-- read but never change it). `usage_events` records every paid AI call; users can insert
-- and read their own events but can't update or delete them, so quotas can't be reset.

create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'unlimited')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger entitlements_set_updated_at
  before update on public.entitlements
  for each row execute function public.set_updated_at();

alter table public.entitlements enable row level security;

create policy "Users can view their own plan"
  on public.entitlements for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;
grant all on public.entitlements to service_role;

create table public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('tailor', 'fit_check', 'review', 'parse')),
  created_at timestamptz not null default now()
);

create index usage_events_user_kind_created_idx
  on public.usage_events (user_id, kind, created_at desc);

alter table public.usage_events enable row level security;

create policy "Users can view their own usage"
  on public.usage_events for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can record their own usage"
  on public.usage_events for insert to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on public.usage_events from anon, authenticated;
grant select, insert on public.usage_events to authenticated;
grant all on public.usage_events to service_role;
