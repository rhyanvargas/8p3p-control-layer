import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import type { SignalsResponse, StateListResponse } from '@/api/types';

const SIGNAL_LOOKBACK_DAYS = 30;
const MAX_LEARNERS_FOR_SIGNALS = 15;

async function fetchLearnerRefs(orgId: string): Promise<string[]> {
  const refs: string[] = [];
  let cursor: string | null = null;
  for (;;) {
    const qs = new URLSearchParams({ org_id: orgId, limit: '200' });
    if (cursor) qs.set('cursor', cursor);
    const page = await apiFetch<StateListResponse>(`/v1/state/list?${qs.toString()}`);
    refs.push(...page.learners.map((l) => l.learner_reference));
    cursor = page.next_cursor;
    if (!cursor || refs.length >= MAX_LEARNERS_FOR_SIGNALS) break;
  }
  return refs.slice(0, MAX_LEARNERS_FOR_SIGNALS);
}

async function fetchSignalsOneLearner(
  orgId: string,
  learnerRef: string,
  from_time: string,
  to_time: string
): Promise<SignalsResponse['signals']> {
  const out: SignalsResponse['signals'] = [];
  let page_token: string | undefined;
  for (;;) {
    const qs = new URLSearchParams({
      org_id: orgId,
      learner_reference: learnerRef,
      from_time,
      to_time,
      page_size: '100',
    });
    if (page_token) qs.set('page_token', page_token);
    const page = await apiFetch<SignalsResponse>(`/v1/signals?${qs.toString()}`);
    out.push(...page.signals);
    if (!page.next_page_token) break;
    page_token = page.next_page_token;
  }
  return out;
}

/** Sampled org signal history (bounded fan-out) for optional panel context. */
export function useSignals(orgId: string) {
  return useQuery({
    queryKey: ['signals', orgId],
    queryFn: async () => {
      const to = new Date();
      const from = new Date(to.getTime() - SIGNAL_LOOKBACK_DAYS * 86_400_000);
      const from_time = from.toISOString();
      const to_time = to.toISOString();
      const refs = await fetchLearnerRefs(orgId);
      const chunks = await Promise.all(
        refs.map((ref) => fetchSignalsOneLearner(orgId, ref, from_time, to_time))
      );
      return {
        org_id: orgId,
        signals: chunks.flat(),
      };
    },
    refetchInterval: 30_000,
    enabled: !!orgId,
  });
}
