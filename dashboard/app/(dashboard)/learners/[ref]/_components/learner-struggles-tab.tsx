'use client';

import { AlertTriangle, CheckCircle } from 'lucide-react';

import { LearnerCard } from '@/components/shared/LearnerCard';
import { ProgressBadge } from '@/components/shared/ProgressBadge';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { useLearnerState } from '@/hooks/use-learner-states';
import { buildStabilityRationale } from '@/lib/rationale-builder';
import { levelRank, scoreToLevel } from '@/lib/score-levels';
import { extractSkillRows } from '@/lib/state-skills';

type LearnerStrugglesTabProps = {
  orgId: string;
  learnerRef: string;
};

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

  type Struggle = {
    key: string;
    skillName: string;
    direction: string;
    quote: string;
  };

  type Progress = {
    key: string;
    skillName: string;
    transition: string;
  };

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

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-[var(--urgency-medium)] size-4" aria-hidden="true" />
          <h2 className="text-sm font-medium">What do they need help with?</h2>
        </div>
        <p className="text-muted-foreground text-sm">
          Per-skill stability from full state — skills where support may be needed.
        </p>
        {struggles.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {struggles.map((issue) => (
              <LearnerCard key={issue.key} learnerRef={learnerRef}>
                <p className="text-sm font-medium">
                  {issue.skillName}: stability {issue.direction}
                </p>
                <blockquote className="border-muted-foreground/30 text-muted-foreground border-l-2 pl-3 text-sm italic">
                  {issue.quote}
                </blockquote>
              </LearnerCard>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No skill struggles detected.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="text-[var(--progress-improved)] size-4" aria-hidden="true" />
          <h2 className="text-sm font-medium">Did the support work?</h2>
        </div>
        <p className="text-muted-foreground text-sm">
          Skills where mastery is improving and proficiency level increased.
        </p>
        {progress.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {progress.map((row) => (
              <LearnerCard
                key={row.key}
                learnerRef={learnerRef}
                headerRight={<ProgressBadge variant="improving" />}
              >
                <p className="text-sm font-medium">{row.skillName}</p>
                <p className="text-muted-foreground text-sm">{row.transition}</p>
              </LearnerCard>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No progress changes yet.</p>
        )}
      </section>
    </div>
  );
}
