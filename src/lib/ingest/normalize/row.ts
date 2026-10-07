import type { Database, Json } from "@/lib/supabase/database.types";

import type { Eligibility, NormalizedJob, PayPeriod } from "../types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

/** Columns written from a NormalizedJob. */
export function normalizedToColumns(n: NormalizedJob) {
  return {
    title: n.title,
    locations: n.locations,
    remote_type: n.remote_type,
    employment_type: n.employment_type,
    field: n.field,
    terms: n.terms,
    duration: n.duration,
    pay_text: n.pay.text,
    pay_min: n.pay.min,
    pay_max: n.pay.max,
    pay_currency: n.pay.currency,
    pay_period: n.pay.period,
    deadline: n.deadline,
    eligibility_json: n.eligibility as unknown as Json,
  };
}

const EMPTY_ELIGIBILITY: Eligibility = {
  years_of_study: [],
  majors: [],
  degree_levels: [],
  work_authorization: null,
  sponsorship: "unknown",
  notes: null,
};

export function rowToNormalized(
  row: Pick<
    JobRow,
    | "title"
    | "locations"
    | "remote_type"
    | "employment_type"
    | "field"
    | "terms"
    | "duration"
    | "pay_text"
    | "pay_min"
    | "pay_max"
    | "pay_currency"
    | "pay_period"
    | "deadline"
    | "eligibility_json"
    | "summary"
  >,
): NormalizedJob {
  const elig = (row.eligibility_json ?? {}) as Partial<Eligibility>;
  return {
    title: row.title,
    locations: row.locations,
    remote_type: row.remote_type,
    employment_type: row.employment_type,
    field: row.field,
    terms: row.terms,
    duration: row.duration,
    pay: {
      text: row.pay_text,
      min: row.pay_min,
      max: row.pay_max,
      currency: row.pay_currency,
      period: row.pay_period as PayPeriod | null,
    },
    deadline: row.deadline,
    eligibility: { ...EMPTY_ELIGIBILITY, ...elig },
    summary: row.summary,
  };
}
