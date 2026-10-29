"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { MatchPanel, type MatchView } from "@/components/match-panel";
import { Skeleton } from "@/components/ui/skeleton";
import type { FitState } from "@/lib/resumes/queries";

import { checkFit, type FitCheckResult } from "./actions";

/**
 * Shows the user's fit for this job. If there's no score yet, it's computed once when the
 * page opens (this is the only place fit scores are generated).
 */
export function FitPanel({
  jobId,
  initial,
  state,
}: {
  jobId: string;
  initial: MatchView | null;
  state: FitState;
}) {
  const [result, setResult] = useState<FitCheckResult | null>(
    initial ? { status: "ok", match: initial, remaining: null } : null,
  );
  const started = useRef(false);

  useEffect(() => {
    if (state !== "ready" || initial || started.current) return;
    started.current = true;
    checkFit(jobId)
      .then(setResult)
      .catch(() =>
        setResult({ status: "unavailable", message: "Couldn't check your fit right now." }),
      );
  }, [jobId, initial, state]);

  if (state === "signed_out") {
    return (
      <Notice>
        <Link
          href={`/login?next=/jobs/${jobId}`}
          className="font-medium underline underline-offset-4"
        >
          Sign in
        </Link>{" "}
        and upload a resume to see how well you fit this job.
      </Notice>
    );
  }
  if (state === "no_resume") {
    return (
      <Notice>
        <Link href="/resumes" className="font-medium underline underline-offset-4">
          Upload a resume
        </Link>{" "}
        to see how well you fit this job.
      </Notice>
    );
  }
  if (!result) {
    return (
      <div className="space-y-3 rounded-xl border p-6" aria-busy="true">
        <p className="text-muted-foreground text-sm">Checking how your resume fits this job…</p>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (result.status !== "ok") return <Notice>{result.message}</Notice>;
  return (
    <div className="space-y-1.5">
      <MatchPanel match={result.match} />
      {result.remaining !== null && result.remaining <= 3 && (
        <p className="text-muted-foreground text-xs">
          {result.remaining} free fit {result.remaining === 1 ? "check" : "checks"} left today.
        </p>
      )}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
      {children}
    </div>
  );
}
