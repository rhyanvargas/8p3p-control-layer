import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import type { LearnerStateResponse } from '@/api/types';

export function useLearnerState(orgId: string, learnerRef: string) {
  return useQuery({
    queryKey: ['learner-state', orgId, learnerRef],
    queryFn: () =>
      apiFetch<LearnerStateResponse>(
        `/v1/state?org_id=${encodeURIComponent(orgId)}&learner=${encodeURIComponent(learnerRef)}`
      ),
    refetchInterval: 30_000,
    enabled: !!learnerRef && !!orgId,
  });
}
