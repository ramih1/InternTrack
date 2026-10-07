# InternTrack

Internships, co-ops and student programs from across the web — de-duplicated, summarized by
Claude, and searchable. See [`PLAN.md`](./PLAN.md) for the product plan. This repo currently
implements **Milestone 1 (Foundation)** and **Milestone 2 (Job board)**.

## Stack

- Next.js 16 (App Router) + TypeScript, Tailwind CSS v4, shadcn/ui
- Supabase (Postgres + Auth with email and Google, RLS on every table)
- Anthropic TypeScript SDK (`claude-opus-5-5`, structured outputs, effort `low`) for listing normalization
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
