-- InternTrack — Milestone 1/2 schema: companies, jobs, job_sources, profiles.
-- Job-board tables are world-readable (the board is public) and only writable by
-- the service role (ingestion). Profiles are private to their owner.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.ats_type as enum ('greenhouse', 'lever', 'ashby', 'workday', 'other');
create type public.remote_type as enum ('remote', 'hybrid', 'onsite', 'unknown');
create type public.posted_at_source as enum ('source', 'first_seen');
create type public.job_status as enum ('open', 'closed');
create type public.employment_type as enum ('internship', 'co_op', 'new_grad', 'program');
create type public.job_field as enum (
  'software', 'data_ml', 'hardware', 'product', 'design',
  'quant_finance', 'business', 'research', 'other'
);
create type public.job_source_type as enum ('greenhouse', 'lever', 'ashby', 'simplify', 'manual');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  domain text,
  ats_type public.ats_type not null default 'other',
  ats_slug text,
  linkedin_url text,
  in_seed_list boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_ats_slug_unique unique (ats_type, ats_slug)
);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- Stable fingerprint used to merge the same role found on several sources.
  dedupe_key text not null unique,
  title text not null,
  locations text[] not null default '{}',
  -- Lower-cased, space-joined copy of `locations` for ilike filtering (maintained by trigger).
  locations_search text not null default '',
  remote_type public.remote_type not null default 'unknown',
  employment_type public.employment_type not null default 'internship',
  field public.job_field not null default 'other',
  -- Normalized terms, e.g. {'Summer 2027','Fall 2027'}.
  terms text[] not null default '{}',
  duration text,
  pay_text text,
  pay_min numeric,
  pay_max numeric,
  pay_currency text,
  pay_period text check (pay_period in ('hour', 'week', 'month', 'year', 'total')),
  posted_at timestamptz not null default now(),
  posted_at_source public.posted_at_source not null default 'first_seen',
  deadline date,
  -- { years_of_study: text[], majors: text[], degree_levels: text[],
  --   work_authorization: text, sponsorship: 'yes'|'no'|'unknown', notes: text }
  eligibility_json jsonb not null default '{}'::jsonb,
  description text,
  summary text,
  status public.job_status not null default 'open',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  closed_at timestamptz,
  -- Hash of the source content last normalized; re-normalize when it changes.
  content_hash text,
  ai_normalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.jobs_set_locations_search()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.locations_search = lower(array_to_string(new.locations, ' | '));
  return new;
end;
$$;

create trigger jobs_set_locations_search
  before insert or update of locations on public.jobs
  for each row execute function public.jobs_set_locations_search();

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

create index jobs_company_id_idx on public.jobs (company_id);
create index jobs_status_posted_at_idx on public.jobs (status, posted_at desc);
create index jobs_terms_idx on public.jobs using gin (terms);
create index jobs_field_idx on public.jobs (field);
create index jobs_remote_type_idx on public.jobs (remote_type);
create index jobs_ai_backlog_idx on public.jobs (posted_at desc)
  where ai_normalized_at is null and status = 'open';

-- ---------------------------------------------------------------------------
-- job_sources: every place a job was found
-- ---------------------------------------------------------------------------
create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  source_type public.job_source_type not null,
  external_id text not null,
  url text not null,
  apply_url text,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint job_sources_source_external_unique unique (source_type, external_id)
);

create index job_sources_job_id_idx on public.job_sources (job_id);
create index job_sources_company_source_idx on public.job_sources (company_id, source_type);

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  school text,
  grad_date date,
  major text,
  work_auth text,
  -- { locations: text[], fields: text[], terms: text[], remote_ok: boolean }
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile automatically when a user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Only the auth trigger should run this.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.jobs enable row level security;
alter table public.job_sources enable row level security;
alter table public.profiles enable row level security;

-- Job board: readable by everyone; writes only via the service role (bypasses RLS).
create policy "Companies are publicly readable"
  on public.companies for select to anon, authenticated using (true);

create policy "Jobs are publicly readable"
  on public.jobs for select to anon, authenticated using (true);

create policy "Job sources are publicly readable"
  on public.job_sources for select to anon, authenticated using (true);

-- Profiles: owner only.
create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own profile"
  on public.profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Explicit Data API grants (don't rely on default privileges)
-- ---------------------------------------------------------------------------
revoke all on public.companies, public.jobs, public.job_sources, public.profiles from anon, authenticated;
grant select on public.companies, public.jobs, public.job_sources to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.companies, public.jobs, public.job_sources, public.profiles to service_role;
