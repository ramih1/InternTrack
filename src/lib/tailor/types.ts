import type { ResumeKind } from "@/lib/resumes/files";

/** One suggested change, as stored in `tailored_resumes.result_json`. */
export interface TailorEdit {
  id: string;
  /** LaTeX: exact substring of the source. DOCX: paragraph id ("P12"). PDF: text as printed. */
  target: string;
  /** Human-readable original text (for DOCX, the paragraph's text). */
  original: string;
  revised: string;
  reason: string;
  keywords: string[];
  /** Numbers or technical terms in `revised` that don't appear anywhere on the resume. */
  unverified: string[];
  /** Whether the edit can be applied to the file automatically. */
  applicable: boolean;
  skipReason?: string;
}

export interface TailorGap {
  requirement: string;
  advice: string;
}

export interface TailorResult {
  kind: ResumeKind;
  strategy: string;
  fitScoreBefore: number;
  fitScoreAfter: number;
  edits: TailorEdit[];
  gaps: TailorGap[];
  summarySuggestion: string | null;
}

export interface ApplyOutcome<T> {
  output: T;
  applied: string[];
  skipped: { id: string; reason: string }[];
}
