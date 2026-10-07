import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { CLAUDE_MODEL } from "@/lib/ai/client";
import { mapLimit } from "@/lib/ingest/fetch";
import { ResumeProfileSchema } from "@/lib/resumes/schema";
import type { Database, Json } from "@/lib/supabase/database.types";

import { chunk, MATCH_JOB_COLUMNS, type JobForMatching } from "./brief";
import { scoreBatch, type TokenUsage } from "./score";

const BATCH_SIZE = 10;

export interface MatchRunStats {
  candidates: number;
  alreadyScored: number;
  scored: number;
  failedBatches: number;
  usage: TokenUsage;
}

/** Number of prefiltered jobs sent to Claude per run (cost control). */
export function candidateLimit(): number {
  const n = Number(process.env.MATCH_CANDIDATES ?? 30);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 10), 100) : 30;
}

/**
 * Scores a resume against its best full-text candidates. Runs with the signed-in user's
 * Supabase client, so RLS guarantees the resume and matches belong to them. Jobs already
 * scored for this resume are skipped, so repeated runs only pay for new candidates.
 */
export async function runMatching(
  supabase: SupabaseClient<Database>,
  resumeId: string,
): Promise<MatchRunStats> {
  const { data: resume, error } = await supabase
    .from("resumes")
    .select("id, user_id, parsed_json, parse_status")
    .eq("id", resumeId)
    .single();
  if (error) throw new Error(`Resume not found: ${error.message}`);
  if (resume.parse_status !== "parsed") throw new Error("This resume hasn't been parsed yet.");
  const profile = ResumeProfileSchema.parse(resume.parsed_json);

  const { data: candidates, error: rpcError } = await supabase.rpc("match_candidates", {
    p_resume_id: resumeId,
    p_limit: candidateLimit(),
  });
  if (rpcError) throw new Error(`Couldn't find candidate jobs: ${rpcError.message}`);

  const { data: existing, error: existingError } = await supabase
    .from("matches")
    .select("job_id")
    .eq("resume_id", resumeId);
  if (existingError) throw new Error(existingError.message);
  const done = new Set(existing.map((m) => m.job_id));
  const todo = candidates.map((c) => c.job_id).filter((id) => !done.has(id));

  const stats: MatchRunStats = {
    candidates: candidates.length,
    alreadyScored: candidates.length - todo.length,
    scored: 0,
    failedBatches: 0,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };

  if (todo.length) {
    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select(MATCH_JOB_COLUMNS)
      .in("id", todo)
      .returns<JobForMatching[]>();
    if (jobsError) throw new Error(jobsError.message);

    await mapLimit(chunk(jobs, BATCH_SIZE), 3, async (batch) => {
      const result = await scoreBatch(profile, batch);
      if (!result.ok) {
        stats.failedBatches++;
        console.error(`Match batch failed: ${result.reason} ${result.detail ?? ""}`);
        return;
      }
      stats.usage.input += result.usage.input;
      stats.usage.output += result.usage.output;
      stats.usage.cacheRead += result.usage.cacheRead;
      stats.usage.cacheWrite += result.usage.cacheWrite;
      if (!result.results.length) return;
      const { error: upsertError } = await supabase.from("matches").upsert(
        result.results.map((r) => ({
          resume_id: resumeId,
          job_id: r.jobId,
          user_id: resume.user_id,
          score: r.score,
          reasons_json: r.reasons as unknown as Json,
          model: CLAUDE_MODEL,
        })),
        { onConflict: "resume_id,job_id" },
      );
      if (upsertError) {
        stats.failedBatches++;
        console.error(`Saving matches failed: ${upsertError.message}`);
        return;
      }
      stats.scored += result.results.length;
    });
  }

  await supabase
    .from("resumes")
    .update({ matched_at: new Date().toISOString() })
    .eq("id", resumeId);
  return stats;
}
