import { apiFetch } from './client';
import { appendOrgId } from './query-params';
import type { Decision, GetDecisionsResponse, StateListResponse } from './types';

const DECISION_LOOKBACK_DAYS = 365;
const LIST_PAGE_SIZE = 500;
const DECISION_PAGE_SIZE = 250;

type ApiFetcher = <T>(path: string, init?: RequestInit) => Promise<T>;

function decisionWindow(): { from_time: string; to_time: string } {
  const to = new Date();
  const from = new Date(to.getTime() - DECISION_LOOKBACK_DAYS * 86_400_000);
  return { from_time: from.toISOString(), to_time: to.toISOString() };
}

async function fetchAllLearnerRefs(
  fetcher: ApiFetcher,
  orgId: string
): Promise<string[]> {
  const refs: string[] = [];
  let cursor: string | null = null;
  for (;;) {
    const qs = new URLSearchParams({ limit: String(LIST_PAGE_SIZE) });
    appendOrgId(qs, orgId);
    if (cursor) qs.set('cursor', cursor);
    const page = await fetcher<StateListResponse>(`/v1/state/list?${qs.toString()}`);
    for (const row of page.learners) {
      refs.push(row.learner_reference);
    }
    cursor = page.next_cursor;
    if (!cursor) break;
  }
  return refs;
}

async function fetchDecisionsForLearner(
  fetcher: ApiFetcher,
  orgId: string,
  learnerRef: string,
  from_time: string,
  to_time: string
): Promise<Decision[]> {
  const out: Decision[] = [];
  let page_token: string | undefined;
  for (;;) {
    const qs = new URLSearchParams({
      learner_reference: learnerRef,
      from_time,
      to_time,
      page_size: String(DECISION_PAGE_SIZE),
    });
    appendOrgId(qs, orgId);
    if (page_token) qs.set('page_token', page_token);
    const page = await fetcher<GetDecisionsResponse>(`/v1/decisions?${qs.toString()}`);
    out.push(...page.decisions);
    if (!page.next_page_token) break;
    page_token = page.next_page_token;
  }
  return out;
}

/** Org-wide decisions via GET /v1/state/list fan-out + per-learner GET /v1/decisions (see docs/guides/get-all-learner-decisions-from-org.md). */
export async function fetchOrgDecisionsWith(
  fetcher: ApiFetcher,
  orgId: string
): Promise<Decision[]> {
  const { from_time, to_time } = decisionWindow();
  const learners = await fetchAllLearnerRefs(fetcher, orgId);
  const pages = await Promise.all(
    learners.map((ref) => fetchDecisionsForLearner(fetcher, orgId, ref, from_time, to_time))
  );
  return pages.flat();
}

/** Browser proxy fetch for TanStack Query hooks. */
export async function fetchOrgDecisions(orgId: string): Promise<Decision[]> {
  return fetchOrgDecisionsWith(apiFetch, orgId);
}
