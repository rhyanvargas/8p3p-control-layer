'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';

import { getDecisionFeedback } from '@/lib/decision-feedback';
import type { LearnerSummaryResponse } from '@/lib/api/types';
import { queryClient, queryKeys } from '@/lib/query-client';

const FEEDBACK_STALE_TIME_MS = 30_000;

function isUrgentDecisionType(decisionType: string): boolean {
  return decisionType === 'intervene' || decisionType === 'pause';
}

/** Urgent decision IDs from all learner summaries (for parallel feedback GET). */
export function collectUrgentDecisionIds(summaries: LearnerSummaryResponse[]): string[] {
  const ids = new Set<string>();
  for (const summary of summaries) {
    for (const decision of summary.recent_decisions) {
      if (isUrgentDecisionType(decision.decision_type)) {
        ids.add(decision.decision_id);
      }
    }
  }
  return [...ids];
}

export function invalidateDecisionFeedbackQuery(decisionId: string): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.decisionFeedback(decisionId),
  });
}

/**
 * Parallel GET feedback/latest_action for urgent decisions.
 * On per-decision GET failure, that ID falls back to local review store only (P2-F08).
 */
export function useFeedbackStatusForDecisionIds(decisionIds: string[]) {
  const feedbackQueries = useQueries({
    queries: decisionIds.map((decisionId) => ({
      queryKey: queryKeys.decisionFeedback(decisionId),
      queryFn: () => getDecisionFeedback(decisionId),
      staleTime: FEEDBACK_STALE_TIME_MS,
      enabled: decisionIds.length > 0,
    })),
  });

  const serverReviewedIds = useMemo(() => {
    const reviewed = new Set<string>();
    for (let index = 0; index < decisionIds.length; index++) {
      const query = feedbackQueries[index];
      if (!query || query.isError) continue;
      if (query.data?.latest_action != null) {
        reviewed.add(decisionIds[index]!);
      }
    }
    return reviewed;
  }, [decisionIds, feedbackQueries]);

  const latestActionByDecisionId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (let index = 0; index < decisionIds.length; index++) {
      const query = feedbackQueries[index];
      if (!query || query.isError || !query.data) continue;
      map.set(decisionIds[index]!, query.data.latest_action);
    }
    return map;
  }, [decisionIds, feedbackQueries]);

  return { serverReviewedIds, latestActionByDecisionId, feedbackQueries };
}

export function useDecisionFeedbackStatus(summaries: LearnerSummaryResponse[]) {
  const decisionIds = useMemo(() => collectUrgentDecisionIds(summaries), [summaries]);

  const { serverReviewedIds, latestActionByDecisionId, feedbackQueries } =
    useFeedbackStatusForDecisionIds(decisionIds);

  return { serverReviewedIds, decisionIds, feedbackQueries, latestActionByDecisionId };
}
