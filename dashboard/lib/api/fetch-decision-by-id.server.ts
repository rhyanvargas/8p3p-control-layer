import 'server-only';

import { fetchOrgDecisionsServer } from '@/lib/api/fetch-org-decisions.server';
import { findDecisionById } from '@/lib/decision-trace';
import type { Decision } from '@/lib/api/types';

/** Resolve a decision from the org-wide fan-out (no GET-by-id endpoint). */
export async function fetchDecisionByIdServer(
  orgId: string,
  decisionId: string
): Promise<Decision | null> {
  const decisions = await fetchOrgDecisionsServer(orgId);
  return findDecisionById(decisions, decisionId) ?? null;
}
