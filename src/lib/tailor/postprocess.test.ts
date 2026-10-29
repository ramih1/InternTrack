import { describe, expect, it } from "vitest";

import { checkResumeFile } from "@/lib/resumes/files";

import { latexForDisplay, wordDiff } from "./diff";
import { downloadFileName, selectEdits } from "./download";
import { buildTailorResult, MAX_EDITS, sanitizeReview } from "./postprocess";
import type { TailorOutput } from "./schema";

const LATEX = String.raw`\begin{document}
\resumeItem{Built REST APIs in Python serving 2M requests/day}
\resumeItem{Wrote React dashboards}
\resumeItem{Wrote React dashboards}
\end{document}`;

const output = (edits: TailorOutput["edits"], over: Partial<TailorOutput> = {}): TailorOutput => ({
  strategy: "Emphasize backend work.",
  fit_score_before: 62,
  fit_score_after: 74,
  edits,
  gaps: [{ requirement: "Kubernetes", advice: "Add only if you've used it." }],
  summary_suggestion: null,
  ...over,
});

const edit = (target: string, revised: string) => ({
  target,
  revised,
  reason: "Matches the posting.",
  keywords: ["backend"],
});

describe("buildTailorResult — LaTeX", () => {
  const src = { kind: "tex" as const, latex: LATEX, resumeText: LATEX };

  it("keeps valid edits, escapes specials and flags new facts", () => {
    const r = buildTailorResult(
      output([
        edit(
          "Built REST APIs in Python serving 2M requests/day",
          "Shipped Python backend APIs & services handling 2M requests/day",
        ),
        edit("Built REST APIs in Python", "Built REST APIs in Go on Kubernetes"),
      ]),
      src,
    );
    expect(r.edits[0]).toMatchObject({
      id: "e1",
      applicable: true,
      revised: "Shipped Python backend APIs \\& services handling 2M requests/day",
      unverified: [],
    });
    expect(r.edits[1].unverified).toEqual(["Go", "Kubernetes"]);
    expect(r.fitScoreBefore).toBe(62);
    expect(r.fitScoreAfter).toBe(74);
  });

  it("marks missing or ambiguous targets as not applicable instead of dropping them", () => {
    const r = buildTailorResult(
      output([
        edit("Wrote React dashboards", "Built React dashboards"),
        edit("Not on resume", "x"),
      ]),
      src,
    );
    expect(r.edits.map((e) => [e.applicable, e.skipReason])).toEqual([
      [false, "The original text appears more than once in your .tex file."],
      [false, "The original text wasn't found in your .tex file."],
    ]);
  });

  it("drops no-op and duplicate edits and caps the list", () => {
    const many = Array.from({ length: MAX_EDITS + 5 }, (_, i) =>
      edit(`target ${i}`, `revised ${i}`),
    );
    const r = buildTailorResult(
      output([
        edit("Wrote React dashboards", "Wrote React dashboards"),
        ...many,
        edit("target 0", "dup"),
      ]),
      src,
    );
    expect(r.edits).toHaveLength(MAX_EDITS);
    expect(r.edits[0].target).toBe("target 0");
  });

  it("clamps scores and never reports a lower score after edits", () => {
    const r = buildTailorResult(output([], { fit_score_before: 140, fit_score_after: 20 }), src);
    expect([r.fitScoreBefore, r.fitScoreAfter]).toEqual([100, 100]);
  });
});

describe("buildTailorResult — Word and PDF", () => {
  it("maps Word paragraph ids to their text and drops invented ids", () => {
    const r = buildTailorResult(output([edit("p3", "Shipped Python APIs"), edit("P99", "x")]), {
      kind: "docx",
      paragraphs: [{ id: "P3", text: "Built Python APIs" }],
      resumeText: "Built Python APIs",
    });
    expect(r.edits).toHaveLength(1);
    expect(r.edits[0]).toMatchObject({
      target: "P3",
      original: "Built Python APIs",
      applicable: true,
    });
  });

  it("marks PDF edits as copy-only", () => {
    const r = buildTailorResult(output([edit("Built APIs", "Shipped APIs")]), {
      kind: "pdf",
      resumeText: "Built APIs",
    });
    expect(r.edits[0].applicable).toBe(false);
    expect(r.edits[0].skipReason).toMatch(/copy/);
  });
});

describe("sanitizeReview", () => {
  it("clamps scores and caps lists", () => {
    const r = sanitizeReview({
      overall_score: 101.6,
      categories: [{ name: "Impact", score: -3, comment: " Needs metrics. " }],
      strengths: ["a", "b", "c", "d", "e"],
      improvements: [
        { issue: "Vague bullet", quote: null, suggestion: "Add a metric if you have one." },
      ],
      ats_warnings: [],
    });
    expect(r.overall_score).toBe(100);
    expect(r.categories[0]).toEqual({ name: "Impact", score: 0, comment: "Needs metrics." });
    expect(r.strengths).toHaveLength(4);
  });
});

describe("download helpers", () => {
  const edits = buildTailorResult(
    output([
      edit("Built REST APIs in Python serving 2M requests/day", "Shipped APIs"),
      edit("Not on resume", "x"),
    ]),
    { kind: "tex", latex: LATEX, resumeText: LATEX },
  ).edits;

  it("selects only accepted, applicable edits", () => {
    expect(selectEdits(edits, "e1,e2,e9").map((e) => e.id)).toEqual(["e1"]);
    expect(selectEdits(edits, null)).toEqual([]);
  });

  it("builds header-safe file names", () => {
    expect(downloadFileName("Jane Doe Résumé.tex", "Acme, Inc.", "tex")).toBe(
      "Jane_Doe_R_sum_-acme-inc.tex",
    );
    expect(downloadFileName(".docx", null, "docx")).toBe("resume-tailored.docx");
  });
});

describe("wordDiff", () => {
  it("marks removed and added words", () => {
    expect(wordDiff("Built REST APIs", "Shipped REST APIs fast")).toEqual([
      { type: "removed", text: "Built" },
      { type: "added", text: "Shipped" },
      { type: "same", text: " REST APIs" },
      { type: "added", text: " fast" },
    ]);
  });
  it("handles identical and empty strings", () => {
    expect(wordDiff("a b", "a b")).toEqual([{ type: "same", text: "a b" }]);
    expect(wordDiff("", "new")).toEqual([{ type: "added", text: "new" }]);
  });
});

describe("checkResumeFile — LaTeX", () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  it("accepts a complete .tex document", () => {
    expect(
      checkResumeFile(enc("\\documentclass{article}\\begin{document}Hi\\end{document}"), "cv.tex"),
    ).toEqual({
      ok: true,
      kind: "tex",
      mimeType: "application/x-tex",
    });
  });
  it("rejects fragments, non-UTF-8 and non-.tex text", () => {
    expect(checkResumeFile(enc("\\section{Experience}"), "part.tex").ok).toBe(false);
    expect(checkResumeFile(new Uint8Array([0xff, 0xfe, 0x00]), "cv.tex").ok).toBe(false);
    expect(checkResumeFile(enc("\\documentclass{article}\\begin{document}"), "cv.txt").ok).toBe(
      false,
    );
  });
});

describe("latexForDisplay", () => {
  it("unescapes and unwraps simple commands", () => {
    expect(
      latexForDisplay(
        "\\textbf{StudyBuddy}: cut load by 35\\% \\& more -- see \\href{https://x.dev}{site}",
      ),
    ).toBe("StudyBuddy: cut load by 35% & more – see site");
  });
});
