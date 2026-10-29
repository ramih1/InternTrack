import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  FREE_LIMITS,
  quotaStatus,
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
  if (plan === "unlimited" || !limit) return quotaStatus(plan, kind, []);
  const { data, error } = await supabase
    .from("usage_events")
    .select("created_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", windowStart(limit).toISOString())
    .order("created_at", { ascending: false })
    .limit(limit.count + 1);
  if (error) throw new Error(`Couldn't check your usage: ${error.message}`);
  return quotaStatus(
    plan,
    kind,
    data.map((r) => r.created_at),
  );
}

/** Records one use of a metered feature after it succeeded. */
export async function recordUsage(supabase: Supabase, userId: string, kind: UsageKind) {
  const { error } = await supabase.from("usage_events").insert({ user_id: userId, kind });
  if (error) console.error(`Failed to record ${kind} usage for ${userId}: ${error.message}`);
}
