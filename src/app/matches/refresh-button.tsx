"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

import { refreshMatches } from "./actions";

export function RefreshMatchesButton({ resumeId }: { resumeId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ text: string; error: boolean } | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(null);
            const res = await refreshMatches(resumeId);
            setResult(
              "error" in res
                ? { text: res.error, error: true }
                : { text: res.message, error: false },
            );
          })
        }
      >
        <RefreshCw className={pending ? "animate-spin" : undefined} />
        {pending ? "Scoring jobs… (this can take a few minutes)" : "Refresh my matches"}
      </Button>
      {result && (
        <p className={result.error ? "text-destructive text-sm" : "text-muted-foreground text-sm"}>
          {result.text}
        </p>
      )}
    </div>
  );
}
