-- InternTrack — Milestone 3: resumes, match scores, and the full-text prefilter.
-- Resumes and matches are private to their owner. Resume files live in a private
-- Storage bucket under `<user_id>/...`.

-- ---------------------------------------------------------------------------
-- resumes
-- ---------------------------------------------------------------------------
create type public.resume_parse_status as enum ('pending', 'parsed', 'failed');

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  -- Object path inside the `resumes` bucket, always prefixed with the owner's id.
  file_path text not null unique,
  file_name text not null check (char_length(file_name) <= 255),
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  parse_status public.resume_parse_status not null default 'pending',
  parse_error text,
  -- Structured profile extracted by Claude (education, skills, experience, keywords…).
  parsed_json jsonb,
  is_default boolean not null default false,
  parsed_at timestamptz,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resumes_file_path_owner check (file_path like user_id::text || '/%')
);

create index resumes_user_id_idx on public.resumes (user_id);
-- At most one default resume per user.
create unique index resumes_one_default_per_user on public.resumes (user_id) where is_default;

create trigger resumes_set_updated_at
  before update on public.resumes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- matches: one score per (resume, job)
-- ---------------------------------------------------------------------------
create table public.matches (
  resume_id uuid not null references public.resumes (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  score smallint not null check (score between 0 and 100),
  -- { matched_skills: text[], missing_skills: text[], eligibility_issues: text[], explanation: text }
  reasons_json jsonb not null default '{}'::jsonb,
  model text not null,
  created_at timestamptz not null default now(),
  primary key (resume_id, job_id)
);

create index matches_resume_score_idx on public.matches (resume_id, score desc);
create index matches_job_id_idx on public.matches (job_id);
create index matches_user_id_idx on public.matches (user_id);

-- ---------------------------------------------------------------------------
-- Full-text search vector on jobs (prefilter for matching)
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column search_tsv tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, left(coalesce(description, ''), 20000)), 'C')
  ) stored;

create index jobs_search_tsv_idx on public.jobs using gin (search_tsv);

-- Ranks open jobs against a resume's keywords. SECURITY INVOKER: RLS on `resumes`
-- means callers can only use their own resume.
create function public.match_candidates(p_resume_id uuid, p_limit integer default 40)
returns table (job_id uuid, rank real)
language sql
stable
security invoker
set search_path = ''
as $$
  with kw as (
    select distinct lower(btrim(k)) as term
    from public.resumes r,
      jsonb_array_elements_text(coalesce(r.parsed_json -> 'search_keywords', '[]'::jsonb)) as k
    where r.id = p_resume_id
      and char_length(btrim(k)) between 2 and 60
    limit 60
  ),
  q as (
    select string_agg('(' || tq::text || ')', ' | ')::tsquery as query
    from (select plainto_tsquery('english'::regconfig, term) as tq from kw) t
    where tq::text <> ''
  )
  select j.id, ts_rank(j.search_tsv, q.query) as rank
  from public.jobs j
  cross join q
  where q.query is not null
    and j.status = 'open'
    and j.search_tsv @@ q.query
  order by rank desc, j.posted_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 200);
$$;

revoke execute on function public.match_candidates(uuid, integer) from public, anon;
grant execute on function public.match_candidates(uuid, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.resumes enable row level security;
alter table public.matches enable row level security;

create policy "Users can view their own resumes"
  on public.resumes for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own resumes"
  on public.resumes for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own resumes"
  on public.resumes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own resumes"
  on public.resumes for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can view their own matches"
  on public.matches for select to authenticated
  using ((select auth.uid()) = user_id);

-- Writes must reference one of the caller's own resumes.
create policy "Users can add matches for their own resumes"
  on public.matches for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.resumes r
      where r.id = resume_id and r.user_id = (select auth.uid())
    )
  );

create policy "Users can update matches for their own resumes"
  on public.matches for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.resumes r
      where r.id = resume_id and r.user_id = (select auth.uid())
    )
  );

create policy "Users can delete their own matches"
  on public.matches for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.resumes, public.matches from anon, authenticated;
grant select, insert, update, delete on public.resumes, public.matches to authenticated;
grant all on public.resumes, public.matches to service_role;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for resume files, one folder per user
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  5242880,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

create policy "Users can read their own resume files"
  on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can upload their own resume files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can delete their own resume files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
