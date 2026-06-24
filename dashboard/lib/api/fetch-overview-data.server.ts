import 'server-only';

import { cache } from 'react';

import { fetchLearnerListServer } from '@/lib/api/fetch-learner-list.server';
import { fetchOrgDecisionsServer } from '@/lib/api/fetch-org-decisions.server';
import { appendOrgId } from '@/lib/api/query-params';
import { serverApiFetch } from '@/lib/api/server';
import type {
  IngestionLogEntry,
  IngestionLogResponse,
  LearnerStateResponse,
} from '@/lib/api/types';
import {
  computeOverviewKpis,
  computeRecentDecisions,
  type OverviewKpis,
} from '@/lib/overview-metrics';
import type { Decision } from '@/lib/api/types';

const INGESTION_PAGE_SIZE = 500;
const IMPROVING_STATE_SAMPLE = 50;

async function fetchIngestionEntries(orgId: string): Promise<IngestionLogEntry[]> {
  const entries: IngestionLogEntry[] = [];
  let cursor: string | null = null;

  for (;;) {
    const qs = new URLSearchParams({ limit: String(INGESTION_PAGE_SIZE) });
    appendOrgId(qs, orgId);
    if (cursor) qs.set('cursor', cursor);

    const page = await serverApiFetch<IngestionLogResponse>(
      `/v1/ingestion?${qs.toString()}`
    );
    entries.push(...page.entries);
    cursor = page.next_cursor;
    if (!cursor) break;
  }

  return entries;
}

async function fetchLearnerStatesSample(
  orgId: string,
  learnerRefs: string[]
): Promise<LearnerStateResponse[]> {
  const sample = learnerRefs.slice(0, IMPROVING_STATE_SAMPLE);
  const results = await Promise.all(
    sample.map(async (learnerRef) => {
      const qs = new URLSearchParams({ learner_reference: learnerRef });
      appendOrgId(qs, orgId);
      return serverApiFetch<LearnerStateResponse>(`/v1/state?${qs.toString()}`);
    })
  );
  return results;
}

export type OverviewData = {
  orgId: string;
  fetchedAt: string;
  kpis: OverviewKpis;
  decisions: Decision[];
  recentDecisions: Decision[];
  learnerStates: LearnerStateResponse[];
  ingestionToday: IngestionLogEntry[];
};

export const getOverviewData = cache(async (orgId: string): Promise<OverviewData> => {
  const [learnerList, decisions, ingestionEntries] = await Promise.all([
    fetchLearnerListServer(orgId),
    fetchOrgDecisionsServer(orgId),
    fetchIngestionEntries(orgId),
  ]);

  const learnerRefs = learnerList.learners.map((l) => l.learner_reference);
  const learnerStates = await fetchLearnerStatesSample(orgId, learnerRefs);

  const ingestionToday = ingestionEntries.filter((entry) => {
    const todayKey = new Date().toISOString().slice(0, 10);
    return entry.received_at.slice(0, 10) === todayKey;
  });

  const kpis = computeOverviewKpis(decisions, ingestionToday, learnerStates);
  const recentDecisions = computeRecentDecisions(decisions);

  return {
    orgId,
    fetchedAt: new Date().toISOString(),
    kpis,
    decisions,
    recentDecisions,
    learnerStates,
    ingestionToday,
  };
});
