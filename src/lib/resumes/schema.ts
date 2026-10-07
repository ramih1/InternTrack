import { z } from "zod";

/**
 * Structured profile Claude extracts from a resume. Contact details (email, phone, address)
 * are deliberately not extracted — matching doesn't need them.
 */
export const ResumeProfileSchema = z.object({
  full_name: z.string().nullable(),
  headline: z
    .string()
    .describe('One line, e.g. "Computer science junior focused on backend and ML".'),
  education: z.array(
    z.object({
      school: z.string(),
      degree: z.string().nullable().describe('e.g. "BSc", "BASc", "MEng".'),
      field: z.string().nullable(),
      start: z.string().nullable().describe("YYYY-MM or YYYY"),
      end: z.string().nullable().describe("YYYY-MM or YYYY; expected date if still studying"),
      gpa: z.string().nullable().describe('As written, e.g. "3.8/4.0".'),
    }),
  ),
  graduation: z.string().nullable().describe("Expected graduation as YYYY-MM, or null."),
  year_of_study: z
    .string()
    .nullable()
    .describe('e.g. "2nd year", "Junior", "Final year", or null if unclear.'),
  majors: z.array(z.string()),
  skills: z.object({
    languages: z.array(z.string()).describe("Programming languages."),
    frameworks: z.array(z.string()).describe("Frameworks and libraries."),
    tools: z.array(z.string()).describe("Tools, platforms, cloud services, databases."),
    domains: z.array(z.string()).describe('Areas of knowledge, e.g. "distributed systems".'),
  }),
  experience: z.array(
    z.object({
      title: z.string(),
      organization: z.string(),
      start: z.string().nullable(),
      end: z.string().nullable().describe('YYYY-MM, or "Present".'),
      highlights: z.array(z.string()).describe("Up to 4 short, factual bullet points."),
    }),
  ),
  projects: z.array(
    z.object({
      name: z.string(),
      summary: z.string().describe("One sentence."),
      technologies: z.array(z.string()),
    }),
  ),
  links: z.array(z.object({ label: z.string(), url: z.string() })),
  work_authorization: z
    .string()
    .nullable()
    .describe("Only if the resume states it (e.g. citizenship, visa status)."),
  search_keywords: z
    .array(z.string())
    .describe(
      "15–40 lowercase keywords and short phrases a recruiter would search to find jobs for this candidate: skills, technologies, role types, domains.",
    ),
});

export type ResumeProfile = z.infer<typeof ResumeProfileSchema>;

/** Flat, de-duplicated list of the candidate's skills (for display and matching). */
export function allSkills(profile: Pick<ResumeProfile, "skills">): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [
    ...profile.skills.languages,
    ...profile.skills.frameworks,
    ...profile.skills.tools,
    ...profile.skills.domains,
  ]) {
    const key = s.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(s.trim());
    }
  }
  return out;
}

/** Normalizes the keyword list stored for the full-text prefilter. */
export function cleanKeywords(keywords: string[], max = 60): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of keywords) {
    const k = raw
      .toLowerCase()
      .replace(/[^\p{L}\p{N}+#.\- ]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (k.length < 2 || k.length > 60 || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= max) break;
  }
  return out;
}
