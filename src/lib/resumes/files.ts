export const MAX_RESUME_BYTES = 4 * 1024 * 1024;
export const MAX_RESUMES_PER_USER = 5;

export const RESUME_MIME_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export type ResumeKind = keyof typeof RESUME_MIME_TYPES;

export type FileCheck =
  { ok: true; kind: ResumeKind; mimeType: string } | { ok: false; error: string };

/**
 * Validates an uploaded resume by size and by its leading bytes — never trust the
 * browser-supplied MIME type or extension alone.
 */
export function checkResumeFile(bytes: Uint8Array, fileName: string): FileCheck {
  if (bytes.byteLength === 0) return { ok: false, error: "The file is empty." };
  if (bytes.byteLength > MAX_RESUME_BYTES) {
    return { ok: false, error: "Resumes must be 4 MB or smaller." };
  }
  const head = String.fromCharCode(...bytes.subarray(0, 5));
  if (head === "%PDF-") return { ok: true, kind: "pdf", mimeType: RESUME_MIME_TYPES.pdf };
  // DOCX files are ZIP archives ("PK\x03\x04").
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (isZip && /\.docx$/i.test(fileName)) {
    return { ok: true, kind: "docx", mimeType: RESUME_MIME_TYPES.docx };
  }
  return { ok: false, error: "Upload a PDF or Word (.docx) file." };
}

/** A display label from a file name: "Jane_Doe_SWE_Resume.pdf" → "Jane Doe SWE Resume". */
export function labelFromFileName(fileName: string): string {
  const base = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (base || "Resume").slice(0, 80);
}

/** Keeps stored file names printable and bounded. */
export function safeFileName(fileName: string): string {
  const cleaned = fileName.replace(/[^\w.\- ()]/g, "_").slice(-120);
  return cleaned || "resume";
}
