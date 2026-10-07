import { fetchJson } from "../fetch";
import { htmlToText, uniq } from "../text";
import type { PayInfo, PayPeriod, RawPosting, RemoteType, SeedCompany } from "../types";

/** Subset of https://github.com/lever/postings-api (`mode=json`). */
export type LeverResponse = Array<{
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  workplaceType?: "remote" | "hybrid" | "onsite" | "on-site" | "unspecified";
  categories?: {
    commitment?: string;
    department?: string;
    team?: string;
    location?: string;
    allLocations?: string[];
  };
  description?: string;
  descriptionPlain?: string;
  lists?: Array<{ text: string; content: string }>;
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string } | null;
  salaryDescriptionPlain?: string;
}>;

const LEVER_INTERVALS: Record<string, PayPeriod> = {
  "per-hour-wage": "hour",
  "per-week-salary": "week",
  "per-month-salary": "month",
  "per-year-salary": "year",
  "one-time": "total",
};

const LEVER_WORKPLACE: Record<string, RemoteType> = {
  remote: "remote",
  hybrid: "hybrid",
  onsite: "onsite",
  "on-site": "onsite",
};

export function parseLever(data: LeverResponse, company: SeedCompany): RawPosting[] {
  return data.map((p) => {
    const cats = p.categories ?? {};
    const locations = uniq(
      (cats.allLocations?.length ? cats.allLocations : [cats.location]).filter((l): l is string =>
        Boolean(l),
      ),
    );
    const listText = (p.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join("\n\n");
    const description = [
      p.descriptionPlain ?? htmlToText(p.description),
      listText,
      p.additionalPlain,
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    let payHint: PayInfo | null = null;
    if (p.salaryRange && (p.salaryRange.min || p.salaryRange.max)) {
      payHint = {
        text: p.salaryDescriptionPlain?.trim() || null,
        min: p.salaryRange.min ?? null,
        max: p.salaryRange.max ?? p.salaryRange.min ?? null,
        currency: p.salaryRange.currency ?? null,
        period: (p.salaryRange.interval && LEVER_INTERVALS[p.salaryRange.interval]) || null,
      };
    }
    return {
      sourceType: "lever",
      externalId: `${company.atsSlug}:${p.id}`,
      companyName: company.name,
      companySlug: company.slug,
      title: p.text.trim(),
      url: p.hostedUrl,
      applyUrl: p.applyUrl ?? p.hostedUrl,
      locations,
      descriptionText: description,
      postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
      remoteHint: (p.workplaceType && LEVER_WORKPLACE[p.workplaceType]) || null,
      employmentTypeHint: cats.commitment ?? null,
      departments: [cats.department, cats.team].filter((d): d is string => Boolean(d)),
      payHint,
    } satisfies RawPosting;
  });
}

export async function fetchLever(company: SeedCompany): Promise<RawPosting[]> {
  const data = await fetchJson<LeverResponse>(
    `https://api.lever.co/v0/postings/${encodeURIComponent(company.atsSlug)}?mode=json`,
  );
  return parseLever(data, company);
}
