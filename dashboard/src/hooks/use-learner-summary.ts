import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import type { LearnerSummaryResponse } from '@/api/types';
import { useLearnerList } from '@/hooks/use-learner-list';

const DEFAULT_RECENT_DECISIONS_LIMIT = 10;
const REFETCH_INTERVAL_MS = 30_000;

export interface LearnerSummaryOptions {
  recentDecisionsLimit?: number;
}

export function learnerSummaryQueryKey(
  orgId: string,
  learnerRef: string,
  recentDecisionsLimit = DEFAULT_RECENT_DECISIONS_LIMIT
) {
  return ['learner-summary', orgId, learnerRef, recentDecisionsLimit] as const;
}

export async function fetchLearnerSummary(
  orgId: string,
  learnerRef: string,
  options?: LearnerSummaryOptions
): Promise<LearnerSummaryResponse> {
  const qs = new URLSearchParams({ org_id: orgId });
  const limit = options?.recentDecisionsLimit ?? DEFAULT_RECENT_DECISIONS_LIMIT;
  qs.set('recent_decisions_limit', String(limit));
  return apiFetch<LearnerSummaryResponse>(
    `/v1/learners/${encodeURIComponent(learnerRef)}/summary?${qs.toString()}`
  );
}

export function useLearnerSummary(orgId: string, learnerRef: string, options?: LearnerSummaryOptions) {
  const recentDecisionsLimit = options?.recentDecisionsLimit ?? DEFAULT_RECENT_DECISIONS_LIMIT;
  return useQuery({
    queryKey: learnerSummaryQueryKey(orgId, learnerRef, recentDecisionsLimit),
    queryFn: () => fetchLearnerSummary(orgId, learnerRef, options),
    refetchInterval: REFETCH_INTERVAL_MS,
    enabled: !!orgId && !!learnerRef,
  });
}

/** Org-wide summaries for decision panels (deduplicated per learner via React Query). */
export function useOrgLearnerSummaries(orgId: string, options?: LearnerSummaryOptions) {
  const listQuery = useLearnerList(orgId);
  const recentDecisionsLimit = options?.recentDecisionsLimit ?? DEFAULT_RECENT_DECISIONS_LIMIT;
  const learnerRefs = useMemo(
    () => (listQuery.data?.learners ?? []).map((l) => l.learner_reference),
    [listQuery.data?.learners]
  );

  const summaryQueries = useQueries({
    queries: learnerRefs.map((learnerRef) => ({
      queryKey: learnerSummaryQueryKey(orgId, learnerRef, recentDecisionsLimit),
      queryFn: () => fetchLearnerSummary(orgId, learnerRef, options),
      refetchInterval: REFETCH_INTERVAL_MS,
      enabled: !!orgId && learnerRefs.length > 0,
    })),
  });

  const summaries = useMemo(
    () => summaryQueries.map((q) => q.data).filter((s): s is LearnerSummaryResponse => s != null),
    [summaryQueries]
  );

  const isLoading =
    listQuery.isLoading || (learnerRefs.length > 0 && summaryQueries.some((q) => q.isLoading));
  const isError = listQuery.isError || summaryQueries.some((q) => q.isError);
  const error =
    listQuery.error ??
    summaryQueries.find((q) => q.error)?.error ??
    null;

  const refetch = () => {
    void listQuery.refetch();
    for (const q of summaryQueries) void q.refetch();
  };

  return { summaries, isLoading, isError, error, refetch };
}
