import Anthropic from "@anthropic-ai/sdk";

/** Default model for every Claude call in the app (PLAN.md §2.2). */
export const CLAUDE_MODEL = "claude-opus-5-5";

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

export type ClaudeFailure = {
  ok: false;
  reason: "refusal" | "max_tokens" | "parse_error" | "api_error";
  detail?: string;
};

export function apiFailure(err: unknown): ClaudeFailure {
  if (err instanceof Anthropic.APIError) {
    return { ok: false, reason: "api_error", detail: `${err.status ?? ""} ${err.message}`.trim() };
  }
  return { ok: false, reason: "api_error", detail: String(err) };
}
