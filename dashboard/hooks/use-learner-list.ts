import { useQuery } from '@tanstack/react-query';
import { fetchLearnerList } from '@/lib/api/fetch-learner-list';
import { queryKeys } from '@/lib/query-client';

export function useLearnerList(orgId: string) {
  return useQuery({
    queryKey: queryKeys.learnerList(orgId),
    queryFn: () => fetchLearnerList(orgId),
    refetchInterval: 30_000,
    enabled: !!orgId,
  });
}
