import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, SearchX } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  filtersToQuery,
  hasActiveFilters,
  PAGE_SIZE,
  parseJobFilters,
  upcomingTerms,
} from "@/lib/jobs/filters";
import { listJobs } from "@/lib/jobs/queries";

import { JobCard } from "./job-card";
import { JobFiltersForm } from "./job-filters";

export const metadata: Metadata = { title: "Job board" };

export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const filters = parseJobFilters(await searchParams);
  const terms = upcomingTerms();
  if (filters.term && !terms.includes(filters.term)) terms.push(filters.term);

  let result: Awaited<ReturnType<typeof listJobs>> | null = null;
  let error: string | null = null;
  try {
    result = await listJobs(filters);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[260px_1fr]">
      <aside className="md:sticky md:top-20 md:self-start">
        <h1 className="mb-4 text-lg font-semibold">Find internships</h1>
        <JobFiltersForm key={filtersToQuery(filters)} filters={filters} terms={terms} />
      </aside>

      <section aria-label="Results" className="min-w-0">
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Couldn&apos;t load listings</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <>
            <p className="text-muted-foreground mb-4 text-sm">
              {result.total.toLocaleString()} open {result.total === 1 ? "role" : "roles"}
              {hasActiveFilters(filters) ? " match your filters" : ""}
            </p>

            {result.jobs.length === 0 ? (
              <div className="flex flex-col items-center rounded-xl border border-dashed py-16 text-center">
                <SearchX className="text-muted-foreground size-8" aria-hidden />
                <p className="mt-3 font-medium">No roles match these filters</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Try widening the location or removing a filter.
                </p>
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/jobs">Clear filters</Link>
                </Button>
              </div>
            ) : (
              <ul className="space-y-3">
                {result.jobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </ul>
            )}

            {totalPages > 1 && (
              <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
                <Button asChild variant="outline" size="sm" aria-disabled={filters.page <= 1}>
                  {filters.page > 1 ? (
                    <Link href={`/jobs${filtersToQuery(filters, { page: filters.page - 1 })}`}>
                      Previous
                    </Link>
                  ) : (
                    <span className="pointer-events-none opacity-50">Previous</span>
                  )}
                </Button>
                <span className="text-muted-foreground text-sm">
                  Page {filters.page} of {totalPages}
                </span>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  aria-disabled={filters.page >= totalPages}
                >
                  {filters.page < totalPages ? (
                    <Link href={`/jobs${filtersToQuery(filters, { page: filters.page + 1 })}`}>
                      Next
                    </Link>
                  ) : (
                    <span className="pointer-events-none opacity-50">Next</span>
                  )}
                </Button>
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  );
}
