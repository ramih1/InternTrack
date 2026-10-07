import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, FileUp, Sparkles } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { listMatches, listResumes, MATCHES_PAGE_SIZE } from "@/lib/resumes/queries";
import { createClient } from "@/lib/supabase/server";

import { JobCard } from "../jobs/job-card";
import { ResumeActions } from "../resumes/resume-actions";

export const metadata: Metadata = { title: "Best matches" };
export const maxDuration = 300;

const MIN_SCORES = [0, 50, 70, 85] as const;

export default async function MatchesPage({ searchParams }: PageProps<"/matches">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login?next=/matches");

  const params = await searchParams;
  const resumes = (await listResumes()).filter((r) => r.parse_status === "parsed");
  if (resumes.length === 0) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
        <Sparkles className="text-muted-foreground size-8" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">See your best matches</h1>
        <p className="text-muted-foreground mt-2">
          Upload a resume and InternTrack scores open internships and co-ops against it, with the
          skills you match and the ones you&apos;re missing.
        </p>
        <Button asChild className="mt-6">
          <Link href="/resumes">
            <FileUp /> Upload a resume
          </Link>
        </Button>
      </div>
    );
  }

  const requested = typeof params.resume === "string" ? params.resume : null;
  const resume =
    resumes.find((r) => r.id === requested) ?? resumes.find((r) => r.is_default) ?? resumes[0];
  const minParam = Number(params.min);
  const minScore = (MIN_SCORES as readonly number[]).includes(minParam) ? minParam : 50;
  const pageParam = Number(params.page);
  const page = Number.isInteger(pageParam) && pageParam > 1 ? Math.min(pageParam, 100) : 1;

  let result: Awaited<ReturnType<typeof listMatches>> | null = null;
  let error: string | null = null;
  try {
    result = await listMatches(resume.id, minScore, page);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const totalPages = result ? Math.max(1, Math.ceil(result.total / MATCHES_PAGE_SIZE)) : 1;
  const href = (over: { page?: number }) => {
    const q = new URLSearchParams({ resume: resume.id, min: String(minScore) });
    if (over.page && over.page > 1) q.set("page", String(over.page));
    return `/matches?${q}`;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Best matches</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Open roles scored against{" "}
            <span className="text-foreground font-medium">{resume.label}</span>. Scores are
            Claude&apos;s estimate; always read the posting.
          </p>
        </div>
        <form action="/matches" method="get" className="flex flex-wrap items-end gap-3">
          {resumes.length > 1 && (
            <label className="space-y-1 text-sm">
              <span className="font-medium">Resume</span>
              <NativeSelect name="resume" defaultValue={resume.id} className="min-w-44">
                {resumes.map((r) => (
                  <NativeSelectOption key={r.id} value={r.id}>
                    {r.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          )}
          {resumes.length === 1 && <input type="hidden" name="resume" value={resume.id} />}
          <label className="space-y-1 text-sm">
            <span className="font-medium">Minimum score</span>
            <NativeSelect name="min" defaultValue={String(minScore)} className="min-w-36">
              {MIN_SCORES.map((m) => (
                <NativeSelectOption key={m} value={m}>
                  {m === 0 ? "Show all" : `${m}+`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>
      </header>

      <ResumeActions
        resumeId={resume.id}
        isDefault={resume.is_default}
        status="parsed"
        showViewMatches={false}
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Couldn&apos;t load matches</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && result.matches.length === 0 && (
        <div className="rounded-xl border border-dashed py-14 text-center">
          <p className="font-medium">No matches at {minScore}+ yet</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Lower the minimum score, or use “Update matches” to score newly posted roles.
          </p>
        </div>
      )}

      {result && result.matches.length > 0 && (
        <>
          <p className="text-muted-foreground text-sm">
            {result.total} {result.total === 1 ? "role" : "roles"} scoring {minScore}+
          </p>
          <ul className="space-y-3">
            {result.matches.map((m) => (
              <JobCard
                key={m.job.id}
                job={m.job}
                match={{ score: m.score, explanation: m.reasons.explanation }}
              />
            ))}
          </ul>
          {totalPages > 1 && (
            <nav className="flex items-center justify-between" aria-label="Pagination">
              <Button asChild variant="outline" size="sm" aria-disabled={page <= 1}>
                {page > 1 ? (
                  <Link href={href({ page: page - 1 })}>Previous</Link>
                ) : (
                  <span className="pointer-events-none opacity-50">Previous</span>
                )}
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {page} of {totalPages}
              </span>
              <Button asChild variant="outline" size="sm" aria-disabled={page >= totalPages}>
                {page < totalPages ? (
                  <Link href={href({ page: page + 1 })}>Next</Link>
                ) : (
                  <span className="pointer-events-none opacity-50">Next</span>
                )}
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
