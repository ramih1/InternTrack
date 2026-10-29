"use server";

import { CLAUDE_MODEL } from "@/lib/ai/client";
import type { MatchView } from "@/components/match-panel";
import { MATCH_JOB_COLUMNS, type JobForMatching } from "@/lib/matching/brief";
import type { MatchReasons } from "@/lib/matching/results";
import { scoreBatch } from "@/lib/matching/score";
import { primaryResume } from "@/lib/resumes/queries";
import { ResumeProfileSchema } from "@/lib/resumes/schema";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { limitMessage } from "@/lib/usage/limits";
import { getQuota, recordUsage } from "@/lib/usage/quota";

export type FitCheckResult =
  | { status: "ok"; match: MatchView; remaining: number | null }
  | { status: "limited"; message: string }
  | { status: "unavailable"; message: string };

/**
 * Scores the user's primary resume against one job — run when they open the job's page.
 * Existing scores are returned for free; new ones count toward the fit-check quota.
 */
export async function checkFit(jobId: string): Promise<FitCheckResult> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return { status: "unavailable", message: "Unknown job." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { status: "unavailable", message: "Sign in to see your fit." };

  const resume = await primaryResume(supabase);
  if (!resume) return { status: "unavailable", message: "Upload a resume to see your fit." };

  const { data: existing } = await supabase
    .from("matches")
    .select("score, reasons_json")
    .eq("resume_id", resume.id)
    .eq("job_id", jobId)
    .maybeSingle();
  if (existing) {
    return {
      status: "ok",
      remaining: null,
      match: {
        score: existing.score,
        reasons: existing.reasons_json as unknown as MatchReasons,
        resumeLabel: resume.label,
      },
    };
  }

  const quota = await getQuota(supabase, userId, "fit_check");
  if (!quota.allowed) return { status: "limited", message: limitMessage("fit_check", quota) };

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(MATCH_JOB_COLUMNS)
    .eq("id", jobId)
    .returns<JobForMatching[]>()
    .single();
  if (jobError) return { status: "unavailable", message: "Unknown job." };

  const profile = ResumeProfileSchema.safeParse(resume.parsed_json);
  if (!profile.success)
    return { status: "unavailable", message: "Re-upload your resume to see your fit." };

  const result = await scoreBatch(profile.data, [job]);
  if (!result.ok || !result.results[0]) {
    if (!result.ok)
      console.error(`Fit check failed (${jobId}): ${result.reason} ${result.detail ?? ""}`);
    return {
      status: "unavailable",
      message: "Couldn't check your fit right now. Try again later.",
    };
  }
  const r = result.results[0];
  const { error: saveError } = await supabase.from("matches").upsert(
    {
      resume_id: resume.id,
      job_id: jobId,
      user_id: userId,
      score: r.score,
      reasons_json: r.reasons as unknown as Json,
      model: CLAUDE_MODEL,
    },
    { onConflict: "resume_id,job_id" },
  );
  if (saveError) console.error(`Saving fit check failed: ${saveError.message}`);
  await recordUsage(supabase, userId, "fit_check");
  return {
    status: "ok",
    match: { score: r.score, reasons: r.reasons, resumeLabel: resume.label },
    remaining: quota.remaining === null ? null : quota.remaining - 1,
  };
}
