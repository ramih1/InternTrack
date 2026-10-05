import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];

export type AtsType = "greenhouse" | "lever" | "ashby";
export type SourceType = Exclude<Enums["job_source_type"], "manual">;
export type RemoteType = Enums["remote_type"];
export type EmploymentType = Enums["employment_type"];
export type JobField = Enums["job_field"];
export type PayPeriod = "hour" | "week" | "month" | "year" | "total";

export interface SeedCompany {
  name: string;
  slug: string;
  domain?: string;
  ats: AtsType;
  atsSlug: string;
}

export interface PayInfo {
  text: string | null;
  min: number | null;
  max: number | null;
  currency: string | null;
  period: PayPeriod | null;
}

/** A listing as fetched from one source, before de-duplication and normalization. */
export interface RawPosting {
  sourceType: SourceType;
  /** Unique within the source type (e.g. `stripe:123456` for Greenhouse). */
  externalId: string;
  companyName: string;
  companySlug: string;
  /** ATS the company was detected on (used for companies discovered via community lists). */
  companyAts?: { type: AtsType; slug: string } | null;
  title: string;
  url: string;
  applyUrl?: string | null;
  locations: string[];
  descriptionText?: string | null;
  /** ISO timestamp when the source states a posting date. */
  postedAt?: string | null;
  remoteHint?: RemoteType | null;
  employmentTypeHint?: string | null;
  departments?: string[];
  termsHint?: string[];
  categoryHint?: string | null;
  sponsorshipHint?: string | null;
  degreesHint?: string[];
  payHint?: PayInfo | null;
}

export interface Eligibility {
  years_of_study: string[];
  majors: string[];
  degree_levels: string[];
  work_authorization: string | null;
  sponsorship: "yes" | "no" | "unknown";
  notes: string | null;
}

/** Normalized fields from PLAN.md §1.1 that we store on `jobs`. */
export interface NormalizedJob {
  title: string;
  locations: string[];
  remote_type: RemoteType;
  employment_type: EmploymentType;
  field: JobField;
  terms: string[];
  duration: string | null;
  pay: PayInfo;
  deadline: string | null;
  eligibility: Eligibility;
  summary: string | null;
}

/** Result of fetching one source scope (one company's board, or one community list). */
export interface FetchResult {
  sourceType: SourceType;
  /** Seed company slug for ATS boards; null for community lists that span many companies. */
  companySlug: string | null;
  ok: boolean;
  error?: string;
  postings: RawPosting[];
}
