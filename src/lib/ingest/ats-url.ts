import type { AtsType, SourceType } from "./types";

export interface AtsRef {
  type: AtsType;
  /** Company's board slug on that ATS. */
  slug: string;
  /** Posting id on that ATS, when present in the URL. */
  jobId: string | null;
}

/**
 * Recognizes public ATS posting URLs so a listing found on a community list can be matched to the
 * same listing fetched from the ATS API (and so new companies can be tagged with their ATS).
 */
export function parseAtsUrl(raw: string): AtsRef | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (/(^|\.)greenhouse\.io$/.test(host)) {
    // boards.greenhouse.io/<slug>/jobs/<id>, job-boards.greenhouse.io/<slug>/jobs/<id>,
    // boards.greenhouse.io/embed/job_app?for=<slug>&token=<id>
    if (parts[0] === "embed") {
      const slug = url.searchParams.get("for");
      return slug ? { type: "greenhouse", slug, jobId: url.searchParams.get("token") } : null;
    }
    if (!parts[0]) return null;
    const jobsIdx = parts.indexOf("jobs");
    const jobId =
      jobsIdx >= 0 && /^\d+$/.test(parts[jobsIdx + 1] ?? "") ? parts[jobsIdx + 1] : null;
    return { type: "greenhouse", slug: parts[0], jobId };
  }
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") {
    if (!parts[0]) return null;
    const jobId = /^[0-9a-f-]{36}$/i.test(parts[1] ?? "") ? parts[1] : null;
    return { type: "lever", slug: parts[0], jobId };
  }
  if (host === "jobs.ashbyhq.com") {
    if (!parts[0]) return null;
    const jobId = /^[0-9a-f-]{36}$/i.test(parts[1] ?? "") ? parts[1] : null;
    return { type: "ashby", slug: decodeURIComponent(parts[0]), jobId };
  }
  return null;
}

/** Canonical cross-source key for a posting (e.g. `greenhouse:stripe:123`), or null. */
export function canonicalPostingRef(
  sourceType: SourceType,
  externalId: string,
  url: string,
): string | null {
  if (sourceType === "greenhouse" || sourceType === "lever" || sourceType === "ashby") {
    return `${sourceType}:${externalId.toLowerCase()}`;
  }
  const ref = parseAtsUrl(url);
  return ref?.jobId ? `${ref.type}:${ref.slug.toLowerCase()}:${ref.jobId.toLowerCase()}` : null;
}
