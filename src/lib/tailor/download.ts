import type { ResumeKind } from "@/lib/resumes/files";

import type { TailorEdit } from "./types";

/** The accepted, applicable edits for a comma-separated `accept` list (e.g. "e1,e3"). */
export function selectEdits(edits: TailorEdit[], accept: string | null): TailorEdit[] {
  const ids = new Set(
    (accept ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return edits.filter((e) => e.applicable && ids.has(e.id));
}

/** "Jane_Resume.tex" + "Acme Inc." → "Jane_Resume-acme-inc.tex" (ASCII only, header-safe). */
export function downloadFileName(
  original: string,
  company: string | null,
  kind: ResumeKind,
): string {
  const base =
    original
      .replace(/\.[^.]+$/, "")
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .slice(0, 60) || "resume";
  const suffix = (company ?? "tailored")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base}-${suffix || "tailored"}.${kind}`;
}
