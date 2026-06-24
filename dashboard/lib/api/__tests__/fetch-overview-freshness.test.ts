import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/fetch-learner-list.server', () => ({
  fetchLearnerListServer: vi.fn(),
}));

vi.mock('@/lib/api/fetch-org-decisions.server', () => ({
  fetchOrgDecisionsServer: vi.fn(),
}));

vi.mock('@/lib/api/server', () => ({
  serverApiFetch: vi.fn(),
}));

import { getOverviewData } from '@/lib/api/fetch-overview-data.server';
import { fetchLearnerListServer } from '@/lib/api/fetch-learner-list.server';
import { fetchOrgDecisionsServer } from '@/lib/api/fetch-org-decisions.server';
import { serverApiFetch } from '@/lib/api/server';

describe('FRSH-001: getOverviewData returns fetchedAt', () => {
  beforeEach(() => {
    vi.mocked(fetchLearnerListServer).mockResolvedValue({
      org_id: 'test-org',
      learners: [{ learner_reference: 'learner-1', state_version: 1, updated_at: new Date().toISOString() }],
    });
    vi.mocked(fetchOrgDecisionsServer).mockResolvedValue([]);
    vi.mocked(serverApiFetch).mockImplementation(async (path: string) => {
      if (path.startsWith('/v1/ingestion')) {
        return { entries: [], next_cursor: null };
      }
      return {
        org_id: 'test-org',
        learner_reference: 'learner-1',
        state_id: 'state-1',
        state_version: 1,
        updated_at: new Date().toISOString(),
        state: { masteryScore: 0.5 },
        provenance: {},
      };
    });
  });

  it('includes fetchedAt as an ISO timestamp on OverviewData', async () => {
    const before = Date.now();
    const data = await getOverviewData(`test-org-${before}`);
    const after = Date.now();

    expect(data.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    const fetchedMs = Date.parse(data.fetchedAt);
    expect(fetchedMs).toBeGreaterThanOrEqual(before);
    expect(fetchedMs).toBeLessThanOrEqual(after);
    expect(data.orgId).toBe(`test-org-${before}`);
  });
});
