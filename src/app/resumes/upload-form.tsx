"use client";

import { useActionState, useRef } from "react";
import { Upload } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { uploadResume, type ResumeActionState } from "./actions";

export function UploadResumeForm({ disabled }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState<ResumeActionState, FormData>(uploadResume, {});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await action(fd);
        formRef.current?.reset();
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
        <div className="space-y-1.5">
          <Label htmlFor="file">Resume file (PDF or .docx, up to 4 MB)</Label>
          <Input
            id="file"
            name="file"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
            disabled={disabled || pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="label">Name (optional)</Label>
          <Input
            id="label"
            name="label"
            placeholder="e.g. SWE resume"
            maxLength={80}
            disabled={disabled || pending}
          />
        </div>
      </div>
      <Button type="submit" disabled={disabled || pending}>
        <Upload />{" "}
        {pending ? "Reading your resume and scoring matches…" : "Upload and find matches"}
      </Button>
      {pending && (
        <p className="text-muted-foreground text-sm">
          This takes about a minute. Keep this page open.
        </p>
      )}
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.message && (
        <Alert>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
