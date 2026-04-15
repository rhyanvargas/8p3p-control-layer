import { useQuery } from '@tanstack/react-query';
import { fetchOrgDecisions } from '@/api/fetch-org-decisions';
import type { Decision } from '@/api/types';

export function useDecisions(orgId: string) {
  return useQuery({
    queryKey: ['decisions', orgId],
    queryFn: (): Promise<Decision[]> => fetchOrgDecisions(orgId),
    refetchInterval: 30_000,
    enabled: !!orgId,
  });
}
