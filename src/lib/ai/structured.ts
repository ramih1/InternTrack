import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import {
  aiProvider,
  apiFailure,
  CLAUDE_MODEL,
  claudeModelFor,
  fallbackParams,
  getAnthropic,
  ollamaConfig,
  type AiResult,
  type AiTask,
} from "./client";
import { ollamaBody, ollamaText, readOllamaResponse, type AiPart } from "./ollama";

export type { AiPart } from "./ollama";
export type { AiResult, TokenUsage } from "./client";

export interface StructuredRequest<S extends z.ZodType> {
  /** Picks the Claude model (see `claudeModelFor`); Ollama runs every task on one model. */
  task: AiTask;
  system: string;
  parts: AiPart[];
  schema: S;
  effort: "low" | "medium";
  maxTokens?: number;
}

/**
 * Runs one structured-output request on the configured provider (see `aiProvider`) and
 * returns the parsed, schema-validated result.
 */
export async function generateStructured<S extends z.ZodType>(
  req: StructuredRequest<S>,
): Promise<AiResult<z.infer<S>>> {
  return aiProvider() === "ollama" ? viaOllama(req) : viaAnthropic(req);
}

function anthropicBlock(part: AiPart): Anthropic.Beta.BetaContentBlockParam {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text };
    case "pdf":
      return {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: Buffer.from(part.data).toString("base64"),
        },
      };
    case "document":
      return {
        type: "document",
        source: { type: "text", media_type: "text/plain", data: part.text },
      };
  }
}

async function viaAnthropic<S extends z.ZodType>(
  req: StructuredRequest<S>,
): Promise<AiResult<z.infer<S>>> {
  try {
    const model = claudeModelFor(req.task);
    const response = await getAnthropic().beta.messages.parse({
      ...(model === CLAUDE_MODEL ? fallbackParams() : {}),
      model,
      max_tokens: req.maxTokens ?? 16000,
      system: req.system,
      output_config: { effort: req.effort, format: betaZodOutputFormat(req.schema) },
      messages: [{ role: "user", content: req.parts.map(anthropicBlock) }],
    });
    if (response.stop_reason === "refusal") {
      return { ok: false, reason: "refusal", detail: response.stop_details?.category ?? undefined };
    }
    if (response.stop_reason === "max_tokens") return { ok: false, reason: "max_tokens" };
    if (!response.parsed_output) return { ok: false, reason: "parse_error" };
    const u = response.usage;
    return {
      ok: true,
      data: response.parsed_output,
      model: response.model,
      usage: {
        input: u.input_tokens,
        output: u.output_tokens,
        cacheRead: u.cache_read_input_tokens ?? 0,
        cacheWrite: u.cache_creation_input_tokens ?? 0,
      },
    };
  } catch (err) {
    return apiFailure(err);
  }
}

async function viaOllama<S extends z.ZodType>(
  req: StructuredRequest<S>,
): Promise<AiResult<z.infer<S>>> {
  const config = ollamaConfig();
  let text: string;
  try {
    text = await ollamaText(req.parts);
  } catch (err) {
    return {
      ok: false,
      reason: "parse_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  let res: Response;
  try {
    res = await fetch(`${config.host}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(
        ollamaBody(config, req.system, text, z.toJSONSchema(req.schema), req.maxTokens),
      ),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      ok: false,
      reason: "api_error",
      detail: timedOut
        ? `Ollama took longer than ${config.timeoutMs / 1000}s (raise OLLAMA_TIMEOUT_SECONDS).`
        : `Couldn't reach Ollama at ${config.host} — is it running? (${String(err)})`,
    };
  }
  return readOllamaResponse(res, req.schema, config.model);
}
