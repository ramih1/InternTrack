import Link from "next/link";
import { Building2, CalendarClock, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDate, formatPay, formatRelativeDate } from "@/lib/jobs/format";
import { EMPLOYMENT_LABELS, FIELD_LABELS, REMOTE_LABELS } from "@/lib/jobs/labels";
import type { JobListItem } from "@/lib/jobs/queries";

export function JobCard({ job }: { job: JobListItem }) {
  const pay = formatPay(job);
  const locations =
    job.locations.length > 3
      ? `${job.locations.slice(0, 3).join(" · ")} +${job.locations.length - 3} more`
      : job.locations.join(" · ");
  return (
    <li className="group hover:bg-accent/40 relative rounded-xl border p-4 transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="leading-snug font-medium">
            <Link href={`/jobs/${job.id}`} className="after:absolute after:inset-0">
              {job.title}
            </Link>
          </h2>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
            <Building2 className="size-3.5" aria-hidden />
            {job.companies.name}
          </p>
        </div>
        <p
          className="text-muted-foreground shrink-0 text-xs"
          title={
            job.posted_at_source === "first_seen" ? "Date first seen by InternTrack" : "Date posted"
          }
        >
          {job.posted_at_source === "first_seen" ? "Seen " : "Posted "}
          {formatRelativeDate(job.posted_at)}
        </p>
      </div>

      {locations && (
        <p className="mt-2 flex items-start gap-1.5 text-sm">
          <MapPin className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{locations}</span>
        </p>
      )}

      {job.summary && (
        <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">{job.summary}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {job.terms.map((t) => (
          <Badge key={t} variant="secondary">
            {t}
          </Badge>
        ))}
        {job.remote_type !== "unknown" && (
          <Badge variant="outline">{REMOTE_LABELS[job.remote_type]}</Badge>
        )}
        {job.employment_type !== "internship" && (
          <Badge variant="outline">{EMPLOYMENT_LABELS[job.employment_type]}</Badge>
        )}
        {job.field !== "other" && <Badge variant="outline">{FIELD_LABELS[job.field]}</Badge>}
        {pay && <Badge variant="outline">{pay}</Badge>}
        {job.deadline && (
          <Badge variant="outline" className="gap-1">
            <CalendarClock aria-hidden /> Apply by {formatDate(job.deadline)}
          </Badge>
        )}
      </div>
    </li>
  );
}
