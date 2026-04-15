import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import type { StateListResponse } from '@/api/types';

export function useLearnerList(orgId: string) {
  return useQuery({
    queryKey: ['learner-list', orgId],
    queryFn: async () => {
      const learners: StateListResponse['learners'] = [];
      let cursor: string | null = null;
      let org_id = orgId;
      for (;;) {
        const qs = new URLSearchParams({ org_id: orgId, limit: '500' });
        if (cursor) qs.set('cursor', cursor);
        const page = await apiFetch<StateListResponse>(`/v1/state/list?${qs.toString()}`);
        org_id = page.org_id;
        learners.push(...page.learners);
        cursor = page.next_cursor;
        if (!cursor) break;
      }
      return { org_id, learners };
    },
    refetchInterval: 30_000,
    enabled: !!orgId,
  });
}
