import { useQueries, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import type { LearnerStateResponse } from '@/api/types';

const REFETCH_INTERVAL_MS = 30_000;

export function learnerStateQueryKey(orgId: string, learnerRef: string) {
  return ['learner-state', orgId, learnerRef] as const;
}

export async function fetchLearnerState(
  orgId: string,
  learnerRef: string
): Promise<LearnerStateResponse> {
  return apiFetch<LearnerStateResponse>(
    `/v1/state?org_id=${encodeURIComponent(orgId)}&learner_reference=${encodeURIComponent(learnerRef)}`
  );
}

export function useLearnerState(orgId: string, learnerRef: string) {
  return useQuery({
    queryKey: learnerStateQueryKey(orgId, learnerRef),
    queryFn: () => fetchLearnerState(orgId, learnerRef),
    refetchInterval: REFETCH_INTERVAL_MS,
    enabled: !!learnerRef && !!orgId,
  });
}

/** Per-learner state reads for Panels 2/4 (deduplicated via React Query). */
export function useLearnerStates(orgId: string, learnerRefs: string[]) {
  const queries = useQueries({
    queries: learnerRefs.map((learnerRef) => ({
      queryKey: learnerStateQueryKey(orgId, learnerRef),
      queryFn: () => fetchLearnerState(orgId, learnerRef),
      refetchInterval: REFETCH_INTERVAL_MS,
      enabled: !!orgId && learnerRefs.length > 0,
    })),
  });

  const isLoading = learnerRefs.length > 0 && queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);
  const error = queries.find((q) => q.error)?.error ?? null;

  const refetch = () => {
    for (const q of queries) void q.refetch();
  };

  return { queries, isLoading, isError, error, refetch };
}
