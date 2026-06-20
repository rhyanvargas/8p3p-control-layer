import { apiFetch } from '@/lib/api/client';
import {
  fetchLearnerListWith,
  type LearnerListResult,
} from '@/lib/api/fetch-learner-list-core';

export type { LearnerListResult };

/** Client-side learner roster via the same-origin proxy. */
export function fetchLearnerList(orgId: string): Promise<LearnerListResult> {
  return fetchLearnerListWith(apiFetch, orgId);
}
