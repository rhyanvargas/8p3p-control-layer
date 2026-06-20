import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { appendOrgId } from '@/lib/api/query-params';
import type { IngestionLogResponse, IngestionOutcome } from '@/lib/api/types';
import { queryKeys } from '@/lib/query-client';

const REFETCH_INTERVAL_MS = 30_000;
export const INGESTION_PAGE_SIZE = 25;

export type IngestionLogQueryOptions = {
  outcome?: IngestionOutcome;
  cursor?: string | null;
  limit?: number;
};

export async function fetchIngestionLogPage(
  orgId: string,
  options: IngestionLogQueryOptions = {}
): Promise<IngestionLogResponse> {
  const qs = new URLSearchParams({
    limit: String(options.limit ?? INGESTION_PAGE_SIZE),
  });
  appendOrgId(qs, orgId);
  if (options.outcome) qs.set('outcome', options.outcome);
  if (options.cursor) qs.set('cursor', options.cursor);

  return apiFetch<IngestionLogResponse>(`/v1/ingestion?${qs.toString()}`);
}

export function useIngestionLog(orgId: string, options: IngestionLogQueryOptions = {}) {
  const outcomeKey = options.outcome ?? 'all';
  const cursorKey = options.cursor ?? 'start';

  return useQuery({
    queryKey: queryKeys.ingestionLog(orgId, outcomeKey, cursorKey),
    queryFn: () => fetchIngestionLogPage(orgId, options),
    refetchInterval: REFETCH_INTERVAL_MS,
    enabled: !!orgId,
  });
}
