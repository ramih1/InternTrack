/** Metered AI features and their free-plan limits. Paid plans will be added with billing. */
export type UsageKind = "tailor" | "fit_check" | "review" | "parse";
export type Plan = "free" | "unlimited";

export interface Limit {
  count: number;
  windowHours: number;
  /** Shown to users, e.g. "3 per 30 days". */
  label: string;
}

export const FREE_LIMITS: Partial<Record<UsageKind, Limit>> = {
  tailor: { count: 3, windowHours: 30 * 24, label: "3 tailored resumes per 30 days" },
  fit_check: { count: 10, windowHours: 24, label: "10 job fit checks per day" },
};

export interface QuotaStatus {
  allowed: boolean;
  unlimited: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  /** When the oldest counted use leaves the window (next slot frees up), if at the limit. */
  resetsAt: string | null;
}

export function windowStart(limit: Limit, now: Date = new Date()): Date {
  return new Date(now.getTime() - limit.windowHours * 3_600_000);
}

/**
 * Computes quota status from the plan and the timestamps of uses inside the window
 * (newest first or any order).
 */
export function quotaStatus(plan: Plan, kind: UsageKind, usesInWindow: string[]): QuotaStatus {
  const limit = FREE_LIMITS[kind];
  const used = usesInWindow.length;
  if (plan === "unlimited" || !limit) {
    return { allowed: true, unlimited: true, used, limit: null, remaining: null, resetsAt: null };
  }
  const remaining = Math.max(0, limit.count - used);
  let resetsAt: string | null = null;
  if (remaining === 0 && used > 0) {
    const oldest = Math.min(...usesInWindow.map((t) => Date.parse(t)));
    resetsAt = new Date(oldest + limit.windowHours * 3_600_000).toISOString();
  }
  return {
    allowed: remaining > 0,
    unlimited: false,
    used,
    limit: limit.count,
    remaining,
    resetsAt,
  };
}

/** "in 3 hours", "in 12 days" — for limit messages. */
export function formatResetIn(resetsAt: string, now: Date = new Date()): string {
  const ms = Date.parse(resetsAt) - now.getTime();
  if (ms <= 60_000) return "in a minute";
  const hours = ms / 3_600_000;
  if (hours < 1) return `in ${Math.ceil(ms / 60_000)} minutes`;
  if (hours < 48) return `in ${Math.ceil(hours)} hours`;
  return `in ${Math.ceil(hours / 24)} days`;
}

export function limitMessage(kind: UsageKind, status: QuotaStatus, now: Date = new Date()): string {
  const limit = FREE_LIMITS[kind];
  const when = status.resetsAt ? ` More ${formatResetIn(status.resetsAt, now)}.` : "";
  return `You've used your free ${limit?.label ?? "limit"}.${when} Paid plans with more are coming soon.`;
}
