'use client';

import { useMemo } from 'react';

import {
  collectUrgentDecisionIds,
  useFeedbackStatusForDecisionIds,
} from '@/hooks/use-decision-feedback-status';
import { useLearnerSummary } from '@/hooks/use-learner-summary';
import { resolveEffectivePendingDecisionId } from '@/lib/attention-decisions';

const RECENT_DECISIONS_LIMIT = 10;

export interface UsePendingReviewForLearnerOptions {
  urlReviewDecisionId?: string;
}

export function usePendingReviewForLearner(
  orgId: string,
  learnerRef: string,
  options?: UsePendingReviewForLearnerOptions
) {
  const summaryQuery = useLearnerSummary(orgId, learnerRef, {
    recentDecisionsLimit: RECENT_DECISIONS_LIMIT,
  });

  const urgentDecisionIds = useMemo(
    () => (summaryQuery.data ? collectUrgentDecisionIds([summaryQuery.data]) : []),
    [summaryQuery.data]
  );

  const { serverReviewedIds, feedbackQueries } =
    useFeedbackStatusForDecisionIds(urgentDecisionIds);

  const isFeedbackLoading =
    urgentDecisionIds.length > 0 && feedbackQueries.some((query) => query.isLoading);

  const isLoading = summaryQuery.isLoading || isFeedbackLoading;

  const effectivePendingDecisionId = useMemo(() => {
    if (!summaryQuery.data || isFeedbackLoading) return null;
    return resolveEffectivePendingDecisionId({
      summary: summaryQuery.data,
      serverReviewedIds,
      urlReviewDecisionId: options?.urlReviewDecisionId,
    });
  }, [
    summaryQuery.data,
    serverReviewedIds,
    isFeedbackLoading,
    options?.urlReviewDecisionId,
  ]);

  return { effectivePendingDecisionId, isLoading, summaryQuery };
}
