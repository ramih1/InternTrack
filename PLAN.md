# InternTrack — Product & Build Plan

InternTrack is a web app for students that finds internships, co-ops, and student programs across the web, matches them to the student's resume, writes tailored cover letters, helps fill out applications, tracks every application in one place, and suggests people at each company to reach out to.

---

## 1. Features

### 1.1 Job discovery (AI search)
- Continuously collects internships, co-ops, new-grad and student programs (fellowships, rotational programs, research programs).
- Each listing shows: title, company, location(s), remote/hybrid/on-site, term (e.g. Summer 2027, Fall co-op), duration, pay (if listed), date posted, application deadline, eligibility (year of study, majors, citizenship/work-authorization), source link, and an "AI summary" of the role.
- Filters: location / radius, remote, term, field (SWE, data, finance, design…), company, posted within N days, deadline soon, sponsorship.
- De-duplication: the same role found on multiple sites appears once, with all sources linked.
- "Closed" detection: re-check listings periodically and mark ones that 404 or stop accepting applications.

### 1.2 Resume upload & matching
- Upload a PDF/DOCX resume. Claude parses it into a structured profile (education, GPA, skills, experience, projects, links).
- Each job gets a **match score (0–100)** plus a short explanation: matched skills, missing skills, eligibility issues.
- "Best matches" view sorted by score; option to hide jobs below a threshold.
- Multiple resumes supported (e.g. SWE resume vs. data resume); matching uses whichever is selected.

### 1.3 Cover letter writer
- One click per job: generates a cover letter from the resume + job description + company info.
- Tone/length controls, editable in-app, regenerate per paragraph, export to PDF/DOCX.
- Never invents experience: the prompt is limited to facts from the resume, and the UI flags any claim it can't trace back to the resume.

### 1.4 Assisted apply (agent)
- Student fills out a standard **Application Profile** once: contact info, address, school, grad date, GPA, work authorization / sponsorship, demographic questions (optional, can be "decline to answer"), links (LinkedIn, GitHub, portfolio), and saved answers to common questions ("Why this company?", "Tell us about a project").
- "Apply" button → a browser agent opens the application page, fills every field it can from the profile/resume/cover letter, uploads documents, and drafts answers to custom questions.
- **The student always reviews and clicks the final Submit** (screenshot + field summary shown in-app). Reasons: many ATS terms forbid fully automated submissions, CAPTCHAs and account logins require a human, and a wrong auto-submitted answer can't be undone.
- Supported first: Greenhouse, Lever, Ashby, Workday (hardest; later). Unsupported sites fall back to "open the page with the cover letter + answers ready to copy."
- Successful applies are logged to the tracker automatically.

### 1.5 Application tracker
- Kanban + table views: Saved → Applied → OA/Assessment → Interview → Offer / Rejected / Ghosted.
- Each entry: job, date applied, resume + cover letter version used, contacts, notes, next action + reminder date.
- **Manual add** for jobs not on the board (paste a URL — Claude fills in the details — or type them in).
- Stats: applications per week, response rate, stage conversion.
- Optional: email reminders for deadlines and follow-ups.

### 1.6 Networking suggestions
- For a job/company, suggest relevant people: university recruiters, recruiting coordinators, hiring managers on the team, and alumni from the student's school.
- **Source rules:** LinkedIn prohibits scraping and automated messaging, so InternTrack does **not** scrape LinkedIn or send messages. Instead it:
  - uses web search over publicly indexed pages (company team pages, press, conference talks, public profile snippets in search results) to suggest names + titles,
  - generates pre-filled LinkedIn **search links** (e.g. company + "university recruiter", company + school name for alumni) that the student opens themselves,
  - drafts a short, personalized connection note (≤300 chars) and a longer follow-up message for the student to copy and send.
- Contacts can be saved to a tracker entry with outreach status (Not contacted → Sent → Replied).

---

## 2. Architecture

```
┌────────────────────────────┐        ┌──────────────────────────────┐
│ Next.js app (Vercel)        │        │ Supabase                      │
│ - UI (React, Tailwind,      │◄──────►│ - Postgres (+ pgvector)       │
│   shadcn/ui)                │        │ - Auth (email, Google)        │
│ - Route handlers / server   │        │ - Storage (resumes, letters)  │
│   actions → Claude API      │        │ - Row Level Security          │
└────────────┬───────────────┘        └──────────────┬───────────────┘
             │ enqueue jobs                              │
             ▼                                           │
┌────────────────────────────┐                          │
│ Worker service (Node,       │──────────────────────────┘
│ Fly.io / Railway / Render)  │
│ - Job ingestion + refresh   │
│ - Matching (batch)          │
│ - Playwright browser agent  │
│   for assisted apply        │
└────────────────────────────┘
```

- **Frontend/API:** Next.js (App Router) + TypeScript, Tailwind, shadcn/ui. Hosted on Vercel; screens designed in Figma (see section 7).
- **DB/Auth/Storage:** Supabase. RLS on every user-owned table.
- **Background jobs:** a separate long-running Node worker (Playwright can't run in Vercel serverless functions). Queue via a `jobs_queue` table polled by the worker, or Inngest/Trigger.dev.
- **AI:** Anthropic TypeScript SDK (`@anthropic-ai/sdk`).
- **Billing (later):** Stripe subscriptions (free tier with limits, paid tier for unlimited matching/letters/assisted apply).

### 2.1 Job sources (in priority order)
1. **Public ATS job-board APIs** (structured, reliable, include posted dates): Greenhouse (`boards-api.greenhouse.io`), Lever (`api.lever.co/v0/postings/<company>`), Ashby (`api.ashbyhq.com/posting-api/job-board/<company>`). Keep a seed list of companies and their ATS slugs; filter for intern/co-op titles.
2. **Community internship lists** on GitHub (e.g. the SimplifyJobs internship repos), parsed from their README/JSON.
3. **Claude web search** to discover companies and programs not covered above (university career pages, government/nonprofit programs, fellowships). New companies found here get added to the seed list.
- Avoid scraping sites whose terms prohibit it (LinkedIn, Indeed, Glassdoor). Respect `robots.txt` and rate limits everywhere.
- **Date posted:** taken from the source when provided; otherwise "first seen by InternTrack" and labeled that way.

### 2.2 Claude usage

| Task | How | Notes |
|---|---|---|
| Discover jobs/programs | Messages API + server tools `web_search_20260209` and `web_fetch_20260209` | Use `allowed_domains`/`blocked_domains`; extract into a strict JSON schema via structured outputs |
| Normalize a raw listing | Structured outputs (`output_config.format`) | Title, location(s), term, pay, deadline, eligibility, summary |
| Parse resume | PDF as a `document` content block (base64 or Files API) + structured outputs | Store parsed profile JSON |
| Match score | Embedding/keyword prefilter in Postgres, then Claude scores top N with structured output | Batch API (50% cheaper) for nightly re-scoring |
| Cover letter | Streaming Messages API | Grounded only in resume + job description |
| Assisted apply | Playwright worker drives the page; Claude picks values for each form field (tool use with `strict: true` tools like `fill_field`, `upload_file`, `select_option`, `request_human`) | Fall back to computer use (`computer_toolset_20260801`) for unusual forms; always stop before Submit |
| Networking | Web search + drafting | Output is suggestions + LinkedIn search URLs + message drafts |

- **Model:** `claude-opus-5-5` (default; adaptive thinking is always on, tune with `output_config.effort` — `low` for extraction/normalization, `medium`/`high` for matching, letters, and the apply agent). Swapping bulk steps to a cheaper model is a cost decision to make after measuring.
- Handle `stop_reason: "refusal"` and enable server-side fallbacks (`fallbacks: "default"` with beta `server-side-fallback-2026-07-01`).
- Prompt-cache the stable parts (system prompt, parsed resume) across a user's many match/letter calls.

---

## 3. Data model (Supabase / Postgres)

- `profiles` — user_id, name, school, grad_date, major, work_auth, preferences (locations, fields, terms).
- `resumes` — id, user_id, file_path, parsed_json, embedding, is_default.
- `application_profiles` — user_id, contact/address, links, demographic answers, saved Q&A (encrypted at rest for sensitive fields).
- `companies` — id, name, domain, ats_type, ats_slug, linkedin_url.
- `jobs` — id, company_id, title, locations[], remote_type, term, pay, posted_at, posted_at_source ('source' | 'first_seen'), deadline, eligibility_json, description, summary, status (open/closed), embedding.
- `job_sources` — job_id, source_type, url, external_id, last_checked_at.
- `matches` — user_id, resume_id, job_id, score, reasons_json, created_at.
- `cover_letters` — id, user_id, job_id, resume_id, content, version.
- `applications` — id, user_id, job_id (nullable for manual), manual_company/title/url, stage, applied_at, resume_id, cover_letter_id, notes, next_action, next_action_at.
- `apply_runs` — id, application_id, status (filling / awaiting_review / submitted / failed), screenshots[], field_log_json, error.
- `contacts` — id, user_id, company_id, name, title, source_url, linkedin_search_url, outreach_status, message_draft.

---

## 4. Milestones

1. **Foundation** — Next.js + Supabase setup, auth, layout, RLS, CI (lint, typecheck, tests).
2. **Job board** — Greenhouse/Lever/Ashby ingestion for a ~100-company seed list, normalization with Claude, listing UI with filters, daily refresh + closed detection.
3. **Resume & matching** — upload, parse, match scores with explanations, "Best matches" view.
4. **Tracker** — Kanban/table, manual add (paste URL → Claude fills details), reminders.
5. **Cover letters** — generate/edit/export, linked to applications.
6. **AI discovery** — web-search-based discovery of additional companies and programs.
7. **Networking** — contact suggestions, LinkedIn search links, message drafts, outreach status.
8. **Assisted apply** — Application Profile, Playwright worker, Greenhouse + Lever first, human review before submit, auto-log to tracker.
9. **SaaS** — Stripe plans and usage limits, onboarding, landing page.

---

## 5. Guardrails & privacy
- Resumes and application profiles are private (RLS); sensitive fields encrypted; users can delete all their data.
- Never store passwords for employer/ATS accounts.
- Never auto-submit an application or auto-send a message — the student confirms each one.
- Cover letters and answers stay grounded in the student's real resume.
- Respect robots.txt, terms of service, and rate limits for every source.

## 6. Open decisions
- Hosting for the worker (Fly.io vs. Railway vs. Render).
- Queue: DB-polling vs. Inngest/Trigger.dev.
- Which cheaper model, if any, for bulk normalization/matching (measure cost vs. quality first).
- Free vs. paid tier limits.

---

## 7. Dev tooling (Claude connectors & plugins)

These are connected to the Claude account and available to Claude Code sessions while building InternTrack.

| Tool | Status | Use in this project |
|---|---|---|
| **Supabase** connector | Connected | Create the project, apply SQL migrations, generate TypeScript types, run security/performance advisors, read logs. Primary DB/auth/storage tool. |
| **Vercel** connector | Connected | Link the GitHub repo to a Vercel project, set environment variables, read build/runtime logs, preview and production deploys. |
| **Figma** connector | Connected | Mock up key screens (job board, match view, tracker Kanban, apply review) and turn Figma frames into code; keep a small design system (colors, type, components). |
| **Canva** connector | Connected | Non-code assets: logo, landing-page graphics, social posts, pitch deck. Optional. |
| **Stripe** connector | Not finished connecting | Needed only for Milestone 9 (billing). Finish connecting at claude.ai/customize/connectors before then. |
| Plugins (frontend-design, Backend Design, supabase, stripe, playwright, code-review, securitymaxxing) | Not enabled yet | Enable from the plugin catalog if wanted: playwright for testing the UI and the apply agent, code-review/securitymaxxing before each merge. |

Rules for using them:
- Ask before creating anything that costs money (paid Supabase plan, Vercel paid features, domains, Stripe live mode).
- Schema changes go through migration files committed to the repo (`supabase/migrations/`), then are applied with the Supabase connector, never ad-hoc SQL on production.
- Run Supabase advisors after every migration and fix security warnings (missing RLS, exposed tables).
