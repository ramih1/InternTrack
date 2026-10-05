import { Constants, type Database } from "@/lib/supabase/database.types";

import { POSTED_WITHIN_OPTIONS } from "./labels";

type Enums = Database["public"]["Enums"];

export interface JobFilters {
  q: string | null;
  company: string | null;
  location: string | null;
  remote: Enums["remote_type"] | null;
  term: string | null;
  field: Enums["job_field"] | null;
  type: Enums["employment_type"] | null;
  days: number | null;
  sponsorship: boolean;
  page: number;
}

export const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

const TERM_RE = /^(Winter|Spring|Summer|Fall) 20\d{2}$/;

/** Parses and validates job-board query params; invalid values are ignored. */
export function parseJobFilters(params: SearchParams): JobFilters {
  const days = Number(first(params.days));
  const page = Number(first(params.page));
  const term = first(params.term);
  return {
    q: first(params.q)?.slice(0, 100) ?? null,
    company: first(params.company)?.slice(0, 100) ?? null,
    location: first(params.location)?.slice(0, 100) ?? null,
    remote: oneOf(first(params.remote), Constants.public.Enums.remote_type),
    term: term && TERM_RE.test(term) ? term : null,
    field: oneOf(first(params.field), Constants.public.Enums.job_field),
    type: oneOf(first(params.type), Constants.public.Enums.employment_type),
    days: (POSTED_WITHIN_OPTIONS as readonly number[]).includes(days) ? days : null,
    sponsorship: first(params.sponsorship) === "1",
    page: Number.isInteger(page) && page > 1 ? Math.min(page, 1000) : 1,
  };
}

/** Serializes filters back to a query string (omitting defaults), optionally overriding keys. */
export function filtersToQuery(filters: JobFilters, overrides: Partial<JobFilters> = {}): string {
  const f = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.company) params.set("company", f.company);
  if (f.location) params.set("location", f.location);
  if (f.remote) params.set("remote", f.remote);
  if (f.term) params.set("term", f.term);
  if (f.field) params.set("field", f.field);
  if (f.type) params.set("type", f.type);
  if (f.days) params.set("days", String(f.days));
  if (f.sponsorship) params.set("sponsorship", "1");
  if (f.page > 1) params.set("page", String(f.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function hasActiveFilters(f: JobFilters): boolean {
  return Boolean(
    f.q ||
    f.company ||
    f.location ||
    f.remote ||
    f.term ||
    f.field ||
    f.type ||
    f.days ||
    f.sponsorship,
  );
}

/** Escapes LIKE wildcards in user input. */
export function likePattern(input: string): string {
  return `%${input.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const SEASONS = ["Winter", "Spring", "Summer", "Fall"] as const;

/** Term options from the current season through roughly two years out. */
export function upcomingTerms(now: Date = new Date(), count = 9): string[] {
  const month = now.getUTCMonth(); // 0-11
  let seasonIdx = month < 3 ? 0 : month < 5 ? 1 : month < 8 ? 2 : 3;
  let year = now.getUTCFullYear();
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${SEASONS[seasonIdx]} ${year}`);
    seasonIdx = (seasonIdx + 1) % 4;
    if (seasonIdx === 0) year++;
  }
  return out;
}
