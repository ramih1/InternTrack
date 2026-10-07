import { fetchJson } from "../fetch";
import { htmlToText, splitLocations, uniq } from "../text";
import type { RawPosting, SeedCompany } from "../types";

/** Subset of https://developers.greenhouse.io/job-board.html#list-jobs (with `content=true`). */
export interface GreenhouseResponse {
  jobs: Array<{
    id: number;
    title: string;
    absolute_url: string;
    updated_at?: string;
    first_published?: string | null;
    location?: { name?: string | null } | null;
    content?: string | null;
    departments?: Array<{ name: string }>;
    offices?: Array<{ name: string; location?: string | null }>;
  }>;
}

export function parseGreenhouse(data: GreenhouseResponse, company: SeedCompany): RawPosting[] {
  return (data.jobs ?? []).map((job) => {
    const locations = uniq([
      ...splitLocations(job.location?.name),
      ...(job.location?.name ? [] : (job.offices ?? []).map((o) => o.location || o.name)),
    ]);
    return {
      sourceType: "greenhouse",
      externalId: `${company.atsSlug}:${job.id}`,
      companyName: company.name,
      companySlug: company.slug,
      title: job.title.trim(),
      url: job.absolute_url,
      applyUrl: job.absolute_url,
      locations,
      descriptionText: htmlToText(job.content),
      postedAt: job.first_published ?? null,
      departments: (job.departments ?? []).map((d) => d.name),
    } satisfies RawPosting;
  });
}

export async function fetchGreenhouse(company: SeedCompany): Promise<RawPosting[]> {
  const data = await fetchJson<GreenhouseResponse>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company.atsSlug)}/jobs?content=true`,
  );
  return parseGreenhouse(data, company);
}
