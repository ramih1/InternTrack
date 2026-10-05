/**
 * Refresh job listings: fetch all sources, de-duplicate, store, mark closed jobs, and normalize
 * new listings with Claude. Usage:
 *
 *   npm run refresh                 # full refresh
 *   npm run refresh -- --ai-only    # only work through the AI-normalization backlog
 *   npm run refresh -- --no-ai      # skip Claude
 *   npm run refresh -- --ai-max=500 # normalize up to 500 listings
 */
import { runRefresh } from "../src/lib/ingest/refresh";
import { createAdminClient } from "../src/lib/supabase/admin";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

async function main() {
  const aiMax = flag("no-ai")
    ? 0
    : Number(value("ai-max") ?? process.env.INGEST_AI_MAX_PER_RUN ?? 100);
  const stats = await runRefresh({
    supabase: createAdminClient(),
    budgetMs: 60 * 60 * 1000,
    aiMaxPerRun: aiMax,
    maxAgeDays: Number(process.env.INGEST_MAX_AGE_DAYS ?? 150),
    skipFetch: flag("ai-only"),
  });
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
