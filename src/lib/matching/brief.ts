import type { Eligibility } from "@/lib/ingest/types";
import { formatPay } from "@/lib/jobs/format";
import type { Database } from "@/lib/supabase/database.types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

export type JobForMatching = Pick<
  JobRow,
  | "id"
  | "title"
  | "locations"
  | "remote_type"
  | "employment_type"
  | "field"
  | "terms"
  | "pay_text"
  | "pay_min"
  | "pay_max"
  | "pay_currency"
  | "pay_period"
  | "eligibility_json"
  | "summary"
  | "description"
> & { companies: { name: string } | null };

export const MATCH_JOB_COLUMNS =
  "id, title, locations, remote_type, employment_type, field, terms, pay_text, pay_min, pay_max, pay_currency, pay_period, eligibility_json, summary, description, companies(name)";

/** Compact text description of a job for the scoring prompt. */
export function jobBrief(job: JobForMatching, ref: string, descriptionChars = 1500): string {
  const e = (job.eligibility_json ?? {}) as Partial<Eligibility>;
  const eligibility = [
    e.years_of_study?.length ? `years: ${e.years_of_study.join(", ")}` : null,
    e.majors?.length ? `majors: ${e.majors.join(", ")}` : null,
    e.degree_levels?.length ? `degree: ${e.degree_levels.join(", ")}` : null,
    e.work_authorization ? `work authorization: ${e.work_authorization}` : null,
    e.sponsorship && e.sponsorship !== "unknown" ? `sponsorship: ${e.sponsorship}` : null,
    e.notes ? `notes: ${e.notes}` : null,
  ].filter(Boolean);
  const lines = [
    `<job ref="${ref}">`,
    `Title: ${job.title}`,
    `Company: ${job.companies?.name ?? "Unknown"}`,
    `Type: ${job.employment_type}; field: ${job.field}; remote: ${job.remote_type}`,
    job.locations.length ? `Locations: ${job.locations.slice(0, 6).join("; ")}` : null,
    job.terms.length ? `Terms: ${job.terms.join(", ")}` : null,
    formatPay(job) ? `Pay: ${formatPay(job)}` : null,
    eligibility.length ? `Eligibility: ${eligibility.join("; ")}` : null,
    job.summary ? `Summary: ${job.summary}` : null,
    job.description ? `Description excerpt: ${job.description.slice(0, descriptionChars)}` : null,
    `</job>`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
