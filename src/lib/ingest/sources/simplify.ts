import { parseAtsUrl } from "../ats-url";
import { fetchJson } from "../fetch";
import { cleanUrl, slugify, uniq } from "../text";
import type { RawPosting } from "../types";

/**
 * Community-maintained internship lists (SimplifyJobs). The repos publish their data as JSON at
 * `.github/scripts/listings.json`; we read that instead of scraping the README.
 */
export const SIMPLIFY_LISTS = [
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
];

export interface SimplifyListing {
  id: string;
  source?: string;
  category?: string | null;
  company_name: string;
  company_url?: string | null;
  title: string;
  active: boolean;
  is_visible: boolean;
  terms?: string[];
  date_posted?: number;
  date_updated?: number;
  url: string;
  locations?: string[];
  sponsorship?: string | null;
  degrees?: string[];
}

export interface SimplifyParseResult {
  /** Active, visible postings. */
  postings: RawPosting[];
  /** External ids the list explicitly marks inactive or hidden. */
  inactiveIds: string[];
}

export function parseSimplify(listings: SimplifyListing[]): SimplifyParseResult {
  const postings: RawPosting[] = [];
  const inactiveIds: string[] = [];
  for (const l of listings) {
    if (!l?.id || !l.title || !l.company_name || !l.url) continue;
    if (!l.active || !l.is_visible) {
      inactiveIds.push(l.id);
      continue;
    }
    const url = cleanUrl(l.url);
    const ats = parseAtsUrl(url);
    postings.push({
      sourceType: "simplify",
      externalId: l.id,
      companyName: l.company_name.trim(),
      companySlug: slugify(l.company_name),
      companyAts: ats ? { type: ats.type, slug: ats.slug } : null,
      title: l.title.trim(),
      url,
      applyUrl: url,
      locations: uniq((l.locations ?? []).map((s) => s.trim()).filter(Boolean)),
      descriptionText: null,
      postedAt: l.date_posted ? new Date(l.date_posted * 1000).toISOString() : null,
      termsHint: l.terms ?? [],
      categoryHint: l.category ?? null,
      sponsorshipHint: l.sponsorship ?? null,
      degreesHint: l.degrees ?? [],
    });
  }
  return { postings, inactiveIds };
}

export async function fetchSimplify(
  lists: string[] = SIMPLIFY_LISTS,
): Promise<SimplifyParseResult> {
  const results = await Promise.all(
    lists.map((u) => fetchJson<SimplifyListing[]>(u, { timeoutMs: 60_000 })),
  );
  const byId = new Map<string, SimplifyListing>();
  for (const list of results) for (const l of list) byId.set(l.id, l);
  return parseSimplify([...byId.values()]);
}
