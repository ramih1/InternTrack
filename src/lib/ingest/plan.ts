import { createHash } from "node:crypto";

import type { PostingGroup } from "./dedupe";
import type { RawPosting } from "./types";

export const sourceKey = (sourceType: string, externalId: string) => `${sourceType}:${externalId}`;

/** Hash of the content we normalize; when it changes the job is re-normalized. */
export function contentHash(p: RawPosting, locations: string[]): string {
  return createHash("sha1")
    .update(p.title)
    .update("\u0000")
    .update(p.descriptionText ?? "")
    .update("\u0000")
    .update([...locations].sort().join("|"))
    .digest("hex");
}

/** Earliest source-provided posting date in a group, if any. */
export function earliestPostedAt(group: PostingGroup): string | null {
  const dates = group.postings
    .map((p) => p.postedAt)
    .filter((d): d is string => Boolean(d) && !Number.isNaN(Date.parse(d!)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return dates[0] ? new Date(dates[0]).toISOString() : null;
}

/**
 * Given the sources currently active in the database for the scopes we re-fetched successfully,
 * returns the ones that were not seen this run (i.e. should be marked inactive).
 */
export function staleSources<T extends { source_type: string; external_id: string }>(
  active: T[],
  seen: Set<string>,
): T[] {
  return active.filter((s) => !seen.has(sourceKey(s.source_type, s.external_id)));
}

export function isTooOld(postedAt: string | null | undefined, maxAgeDays: number, now: Date) {
  if (!postedAt) return false;
  return now.getTime() - Date.parse(postedAt) > maxAgeDays * 86_400_000;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
