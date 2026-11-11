"use server";

import { revalidatePath } from "next/cache";

import { runMatching } from "@/lib/matching/run";
import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/usage/quota";

export type RefreshMatchesResult = { message: string } | { error: string };

/**
 * Scores the resume against its best keyword matches across all open jobs. Unlimited plan
 * only: free accounts get a score when they open a job, which keeps AI costs bounded.
 */
export async function refreshMatches(resumeId: string): Promise<RefreshMatchesResult> {
  if (!/^[0-9a-f-]{36}$/i.test(resumeId)) return { error: "Unknown resume." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { error: "Sign in to refresh your matches." };
  if ((await getPlan(supabase, userId)) !== "unlimited") {
    return { error: "Refreshing all matches is only available on the unlimited plan." };
  }

  let stats: Awaited<ReturnType<typeof runMatching>>;
  try {
    stats = await runMatching(supabase, resumeId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  console.log(
    `Refreshed matches for ${resumeId}: ${JSON.stringify({ ...stats, usage: undefined })} tokens in=${stats.usage.input} out=${stats.usage.output}`,
  );
  revalidatePath("/matches");
  revalidatePath("/resumes");

  if (stats.candidates === 0) {
    return { message: "No open jobs share keywords with this resume yet." };
  }
  const todo = stats.candidates - stats.alreadyScored;
  if (todo === 0) {
    return {
      message: `Your top ${stats.candidates} keyword matches are already scored. New jobs are added daily.`,
    };
  }
  if (stats.scored === 0) {
    return { error: "Couldn't score jobs right now. Check the AI provider and try again." };
  }
  const parts = [`Scored ${stats.scored} new ${stats.scored === 1 ? "job" : "jobs"}`];
  if (stats.alreadyScored) parts.push(`${stats.alreadyScored} were already scored`);
  if (stats.failedBatches) parts.push(`some jobs failed, so refresh again to retry them`);
  return { message: `${parts.join("; ")}.` };
}
