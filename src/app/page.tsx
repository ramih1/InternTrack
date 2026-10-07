import Link from "next/link";
import { ArrowRight, Layers, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { countOpenJobs } from "@/lib/jobs/queries";

export const dynamic = "force-dynamic";

async function safeCount() {
  try {
    return await countOpenJobs();
  } catch {
    return null;
  }
}

export default async function Home() {
  const openJobs = await safeCount();
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <section className="max-w-2xl">
        <p className="text-muted-foreground text-sm font-medium">For students</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
          Every internship and co-op, in one place.
        </h1>
        <p className="text-muted-foreground mt-4 text-lg">
          InternTrack collects internships, co-ops, new-grad roles and student programs from company
          job boards and community lists, merges duplicates, and summarizes each role so you can
          skim fast.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link href="/jobs">
              Browse {openJobs ? openJobs.toLocaleString() : ""} open roles <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Create an account</Link>
          </Button>
        </div>
      </section>

      <section className="mt-16 grid gap-6 sm:grid-cols-3">
        {[
          {
            icon: Layers,
            title: "De-duplicated",
            body: "The same role found on several sites shows up once, with every source linked.",
          },
          {
            icon: Sparkles,
            title: "AI summaries",
            body: "Claude extracts term, pay, eligibility and a two-line summary from each posting.",
          },
          {
            icon: RefreshCw,
            title: "Refreshed daily",
            body: "Listings are re-checked every day, and closed roles drop off the board.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border p-5">
            <Icon className="text-muted-foreground size-5" aria-hidden />
            <h2 className="mt-3 font-medium">{title}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
