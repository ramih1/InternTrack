"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import {
  deleteResume,
  retryParse,
  setDefaultResume,
  updateMatches,
  type ResumeActionState,
} from "./actions";

export function ResumeActions({
  resumeId,
  isDefault,
  status,
  showViewMatches = true,
}: {
  resumeId: string;
  isDefault: boolean;
  status: "pending" | "parsed" | "failed";
  showViewMatches?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<ResumeActionState>({});

  const run = (name: string, fn: () => Promise<ResumeActionState>) => {
    setRunning(name);
    setResult({});
    startTransition(async () => {
      setResult(await fn());
      setRunning(null);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "parsed" && (
          <>
            {showViewMatches && (
              <Button asChild size="sm">
                <Link href={`/matches?resume=${resumeId}`}>View matches</Link>
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run("update", () => updateMatches(resumeId))}
            >
              {running === "update" ? "Scoring new jobs…" : "Update matches"}
            </Button>
          </>
        )}
        {status !== "parsed" && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run("retry", () => retryParse(resumeId))}
          >
            {running === "retry" ? "Reading resume…" : "Try reading again"}
          </Button>
        )}
        {!isDefault && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run("default", () => setDefaultResume(resumeId))}
          >
            Make default
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={pending}
          onClick={() => {
            if (confirm("Delete this resume and its match scores?")) {
              run("delete", () => deleteResume(resumeId));
            }
          }}
        >
          {running === "delete" ? "Deleting…" : "Delete"}
        </Button>
      </div>
      {result.error && <p className="text-destructive text-sm">{result.error}</p>}
      {result.message && <p className="text-muted-foreground text-sm">{result.message}</p>}
    </div>
  );
}
