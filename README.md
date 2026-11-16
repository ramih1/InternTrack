# InternTrack

Internships, co-ops and student programs from across the web — de-duplicated, summarized by
Claude, and searchable. See [`PLAN.md`](./PLAN.md) for the product plan. This repo currently
implements **Milestone 1 (Foundation)** and **Milestone 2 (Job board)**.

## Stack

- Next.js 16 (App Router) + TypeScript, Tailwind CSS v4, shadcn/ui
- Supabase (Postgres + Auth with email and Google, RLS on every table)
- Anthropic TypeScript SDK with structured outputs: `claude-opus-5-5` for listing normalization,
  tailoring and resume ratings; `claude-haiku-5-5` for the high-volume resume parsing and job
  fit checks
- Optional [Ollama](https://ollama.com) provider (`qwen3.5:4b`) to run the resume features free on
  your own machine
- Vitest, ESLint, Prettier; Vercel hosting + Vercel Cron for the daily refresh

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000
```

| Script                                      | What it does                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`           | Next.js                                                                    |
| `npm run check`                             | lint + typecheck + tests                                                   |
| `npm run refresh`                           | Fetch all sources, de-dupe, store, close stale jobs, normalize with Claude |
| `npm run refresh -- --ai-only --ai-max=500` | Only work through the Claude normalization backlog                         |
| `npm run refresh -- --no-ai`                | Ingest with rule-based normalization only                                  |
| `npm run verify:companies`                  | Check every ATS slug in `data/companies.json` resolves                     |

### Running the AI features locally for free (Ollama)

Resume parsing, fit checks, "Rate my resume" and tailoring can use a model on your own machine
instead of the Anthropic API:

1. Install Ollama from <https://ollama.com/download> and start it (the app, or `ollama serve`).
2. `ollama pull qwen3.5:4b` — about 3.3 GB; fits an 8 GB Mac. On 16 GB+, `qwen3.5:9b` is better.
3. In `.env.local`: `AI_PROVIDER=ollama` (and `OLLAMA_MODEL` if you pulled another model).
4. `npm run dev`.

Notes:

- This only works where the app runs next to Ollama (e.g. `npm run dev` on your laptop). The
  deployed site can't reach your laptop, so production uses `AI_PROVIDER=anthropic`.
- A 4B model is noticeably weaker than Claude: check tailored edits carefully. Grounding checks
  (edits must match the real file, new numbers/terms are flagged) apply to both providers.
- PDFs are sent as their extracted text (scanned PDFs without a text layer won't work).
- Listing normalization in `npm run refresh` / the cron always uses Claude, since those
  summaries are shared by every user.

## How ingestion works (`src/lib/ingest`)

1. **Sources**
   - Public ATS job-board APIs for the seed companies in `data/companies.json`:
     Greenhouse (`boards-api.greenhouse.io`), Lever (`api.lever.co/v0/postings`), Ashby
     (`api.ashbyhq.com/posting-api/job-board`). Only intern/co-op/new-grad/program titles are kept.
   - Community lists on GitHub (SimplifyJobs `listings.json`). Companies found there are added
     to `companies` (tagged with their ATS when the link reveals it).
2. **De-duplication** — postings are merged when they share a fingerprint (company + normalized
   title) or point at the same ATS posting (a community-list link to
   `job-boards.greenhouse.io/acme/jobs/123` merges with the Greenhouse API's `acme:123`). Each
   job keeps every source in `job_sources`.
3. **Normalization** — every listing gets fast rule-based fields on ingest. Listings with a
   description are then sent to Claude (structured outputs) to extract term, pay, deadline,
   eligibility, remote type, field and a short summary. Content is hashed, so a listing is only
   re-normalized when it changes. `INGEST_AI_MAX_PER_RUN` caps Claude calls per run.
4. **Closed detection** — after each successful fetch of a board or list, sources that
   disappeared (or that the list marks inactive) are deactivated; a job closes when none of its
   sources are active. A failed fetch never closes anything.
5. **Dates** — `posted_at` comes from the source when it provides one (`posted_at_source =
'source'`); otherwise it's the date InternTrack first saw the job (`'first_seen'`), and the UI
   says so.

The daily refresh runs as a Vercel Cron job (`vercel.json` → `GET /api/cron/refresh`, guarded
by `CRON_SECRET`). It has a ~270 s budget; anything not normalized in time is picked up next run.
For a large backfill, run `npm run refresh` locally or in CI.

## Database

Migrations live in `supabase/migrations/` and are applied with the Supabase connector/CLI —
never ad-hoc SQL. Regenerate types into `src/lib/supabase/database.types.ts` after each
migration and run the Supabase security/performance advisors.

- `companies`, `jobs`, `job_sources` — public read, writes only via the service role (ingestion).
- `profiles` — one row per user (auto-created on sign-up), readable/writable only by its owner.

## Auth setup (Supabase dashboard)

- **Authentication → URL configuration**: set Site URL to the production URL and add
  `http://localhost:3000/**` and `https://*-<your-vercel-scope>.vercel.app/**` to redirect URLs.
- **Authentication → Providers → Google**: add a Google OAuth client ID/secret; in Google Cloud
  use `https://<project-ref>.supabase.co/auth/v1/callback` as the authorized redirect URI.

## Plans & AI usage limits

AI features are metered in `usage_events` (users can't edit or delete their own events).
Free-plan limits live in `src/lib/usage/limits.ts`:

| Feature                          | Free plan                            | Model     |
| -------------------------------- | ------------------------------------ | --------- |
| Tailor a resume to a job         | 3 per 30 days                        | Opus 5.5  |
| Rate my resume                   | 3 per 30 days (+ 10-minute cooldown) | Opus 5.5  |
| Job fit check (on opening a job) | 10 per 24 hours                      | Haiku 5.5 |
| Resume upload + parsing          | 5 resumes kept per person            | Haiku 5.5 |

On top of the per-user limits, **free-plan AI use across the whole site is capped at
`AI_DAILY_LIMIT` (default 300) per rolling 24 hours**, so many free accounts can't run up the
bill. Each user counts for at most 20 toward it, and `unlimited` accounts are neither counted
nor blocked. The total comes from `ai_usage_last_24h()`, which only the service role can call
(the app uses `SUPABASE_SECRET_KEY`; without it the check is skipped and logged).

Fit checks also apply a rule-based graduation check (`src/lib/matching/eligibility.ts`): when a
posting's eligibility notes state a graduation window and the resume's graduation date is
clearly outside it, the score is capped at 40 even if the model missed it.

Fit scores are only computed when a signed-in user opens a job page. Accounts on the
`unlimited` plan also get a **Refresh my matches** button on Best matches, which scores the
resume against its top `MATCH_CANDIDATES` (default 30) keyword-matched open jobs, skipping jobs
already scored. To give an account unlimited use (e.g. for testing), set its plan with the
service role in the SQL editor:

```sql
insert into public.entitlements (user_id, plan, note)
values ('<auth user id>', 'unlimited', 'tester')
on conflict (user_id) do update set plan = excluded.plan;
```
