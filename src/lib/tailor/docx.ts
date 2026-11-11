import JSZip from "jszip";

/**
 * Reads and rewrites paragraphs in a .docx file's main document part. Untouched paragraphs
 * keep their exact XML; a rewritten paragraph keeps its paragraph properties (style, bullet,
 * indentation) and the formatting of its first text run.
 */

const DOC_PATH = "word/document.xml";
const PARAGRAPH_RE = /<w:p\b(?:[^>]*[^/])?>[\s\S]*?<\/w:p>/g;

export interface DocxParagraph {
  /** Stable id used in prompts and edits, e.g. "P12". */
  id: string;
  text: string;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function encodeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Plain text of one <w:p> element. */
export function paragraphText(xml: string): string {
  let text = "";
  const tokenRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g;
  for (const m of xml.matchAll(tokenRe)) {
    if (m[1] !== undefined) text += decodeXml(m[1]);
    else if (m[0] === "<w:tab/>") text += "\t";
    else text += "\n";
  }
  return text;
}

/** A paragraph that contains another paragraph (e.g. a text box) can't be rewritten safely. */
function isNested(xml: string): boolean {
  return /<w:p[\s>]/.test(xml.slice(4));
}

function rewriteParagraph(xml: string, newText: string): string {
  const open = xml.match(/^<w:p\b[^>]*>/)![0];
  const pPr = xml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
  // Formatting of the first run that actually carries text.
  const firstTextRun =
    xml.match(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:t[\s>][\s\S]*?<\/w:r>/)?.[0] ?? "";
  const rPr = firstTextRun.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
  return `${open}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${encodeXml(newText)}</w:t></w:r></w:p>`;
}

async function loadDocument(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file(DOC_PATH);
  if (!file) throw new Error("This doesn't look like a Word document (no word/document.xml).");
  return { zip, xml: await file.async("string") };
}

/** Non-empty paragraphs with stable ids (index among all paragraphs). */
export async function readDocxParagraphs(bytes: Uint8Array): Promise<DocxParagraph[]> {
  const { xml } = await loadDocument(bytes);
  const out: DocxParagraph[] = [];
  let i = 0;
  for (const m of xml.matchAll(PARAGRAPH_RE)) {
    const text = paragraphText(m[0]).trim();
    if (text && !isNested(m[0])) out.push({ id: `P${i}`, text });
    i++;
  }
  return out;
}

/** Replaces the text of the given paragraphs (by id) and returns the new .docx bytes. */
export async function applyDocxEdits(
  bytes: Uint8Array,
  edits: { id: string; target: string; revised: string }[],
) {
  const { zip, xml } = await loadDocument(bytes);
  const byParagraph = new Map<string, { id: string; revised: string }>();
  const skipped: { id: string; reason: string }[] = [];
  for (const e of edits) {
    if (!/^P\d+$/.test(e.target)) skipped.push({ id: e.id, reason: "Unknown paragraph." });
    else if (byParagraph.has(e.target))
      skipped.push({ id: e.id, reason: "Another edit already changes this paragraph." });
    else byParagraph.set(e.target, e);
  }

  const applied: string[] = [];
  let i = 0;
  const newXml = xml.replace(PARAGRAPH_RE, (p) => {
    const edit = byParagraph.get(`P${i++}`);
    if (!edit) return p;
    byParagraph.delete(`P${i - 1}`);
    if (isNested(p) || !paragraphText(p).trim()) {
      skipped.push({ id: edit.id, reason: "This paragraph can't be edited automatically." });
      return p;
    }
    applied.push(edit.id);
    return rewriteParagraph(p, edit.revised.replace(/\s+/g, " ").trim());
  });
  for (const e of byParagraph.values()) skipped.push({ id: e.id, reason: "Unknown paragraph." });

  zip.file(DOC_PATH, newXml);
  const output = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return { output, applied, skipped };
}
