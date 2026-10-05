import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { sortTerms } from "../classify";
import { truncate, uniq } from "../text";
import type { NormalizedJob } from "../types";

export const NORMALIZE_MODEL = "claude-opus-5-5";

/** Structured output schema for one listing (PLAN.md §1.1 fields). */
export const ListingSchema = z.object({
  title: z.string().describe("Clean role title without location or req codes."),
  locations: z
    .array(z.string())
    .describe(
      'Each location as "City, ST" (US/Canada) or "City, Country"; remote as "Remote (Country)".',
    ),
  remote_type: z.enum(["remote", "hybrid", "onsite", "unknown"]),
  employment_type: z.enum(["internship", "co_op", "new_grad", "program"]),
  field: z.enum([
    "software",
    "data_ml",
    "hardware",
    "product",
    "design",
    "quant_finance",
    "business",
    "research",
    "other",
  ]),
  terms: z
    .array(z.string())
    .describe(
      'Terms as "<Season> <Year>", Season one of Winter, Spring, Summer, Fall. Empty if unknown.',
    ),
  duration: z.string().nullable().describe('e.g. "12 weeks", "4 months", or null.'),
  pay: z.object({
    text: z.string().nullable().describe("Pay as written in the posting, or null."),
    min: z.number().nullable(),
    max: z.number().nullable(),
    currency: z.string().nullable().describe("ISO 4217 code, e.g. USD."),
    period: z.enum(["hour", "week", "month", "year", "total"]).nullable(),
  }),
  deadline: z.string().nullable().describe("Application deadline as YYYY-MM-DD, or null."),
  eligibility: z.object({
    years_of_study: z.array(z.string()).describe('e.g. "Sophomore", "Junior", "Final year".'),
    majors: z.array(z.string()),
    degree_levels: z.array(z.string()).describe('e.g. "Bachelor\'s", "Master\'s", "PhD".'),
    work_authorization: z.string().nullable(),
    sponsorship: z.enum(["yes", "no", "unknown"]),
    notes: z
      .string()
      .nullable()
      .describe("Other hard requirements (e.g. graduation window), or null."),
  }),
  summary: z
    .string()
    .describe("2–3 plain sentences (max ~60 words): what the intern will do and who should apply."),
});

export type ListingOutput = z.infer<typeof ListingSchema>;

const SYSTEM_PROMPT = `You normalize internship, co-op, new-grad and student-program job postings into structured data for a student job board.

Rules:
- Use only facts stated in the posting or its metadata. When something isn't stated, use null, an empty list, or "unknown" — never guess pay, deadlines or eligibility.
- Terms: infer the season and year only when the posting clearly states or implies them (for example "Summer 2027", or "summer internship" in a posting for the upcoming summer relative to the posting date). Co-op terms use the season the co-op starts.
- Field: software (SWE, infra, security, mobile, web), data_ml (data science/engineering, ML, AI), hardware (EE, ME, embedded, robotics), product (PM/TPM), design (UX/UI/visual), quant_finance (trading, quant research, investment banking), business (marketing, sales, ops, finance, HR, legal), research (non-ML research science), other.
- remote_type: "remote" only if fully remote; "hybrid" for a mix; "onsite" when only office locations are listed.
- The summary is for a student skimming the board: concrete, neutral, no marketing language, no repetition of the title.`;

export interface ClaudeNormalizeInput {
  companyName: string;
  title: string;
  locations: string[];
  postedAt: string | null;
  url: string;
  description: string;
  /** Rule-based guesses, offered as hints. */
  hints: Partial<NormalizedJob>;
}

export type ClaudeNormalizeResult =
  | { ok: true; job: ListingOutput; usage: Anthropic.Beta.BetaUsage }
  | { ok: false; reason: "refusal" | "max_tokens" | "parse_error" | "api_error"; detail?: string };

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic({ maxRetries: 3, timeout: 120_000 });
  return client;
}

export async function normalizeWithClaude(
  input: ClaudeNormalizeInput,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<ClaudeNormalizeResult> {
  const userContent = [
    `Today's date: ${today}`,
    `Company: ${input.companyName}`,
    `Title: ${input.title}`,
    `Locations (from source): ${input.locations.join("; ") || "not listed"}`,
    `Posted: ${input.postedAt ?? "unknown"}`,
    `URL: ${input.url}`,
    `Rule-based hints (may be wrong): ${JSON.stringify(input.hints)}`,
    "",
    "<posting>",
    truncate(input.description, 24_000),
    "</posting>",
  ].join("\n");

  try {
    const response = await getClient().beta.messages.parse({
      model: NORMALIZE_MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { effort: "low", format: betaZodOutputFormat(ListingSchema) },
      messages: [{ role: "user", content: userContent }],
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, reason: "refusal", detail: response.stop_details?.category ?? undefined };
    }
    if (response.stop_reason === "max_tokens") return { ok: false, reason: "max_tokens" };
    if (!response.parsed_output) return { ok: false, reason: "parse_error" };
    return { ok: true, job: response.parsed_output, usage: response.usage };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return { ok: false, reason: "api_error", detail: `${err.status ?? ""} ${err.message}` };
    }
    return { ok: false, reason: "api_error", detail: String(err) };
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TERM_RE = /^(Winter|Spring|Summer|Fall) 20\d{2}$/;

/**
 * Merges Claude's output over the rule-based result, validating fields the database constrains
 * (dates, term format) and keeping rule-based values where Claude returned nothing.
 */
export function mergeNormalized(base: NormalizedJob, ai: ListingOutput): NormalizedJob {
  const terms = sortTerms(uniq(ai.terms.filter((t) => TERM_RE.test(t))));
  const deadline = ai.deadline && DATE_RE.test(ai.deadline) ? ai.deadline : null;
  const hasPay = ai.pay.min !== null || ai.pay.max !== null || ai.pay.text;
  return {
    title: ai.title.trim() || base.title,
    locations: ai.locations.length
      ? uniq(ai.locations.map((l) => l.trim()).filter(Boolean))
      : base.locations,
    remote_type: ai.remote_type === "unknown" ? base.remote_type : ai.remote_type,
    employment_type: ai.employment_type,
    field: ai.field,
    terms: terms.length ? terms : base.terms,
    duration: ai.duration,
    pay: hasPay ? ai.pay : base.pay,
    deadline,
    eligibility: {
      ...ai.eligibility,
      degree_levels: ai.eligibility.degree_levels.length
        ? ai.eligibility.degree_levels
        : base.eligibility.degree_levels,
      sponsorship:
        ai.eligibility.sponsorship === "unknown"
          ? base.eligibility.sponsorship
          : ai.eligibility.sponsorship,
    },
    summary: ai.summary.trim() || null,
  };
}
