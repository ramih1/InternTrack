"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

import { generateTailoring } from "./actions";

export function GenerateTailoringButton({
  resumeId,
  jobId,
  label = "Tailor my resume",
  variant = "default",
}: {
  resumeId: string;
  jobId: string;
  label?: string;
  variant?: "default" | "outline";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant={variant}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await generateTailoring(resumeId, jobId);
            if (res.error) setError(res.error);
          })
        }
      >
        <Sparkles /> {pending ? "Tailoring… (about 30 seconds)" : label}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
