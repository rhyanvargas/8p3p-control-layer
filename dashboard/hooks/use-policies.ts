import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { appendOrgId } from '@/lib/api/query-params';
import type { PolicyDetailResponse, PolicyListResponse } from '@/lib/api/types';
import { queryKeys } from '@/lib/query-client';

const REFETCH_INTERVAL_MS = 60_000;

export async function fetchPolicies(orgId: string): Promise<PolicyListResponse> {
  const qs = new URLSearchParams();
  appendOrgId(qs, orgId);
  return apiFetch<PolicyListResponse>(`/v1/policies?${qs.toString()}`);
}

export async function fetchPolicyDetail(
  orgId: string,
  policyKey: string
): Promise<PolicyDetailResponse> {
  const qs = new URLSearchParams();
  appendOrgId(qs, orgId);
  return apiFetch<PolicyDetailResponse>(
    `/v1/policies/${encodeURIComponent(policyKey)}?${qs.toString()}`
  );
}

export function usePolicies(orgId: string) {
  return useQuery({
    queryKey: queryKeys.policies(orgId),
    queryFn: () => fetchPolicies(orgId),
    refetchInterval: REFETCH_INTERVAL_MS,
    enabled: !!orgId,
  });
}

export function usePolicyDetail(orgId: string, policyKey: string) {
  return useQuery({
    queryKey: queryKeys.policyDetail(orgId, policyKey),
    queryFn: () => fetchPolicyDetail(orgId, policyKey),
    refetchInterval: REFETCH_INTERVAL_MS,
    enabled: !!orgId && !!policyKey,
  });
}
