import { canonicalPostingRef } from "./ats-url";
import type { RawPosting, SourceType } from "./types";

/** Normalizes a title so trivially different spellings of the same role compare equal. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bco-op\b/g, "coop")
    .replace(/\binternship\b/g, "intern")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stable key for "the same role at the same company", independent of source and location. */
export function jobFingerprint(companySlug: string, title: string): string {
  return `${companySlug}::${normalizeTitle(title)}`;
}

export interface PostingGroup {
  /** Fingerprint of the primary posting; becomes `jobs.dedupe_key` for new jobs. */
  dedupeKey: string;
  /** All fingerprints in the group (used to match existing jobs). */
  fingerprints: string[];
  /** The posting whose content we normalize (prefers ATS sources, which carry descriptions). */
  primary: RawPosting;
  postings: RawPosting[];
}

const SOURCE_PRIORITY: Record<SourceType, number> = {
  greenhouse: 0,
  lever: 0,
  ashby: 0,
  simplify: 1,
};

/**
 * Groups postings that describe the same role. Two postings are merged when they share a
 * fingerprint (company + normalized title) or point at the same underlying ATS posting.
 */
export function groupPostings(
  postings: RawPosting[],
  companySlugFor: (p: RawPosting) => string = (p) => p.companySlug,
): PostingGroup[] {
  const parent = postings.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const firstByKey = new Map<string, number>();
  const fingerprints = postings.map((p) => jobFingerprint(companySlugFor(p), p.title));
  postings.forEach((p, i) => {
    const keys = [`fp:${fingerprints[i]}`, `src:${p.sourceType}:${p.externalId}`];
    const ref = canonicalPostingRef(p.sourceType, p.externalId, p.url);
    if (ref) keys.push(`ref:${ref}`);
    for (const key of keys) {
      const seen = firstByKey.get(key);
      if (seen === undefined) firstByKey.set(key, i);
      else union(seen, i);
    }
  });

  const groups = new Map<number, number[]>();
  postings.forEach((_, i) => {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(i);
    else groups.set(root, [i]);
  });

  return [...groups.values()].map((idxs) => {
    const sorted = [...idxs].sort(
      (a, b) =>
        SOURCE_PRIORITY[postings[a].sourceType] - SOURCE_PRIORITY[postings[b].sourceType] ||
        (postings[b].descriptionText?.length ?? 0) - (postings[a].descriptionText?.length ?? 0) ||
        a - b,
    );
    // Drop exact duplicates of the same source posting (e.g. a listing present in two lists).
    const seenSource = new Set<string>();
    const unique = sorted.filter((i) => {
      const k = `${postings[i].sourceType}:${postings[i].externalId}`;
      if (seenSource.has(k)) return false;
      seenSource.add(k);
      return true;
    });
    return {
      dedupeKey: fingerprints[unique[0]],
      fingerprints: [...new Set(unique.map((i) => fingerprints[i]))],
      primary: postings[unique[0]],
      postings: unique.map((i) => postings[i]),
    };
  });
}
