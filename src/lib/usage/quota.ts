import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

import {
  FREE_LIMITS,
  quotaStatus,
  siteDailyLimit,
  windowStart,
  type Plan,
  type QuotaStatus,
  type UsageKind,
} from "./limits";

type Supabase = SupabaseClient<Database>;

export async function getPlan(supabase: Supabase, userId: string): Promise<Plan> {
  const { data } = await supabase
    .from("entitlements")
    .select("plan")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.plan === "unlimited" ? "unlimited" : "free";
}

/** The user's quota for a metered feature (RLS scopes the query to their own events). */
export async function getQuota(
  supabase: Supabase,
  userId: string,
  kind: UsageKind,
  knownPlan?: Plan,
): Promise<QuotaStatus> {
  const plan = knownPlan ?? (await getPlan(supabase, userId));
  const limit = FREE_LIMITS[kind];
  if (plan === "unlimited") return quotaStatus(plan, kind, []);
  if (!limit) {
    const status = quotaStatus(plan, kind, []);
    return (await siteLimitReached()) ? { ...status, allowed: false, siteLimited: true } : status;
  }
  const { data, error } = await supabase
    .from("usage_events")
    .select("created_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", windowStart(limit).toISOString())
    .order("created_at", { ascending: false })
    .limit(limit.count + 1);
  if (error) throw new Error(`Couldn't check your usage: ${error.message}`);
  const status = quotaStatus(
    plan,
    kind,
    data.map((r) => r.created_at),
  );
  if (status.allowed && (await siteLimitReached())) {
    return { ...status, allowed: false, siteLimited: true };
  }
  return status;
}

/**
 * Whether free-plan AI use across the whole site has hit the daily limit. The total is only
 * readable with the service role. If it can't be read (e.g. no SUPABASE_SECRET_KEY in local
 * development), this logs and allows the request rather than taking the AI features down.
 */
export async function siteLimitReached(): Promise<boolean> {
  const limit = siteDailyLimit();
  if (limit === null) return false;
  let total: number;
  try {
    const { data, error } = await createAdminClient().rpc("ai_usage_last_24h");
    if (error) throw new Error(error.message);
    total = data;
  } catch (err) {
    console.error(`Couldn't read site-wide AI usage: ${err instanceof Error ? err.message : err}`);
    return false;
  }
  if (total >= limit) console.warn(`Site-wide AI limit reached (${total}/${limit} in 24h).`);
  return total >= limit;
}

/** Records one use of a metered feature after it succeeded. */
export async function recordUsage(supabase: Supabase, userId: string, kind: UsageKind) {
  const { error } = await supabase.from("usage_events").insert({ user_id: userId, kind });
  if (error) console.error(`Failed to record ${kind} usage for ${userId}: ${error.message}`);
}
