'use client';

import { useMemo, useState } from 'react';
import { Lightbulb } from 'lucide-react';

import { DecisionBadge } from '@/components/shared/decision-badge';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { Button } from '@/components/ui/button';
import { useOrgLearnerSummaries } from '@/hooks/use-learner-summary';
import { isReviewed, markReviewed } from '@/lib/decision-review';
import { skillDisplayLine } from '@/lib/panel-helpers';
import type { RecentDecisionItem } from '@/lib/api/types';

type PendingReview = {
  learnerRef: string;
  dominantSkill: string | null;
  decision: RecentDecisionItem;
};

const MAX_REVIEW_CARDS = 5;

type DecisionReviewSectionProps = {
  orgId: string;
};

export function DecisionReviewSection({ orgId }: DecisionReviewSectionProps) {
  const { summaries, isLoading, isError, error, refetch } = useOrgLearnerSummaries(orgId);
  const [reviewTick, setReviewTick] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const pending = useMemo(() => {
    void reviewTick;
    const candidates: PendingReview[] = [];
    for (const summary of summaries) {
      const skillField = summary.current_state.fields.skill;
      const dominantSkill =
        typeof skillField === 'string' && skillField.trim() ? skillField : null;
      for (const decision of summary.recent_decisions) {
        if (
          (decision.decision_type === 'intervene' ||
            decision.decision_type === 'pause') &&
          !isReviewed(decision.decision_id)
        ) {
          candidates.push({
            learnerRef: summary.learner_reference,
            dominantSkill,
            decision,
          });
        }
      }
    }
    candidates.sort((a, b) =>
      b.decision.decided_at.localeCompare(a.decision.decided_at)
    );
    return candidates.slice(0, MAX_REVIEW_CARDS);
  }, [summaries, reviewTick]);

  function handleReviewed(decisionId: string) {
    markReviewed(decisionId);
    setReviewTick((n) => n + 1);
  }

  function toggleExpanded(decisionId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(decisionId)) next.delete(decisionId);
      else next.add(decisionId);
      return next;
    });
  }

  return (
    <section aria-labelledby="decision-review-heading" className="flex flex-col gap-4">
      <div>
        <h2
          id="decision-review-heading"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <Lightbulb className="text-[var(--brand-accent-500)] size-5" aria-hidden="true" />
          What should happen next
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Actionable intervene or pause decisions awaiting educator review.
        </p>
      </div>

      {isLoading ? (
        <LoadingState variant="list" count={2} />
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : pending.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          message="All caught up — no pending decisions to review."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map(({ decision, learnerRef, dominantSkill }) => {
            const rationale = decision.rationale ?? '';
            const skillLine = skillDisplayLine(dominantSkill);
            const expanded = expandedIds.has(decision.decision_id);

            return (
              <div
                key={decision.decision_id}
                className="bg-card flex flex-col gap-3 rounded-lg border border-border p-4"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-start gap-2">
                    <DecisionBadge type={decision.decision_type} />
                  </div>
                  {decision.educator_summary ? (
                    <p
                      className="text-foreground text-sm"
                      aria-label="Educator-facing decision summary"
                    >
                      {decision.educator_summary}
                    </p>
                  ) : null}
                </div>
                <p className="text-foreground text-base font-semibold">{learnerRef}</p>
                {skillLine ? (
                  <p className="text-muted-foreground text-sm">{skillLine}</p>
                ) : null}
                <div>
                  <p
                    className={`text-foreground text-sm ${expanded ? '' : 'line-clamp-3'}`}
                    aria-label="Decision rationale"
                  >
                    {rationale || 'No rationale text was provided for this decision.'}
                  </p>
                  {rationale.length > 160 ? (
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto px-0 text-xs"
                      onClick={() => toggleExpanded(decision.decision_id)}
                      aria-expanded={expanded}
                    >
                      {expanded ? 'Show less' : 'Read more'}
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    onClick={() => handleReviewed(decision.decision_id)}
                    aria-label={`Approve decision for ${learnerRef}`}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleReviewed(decision.decision_id)}
                    aria-label={`Reject decision for ${learnerRef}`}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
