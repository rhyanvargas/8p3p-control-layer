'use client';

import { AlertCircle } from 'lucide-react';

import { LearnerDetailSheet } from '@/app/(dashboard)/learners/_components/learner-detail-sheet';
import { DecisionBadge } from '@/components/shared/decision-badge';
import { LearnerCard } from '@/components/shared/LearnerCard';
import { UrgencyBadge } from '@/components/shared/urgency-badge';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { useLearnerList } from '@/hooks/use-learner-list';
import { useOrgLearnerSummaries } from '@/hooks/use-learner-summary';
import {
  decisionTypePriority,
  rankSummaryAttention,
} from '@/lib/attention-decisions';
import { buildLearnerRosterRows, type LearnerRosterRow } from '@/lib/learners';
import { skillDisplayLine } from '@/lib/panel-helpers';
import { useMemo, useState } from 'react';

function decisionNarration(decisionType: string): string {
  if (decisionType === 'intervene') return 'high urgency decision';
  if (decisionType === 'pause') return 'high decay risk';
  return 'needs attention';
}

type WhoNeedsAttentionProps = {
  orgId: string;
};

export function WhoNeedsAttention({ orgId }: WhoNeedsAttentionProps) {
  const [selected, setSelected] = useState<LearnerRosterRow | null>(null);

  const listQuery = useLearnerList(orgId);
  const summariesQuery = useOrgLearnerSummaries(orgId, { recentDecisionsLimit: 5 });

  const isLoading = listQuery.isLoading || summariesQuery.isLoading;
  const isError = listQuery.isError || summariesQuery.isError;
  const error = listQuery.error ?? summariesQuery.error;

  const refetch = () => {
    void listQuery.refetch();
    summariesQuery.refetch();
  };

  const rosterByRef = useMemo(() => {
    const rows = buildLearnerRosterRows(
      listQuery.data?.learners ?? [],
      summariesQuery.summaries
    );
    return new Map(rows.map((row) => [row.learner_reference, row]));
  }, [listQuery.data?.learners, summariesQuery.summaries]);

  const ranked = useMemo(
    () => rankSummaryAttention(summariesQuery.summaries),
    [summariesQuery.summaries]
  );

  const rows = ranked.slice(0, 5);
  const more = Math.max(0, ranked.length - rows.length);

  return (
    <section aria-labelledby="who-needs-attention-heading" className="flex flex-col gap-4">
      <div>
        <h2
          id="who-needs-attention-heading"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <AlertCircle className="text-[var(--urgency-high)] size-5" aria-hidden="true" />
          Who needs help now
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Learners with recent intervene or pause decisions, ordered by urgency.
        </p>
      </div>

      {isLoading ? (
        <LoadingState variant="list" count={3} />
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          message="All caught up — no learners need attention."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => {
            const skillLine = skillDisplayLine(row.dominantSkill);
            const decisionType = row.decision.decision_type;
            const rosterRow = rosterByRef.get(row.learner_reference);

            return (
              <button
                key={`${row.decision.decision_id}-who`}
                type="button"
                className="text-left"
                onClick={() => {
                  if (rosterRow) setSelected(rosterRow);
                }}
              >
                <LearnerCard
                  learnerRef={row.learner_reference}
                  headerRight={
                    <UrgencyBadge priority={decisionTypePriority(decisionType)} />
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <DecisionBadge type={decisionType} />
                    <span className="text-muted-foreground text-sm">
                      {row.decision.educator_summary ||
                        decisionNarration(decisionType)}
                    </span>
                  </div>
                  {skillLine ? (
                    <p className="text-foreground text-sm">{skillLine}</p>
                  ) : null}
                </LearnerCard>
              </button>
            );
          })}
          {more > 0 ? (
            <p className="text-muted-foreground text-center text-xs">
              + {more} more learners
            </p>
          ) : null}
        </div>
      )}

      <LearnerDetailSheet
        learner={selected}
        orgId={orgId}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}
