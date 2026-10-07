import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeDate, formatYearMonth } from "@/lib/jobs/format";
import { MAX_RESUMES_PER_USER } from "@/lib/resumes/files";
import { listResumes, type ResumeListItem } from "@/lib/resumes/queries";
import { allSkills } from "@/lib/resumes/schema";
import { createClient } from "@/lib/supabase/server";

import { ResumeActions } from "./resume-actions";
import { UploadResumeForm } from "./upload-form";

export const metadata: Metadata = { title: "Resumes" };
// Parsing a resume and scoring matches runs inside the upload Server Action (~1 min).
export const maxDuration = 300;

export default async function ResumesPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login?next=/resumes");

  const resumes = await listResumes();
  const atLimit = resumes.length >= MAX_RESUMES_PER_USER;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Your resumes</h1>
        <p className="text-muted-foreground mt-1">
          Upload a resume and Claude reads it into a profile, then scores the best-fitting open
          roles. Your resumes and scores are private to you.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a resume</CardTitle>
          <CardDescription>
            {atLimit
              ? `You've reached ${MAX_RESUMES_PER_USER} resumes. Delete one to add another.`
              : "Keep separate resumes for different roles, e.g. software vs. data."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UploadResumeForm disabled={atLimit} />
        </CardContent>
      </Card>

      {resumes.length > 0 && (
        <section className="space-y-4">
          {resumes.map((r) => (
            <ResumeCard key={r.id} resume={r} />
          ))}
        </section>
      )}
    </div>
  );
}

function ResumeCard({ resume }: { resume: ResumeListItem }) {
  const profile = resume.parse_status === "parsed" ? resume.profile : null;
  const skills = profile ? allSkills(profile) : [];
  const education = profile?.education[0];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <span className="truncate">{resume.label}</span>
            </CardTitle>
            <CardDescription className="mt-1">
              {resume.file_name} · uploaded {formatRelativeDate(resume.created_at)}
              {resume.matched_at
                ? ` · matches updated ${formatRelativeDate(resume.matched_at)}`
                : ""}
            </CardDescription>
          </div>
          <div className="flex gap-1.5">
            {resume.is_default && <Badge>Default</Badge>}
            {resume.parse_status === "failed" && (
              <Badge variant="destructive">Couldn&apos;t read</Badge>
            )}
            {resume.parse_status === "pending" && <Badge variant="secondary">Not read yet</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {resume.parse_status === "failed" && resume.parse_error && (
          <p className="text-destructive text-sm">{resume.parse_error}</p>
        )}
        {profile && (
          <div className="space-y-3 text-sm">
            <p>{profile.headline}</p>
            {education && (
              <p className="text-muted-foreground">
                {[education.degree, education.field].filter(Boolean).join(", ")}
                {education.school ? ` — ${education.school}` : ""}
                {profile.graduation ? ` · graduating ${formatYearMonth(profile.graduation)}` : ""}
              </p>
            )}
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {skills.slice(0, 24).map((s) => (
                  <Badge key={s} variant="outline">
                    {s}
                  </Badge>
                ))}
                {skills.length > 24 && <Badge variant="outline">+{skills.length - 24} more</Badge>}
              </div>
            )}
          </div>
        )}
        <ResumeActions
          resumeId={resume.id}
          isDefault={resume.is_default}
          status={resume.parse_status}
        />
      </CardContent>
    </Card>
  );
}
