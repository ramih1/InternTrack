import { z } from "zod";

export const TailorOutputSchema = z.object({
  strategy: z
    .string()
    .describe("Two or three sentences: what this job values and how the edits emphasize it."),
  fit_score_before: z.number().describe("0–100 fit of the resume as it is now."),
  fit_score_after: z.number().describe("0–100 realistic fit if every edit is applied."),
  edits: z.array(
    z.object({
      target: z
        .string()
        .describe(
          "Exact text to replace, copied character for character (or a paragraph id like P12 for Word files).",
        ),
      revised: z.string(),
      reason: z.string().describe("One sentence tying the change to the posting."),
      keywords: z.array(z.string()).describe("Posting keywords this edit surfaces."),
    }),
  ),
  gaps: z.array(
    z.object({
      requirement: z
        .string()
        .describe("Something the posting asks for that the resume doesn't show."),
      advice: z
        .string()
        .describe("Honest advice, e.g. add it only if true, or mention a related course."),
    }),
  ),
  summary_suggestion: z
    .string()
    .nullable()
    .describe("An optional one-line summary tailored to this job, using only resume facts."),
});

export type TailorOutput = z.infer<typeof TailorOutputSchema>;

export const ReviewSchema = z.object({
  overall_score: z.number().describe("0–100 overall quality for internship applications."),
  categories: z.array(
    z.object({
      name: z.enum(["Impact", "Clarity", "Skills", "Formatting & ATS", "Relevance"]),
      score: z.number().describe("0–100"),
      comment: z.string().describe("One sentence."),
    }),
  ),
  strengths: z.array(z.string()).describe("Up to 4 specific strengths."),
  improvements: z.array(
    z.object({
      issue: z.string(),
      quote: z
        .string()
        .nullable()
        .describe("The resume line this is about, copied exactly, if any."),
      suggestion: z.string().describe("A concrete fix, using only facts already on the resume."),
    }),
  ),
  ats_warnings: z.array(z.string()).describe("Things applicant tracking systems may parse badly."),
});

export type ResumeReview = z.infer<typeof ReviewSchema>;
