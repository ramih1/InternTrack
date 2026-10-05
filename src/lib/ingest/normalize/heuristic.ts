import {
  detectEmploymentType,
  detectField,
  detectRemote,
  extractPay,
  extractTerms,
  normalizeTermLabels,
  sponsorshipFromLabel,
  sortTerms,
} from "../classify";
import { uniq } from "../text";
import type { NormalizedJob, RawPosting } from "../types";

/**
 * Rule-based normalization. Used for every listing on ingest (fast, free) and as the fallback
 * when Claude normalization is unavailable or declines.
 */
export function normalizeHeuristic(primary: RawPosting, others: RawPosting[] = []): NormalizedJob {
  const all = [primary, ...others];
  const locations = uniq(all.flatMap((p) => p.locations));
  const description = primary.descriptionText ?? "";
  const hintTerms = normalizeTermLabels(all.flatMap((p) => p.termsHint ?? []));
  const terms = sortTerms(
    uniq([
      ...hintTerms,
      ...extractTerms(primary.title),
      ...(hintTerms.length ? [] : extractTerms(description.slice(0, 4000))),
    ]),
  );
  const remoteHint = all.map((p) => p.remoteHint).find((h) => h && h !== "unknown") ?? null;
  const pay = all.map((p) => p.payHint).find(Boolean) ?? extractPay(description);
  const sponsorshipLabel = all.map((p) => p.sponsorshipHint).find(Boolean) ?? null;
  const degrees = uniq(all.flatMap((p) => p.degreesHint ?? []));
  const category = all.map((p) => p.categoryHint).find(Boolean) ?? null;

  return {
    title: primary.title,
    locations,
    remote_type: detectRemote(locations, description, remoteHint),
    employment_type: detectEmploymentType(primary.title, primary.employmentTypeHint),
    field: detectField(primary.title, primary.departments, category),
    terms,
    duration: null,
    pay: pay ?? { text: null, min: null, max: null, currency: null, period: null },
    deadline: null,
    eligibility: {
      years_of_study: [],
      majors: [],
      degree_levels: degrees,
      work_authorization:
        sponsorshipLabel && /citizenship/i.test(sponsorshipLabel) ? sponsorshipLabel : null,
      sponsorship: sponsorshipFromLabel(sponsorshipLabel),
      notes: null,
    },
    summary: null,
  };
}
