import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { getJob } from "@/lib/jobs/queries";
import { kindFromMimeType } from "@/lib/resumes/files";
import { listResumes } from "@/lib/resumes/queries";
import { createClient } from "@/lib/supabase/server";
import { getTailoring } from "@/lib/tailor/queries";

import { GenerateTailoringButton } from "./generate-button";
import { TailorView } from "./tailor-view";

export const metadata: Metadata = { title: "Tailor your resume" };
// Tailoring runs inside a Server Action (~30 s).
export const maxDuration = 300;

const FORMAT_LABEL = { pdf: "PDF", docx: "Word", tex: "LaTeX" } as const;

export default async function TailorPage({ params, searchParams }: PageProps<"/jobs/[id]/tailor">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(`/login?next=/jobs/${id}/tailor`);

  const job = await getJob(id);
  if (!job) notFound();
  const resumes = (await listResumes()).filter((r) => r.parse_status === "parsed");
  const sp = await searchParams;
  const requested = typeof sp.resume === "string" ? sp.resume : null;
  const resume =
    resumes.find((r) => r.id === requested) ?? resumes.find((r) => r.is_default) ?? resumes[0];
  const tailoring = resume ? await getTailoring(resume.id, job.id) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link href={`/jobs/${job.id}`}>
          <ArrowLeft /> Back to job
        </Link>
      </Button>
      <header className="space-y-1">
        <p className="text-muted-foreground text-sm">Tailor your resume for</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {job.title} <span className="text-muted-foreground">· {job.companies?.name}</span>
        </h1>
      </header>

      {!resume ? (
        <div className="rounded-xl border border-dashed py-14 text-center">
          <p className="font-medium">Upload a resume first</p>
          <p className="text-muted-foreground mt-1 text-sm">PDF, Word (.docx) or LaTeX (.tex).</p>
          <Button asChild className="mt-4">
            <Link href="/resumes">
              <FileUp /> Upload a resume
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            {resumes.length > 1 ? (
              <form method="get" className="flex items-end gap-2">
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Resume</span>
                  <NativeSelect name="resume" defaultValue={resume.id} className="min-w-48">
                    {resumes.map((r) => (
                      <NativeSelectOption key={r.id} value={r.id}>
                        {r.label} ({FORMAT_LABEL[kindFromMimeType(r.mime_type)]})
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </label>
                <Button type="submit" variant="outline">
                  Switch
                </Button>
              </form>
            ) : (
              <p className="text-muted-foreground text-sm">
                Using <span className="text-foreground font-medium">{resume.label}</span> (
                {FORMAT_LABEL[kindFromMimeType(resume.mime_type)]})
              </p>
            )}
            {tailoring && (
              <GenerateTailoringButton
                resumeId={resume.id}
                jobId={job.id}
                label="Regenerate"
                variant="outline"
              />
            )}
          </div>

          {tailoring ? (
            <TailorView
              tailoredId={tailoring.id}
              result={tailoring.result}
              generatedAt={tailoring.generatedAt}
            />
          ) : (
            <div className="space-y-4 rounded-xl border p-6">
              <p className="text-muted-foreground text-sm">
                Claude will compare your resume with this posting and suggest rewrites of your
                existing lines in the job&apos;s language — no invented experience. You choose which
                edits to keep
                {kindFromMimeType(resume.mime_type) === "pdf"
                  ? "."
                  : ` and download your ${FORMAT_LABEL[kindFromMimeType(resume.mime_type)]} file with the same formatting.`}
              </p>
              <GenerateTailoringButton resumeId={resume.id} jobId={job.id} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
