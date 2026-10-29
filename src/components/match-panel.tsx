import { ScoreBadge } from "@/components/score-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { scoreLabel, type MatchReasons } from "@/lib/matching/results";

export interface MatchView {
  score: number;
  reasons: MatchReasons;
  resumeLabel: string;
}

export function MatchPanel({ match }: { match: MatchView }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Your match <ScoreBadge score={match.score} />
          <span className="text-muted-foreground text-sm font-normal">
            {scoreLabel(match.score)} · {match.resumeLabel}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>{match.reasons.explanation}</p>
        {match.reasons.matched_skills.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1.5 text-xs font-medium">You have</p>
            <div className="flex flex-wrap gap-1.5">
              {match.reasons.matched_skills.map((s) => (
                <Badge key={s} variant="secondary">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {match.reasons.missing_skills.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1.5 text-xs font-medium">Not on your resume</p>
            <div className="flex flex-wrap gap-1.5">
              {match.reasons.missing_skills.map((s) => (
                <Badge key={s} variant="outline">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {match.reasons.eligibility_issues.length > 0 && (
          <ul className="text-destructive list-disc space-y-1 pl-5">
            {match.reasons.eligibility_issues.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
