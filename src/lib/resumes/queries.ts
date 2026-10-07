import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { MatchReasons } from "@/lib/matching/results";
import type { ResumeProfile } from "./schema";

const RESUME_COLUMNS =
  "id, label, file_name, mime_type, size_bytes, parse_status, parse_error, parsed_json, is_default, parsed_at, matched_at, created_at";

export async function listResumes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resumes")
    .select(RESUME_COLUMNS)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load resumes: ${error.message}`);
  return data.map((r) => ({ ...r, profile: r.parsed_json as ResumeProfile | null }));
}

export type ResumeListItem = Awaited<ReturnType<typeof listResumes>>[number];

export const MATCHES_PAGE_SIZE = 25;

const MATCH_LIST_COLUMNS =
  "score, reasons_json, jobs!inner(id, title, locations, remote_type, employment_type, field, terms, posted_at, posted_at_source, pay_text, pay_min, pay_max, pay_currency, pay_period, deadline, summary, status, companies!inner(name, slug, domain))";

/** A resume's scored jobs (open only), best first. */
export async function listMatches(resumeId: string, minScore: number, page: number) {
  const supabase = await createClient();
  const from = (page - 1) * MATCHES_PAGE_SIZE;
  const { data, count, error } = await supabase
    .from("matches")
    .select(MATCH_LIST_COLUMNS, { count: "exact" })
    .eq("resume_id", resumeId)
    .eq("jobs.status", "open")
    .gte("score", minScore)
    .order("score", { ascending: false })
    .order("job_id")
    .range(from, from + MATCHES_PAGE_SIZE - 1);
  if (error) throw new Error(`Failed to load matches: ${error.message}`);
  return {
    matches: data.map((m) => ({
      score: m.score,
      reasons: m.reasons_json as unknown as MatchReasons,
      job: m.jobs,
    })),
    total: count ?? 0,
  };
}

/** The signed-in user's match for a job against their default resume, if any. */
export async function getDefaultResumeMatch(jobId: string) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return null;
  const { data, error } = await supabase
    .from("matches")
    .select("score, reasons_json, resumes!inner(label, is_default)")
    .eq("job_id", jobId)
    .eq("resumes.is_default", true)
    .maybeSingle();
  if (error || !data) return null;
  return {
    score: data.score,
    reasons: data.reasons_json as unknown as MatchReasons,
    resumeLabel: data.resumes.label,
  };
}
