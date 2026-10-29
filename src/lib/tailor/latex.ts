/**
 * Applies tailoring edits to a LaTeX source by exact string replacement, so everything
 * outside the edited text (preamble, macros, layout) stays byte-for-byte identical.
 */

const SPECIALS = ["%", "&", "#", "$", "_"] as const;

/** Commands a revision may introduce even if the original line didn't use them. */
const SAFE_COMMANDS = new Set(["textbf", "textit", "emph", "underline", "texttt"]);

/** Commands that can read/write files or change the document setup — never allowed in an edit. */
const FORBIDDEN_COMMANDS = new Set([
  "input",
  "include",
  "write",
  "immediate",
  "openout",
  "openin",
  "read",
  "usepackage",
  "documentclass",
  "def",
  "newcommand",
  "renewcommand",
  "catcode",
  "csname",
  "directlua",
  "special",
  "begin",
  "end",
]);

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  for (
    let i = haystack.indexOf(needle);
    i !== -1;
    i = haystack.indexOf(needle, i + needle.length)
  ) {
    count++;
  }
  return count;
}

/** Counts `c` not preceded by a backslash. */
function unescapedCount(text: string, c: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === c && text[i - 1] !== "\\") n++;
  return n;
}

function escapeUnescaped(text: string, c: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    out += text[i] === c && text[i - 1] !== "\\" ? `\\${c}` : text[i];
  }
  return out;
}

function braceBalance(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i - 1] === "\\") continue;
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
  }
  return depth;
}

function commandsIn(text: string): Set<string> {
  return new Set([...text.matchAll(/\\([a-zA-Z]+)/g)].map((m) => m[1]));
}

export type LatexCheck = { ok: true; revised: string } | { ok: false; reason: string };

/**
 * Validates (and lightly repairs) a revised LaTeX snippet against the original it replaces.
 * Special characters the original didn't use are escaped (e.g. "C#" → "C\#"); changes that
 * would alter document structure are rejected.
 */
export function checkLatexRevision(original: string, revisedRaw: string): LatexCheck {
  let revised = revisedRaw;
  if (braceBalance(revised) !== braceBalance(original)) {
    return { ok: false, reason: "The rewrite has unbalanced braces." };
  }
  for (const c of SPECIALS) {
    const before = unescapedCount(original, c);
    const after = unescapedCount(revised, c);
    if (after === before) continue;
    if (before === 0) revised = escapeUnescaped(revised, c);
    else return { ok: false, reason: `The rewrite changes how "${c}" is used in the layout.` };
  }
  const originalCommands = commandsIn(original);
  for (const cmd of commandsIn(revised)) {
    if (FORBIDDEN_COMMANDS.has(cmd)) {
      return { ok: false, reason: `The rewrite uses \\${cmd}, which isn't allowed in an edit.` };
    }
    if (!originalCommands.has(cmd) && !SAFE_COMMANDS.has(cmd)) {
      return { ok: false, reason: `The rewrite adds a new command (\\${cmd}).` };
    }
  }
  return { ok: true, revised };
}

/** Why an edit target can't be applied to this source, or null if it can. */
export function latexTargetProblem(source: string, target: string): string | null {
  const n = countOccurrences(source, target);
  if (n === 0) return "The original text wasn't found in your .tex file.";
  if (n > 1) return "The original text appears more than once in your .tex file.";
  return null;
}

export function applyLatexEdits(
  source: string,
  edits: { id: string; target: string; revised: string }[],
) {
  let output = source;
  const applied: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const edit of edits) {
    const problem = latexTargetProblem(output, edit.target);
    if (problem) {
      skipped.push({ id: edit.id, reason: problem });
      continue;
    }
    const check = checkLatexRevision(edit.target, edit.revised);
    if (!check.ok) {
      skipped.push({ id: edit.id, reason: check.reason });
      continue;
    }
    output = output.replace(edit.target, () => check.revised);
    applied.push(edit.id);
  }
  return { output, applied, skipped };
}
