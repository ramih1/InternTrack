import { describe, expect, it } from "vitest";

import { checkResumeFile, labelFromFileName, MAX_RESUME_BYTES, safeFileName } from "./files";
import { allSkills, cleanKeywords } from "./schema";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("checkResumeFile", () => {
  it("accepts PDFs by their header, regardless of name", () => {
    expect(checkResumeFile(bytes("%PDF-1.7 ..."), "resume.bin")).toEqual({
      ok: true,
      kind: "pdf",
      mimeType: "application/pdf",
    });
  });

  it("accepts .docx (zip) files", () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    expect(checkResumeFile(zip, "Resume.DOCX")).toMatchObject({ ok: true, kind: "docx" });
  });

  it("rejects other zips, renamed files, empty and oversized files", () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    expect(checkResumeFile(zip, "archive.zip").ok).toBe(false);
    expect(checkResumeFile(bytes("<html>"), "resume.pdf").ok).toBe(false);
    expect(checkResumeFile(new Uint8Array(), "resume.pdf").ok).toBe(false);
    const big = new Uint8Array(MAX_RESUME_BYTES + 1);
    big.set(bytes("%PDF-"));
    expect(checkResumeFile(big, "resume.pdf")).toEqual({
      ok: false,
      error: "Resumes must be 4 MB or smaller.",
    });
  });
});

describe("file name helpers", () => {
  it("derives a label", () => {
    expect(labelFromFileName("Jane_Doe-SWE__Resume.pdf")).toBe("Jane Doe SWE Resume");
    expect(labelFromFileName(".pdf")).toBe("Resume");
  });
  it("sanitizes stored names", () => {
    expect(safeFileName("../../etc/passwd<script>.pdf")).toBe(".._.._etc_passwd_script_.pdf");
  });
});

describe("cleanKeywords", () => {
  it("lowercases, strips punctuation, de-duplicates and bounds length", () => {
    expect(
      cleanKeywords([
        "Python",
        "python",
        "C++",
        "C#",
        "Next.js",
        "a",
        "  Machine   Learning! ",
        "x".repeat(61),
      ]),
    ).toEqual(["python", "c++", "c#", "next.js", "machine learning"]);
  });
  it("caps the number of keywords", () => {
    expect(
      cleanKeywords(
        Array.from({ length: 100 }, (_, i) => `skill${i}`),
        10,
      ),
    ).toHaveLength(10);
  });
});

describe("allSkills", () => {
  it("flattens and de-duplicates case-insensitively", () => {
    expect(
      allSkills({
        skills: {
          languages: ["Python", "SQL"],
          frameworks: ["React"],
          tools: ["sql", " Docker "],
          domains: [],
        },
      }),
    ).toEqual(["Python", "SQL", "React", "Docker"]);
  });
});
