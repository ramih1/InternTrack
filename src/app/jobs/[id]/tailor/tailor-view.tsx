"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, Download, ExternalLink } from "lucide-react";

import { ScoreBadge } from "@/components/score-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { latexForDisplay, wordDiff } from "@/lib/tailor/diff";
import type { TailorEdit, TailorResult } from "@/lib/tailor/types";

function Diff({ before, after }: { before: string; after: string }) {
  const parts = wordDiff(before, after);
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.type === "same" ? (
          <span key={i}>{p.text}</span>
        ) : p.type === "removed" ? (
          <del
            key={i}
            className="bg-red-100 text-red-900 decoration-red-400 dark:bg-red-950 dark:text-red-200"
          >
            {p.text}
          </del>
        ) : (
          <ins
            key={i}
            className="bg-emerald-100 text-emerald-900 no-underline dark:bg-emerald-950 dark:text-emerald-200"
          >
            {p.text}
          </ins>
        ),
      )}
    </p>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function EditCard({
  edit,
  checked,
  onToggle,
  showCopy,
  isLatex,
}: {
  edit: TailorEdit;
  checked: boolean;
  onToggle: () => void;
  showCopy: boolean;
  isLatex: boolean;
}) {
  const show = isLatex ? latexForDisplay : (s: string) => s;
  return (
    <li className="rounded-xl border p-4">
      <div className="flex items-start gap-3">
        {edit.applicable && (
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="accent-primary mt-1 size-4 shrink-0"
            aria-label="Include this edit"
          />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <Diff before={show(edit.original)} after={show(edit.revised)} />
          <p className="text-muted-foreground text-xs">{edit.reason}</p>
          {edit.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {edit.keywords.map((k) => (
                <Badge key={k} variant="secondary">
                  {k}
                </Badge>
              ))}
            </div>
          )}
          {edit.unverified.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                Not found on your resume: <strong>{edit.unverified.join(", ")}</strong>. Only keep
                this edit if it&apos;s true.
              </span>
            </p>
          )}
          {!edit.applicable && edit.skipReason && (
            <p className="text-muted-foreground text-xs">{edit.skipReason}</p>
          )}
        </div>
        {showCopy && <CopyButton text={edit.revised} />}
      </div>
    </li>
  );
}

export function TailorView({
  tailoredId,
  result,
  generatedAt,
}: {
  tailoredId: string;
  result: TailorResult;
  generatedAt: string;
}) {
  // Edits that introduce unverified facts start unchecked: the student opts in.
  const [accepted, setAccepted] = useState<Set<string>>(
    () =>
      new Set(result.edits.filter((e) => e.applicable && !e.unverified.length).map((e) => e.id)),
  );
  const [overleafError, setOverleafError] = useState<string | null>(null);
  const toggle = (id: string) =>
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const acceptParam = useMemo(() => [...accepted].sort().join(","), [accepted]);
  const downloadUrl = `/api/tailored/${tailoredId}/download?accept=${encodeURIComponent(acceptParam)}`;
  const editable = result.kind !== "pdf";

  async function openInOverleaf() {
    setOverleafError(null);
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      setOverleafError("Couldn't build the .tex file. Try downloading it instead.");
      return;
    }
    const tex = await res.text();
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "https://www.overleaf.com/docs";
    form.target = "_blank";
    for (const [name, value] of [
      ["snip", tex],
      ["snip_name", "tailored-resume.tex"],
    ]) {
      const input = document.createElement("textarea");
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    form.style.display = "none";
    document.body.appendChild(form);
    form.submit();
    form.remove();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Fit for this job
            <ScoreBadge score={result.fitScoreBefore} />
            <span className="text-muted-foreground">→</span>
            <ScoreBadge score={result.fitScoreAfter} />
            <span className="text-muted-foreground text-sm font-normal">
              with all edits (estimate)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{result.strategy}</p>
          <p className="text-muted-foreground text-xs">
            Generated {new Date(generatedAt).toLocaleString()}. Claude only rewords what&apos;s
            already on your resume — review every change before you use it.
          </p>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">
            Suggested edits{" "}
            {editable && (
              <span className="text-muted-foreground text-sm font-normal">
                ({accepted.size} of {result.edits.filter((e) => e.applicable).length} selected)
              </span>
            )}
          </h2>
          {editable && (
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" aria-disabled={!accepted.size}>
                <a href={downloadUrl} download>
                  <Download /> Download tailored .{result.kind}
                </a>
              </Button>
              {result.kind === "tex" && (
                <Button size="sm" variant="outline" onClick={openInOverleaf}>
                  <ExternalLink /> Open in Overleaf
                </Button>
              )}
            </div>
          )}
        </div>
        {overleafError && <p className="text-destructive text-sm">{overleafError}</p>}
        {!editable && (
          <p className="text-muted-foreground text-sm">
            PDFs can&apos;t be edited in place, so copy the lines you want into your original
            document. Upload a .docx or .tex version to download an edited file directly.
          </p>
        )}
        <ul className="space-y-3">
          {result.edits.map((e) => (
            <EditCard
              key={e.id}
              edit={e}
              checked={accepted.has(e.id)}
              onToggle={() => toggle(e.id)}
              showCopy={!editable || !e.applicable}
              isLatex={result.kind === "tex"}
            />
          ))}
        </ul>
      </section>

      {result.summarySuggestion && (
        <section className="space-y-2">
          <h2 className="font-medium">Optional summary line</h2>
          <div className="flex items-start justify-between gap-2 rounded-xl border p-4 text-sm">
            <p>{result.summarySuggestion}</p>
            <CopyButton text={result.summarySuggestion} />
          </div>
        </section>
      )}

      {result.gaps.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">What the job asks for that your resume doesn&apos;t show</h2>
          <ul className="space-y-2 text-sm">
            {result.gaps.map((g) => (
              <li key={g.requirement} className="rounded-xl border p-3">
                <p className="font-medium">{g.requirement}</p>
                <p className="text-muted-foreground">{g.advice}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
