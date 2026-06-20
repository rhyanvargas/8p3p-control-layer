import { appendOrgId } from '@/lib/api/query-params';
import type { StateListResponse } from '@/lib/api/types';

const LIST_PAGE_SIZE = 500;

export type LearnerListResult = {
  org_id: string;
  learners: StateListResponse['learners'];
};

type ApiFetcher = <T>(path: string, init?: RequestInit) => Promise<T>;

export async function fetchLearnerListWith(
  fetcher: ApiFetcher,
  orgId: string
): Promise<LearnerListResult> {
  const learners: StateListResponse['learners'] = [];
  let cursor: string | null = null;
  let org_id = orgId;

  for (;;) {
    const qs = new URLSearchParams({ limit: String(LIST_PAGE_SIZE) });
    appendOrgId(qs, orgId);
    if (cursor) qs.set('cursor', cursor);

    const page = await fetcher<StateListResponse>(`/v1/state/list?${qs.toString()}`);
    org_id = page.org_id;
    learners.push(...page.learners);
    cursor = page.next_cursor;
    if (!cursor) break;
  }

  return { org_id, learners };
}
