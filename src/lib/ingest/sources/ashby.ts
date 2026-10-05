import { fetchJson } from "../fetch";
import { htmlToText, uniq } from "../text";
import type { PayInfo, PayPeriod, RawPosting, RemoteType, SeedCompany } from "../types";

/** Subset of https://developers.ashbyhq.com/docs/public-job-posting-api */
export interface AshbyResponse {
  jobs: Array<{
    id: string;
    title: string;
    department?: string | null;
    team?: string | null;
    employmentType?: string | null;
    location?: string | null;
    secondaryLocations?: Array<{ location: string }>;
    publishedAt?: string | null;
    isListed?: boolean;
    isRemote?: boolean | null;
    workplaceType?: "OnSite" | "Remote" | "Hybrid" | null;
    jobUrl: string;
    applyUrl?: string | null;
    descriptionHtml?: string | null;
    descriptionPlain?: string | null;
    compensation?: {
      compensationTierSummary?: string | null;
      summaryComponents?: Array<{
        compensationType?: string;
        interval?: string;
        currencyCode?: string | null;
        minValue?: number | null;
        maxValue?: number | null;
      }>;
    } | null;
  }>;
}

const ASHBY_WORKPLACE: Record<string, RemoteType> = {
  Remote: "remote",
  Hybrid: "hybrid",
  OnSite: "onsite",
};

const ASHBY_INTERVALS: Record<string, PayPeriod> = {
  "1 HOUR": "hour",
  "1 WEEK": "week",
  "1 MONTH": "month",
  "1 YEAR": "year",
  "ONE TIME": "total",
};

function ashbyPay(
  comp: NonNullable<AshbyResponse["jobs"][number]["compensation"]>,
): PayInfo | null {
  const salary = comp.summaryComponents?.find((c) => c.compensationType === "Salary");
  if (!salary && !comp.compensationTierSummary) return null;
  return {
    text: comp.compensationTierSummary ?? null,
    min: salary?.minValue ?? null,
    max: salary?.maxValue ?? salary?.minValue ?? null,
    currency: salary?.currencyCode ?? null,
    period: (salary?.interval && ASHBY_INTERVALS[salary.interval]) || null,
  };
}

export function parseAshby(data: AshbyResponse, company: SeedCompany): RawPosting[] {
  return (data.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const locations = uniq(
        [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].filter(
          (l): l is string => Boolean(l),
        ),
      );
      const remoteHint: RemoteType | null =
        (j.workplaceType && ASHBY_WORKPLACE[j.workplaceType]) || (j.isRemote ? "remote" : null);
      return {
        sourceType: "ashby",
        externalId: `${company.atsSlug}:${j.id}`,
        companyName: company.name,
        companySlug: company.slug,
        title: j.title.trim(),
        url: j.jobUrl,
        applyUrl: j.applyUrl ?? j.jobUrl,
        locations,
        descriptionText: j.descriptionPlain?.trim() || htmlToText(j.descriptionHtml),
        postedAt: j.publishedAt ?? null,
        remoteHint,
        employmentTypeHint: j.employmentType ?? null,
        departments: [j.department, j.team].filter((d): d is string => Boolean(d)),
        payHint: j.compensation ? ashbyPay(j.compensation) : null,
      } satisfies RawPosting;
    });
}

export async function fetchAshby(company: SeedCompany): Promise<RawPosting[]> {
  const data = await fetchJson<AshbyResponse>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company.atsSlug)}?includeCompensation=true`,
  );
  return parseAshby(data, company);
}
