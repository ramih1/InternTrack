import { ScoreBadge, scoreTone } from "@/components/score-badge";
import type { ResumeReview } from "@/lib/tailor/schema";
import { cn } from "@/lib/utils";

export function ReviewPanel({
  review,
  reviewedAt,
}: {
  review: ResumeReview;
  reviewedAt: string | null;
}) {
  return (
    <details className="group rounded-lg border p-3 text-sm" open>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 font-medium">
        Resume rating <ScoreBadge score={review.overall_score} />
        <span className="text-muted-foreground text-xs font-normal">
          {reviewedAt ? `reviewed ${new Date(reviewedAt).toLocaleDateString()}` : ""} · click to{" "}
          <span className="group-open:hidden">expand</span>
          <span className="hidden group-open:inline">collapse</span>
        </span>
      </summary>
      <div className="mt-3 space-y-4">
        <ul className="grid gap-2 sm:grid-cols-2">
          {review.categories.map((c) => (
            <li key={c.name} className="rounded-md border p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{c.name}</span>
                <span
                  className={cn(
                    "rounded px-1.5 text-xs font-semibold tabular-nums",
                    scoreTone(c.score),
                  )}
                >
                  {c.score}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">{c.comment}</p>
            </li>
          ))}
        </ul>
        {review.strengths.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">Strengths</p>
            <ul className="list-disc space-y-1 pl-5">
              {review.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {review.improvements.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">Top fixes</p>
            <ol className="space-y-2">
              {review.improvements.map((i, n) => (
                <li key={n} className="rounded-md border p-2">
                  <p className="font-medium">{i.issue}</p>
                  {i.quote && (
                    <p className="text-muted-foreground mt-1 border-l-2 pl-2 text-xs italic">
                      “{i.quote}”
                    </p>
                  )}
                  <p className="mt-1">{i.suggestion}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
        {review.ats_warnings.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">
              Applicant-tracking (ATS) warnings
            </p>
            <ul className="list-disc space-y-1 pl-5 text-amber-800 dark:text-amber-300">
              {review.ats_warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
