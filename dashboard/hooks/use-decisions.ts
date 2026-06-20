import { useQuery } from '@tanstack/react-query';
import { fetchOrgDecisions } from '@/lib/api/fetch-org-decisions';
import type { Decision } from '@/lib/api/types';
import { queryKeys } from '@/lib/query-client';

export function useDecisions(orgId: string) {
  return useQuery({
    queryKey: queryKeys.decisions(orgId),
    queryFn: (): Promise<Decision[]> => fetchOrgDecisions(orgId),
    refetchInterval: 30_000,
    enabled: !!orgId,
  });
}
