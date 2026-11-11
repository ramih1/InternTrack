/**
 * Flags content in a rewrite that can't be traced back to the resume: numbers and
 * technical-looking terms (TypeScript, AWS, CI/CD, C#, Python3…) absent from the resume text.
 * It's a heuristic safety net — the student still reviews every edit.
 */

function stripLatex(text: string): string {
  return text
    .replace(/\\(?:href|url)\{[^}]*\}/g, " ")
    .replace(/\\[a-zA-Z]+\*?/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\\([%&#$_])/g, "$1");
}

function normalize(text: string): string {
  return stripLatex(text).toLowerCase().replace(/\s+/g, " ");
}

const NUMBER_RE = /\d[\d,.]*(?:\s?(?:%|k|m|b|x|\+))?/gi;
const TERM_RE = /[A-Za-z][A-Za-z0-9+#./-]*[A-Za-z0-9+#]|[A-Za-z]/g;

function isTechnicalLooking(token: string): boolean {
  if (/[0-9+#]/.test(token)) return true; // C#, C++, Python3, S3
  if (/^[A-Z]{2,}(?:\/[A-Z]{2,})*$/.test(token)) return true; // AWS, SQL, CI/CD
  if (/[a-z][A-Z]/.test(token)) return true; // TypeScript, GraphQL, PyTorch
  if (/\.[a-z]/i.test(token)) return true; // Next.js, Node.js
  return false;
}

export function unverifiedTerms(revised: string, resumeText: string): string[] {
  const haystack = normalize(resumeText);
  const clean = stripLatex(revised);
  const flagged = new Set<string>();

  for (const m of clean.matchAll(NUMBER_RE)) {
    const num = m[0].trim().replace(/[.,]$/, "");
    const digits = num.replace(/[^\d.]/g, "");
    if (digits && !haystack.includes(digits)) flagged.add(num);
  }
  for (const m of clean.matchAll(TERM_RE)) {
    const token = m[0].replace(/[./-]+$/, "");
    if (token.length < 2) continue;
    // Capitalized words mid-sentence are usually names of tools, companies or products.
    const before = clean.slice(0, m.index).trimEnd();
    const sentenceStart = before === "" || /[.!?:;•(]$/.test(before);
    const properNoun = /^[A-Z]/.test(token) && !sentenceStart;
    if (!isTechnicalLooking(token) && !properNoun) continue;
    if (!haystack.includes(token.toLowerCase())) flagged.add(token);
  }
  return [...flagged];
}
