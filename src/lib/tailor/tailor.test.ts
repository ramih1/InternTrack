import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { applyDocxEdits, paragraphText, readDocxParagraphs } from "./docx";
import { unverifiedTerms } from "./grounding";
import { applyLatexEdits, checkLatexRevision, latexTargetProblem } from "./latex";

const TEX = String.raw`\documentclass[letterpaper,11pt]{article}
\usepackage{titlesec}
\newcommand{\resumeItem}[1]{\item\small{#1}}
\begin{document}
\section{Experience}
\resumeItem{Built REST APIs in Python (FastAPI) serving 2M requests/day}
\resumeItem{Wrote React + TypeScript dashboard components; cut load time by 35\%}
Languages & Python, Java \\
\end{document}
`;

describe("checkLatexRevision", () => {
  it("escapes special characters the original didn't use", () => {
    const r = checkLatexRevision("Built APIs", "Built APIs in C# & Go");
    expect(r).toEqual({ ok: true, revised: "Built APIs in C\\# \\& Go" });
  });

  it("rejects changes to structural characters the original used", () => {
    expect(checkLatexRevision("Languages & Python", "Languages: Python").ok).toBe(false);
  });

  it("rejects unbalanced braces, new commands and file access", () => {
    expect(checkLatexRevision("a {b}", "a {b").ok).toBe(false);
    expect(checkLatexRevision("Built APIs", "Built \\hspace{1cm} APIs").ok).toBe(false);
    expect(checkLatexRevision("Built APIs", "\\input{/etc/passwd}").ok).toBe(false);
    expect(checkLatexRevision("Built \\href{x}{APIs}", "Shipped \\href{x}{APIs}").ok).toBe(true);
    expect(checkLatexRevision("Built APIs", "Built \\textbf{scalable} APIs").ok).toBe(true);
  });
});

describe("applyLatexEdits", () => {
  it("replaces only the targeted text and keeps everything else identical", () => {
    const target = "Built REST APIs in Python (FastAPI) serving 2M requests/day";
    const revised =
      "Designed and shipped Python (FastAPI) backend services handling 2M requests/day";
    const { output, applied, skipped } = applyLatexEdits(TEX, [{ id: "e1", target, revised }]);
    expect(applied).toEqual(["e1"]);
    expect(skipped).toEqual([]);
    expect(output).toBe(TEX.replace(target, revised));
  });

  it("treats $ in the revision literally, not as a replacement pattern", () => {
    const { output } = applyLatexEdits(TEX, [
      { id: "e1", target: "serving 2M requests/day", revised: "serving 2M requests/day ($&)" },
    ]);
    expect(output).toContain("serving 2M requests/day (\\$\\&)");
  });

  it("skips targets that are missing or ambiguous", () => {
    const { applied, skipped } = applyLatexEdits(TEX, [
      { id: "e1", target: "Not in the resume", revised: "x" },
      { id: "e2", target: "\\resumeItem{", revised: "x" },
    ]);
    expect(applied).toEqual([]);
    expect(skipped.map((s) => s.id)).toEqual(["e1", "e2"]);
    expect(latexTargetProblem(TEX, "\\resumeItem{")).toMatch(/more than once/);
  });
});

async function makeDocx(paragraphsXml: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${paragraphsXml}<w:sectPr/></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

const P_HEADING = `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Experience</w:t></w:r></w:p>`;
const P_BULLET = `<w:p w:rsidR="00AB"><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Built REST </w:t></w:r><w:r><w:t>APIs &amp; dashboards</w:t></w:r></w:p>`;

describe("docx paragraphs", () => {
  it("extracts paragraph text across runs and decodes entities", () => {
    expect(paragraphText(P_BULLET)).toBe("Built REST APIs & dashboards");
  });

  it("lists non-empty paragraphs with stable ids", async () => {
    const docx = await makeDocx(`${P_HEADING}<w:p/><w:p><w:pPr/></w:p>${P_BULLET}`);
    expect(await readDocxParagraphs(docx)).toEqual([
      { id: "P0", text: "Experience" },
      { id: "P2", text: "Built REST APIs & dashboards" },
    ]);
  });

  it("rewrites a paragraph keeping its paragraph and first-run formatting", async () => {
    const docx = await makeDocx(`${P_HEADING}${P_BULLET}`);
    const { output, applied } = await applyDocxEdits(docx, [
      { id: "e1", target: "P1", revised: "Shipped REST APIs <fast> & dashboards" },
    ]);
    expect(applied).toEqual(["e1"]);
    const xml = await (await JSZip.loadAsync(output)).file("word/document.xml")!.async("string");
    expect(xml).toContain(P_HEADING); // untouched paragraph is byte-identical
    expect(xml).toContain(
      `<w:p w:rsidR="00AB"><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Shipped REST APIs &lt;fast&gt; &amp; dashboards</w:t></w:r></w:p>`,
    );
    expect(await readDocxParagraphs(output)).toEqual([
      { id: "P0", text: "Experience" },
      { id: "P1", text: "Shipped REST APIs <fast> & dashboards" },
    ]);
  });

  it("skips unknown and duplicate paragraph targets", async () => {
    const docx = await makeDocx(P_BULLET);
    const { applied, skipped } = await applyDocxEdits(docx, [
      { id: "e1", target: "P0", revised: "One" },
      { id: "e2", target: "P0", revised: "Two" },
      { id: "e3", target: "P9", revised: "Three" },
      { id: "e4", target: "Built REST", revised: "Four" },
    ]);
    expect(applied).toEqual(["e1"]);
    expect(skipped.map((s) => s.id).sort()).toEqual(["e2", "e3", "e4"]);
  });

  it("rejects files that aren't Word documents", async () => {
    const zip = await new JSZip().file("x.txt", "hi").generateAsync({ type: "uint8array" });
    await expect(readDocxParagraphs(zip)).rejects.toThrow(/Word document/);
  });
});

describe("unverifiedTerms", () => {
  const resume = String.raw`Built REST APIs in Python (FastAPI) serving 2M requests/day.
    React + TypeScript dashboards; cut load time by 35\%. Tools: AWS S3, Docker, Next.js, C++`;

  it("accepts rewrites that only use facts from the resume", () => {
    expect(
      unverifiedTerms("Shipped Python FastAPI services handling 2M daily requests on AWS", resume),
    ).toEqual([]);
    expect(
      unverifiedTerms("Cut dashboard load time 35\\% with TypeScript and Next.js", resume),
    ).toEqual([]);
  });

  it("flags new numbers and new technical terms", () => {
    expect(
      unverifiedTerms("Scaled Kubernetes clusters to 10M users using GraphQL", resume),
    ).toEqual(["10M", "Kubernetes", "GraphQL"]);
    expect(unverifiedTerms("Wrote C# and Go services on GCP", resume)).toEqual(["C#", "Go", "GCP"]);
  });

  it("ignores ordinary capitalized words and LaTeX commands", () => {
    expect(
      unverifiedTerms("\\textbf{Designed} and delivered features. Improved Docker builds", resume),
    ).toEqual([]);
  });
});
