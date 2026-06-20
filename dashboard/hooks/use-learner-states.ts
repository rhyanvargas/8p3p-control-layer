import { useQueries, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { appendOrgId } from '@/lib/api/query-params';
import type { LearnerStateResponse } from '@/lib/api/types';
import { queryKeys } from '@/lib/query-client';

const REFETCH_INTERVAL_MS = 30_000;

export function learnerStateQueryKey(orgId: string, learnerRef: string, version?: number) {
  return queryKeys.learnerState(orgId, learnerRef, version);
}

export async function fetchLearnerState(
  orgId: string,
  learnerRef: string,
  version?: number
): Promise<LearnerStateResponse> {
  const qs = new URLSearchParams({
    learner_reference: learnerRef,
  });
  appendOrgId(qs, orgId);
  if (version != null) qs.set('version', String(version));
  return apiFetch<LearnerStateResponse>(`/v1/state?${qs.toString()}`);
}

export function useLearnerState(
  orgId: string,
  learnerRef: string,
  version?: number
) {
  return useQuery({
    queryKey: learnerStateQueryKey(orgId, learnerRef, version),
    queryFn: () => fetchLearnerState(orgId, learnerRef, version),
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
