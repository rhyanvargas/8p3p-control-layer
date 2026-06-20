import 'server-only';

import { fetchLearnerListWith, type LearnerListResult } from '@/lib/api/fetch-learner-list-core';
import { serverApiFetch } from '@/lib/api/server';

export type { LearnerListResult };

/** Server-side learner roster for RSC first paint. */
export function fetchLearnerListServer(orgId: string): Promise<LearnerListResult> {
  return fetchLearnerListWith(serverApiFetch, orgId);
}
