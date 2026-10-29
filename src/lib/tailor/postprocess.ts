import type { ResumeKind } from "@/lib/resumes/files";

import type { DocxParagraph } from "./docx";
import { unverifiedTerms } from "./grounding";
import { checkLatexRevision, latexTargetProblem } from "./latex";
import type { ResumeReview, TailorOutput } from "./schema";
import type { TailorEdit, TailorResult } from "./types";

export const MAX_EDITS = 10;

const clampScore = (n: number) =>
  Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n))) : 0;
const clean = (s: string, max: number) => s.trim().slice(0, max);

export interface TailorSource {
  kind: ResumeKind;
  /** Full resume text used for grounding checks (LaTeX source, DOCX text, or parsed profile). */
  resumeText: string;
  /** LaTeX source, for target validation. */
  latex?: string;
  /** DOCX paragraphs, for target validation. */
  paragraphs?: DocxParagraph[];
}

/**
 * Turns Claude's suggestions into stored edits: validates every target against the real
 * file, checks LaTeX safety, flags terms that aren't on the resume, and caps the list.
 */
export function buildTailorResult(out: TailorOutput, source: TailorSource): TailorResult {
  const paragraphText = new Map((source.paragraphs ?? []).map((p) => [p.id, p.text]));
  const seenTargets = new Set<string>();
  const edits: TailorEdit[] = [];

  for (const e of out.edits) {
    if (edits.length >= MAX_EDITS) break;
    const target = source.kind === "docx" ? e.target.trim().toUpperCase() : e.target;
    const revised = e.revised.trim();
    if (!target.trim() || !revised || seenTargets.has(target)) continue;
    seenTargets.add(target);

    let original = target;
    let applicable = true;
    let skipReason: string | undefined;
    let finalRevised = revised;

    if (source.kind === "tex") {
      const problem = latexTargetProblem(source.latex ?? "", target);
      const check = problem ? null : checkLatexRevision(target, revised);
      if (problem) [applicable, skipReason] = [false, problem];
      else if (check && !check.ok) [applicable, skipReason] = [false, check.reason];
      else if (check?.ok) finalRevised = check.revised;
    } else if (source.kind === "docx") {
      const text = paragraphText.get(target);
      if (!text) continue; // hallucinated paragraph id: drop the edit entirely
      original = text;
    } else {
      applicable = false;
      skipReason = "PDFs can't be edited in place — copy this line into your resume.";
    }

    if (original.trim() === finalRevised.trim()) continue;
    edits.push({
      id: `e${edits.length + 1}`,
      target,
      original,
      revised: finalRevised,
      reason: clean(e.reason, 300),
      keywords: [...new Set(e.keywords.map((k) => clean(k, 40)).filter(Boolean))].slice(0, 6),
      unverified: unverifiedTerms(finalRevised, source.resumeText),
      applicable,
      ...(skipReason ? { skipReason } : {}),
    });
  }

  return {
    kind: source.kind,
    strategy: clean(out.strategy, 800),
    fitScoreBefore: clampScore(out.fit_score_before),
    fitScoreAfter: Math.max(clampScore(out.fit_score_before), clampScore(out.fit_score_after)),
    edits,
    gaps: out.gaps
      .slice(0, 6)
      .map((g) => ({ requirement: clean(g.requirement, 160), advice: clean(g.advice, 300) }))
      .filter((g) => g.requirement),
    summarySuggestion: out.summary_suggestion ? clean(out.summary_suggestion, 300) : null,
  };
}

export function sanitizeReview(r: ResumeReview): ResumeReview {
  return {
    overall_score: clampScore(r.overall_score),
    categories: r.categories
      .slice(0, 5)
      .map((c) => ({ ...c, score: clampScore(c.score), comment: clean(c.comment, 240) })),
    strengths: r.strengths.slice(0, 4).map((s) => clean(s, 240)),
    improvements: r.improvements.slice(0, 6).map((i) => ({
      issue: clean(i.issue, 200),
      quote: i.quote ? clean(i.quote, 300) : null,
      suggestion: clean(i.suggestion, 400),
    })),
    ats_warnings: r.ats_warnings.slice(0, 5).map((w) => clean(w, 200)),
  };
}
