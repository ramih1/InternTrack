import Anthropic from "@anthropic-ai/sdk";

/** Default model for every Claude call in the app (PLAN.md §2.2). */
export const CLAUDE_MODEL = "claude-opus-5-5";

/** Small model that runs on an 8 GB laptop; override with OLLAMA_MODEL. */
export const DEFAULT_OLLAMA_MODEL = "qwen3.5:4b";

export type AiProvider = "anthropic" | "ollama";

/**
 * Which model serves the per-user AI features (resume parsing, fit checks, rating, tailoring).
 * `AI_PROVIDER=ollama` uses a local (or self-hosted) Ollama server; anything else uses Claude.
 */
export function aiProvider(): AiProvider {
  return process.env.AI_PROVIDER?.trim().toLowerCase() === "ollama" ? "ollama" : "anthropic";
}

export interface OllamaConfig {
  /** Base URL without a trailing slash, e.g. http://localhost:11434. */
  host: string;
  model: string;
  /** Only needed for a remote Ollama server that requires one (e.g. Ollama Cloud). */
  apiKey: string | null;
  /** Context window to request; the default is too small for a resume plus a posting. */
  numCtx: number;
  think: boolean;
  timeoutMs: number;
}

export function ollamaConfig(env: Record<string, string | undefined> = process.env): OllamaConfig {
  // OLLAMA_HOST is shared with the ollama CLI, which accepts it without a scheme.
  let host = env.OLLAMA_HOST?.trim() || "http://localhost:11434";
  if (!/^https?:\/\//i.test(host)) host = `http://${host}`;
  const int = (raw: string | undefined, fallback: number, min: number, max: number) => {
    const n = Number(raw);
    return Number.isFinite(n) && raw?.trim()
      ? Math.min(Math.max(Math.round(n), min), max)
      : fallback;
  };
  return {
    host: host.replace(/\/+$/, ""),
    model: env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL,
    apiKey: env.OLLAMA_API_KEY?.trim() || null,
    numCtx: int(env.OLLAMA_NUM_CTX, 16_384, 4_096, 262_144),
    think: env.OLLAMA_THINK?.trim().toLowerCase() === "true",
    timeoutMs: int(env.OLLAMA_TIMEOUT_SECONDS, 600, 30, 3_600) * 1000,
  };
}

/** The model name stored alongside AI results (matches, tailored resumes). */
export function aiModelName(): string {
  return aiProvider() === "ollama" ? `ollama/${ollamaConfig().model}` : CLAUDE_MODEL;
}

/**
 * Request fields shared by every call: on a safety decline the API re-runs the request on
 * Anthropic's recommended fallback model instead of returning the refusal.
 */
export function fallbackParams(): {
  betas: Anthropic.Beta.AnthropicBeta[];
  fallbacks: "default";
} {
  return { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
}

let client: Anthropic | null = null;

export function getAnthropic() {
  client ??= new Anthropic({ maxRetries: 3, timeout: 180_000 });
  return client;
}

export type AiFailure = {
  ok: false;
  reason: "refusal" | "max_tokens" | "parse_error" | "api_error";
  detail?: string;
};

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export type AiResult<T> = { ok: true; data: T; usage: TokenUsage; model: string } | AiFailure;

export function apiFailure(err: unknown): AiFailure {
  if (err instanceof Anthropic.APIError) {
    return { ok: false, reason: "api_error", detail: `${err.status ?? ""} ${err.message}`.trim() };
  }
  return { ok: false, reason: "api_error", detail: String(err) };
}
