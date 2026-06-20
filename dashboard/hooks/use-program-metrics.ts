import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { appendOrgId } from '@/lib/api/query-params';
import type { ProgramMetricsReport } from '@/lib/api/types';
import { queryKeys } from '@/lib/query-client';

const REFETCH_INTERVAL_MS = 60_000;

export async function fetchProgramMetrics(
  orgId: string,
  from: string,
  to: string
): Promise<ProgramMetricsReport> {
  const qs = new URLSearchParams();
  appendOrgId(qs, orgId);
  qs.set('from', from);
  qs.set('to', to);
  return apiFetch<ProgramMetricsReport>(`/v1/program-metrics?${qs.toString()}`);
}

export function isProgramMetricsUnavailable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.status === 404 || error.status === 409;
}

export function useProgramMetrics(orgId: string, from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.programMetrics(orgId, from, to),
    queryFn: () => fetchProgramMetrics(orgId, from, to),
    refetchInterval: REFETCH_INTERVAL_MS,
    enabled: !!orgId && !!from && !!to,
    retry: (failureCount, error) => {
      if (isProgramMetricsUnavailable(error)) return false;
      return failureCount < 2;
    },
  });
}
