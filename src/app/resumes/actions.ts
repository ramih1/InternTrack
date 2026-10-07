"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { runMatching } from "@/lib/matching/run";
import {
  checkResumeFile,
  labelFromFileName,
  MAX_RESUMES_PER_USER,
  RESUME_MIME_TYPES,
  safeFileName,
  type ResumeKind,
} from "@/lib/resumes/files";
import { parseResume } from "@/lib/resumes/parse";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export interface ResumeActionState {
  error?: string;
  message?: string;
}

const UPDATE_COOLDOWN_MS = 15 * 60 * 1000;
const UUID_RE = /^[0-9a-f-]{36}$/i;

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login?next=/resumes");
  return { supabase, userId };
}

function friendlyParseError(reason: string, detail?: string) {
  if (reason === "parse_error" && detail) return detail;
  if (reason === "refusal") return "We couldn't read this resume. Try a different file.";
  return "Reading the resume failed. Please try again in a minute.";
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Parses the stored file with Claude and records the result on the resume row. */
async function parseAndStore(
  supabase: Supabase,
  resumeId: string,
  bytes: Uint8Array,
  kind: ResumeKind,
) {
  const result = await parseResume(bytes, kind);
  if (!result.ok) {
    console.error(`Resume parse failed (${resumeId}): ${result.reason} ${result.detail ?? ""}`);
    const message = friendlyParseError(result.reason, result.detail);
    await supabase
      .from("resumes")
      .update({ parse_status: "failed", parse_error: message })
      .eq("id", resumeId);
    return { ok: false as const, error: message };
  }
  const { error } = await supabase
    .from("resumes")
    .update({
      parse_status: "parsed",
      parse_error: null,
      parsed_json: result.profile as unknown as Json,
      parsed_at: new Date().toISOString(),
    })
    .eq("id", resumeId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

async function matchAndSummarize(supabase: Supabase, resumeId: string): Promise<ResumeActionState> {
  try {
    const stats = await runMatching(supabase, resumeId);
    if (stats.failedBatches && !stats.scored) {
      return { error: "Scoring matches failed. Try “Update matches” in a few minutes." };
    }
    return {
      message: stats.scored
        ? `Scored ${stats.scored} new ${stats.scored === 1 ? "job" : "jobs"}.`
        : "Your matches are up to date.",
    };
  } catch (err) {
    console.error(err);
    return { error: "Scoring matches failed. Try “Update matches” in a few minutes." };
  }
}

export async function uploadResume(
  _: ResumeActionState,
  formData: FormData,
): Promise<ResumeActionState> {
  const { supabase, userId } = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF or .docx file." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkResumeFile(bytes, file.name);
  if (!check.ok) return { error: check.error };

  const { count, error: countError } = await supabase
    .from("resumes")
    .select("id", { count: "exact", head: true });
  if (countError) return { error: countError.message };
  if ((count ?? 0) >= MAX_RESUMES_PER_USER) {
    return { error: `You can keep up to ${MAX_RESUMES_PER_USER} resumes. Delete one first.` };
  }

  const id = crypto.randomUUID();
  const path = `${userId}/${id}.${check.kind}`;
  const { error: uploadError } = await supabase.storage
    .from("resumes")
    .upload(path, bytes, { contentType: check.mimeType, upsert: false });
  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  const label =
    String(formData.get("label") ?? "")
      .trim()
      .slice(0, 80) || labelFromFileName(file.name);
  const { error: insertError } = await supabase.from("resumes").insert({
    id,
    user_id: userId,
    label,
    file_path: path,
    file_name: safeFileName(file.name),
    mime_type: check.mimeType,
    size_bytes: bytes.byteLength,
    is_default: (count ?? 0) === 0,
  });
  if (insertError) {
    await supabase.storage.from("resumes").remove([path]);
    return { error: insertError.message };
  }

  const parsed = await parseAndStore(supabase, id, bytes, check.kind);
  revalidatePath("/resumes");
  if (!parsed.ok) return { error: parsed.error };

  const result = await matchAndSummarize(supabase, id);
  revalidatePath("/matches");
  return result.error ? result : { message: `Resume added. ${result.message}` };
}

export async function retryParse(resumeId: string): Promise<ResumeActionState> {
  if (!UUID_RE.test(resumeId)) return { error: "Unknown resume." };
  const { supabase } = await requireUser();
  const { data: resume, error } = await supabase
    .from("resumes")
    .select("id, file_path, mime_type")
    .eq("id", resumeId)
    .single();
  if (error) return { error: "Unknown resume." };
  const { data: blob, error: dlError } = await supabase.storage
    .from("resumes")
    .download(resume.file_path);
  if (dlError) return { error: `Couldn't read the file: ${dlError.message}` };
  const kind: ResumeKind = resume.mime_type === RESUME_MIME_TYPES.docx ? "docx" : "pdf";
  const parsed = await parseAndStore(
    supabase,
    resumeId,
    new Uint8Array(await blob.arrayBuffer()),
    kind,
  );
  revalidatePath("/resumes");
  if (!parsed.ok) return { error: parsed.error };
  const result = await matchAndSummarize(supabase, resumeId);
  revalidatePath("/matches");
  return result;
}

export async function updateMatches(resumeId: string): Promise<ResumeActionState> {
  if (!UUID_RE.test(resumeId)) return { error: "Unknown resume." };
  const { supabase } = await requireUser();
  const { data: resume, error } = await supabase
    .from("resumes")
    .select("matched_at, parse_status")
    .eq("id", resumeId)
    .single();
  if (error) return { error: "Unknown resume." };
  if (resume.parse_status !== "parsed") return { error: "This resume hasn't been read yet." };
  const since = resume.matched_at ? Date.now() - Date.parse(resume.matched_at) : Infinity;
  if (since < UPDATE_COOLDOWN_MS) {
    const minutes = Math.ceil((UPDATE_COOLDOWN_MS - since) / 60_000);
    return { error: `Matches were just updated. Try again in ${minutes} min.` };
  }
  const result = await matchAndSummarize(supabase, resumeId);
  revalidatePath("/resumes");
  revalidatePath("/matches");
  return result;
}

export async function setDefaultResume(resumeId: string): Promise<ResumeActionState> {
  if (!UUID_RE.test(resumeId)) return { error: "Unknown resume." };
  const { supabase, userId } = await requireUser();
  // Clear the old default first: a partial unique index allows one default per user.
  const { error: clearError } = await supabase
    .from("resumes")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("is_default", true);
  if (clearError) return { error: clearError.message };
  const { error } = await supabase.from("resumes").update({ is_default: true }).eq("id", resumeId);
  if (error) return { error: error.message };
  revalidatePath("/resumes");
  revalidatePath("/matches");
  return { message: "Default resume updated." };
}

export async function deleteResume(resumeId: string): Promise<ResumeActionState> {
  if (!UUID_RE.test(resumeId)) return { error: "Unknown resume." };
  const { supabase, userId } = await requireUser();
  const { data: resume, error } = await supabase
    .from("resumes")
    .select("id, file_path, is_default")
    .eq("id", resumeId)
    .single();
  if (error) return { error: "Unknown resume." };
  const { error: rmError } = await supabase.storage.from("resumes").remove([resume.file_path]);
  if (rmError) return { error: `Couldn't delete the file: ${rmError.message}` };
  const { error: delError } = await supabase.from("resumes").delete().eq("id", resumeId);
  if (delError) return { error: delError.message };

  // Promote the newest remaining resume to default.
  if (resume.is_default) {
    const { data: next } = await supabase
      .from("resumes")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (next) await supabase.from("resumes").update({ is_default: true }).eq("id", next.id);
  }
  revalidatePath("/resumes");
  revalidatePath("/matches");
  return { message: "Resume deleted." };
}
