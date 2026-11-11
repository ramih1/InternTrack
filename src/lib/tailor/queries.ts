import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { TailorResult } from "./types";

export async function getTailoring(resumeId: string, jobId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tailored_resumes")
    .select("id, result_json, generated_at")
    .eq("resume_id", resumeId)
    .eq("job_id", jobId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load tailored resume: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    generatedAt: data.generated_at,
    result: data.result_json as unknown as TailorResult,
  };
}
