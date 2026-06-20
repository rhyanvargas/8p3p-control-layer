import 'server-only';

import { fetchOrgDecisionsWith } from '@/lib/api/fetch-org-decisions';
import { serverApiFetch } from '@/lib/api/server';

/** Server-side org decisions for RSC first paint. */
export function fetchOrgDecisionsServer(orgId: string) {
  return fetchOrgDecisionsWith(serverApiFetch, orgId);
}
