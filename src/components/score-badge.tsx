import { scoreLabel } from "@/lib/matching/results";
import { cn } from "@/lib/utils";

export function scoreTone(score: number) {
  if (score >= 70)
    return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
  if (score >= 50) return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  return "bg-muted text-muted-foreground";
}

export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
        scoreTone(score),
        className,
      )}
      title={scoreLabel(score)}
    >
      {score}
      <span className="font-normal opacity-80">/100</span>
    </span>
  );
}
