"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { CLAUDE_MODEL } from "@/lib/ai/client";
import { MATCH_JOB_COLUMNS, type JobForMatching } from "@/lib/matching/brief";
import { kindFromMimeType } from "@/lib/resumes/files";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { tailorResume } from "@/lib/tailor/generate";
import { limitMessage } from "@/lib/usage/limits";
import { getPlan, getQuota, recordUsage } from "@/lib/usage/quota";

export interface TailorActionState {
  error?: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const REGENERATE_COOLDOWN_MS = 10 * 60 * 1000;

export async function generateTailoring(
  resumeId: string,
  jobId: string,
): Promise<TailorActionState> {
  if (!UUID_RE.test(resumeId) || !UUID_RE.test(jobId)) return { error: "Unknown resume or job." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect(`/login?next=/jobs/${jobId}/tailor`);

  const { data: resume, error: resumeError } = await supabase
    .from("resumes")
    .select("id, file_path, mime_type, parse_status, parsed_json")
    .eq("id", resumeId)
    .single();
  if (resumeError) return { error: "Unknown resume." };
  if (resume.parse_status !== "parsed") return { error: "This resume hasn't been read yet." };

  const plan = await getPlan(supabase, userId);
  if (plan !== "unlimited") {
    const { data: existing } = await supabase
      .from("tailored_resumes")
      .select("generated_at")
      .eq("resume_id", resumeId)
      .eq("job_id", jobId)
      .maybeSingle();
    if (existing) {
      const since = Date.now() - Date.parse(existing.generated_at);
      if (since < REGENERATE_COOLDOWN_MS) {
        return {
          error: `You just tailored this. Try again in ${Math.ceil((REGENERATE_COOLDOWN_MS - since) / 60_000)} min.`,
        };
      }
    }
  }
  const quota = await getQuota(supabase, userId, "tailor", plan);
  if (!quota.allowed) return { error: limitMessage("tailor", quota) };

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(MATCH_JOB_COLUMNS)
    .eq("id", jobId)
    .returns<JobForMatching[]>()
    .single();
  if (jobError) return { error: "Unknown job." };

  const { data: blob, error: dlError } = await supabase.storage
    .from("resumes")
    .download(resume.file_path);
  if (dlError) return { error: `Couldn't read your resume file: ${dlError.message}` };

  const result = await tailorResume(
    {
      kind: kindFromMimeType(resume.mime_type),
      bytes: new Uint8Array(await blob.arrayBuffer()),
      profileText: JSON.stringify(resume.parsed_json ?? {}),
    },
    job,
  );
  if (!result.ok) {
    console.error(
      `Tailoring failed (${resumeId}/${jobId}): ${result.reason} ${result.detail ?? ""}`,
    );
    return { error: "Tailoring failed. Please try again in a few minutes." };
  }
  if (!result.result.edits.length) {
    return {
      error:
        "Claude didn't find changes worth making for this job — your resume already fits it well.",
    };
  }

  const { error: saveError } = await supabase.from("tailored_resumes").upsert(
    {
      user_id: userId,
      resume_id: resumeId,
      job_id: jobId,
      result_json: result.result as unknown as Json,
      model: CLAUDE_MODEL,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "resume_id,job_id" },
  );
  if (saveError) return { error: saveError.message };
  await recordUsage(supabase, userId, "tailor");
  revalidatePath(`/jobs/${jobId}/tailor`);
  return {};
}
