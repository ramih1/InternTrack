import { describe, expect, it } from "vitest";
import { z } from "zod";

import { aiProvider, ollamaConfig } from "./client";
import { ollamaBody, ollamaText, parseStructured, pdfText, readOllamaResponse } from "./ollama";

const Schema = z.object({ score: z.number(), tags: z.array(z.string()) });

/** A one-page PDF whose text layer reads "Jordan Rivera Python". */
function tinyPdf(): Uint8Array {
  const stream = "BT /F1 12 Tf 72 720 Td (Jordan Rivera Python) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

describe("ollamaConfig", () => {
  it("defaults to a local qwen3.5:4b server", () => {
    expect(ollamaConfig({})).toEqual({
      host: "http://localhost:11434",
      model: "qwen3.5:4b",
      apiKey: null,
      numCtx: 16_384,
      think: false,
      timeoutMs: 600_000,
    });
  });

  it("accepts the ollama CLI's scheme-less OLLAMA_HOST and clamps numbers", () => {
    const c = ollamaConfig({
      OLLAMA_HOST: "127.0.0.1:11434/",
      OLLAMA_MODEL: " qwen3.5:2b ",
      OLLAMA_NUM_CTX: "999",
      OLLAMA_TIMEOUT_SECONDS: "abc",
      OLLAMA_THINK: "TRUE",
    });
    expect(c.host).toBe("http://127.0.0.1:11434");
    expect(c.model).toBe("qwen3.5:2b");
    expect(c.numCtx).toBe(4_096);
    expect(c.timeoutMs).toBe(600_000);
    expect(c.think).toBe(true);
  });
});

describe("aiProvider", () => {
  it("uses Ollama only when asked to", () => {
    const before = process.env.AI_PROVIDER;
    try {
      process.env.AI_PROVIDER = " Ollama ";
      expect(aiProvider()).toBe("ollama");
      process.env.AI_PROVIDER = "something-else";
      expect(aiProvider()).toBe("anthropic");
      delete process.env.AI_PROVIDER;
      expect(aiProvider()).toBe("anthropic");
    } finally {
      if (before === undefined) delete process.env.AI_PROVIDER;
      else process.env.AI_PROVIDER = before;
    }
  });
});

describe("ollamaText", () => {
  it("wraps documents and keeps text parts in order", async () => {
    const text = await ollamaText([
      { type: "document", text: "  \\resumeItem{Built a thing}  " },
      { type: "text", text: "Review this resume." },
    ]);
    expect(text).toBe(
      "<document>\n\\resumeItem{Built a thing}\n</document>\n\nReview this resume.",
    );
  });

  it("rejects empty documents", async () => {
    await expect(ollamaText([{ type: "document", text: "  " }])).rejects.toThrow(/empty/);
  });

  it("reads a PDF's text layer", async () => {
    expect(await pdfText(tinyPdf())).toContain("Jordan Rivera Python");
    expect(await ollamaText([{ type: "pdf", data: tinyPdf() }])).toMatch(
      /^<document>\nJordan Rivera Python\s*\n<\/document>$/,
    );
  });
});

describe("ollamaBody", () => {
  it("constrains output to the schema and caps local output length", () => {
    const schema = z.toJSONSchema(Schema);
    const body = ollamaBody(ollamaConfig({}), "Score it.", "resume", schema, 16_000);
    expect(body.format).toBe(schema);
    expect(body.stream).toBe(false);
    expect(body.think).toBe(false);
    expect(body.options).toMatchObject({ num_ctx: 16_384, num_predict: 8192 });
    expect(body.messages[0].content).toContain("Score it.");
    expect(body.messages[0].content).toContain('"score"');
    expect(body.messages[1]).toEqual({ role: "user", content: "resume" });
  });
});

describe("parseStructured", () => {
  it("parses JSON, including fenced output", () => {
    expect(parseStructured('{"score": 80, "tags": ["a"]}', Schema)).toEqual({
      ok: true,
      data: { score: 80, tags: ["a"] },
    });
    expect(parseStructured('```json\n{"score": 1, "tags": []}\n```', Schema).ok).toBe(true);
  });

  it("reports invalid JSON and schema mismatches", () => {
    const bad = parseStructured("{score: 80", Schema);
    expect(bad).toMatchObject({ ok: false, detail: expect.stringMatching(/invalid JSON/) });
    const wrong = parseStructured('{"score": "high", "tags": []}', Schema);
    expect(wrong).toMatchObject({ ok: false, detail: expect.stringMatching(/at score/) });
  });
});

describe("readOllamaResponse", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("returns data, usage and the serving model", async () => {
    const res = await readOllamaResponse(
      json({
        model: "qwen3.5:4b",
        message: { content: '{"score": 72, "tags": ["python"]}' },
        done_reason: "stop",
        prompt_eval_count: 1200,
        eval_count: 80,
      }),
      Schema,
      "qwen3.5:4b",
    );
    expect(res).toEqual({
      ok: true,
      data: { score: 72, tags: ["python"] },
      model: "ollama/qwen3.5:4b",
      usage: { input: 1200, output: 80, cacheRead: 0, cacheWrite: 0 },
    });
  });

  it("maps truncation, missing models and bad output to failures", async () => {
    expect(
      await readOllamaResponse(
        json({ message: { content: '{"sco' }, done_reason: "length" }),
        Schema,
        "m",
      ),
    ).toEqual({ ok: false, reason: "max_tokens" });

    const missing = await readOllamaResponse(
      json({ error: "model 'qwen3.5:4b' not found" }, 404),
      Schema,
      "qwen3.5:4b",
    );
    expect(missing).toMatchObject({
      ok: false,
      reason: "api_error",
      detail: expect.stringContaining("ollama pull qwen3.5:4b"),
    });

    expect(
      await readOllamaResponse(json({ message: { content: "not json" } }), Schema, "m"),
    ).toMatchObject({ ok: false, reason: "parse_error" });
  });
});
