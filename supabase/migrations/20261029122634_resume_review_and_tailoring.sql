-- InternTrack — resume review and per-job tailoring.
-- Adds LaTeX (.tex) resumes, a stored resume review, and tailored-resume suggestions
-- (one per resume and job). Everything stays private to its owner.

-- ---------------------------------------------------------------------------
-- resumes: accept .tex sources, store the latest review
-- ---------------------------------------------------------------------------
alter table public.resumes drop constraint resumes_mime_type_check;
alter table public.resumes add constraint resumes_mime_type_check check (mime_type in (
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/x-tex'
));

alter table public.resumes
  -- { overall_score, categories: [...], strengths: [...], improvements: [...], ats_warnings: [...] }
  add column review_json jsonb,
  add column reviewed_at timestamptz;

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/x-tex'
]
where id = 'resumes';

-- ---------------------------------------------------------------------------
-- tailored_resumes: Claude's suggested edits of one resume for one job
-- ---------------------------------------------------------------------------
create table public.tailored_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  resume_id uuid not null references public.resumes (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  -- { strategy, fit_score_before, fit_score_after, edits: [...], gaps: [...] }
  result_json jsonb not null,
  model text not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint tailored_resumes_resume_job_unique unique (resume_id, job_id)
);

create index tailored_resumes_user_generated_idx on public.tailored_resumes (user_id, generated_at desc);
create index tailored_resumes_job_id_idx on public.tailored_resumes (job_id);

alter table public.tailored_resumes enable row level security;

create policy "Users can view their own tailored resumes"
  on public.tailored_resumes for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add tailored versions of their own resumes"
  on public.tailored_resumes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.resumes r
      where r.id = resume_id and r.user_id = (select auth.uid())
    )
  );

create policy "Users can update tailored versions of their own resumes"
  on public.tailored_resumes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.resumes r
      where r.id = resume_id and r.user_id = (select auth.uid())
    )
  );

create policy "Users can delete their own tailored resumes"
  on public.tailored_resumes for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.tailored_resumes from anon, authenticated;
grant select, insert, update, delete on public.tailored_resumes to authenticated;
grant all on public.tailored_resumes to service_role;
