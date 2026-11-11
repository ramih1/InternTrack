import { extractText, getDocumentProxy } from "unpdf";
import type { z } from "zod";

import type { AiResult, OllamaConfig } from "./client";

/** Provider-neutral prompt content. */
export type AiPart =
  | { type: "text"; text: string }
  | { type: "pdf"; data: Uint8Array }
  /** A plain-text document, e.g. text pulled from a .docx or LaTeX source. */
  | { type: "document"; text: string };

/** Ollama models can't read PDFs, so they get the PDF's text layer instead. */
export async function pdfText(data: Uint8Array): Promise<string> {
  // pdf.js takes ownership of the buffer it's given; pass a copy.
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/** Flattens prompt parts into the single user message an Ollama chat request takes. */
export async function ollamaText(parts: AiPart[]): Promise<string> {
  const out: string[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      out.push(part.text);
      continue;
    }
    const text = part.type === "pdf" ? await pdfText(part.data) : part.text;
    if (!text.trim()) {
      throw new Error(
        part.type === "pdf"
          ? "No text could be extracted from this PDF (it may be a scanned image)."
          : "The document is empty.",
      );
    }
    out.push(`<document>\n${text.trim()}\n</document>`);
  }
  return out.join("\n\n");
}

/** Output cap for one local request; small models rarely need more and can loop past it. */
const MAX_LOCAL_OUTPUT = 8192;

export function ollamaBody(
  config: OllamaConfig,
  system: string,
  text: string,
  schema: Record<string, unknown>,
  maxTokens = MAX_LOCAL_OUTPUT,
) {
  return {
    model: config.model,
    stream: false,
    think: config.think,
    // `format` constrains decoding to the schema; the copy in the prompt carries the field
    // descriptions, which small models need to fill the fields sensibly.
    format: schema,
    messages: [
      {
        role: "system",
        content: `${system}\n\nRespond with JSON only, matching this JSON Schema (the descriptions say what each field holds):\n${JSON.stringify(schema)}`,
      },
      { role: "user", content: text },
    ],
    options: {
      num_ctx: config.numCtx,
      num_predict: Math.min(maxTokens, MAX_LOCAL_OUTPUT),
      temperature: 0.2,
    },
  };
}

interface OllamaChatResponse {
  model?: string;
  message?: { content?: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

/** Parses and validates a model's JSON reply against the request schema. */
export function parseStructured<S extends z.ZodType>(
  content: string,
  schema: S,
): { ok: true; data: z.infer<S> } | { ok: false; detail: string } {
  const raw = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, detail: `Model returned invalid JSON: ${raw.slice(0, 120)}` };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      detail: `Model output didn't match the schema at ${issue.path.join(".") || "(root)"}: ${issue.message}`,
    };
  }
  return { ok: true, data: parsed.data };
}

export async function readOllamaResponse<S extends z.ZodType>(
  res: Response,
  schema: S,
  model: string,
): Promise<AiResult<z.infer<S>>> {
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    const hint = res.status === 404 ? ` Run \`ollama pull ${model}\` first.` : "";
    return { ok: false, reason: "api_error", detail: `Ollama ${res.status}: ${body}${hint}` };
  }
  const json = (await res.json()) as OllamaChatResponse;
  if (json.done_reason === "length") return { ok: false, reason: "max_tokens" };
  const parsed = parseStructured(json.message?.content ?? "", schema);
  if (!parsed.ok) return { ok: false, reason: "parse_error", detail: parsed.detail };
  return {
    ok: true,
    data: parsed.data,
    model: `ollama/${json.model ?? model}`,
    usage: {
      input: json.prompt_eval_count ?? 0,
      output: json.eval_count ?? 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
  };
}
