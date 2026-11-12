import type { Eligibility } from "@/lib/ingest/types";

import type { MatchResult } from "./results";

/** A month as a single comparable number: year * 12 + (month - 1). */
type MonthIndex = number;

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * Months a season can mean, kept wide so the check only fires on clear mismatches
 * ("Winter 2027" is used both for December 2027 and for January–April 2027 terms).
 */
const SEASONS: Record<string, [number, number]> = {
  winter: [1, 12],
  spring: [3, 6],
  summer: [5, 9],
  fall: [8, 12],
  autumn: [8, 12],
};

const DATE = String.raw`(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|winter|spring|summer|fall|autumn)\s+(?:of\s+)?)?20\d{2}`;

/** The earliest and latest month a date phrase like "Summer 2028" or "2027" can mean. */
export function dateRange(text: string): [MonthIndex, MonthIndex] | null {
  const m = text.trim().match(/^(?:([a-z]+)\s+(?:of\s+)?)?(20\d{2})$/i);
  if (!m) return null;
  const year = Number(m[2]) * 12;
  const word = m[1]?.toLowerCase();
  if (!word) return [year, year + 11];
  const season = SEASONS[word];
  if (season) return [year + season[0] - 1, year + season[1] - 1];
  const month = MONTHS[word.slice(0, 3)];
  return month ? [year + month - 1, year + month - 1] : null;
}

export interface GraduationWindow {
  earliest: MonthIndex | null;
  latest: MonthIndex | null;
  /** The posting's wording, e.g. "between December 2027 and Summer 2028". */
  phrase: string;
}

const PATTERNS: {
  re: RegExp;
  window: (a: string, b?: string) => [number | null, number | null];
}[] = [
  {
    // "graduation between December 2027 and Summer 2028", "graduate from Fall 2026 to Spring 2027"
    re: new RegExp(
      String.raw`\b(between|from)\s+(${DATE})\s+(?:and|to|through|-|–|—)\s+(${DATE})`,
      "i",
    ),
    window: (a, b) => [dateRange(a)![0], dateRange(b!)![1]],
  },
  {
    // "graduating by Summer 2026", "graduate before December 2027"
    re: new RegExp(String.raw`\b(by|before|no later than|prior to)\s+(${DATE})`, "i"),
    window: (a) => [null, dateRange(a)![1]],
  },
  {
    // "graduating 2027 or later", "graduating in 2027 or later"
    re: new RegExp(String.raw`\b(in\s+|)(${DATE})\s+or\s+later\b`, "i"),
    window: (a) => [dateRange(a)![0], null],
  },
  {
    // "graduation date in Fall 2026 or Spring 2027", "class of 2026 or 2027", "Winter 2027/Spring 2028"
    re: new RegExp(String.raw`\b(in|of|)\s*(${DATE})\s*(?:or|/)\s*(${DATE})\b`, "i"),
    window: (a, b) => [dateRange(a)![0], dateRange(b!)![1]],
  },
  {
    // "must graduate in 2028", "graduating in December 2026"
    re: new RegExp(String.raw`\b(in)\s+(${DATE})\b`, "i"),
    window: (a) => [dateRange(a)![0], dateRange(a)![1]],
  },
];

/**
 * Finds a graduation window in a posting's eligibility notes. Only text right after a
 * "graduate…"/"class of" mention is read, and only well-formed date phrases count, so
 * unrelated dates (start dates, deadlines) are ignored.
 */
export function graduationWindow(notes: string | null | undefined): GraduationWindow | null {
  if (!notes) return null;
  for (const mention of notes.matchAll(/\b(?:graduat\w*|class of)\b([^.;]{0,80})/gi)) {
    const tail = mention[0].toLowerCase().startsWith("class of") ? ` of${mention[1]}` : mention[1];
    for (const { re, window } of PATTERNS) {
      const m = tail.match(re);
      if (!m) continue;
      const [earliest, latest] = window(m[2], m[3]);
      const phrase = m[0].trim();
      return { earliest, latest, phrase: /^of\b/i.test(phrase) ? `class ${phrase}` : phrase };
    }
  }
  return null;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * An eligibility issue when the resume's expected graduation (YYYY-MM or YYYY) falls
 * entirely outside the posting's graduation window; null when it fits or either is unknown.
 */
export function graduationIssue(
  eligibility: Partial<Eligibility> | null | undefined,
  graduation: string | null | undefined,
): string | null {
  const window = graduationWindow(eligibility?.notes);
  const m = graduation?.trim().match(/^(20\d{2})(?:-(\d{2}))?$/);
  if (!window || !m) return null;
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) : null;
  if (month !== null && (month < 1 || month > 12)) return null;
  const start = year * 12 + (month ?? 1) - 1;
  const end = year * 12 + (month ?? 12) - 1;
  const tooEarly = window.earliest !== null && end < window.earliest;
  const tooLate = window.latest !== null && start > window.latest;
  if (!tooEarly && !tooLate) return null;
  const yours = month ? `${MONTH_NAMES[month - 1]} ${year}` : String(year);
  return `The posting asks for graduation ${window.phrase}; your resume shows ${yours}.`;
}

/** Adds rule-based graduation issues the model missed, applying the usual cap of 40. */
export function applyGraduationCheck(
  results: MatchResult[],
  eligibilityByJob: Map<string, Partial<Eligibility> | null>,
  graduation: string | null | undefined,
): MatchResult[] {
  return results.map((r) => {
    const issue = graduationIssue(eligibilityByJob.get(r.jobId), graduation);
    if (!issue) return r;
    return {
      ...r,
      score: Math.min(r.score, 40),
      reasons: {
        ...r.reasons,
        eligibility_issues: [issue, ...r.reasons.eligibility_issues].slice(0, 5),
      },
    };
  });
}
