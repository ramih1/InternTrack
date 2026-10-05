import { NextResponse, type NextRequest } from "next/server";

import { runRefresh } from "@/lib/ingest/refresh";
import { createAdminClient } from "@/lib/supabase/admin";

// Vercel Cron calls this daily (see vercel.json). Hobby/Fluid functions allow up to 300s.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const logs: string[] = [];
  try {
    const stats = await runRefresh({
      supabase: createAdminClient(),
      budgetMs: 270_000,
      aiMaxPerRun: Number(process.env.INGEST_AI_MAX_PER_RUN ?? 100),
      maxAgeDays: Number(process.env.INGEST_MAX_AGE_DAYS ?? 150),
      log: (m) => {
        logs.push(m);
        console.log(m);
      },
    });
    return NextResponse.json({ ok: true, stats, logs });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message, logs }, { status: 500 });
  }
}
