import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { appendOrgId } from '@/lib/api/query-params';
import type { PolicyListResponse } from '@/lib/api/types';
import { queryKeys } from '@/lib/query-client';

const REFETCH_INTERVAL_MS = 60_000;

export async function fetchPolicies(orgId: string): Promise<PolicyListResponse> {
  const qs = new URLSearchParams();
  appendOrgId(qs, orgId);
  return apiFetch<PolicyListResponse>(`/v1/policies?${qs.toString()}`);
}

export function usePolicies(orgId: string) {
  return useQuery({
    queryKey: queryKeys.policies(orgId),
    queryFn: () => fetchPolicies(orgId),
    refetchInterval: REFETCH_INTERVAL_MS,
    enabled: !!orgId,
  });
}
