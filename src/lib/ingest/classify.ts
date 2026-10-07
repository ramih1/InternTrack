import type { EmploymentType, JobField, PayInfo, PayPeriod, RemoteType } from "./types";
import { uniq } from "./text";

const STUDENT_ROLE_RE =
  /\b(interns?|internships?|co-?ops?|summer (?:analyst|associate|student)|working student|student (?:researcher|program|engineer|developer|analyst)|apprentice(?:ship)?s?|fellow(?:ship)?s?|new grad(?:uate)?s?|university grad(?:uate)?s?|early careers?|placement year|industrial placement)\b/i;

/** True when a title (or ATS employment type) describes an internship, co-op, new-grad or student program. */
export function isStudentRole(title: string, employmentType?: string | null): boolean {
  if (STUDENT_ROLE_RE.test(title)) return true;
  return Boolean(employmentType && /\b(intern|internship|co-?op|student)\b/i.test(employmentType));
}

export function detectEmploymentType(title: string, hint?: string | null): EmploymentType {
  const text = `${title} ${hint ?? ""}`;
  if (/\bco-?ops?\b/i.test(text)) return "co_op";
  if (/\b(interns?|internships?|placement)\b/i.test(text)) return "internship";
  if (
    /\b(new grad(uate)?|university grad(uate)?|early careers?|graduate (program|scheme))\b/i.test(
      text,
    )
  )
    return "new_grad";
  if (/\b(fellow(ship)?|apprentice(ship)?|scholar(ship)?|program)\b/i.test(text)) return "program";
  return "internship";
}

export function detectRemote(
  locations: string[],
  text: string = "",
  hint?: RemoteType | null,
): RemoteType {
  if (hint && hint !== "unknown") return hint;
  const loc = locations.join(" | ");
  if (/\bhybrid\b/i.test(loc)) return "hybrid";
  const remoteLoc = locations.filter((l) => /\bremote\b/i.test(l));
  if (remoteLoc.length > 0 && remoteLoc.length === locations.length) return "remote";
  if (remoteLoc.length > 0) return "hybrid";
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  if (/\b(fully remote|100% remote|remote-first|work from anywhere)\b/i.test(text)) return "remote";
  if (locations.length > 0) return "onsite";
  return "unknown";
}

const SEASONS: Record<string, string> = {
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
  autumn: "Fall",
  winter: "Winter",
};

/** Extracts normalized terms ("Summer 2027") from free text such as titles or descriptions. */
export function extractTerms(text: string): string[] {
  const out: string[] = [];
  const re =
    /\b(spring|summer|fall|autumn|winter)\s*(?:'|’|term\s*|semester\s*|of\s*)?(20\d{2}|\d{2})\b/gi;
  for (const m of text.matchAll(re)) {
    const season = SEASONS[m[1].toLowerCase()];
    const year = m[2].length === 2 ? `20${m[2]}` : m[2];
    out.push(`${season} ${year}`);
  }
  return sortTerms(uniq(out));
}

/** Normalizes community-list term labels; drops placeholders like "N/A". */
export function normalizeTermLabels(labels: string[]): string[] {
  return sortTerms(uniq(labels.flatMap((l) => extractTerms(l))));
}

const SEASON_ORDER = ["Winter", "Spring", "Summer", "Fall"];
export function sortTerms(terms: string[]): string[] {
  return [...terms].sort((a, b) => {
    const [sa, ya] = a.split(" ");
    const [sb, yb] = b.split(" ");
    return Number(ya) - Number(yb) || SEASON_ORDER.indexOf(sa) - SEASON_ORDER.indexOf(sb);
  });
}

const FIELD_RULES: Array<[JobField, RegExp]> = [
  [
    "quant_finance",
    /\b(quant(itative)?|trading|trader|investment bank|equity research|asset management|hedge fund)\b/i,
  ],
  [
    "data_ml",
    /\b(data|machine learning|\bml\b|\bai\b|artificial intelligence|deep learning|analytics|statistic|nlp|computer vision|llm)\b/i,
  ],
  [
    "hardware",
    /\b(hardware|electrical|mechanical|firmware|embedded|fpga|asic|silicon|robotics|manufacturing|aerospace|avionics|rf\b|circuit)\b/i,
  ],
  ["design", /\b(design(er)?|ux|ui\b|user experience|graphic|visual)\b/i],
  ["product", /\b(product manag\w*|product owner|apm|program manag\w*|technical program\w*)\b/i],
  ["research", /\b(research(er)?|scientist|phd)\b/i],
  [
    "software",
    /\b(software|swe\b|developer|engineer(ing)?|backend|frontend|front-end|back-end|full[- ]?stack|devops|sre\b|security|infrastructure|mobile|ios|android|platform|cloud|web)\b/i,
  ],
  [
    "business",
    /\b(business|marketing|sales|finance|accounting|operations|strategy|consult|hr\b|people|recruit|legal|communications|partnerships|supply chain)\b/i,
  ],
];

/** Maps community-list categories (e.g. SimplifyJobs) to our field enum. */
const CATEGORY_FIELDS: Array<[RegExp, JobField]> = [
  [/quant/i, "quant_finance"],
  [/ai|ml|data/i, "data_ml"],
  [/hardware/i, "hardware"],
  [/product/i, "product"],
  [/software/i, "software"],
];

export function detectField(
  title: string,
  departments: string[] = [],
  category?: string | null,
): JobField {
  if (category) {
    for (const [re, field] of CATEGORY_FIELDS) if (re.test(category)) return field;
  }
  for (const text of [title, departments.join(" ")]) {
    if (!text) continue;
    for (const [field, re] of FIELD_RULES) if (re.test(text)) return field;
  }
  return "other";
}

const PERIOD_PATTERNS: Array<[RegExp, PayPeriod]> = [
  [/(\/|per|an?)\s*(hr|hour)\b|hourly/i, "hour"],
  [/(\/|per|a)\s*(wk|week)\b|weekly/i, "week"],
  [/(\/|per|a)\s*(mo|month)\b|monthly/i, "month"],
  [/(\/|per|a)\s*(yr|year|annum)\b|annual|salary/i, "year"],
];

/** Best-effort pay extraction from description text, e.g. "$45 - $55/hr" or "$8,000/month". */
export function extractPay(text: string): PayInfo | null {
  const re =
    /(?<cur>US\$|CA\$|C\$|\$|£|€)\s?(?<min>\d{1,3}(?:,\d{3})*(?:\.\d+)?)(?<mk>k)?(?:\s*(?:-|–|—|to)\s*(?:US\$|CA\$|C\$|\$|£|€)?\s?(?<max>\d{1,3}(?:,\d{3})*(?:\.\d+)?)(?<xk>k)?)?(?<tail>[^.\n]{0,40})/i;
  const m = text.match(re);
  if (!m?.groups) return null;
  const num = (v?: string, k?: string) => (v ? Number(v.replace(/,/g, "")) * (k ? 1000 : 1) : null);
  const min = num(m.groups.min, m.groups.mk);
  const max = num(m.groups.max, m.groups.xk) ?? min;
  if (min === null || min < 10) return null;
  let period: PayPeriod | null = null;
  for (const [pre, p] of PERIOD_PATTERNS) if (pre.test(m.groups.tail)) period = p;
  if (!period) period = min < 300 ? "hour" : min < 20000 ? "month" : "year";
  const cur = m.groups.cur;
  const currency =
    cur === "£" ? "GBP" : cur === "€" ? "EUR" : /CA?\$/i.test(cur) && cur !== "$" ? "CAD" : "USD";
  return { text: m[0].replace(m.groups.tail, "").trim(), min, max, currency, period };
}

export function sponsorshipFromLabel(label?: string | null): "yes" | "no" | "unknown" {
  if (!label) return "unknown";
  if (/does not|no sponsorship|citizenship is required|not offer/i.test(label)) return "no";
  if (/offers sponsorship|will sponsor|sponsorship available/i.test(label)) return "yes";
  return "unknown";
}
