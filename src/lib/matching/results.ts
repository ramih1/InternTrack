import { z } from "zod";

export const MatchBatchSchema = z.object({
  results: z.array(
    z.object({
      job_ref: z.string().describe('The job\'s ref, e.g. "J3".'),
      score: z.number().describe("Integer from 0 to 100."),
      matched_skills: z.array(z.string()),
      missing_skills: z.array(z.string()),
      eligibility_issues: z.array(z.string()),
      explanation: z.string(),
    }),
  ),
});

export type MatchBatch = z.infer<typeof MatchBatchSchema>;

export interface MatchReasons {
  matched_skills: string[];
  missing_skills: string[];
  eligibility_issues: string[];
  explanation: string;
}

export interface MatchResult {
  jobId: string;
  score: number;
  reasons: MatchReasons;
}

const cap = (items: string[], n: number, maxChars = 80) =>
  [...new Set(items.map((s) => s.trim()).filter(Boolean))]
    .slice(0, n)
    .map((s) => s.slice(0, maxChars));

/**
 * Maps model output back to job ids, dropping unknown or duplicate refs and clamping
 * scores to 0–100. Jobs with eligibility issues are capped at 40, per the rubric.
 */
export function sanitizeScores(batch: MatchBatch, jobIdByRef: Map<string, string>): MatchResult[] {
  const seen = new Set<string>();
  const out: MatchResult[] = [];
  for (const r of batch.results) {
    const jobId = jobIdByRef.get(r.job_ref.trim().toUpperCase());
    if (!jobId || seen.has(jobId) || !Number.isFinite(r.score)) continue;
    seen.add(jobId);
    const eligibility = cap(r.eligibility_issues, 5, 240);
    let score = Math.round(Math.min(100, Math.max(0, r.score)));
    if (eligibility.length) score = Math.min(score, 40);
    out.push({
      jobId,
      score,
      reasons: {
        matched_skills: cap(r.matched_skills, 12),
        missing_skills: cap(r.missing_skills, 12),
        eligibility_issues: eligibility,
        explanation: r.explanation.trim().slice(0, 600),
      },
    });
  }
  return out;
}

export function scoreLabel(score: number): string {
  if (score >= 90) return "Excellent fit";
  if (score >= 70) return "Strong fit";
  if (score >= 50) return "Partial fit";
  return "Weak fit";
}
