'use client';

import { AlertTriangle, CheckCircle, Info } from 'lucide-react';

import { ProgressBadge } from '@/components/shared/ProgressBadge';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { useLearnerState } from '@/hooks/use-learner-states';
import { buildStabilityRationale } from '@/lib/rationale-builder';
import { badge, icon } from '@/lib/semantic-colors';
import { levelRank, scoreToLevel } from '@/lib/score-levels';
import { extractSkillRows } from '@/lib/state-skills';
import { cn } from '@/lib/utils';

type LearnerStrugglesTabProps = {
  orgId: string;
  learnerRef: string;
};

type Struggle = {
  key: string;
  skillName: string;
  direction: 'declining' | 'below threshold';
  stabilityPct: number | null;
  quote: string;
};

type Progress = {
  key: string;
  skillName: string;
  transition: string;
};

const SUPPORT_WORKED_TOOLTIP =
  'Shows skills where mastery improved enough to move up a proficiency level (for example, novice → proficient). This is an outcome signal — it does not prove a specific intervention caused the change. Use it to spot where recent support may be paying off.';

function SectionInfoTip({ label, children }: { label: string; children: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="text-muted-foreground hover:text-foreground inline-flex shrink-0 rounded-sm"
        aria-label={`More about ${label}`}
      >
        <Info className="size-3.5" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

function SkillList({
  children,
  empty,
}: {
  children: React.ReactNode;
  empty: boolean;
}) {
  if (empty) return null;
  return (
    <ul className="divide-border bg-card divide-y overflow-hidden rounded-lg border">
      {children}
    </ul>
  );
}

export function LearnerStrugglesTab({ orgId, learnerRef }: LearnerStrugglesTabProps) {
  const stateQuery = useLearnerState(orgId, learnerRef);

  if (stateQuery.isLoading) {
    return <LoadingState variant="list" count={4} />;
  }

  if (stateQuery.isError) {
    return (
      <ErrorState error={stateQuery.error} onRetry={() => stateQuery.refetch()} />
    );
  }

  const body = stateQuery.data;
  if (!body) {
    return <LoadingState variant="list" count={2} />;
  }

  const skillRows = extractSkillRows(body.state);
  const struggles: Struggle[] = [];
  const progress: Progress[] = [];

  for (const row of skillRows) {
    const dir = row.stabilityScore_direction;
    const score = row.stabilityScore;
    const declining = dir === 'declining';
    const low = typeof score === 'number' && score < 0.5;

    if (declining || low) {
      const quote =
        typeof score === 'number'
          ? buildStabilityRationale(score, row.skillName)
          : `Stability trend for ${row.skillName} needs attention.`;
      struggles.push({
        key: `struggle-${row.skillName}`,
        skillName: row.skillName,
        direction: declining ? 'declining' : 'below threshold',
        stabilityPct: typeof score === 'number' ? Math.round(score * 100) : null,
        quote,
      });
    }

    if (row.masteryScore_direction === 'improving') {
      const current = row.masteryScore;
      if (typeof current === 'number') {
        const delta =
          typeof row.masteryScore_delta === 'number' ? row.masteryScore_delta : 0;
        const previous = current - delta;
        const curLevel = scoreToLevel(current);
        const prevLevel = scoreToLevel(previous);
        if (levelRank(curLevel) > levelRank(prevLevel)) {
          progress.push({
            key: `progress-${row.skillName}`,
            skillName: row.skillName,
            transition: `${prevLevel} → ${curLevel}`,
          });
        }
      }
    }
  }

  struggles.sort((a, b) => {
    if (a.direction !== b.direction) {
      return a.direction === 'declining' ? -1 : 1;
    }
    const aPct = a.stabilityPct ?? 100;
    const bPct = b.stabilityPct ?? 100;
    return aPct - bPct;
  });

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-labelledby="struggles-heading">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`${icon.warning} size-4`} aria-hidden="true" />
          <h2 id="struggles-heading" className="text-sm font-medium">
            What do they need help with?
          </h2>
          <SectionInfoTip label="What do they need help with?">
            Skills where stability is declining or below 50%. These are the best places to
            focus reinforcement or check-ins.
          </SectionInfoTip>
          {struggles.length > 0 ? (
            <span className="text-muted-foreground ml-auto text-xs tabular-nums">
              {struggles.length} skill{struggles.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>

        {struggles.length > 0 ? (
          <SkillList empty={false}>
            {struggles.map((issue) => (
              <li
                key={issue.key}
                className="hover:bg-muted/40 flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium">{issue.skillName}</p>
                  <p className="text-muted-foreground text-sm">{issue.quote}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {issue.stabilityPct != null ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        issue.stabilityPct < 50 ? badge.warning : badge.neutral,
                        'tabular-nums'
                      )}
                    >
                      {issue.stabilityPct}% stable
                    </Badge>
                  ) : null}
                  {issue.direction === 'declining' ? (
                    <ProgressBadge variant="declining" />
                  ) : (
                    <Badge variant="outline" className={badge.warning}>
                      Below threshold
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </SkillList>
        ) : (
          <p className="text-muted-foreground text-sm">No skill struggles detected.</p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="progress-heading">
        <div className="flex items-center gap-2">
          <CheckCircle className={`${icon.success} size-4`} aria-hidden="true" />
          <h2 id="progress-heading" className="text-sm font-medium">
            Did the support work?
          </h2>
          <SectionInfoTip label="Did the support work?">
            {SUPPORT_WORKED_TOOLTIP}
          </SectionInfoTip>
          {progress.length > 0 ? (
            <span className="text-muted-foreground ml-auto text-xs tabular-nums">
              {progress.length} skill{progress.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>

        {progress.length > 0 ? (
          <SkillList empty={false}>
            {progress.map((row) => (
              <li
                key={row.key}
                className="hover:bg-muted/40 flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <p className="min-w-0 text-sm font-medium">{row.skillName}</p>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-sm capitalize">
                    {row.transition}
                  </span>
                  <ProgressBadge variant="improving" />
                </div>
              </li>
            ))}
          </SkillList>
        ) : (
          <p className="text-muted-foreground text-sm">
            No proficiency-level gains yet. Level-ups will appear here when mastery improves
            enough to cross a band.
          </p>
        )}
      </section>
    </div>
  );
}
