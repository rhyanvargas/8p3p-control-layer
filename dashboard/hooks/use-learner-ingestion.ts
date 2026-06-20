import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { appendOrgId } from '@/lib/api/query-params';
import type { IngestionLogEntry, IngestionLogResponse } from '@/lib/api/types';
import { queryKeys } from '@/lib/query-client';

const REFETCH_INTERVAL_MS = 30_000;
const FETCH_LIMIT = 200;

export async function fetchLearnerIngestion(
  orgId: string,
  learnerRef: string,
  maxEntries = 3
): Promise<IngestionLogEntry[]> {
  const qs = new URLSearchParams({ limit: String(FETCH_LIMIT) });
  appendOrgId(qs, orgId);

  const page = await apiFetch<IngestionLogResponse>(
    `/v1/ingestion?${qs.toString()}`
  );

  return page.entries
    .filter((entry) => entry.learner_reference === learnerRef)
    .slice(0, maxEntries);
}

export function useLearnerIngestion(
  orgId: string,
  learnerRef: string,
  maxEntries = 3
) {
  return useQuery({
    queryKey: queryKeys.learnerIngestion(orgId, learnerRef),
    queryFn: () => fetchLearnerIngestion(orgId, learnerRef, maxEntries),
    refetchInterval: REFETCH_INTERVAL_MS,
    enabled: !!orgId && !!learnerRef,
  });
}
