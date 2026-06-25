import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DecisionReviewRecord } from '@/lib/decision-review';

const LEGACY_KEY = '8p3p-reviewed-decisions';
const V1_KEY = '8p3p-review-log:v1';

function sampleRecord(overrides: Partial<DecisionReviewRecord> = {}): DecisionReviewRecord {
  return {
    decisionId: 'dec-001',
    action: 'approve',
    learnerReference: 'Malosi',
    decisionType: 'intervene',
    reviewedAt: new Date().toISOString(),
    source: 'local',
    ...overrides,
  };
}

describe('decision-review store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  async function loadStore() {
    return import('@/lib/decision-review');
  }

  describe('REVIEW-UX-001', () => {
    it('recordReview + isReviewedLocally excludes reviewed ID from membership', async () => {
      const { recordReview, isReviewedLocally } = await loadStore();

      expect(isReviewedLocally('dec-001')).toBe(false);

      recordReview(sampleRecord());

      expect(isReviewedLocally('dec-001')).toBe(true);
      expect(isReviewedLocally('dec-other')).toBe(false);
    });
  });

  describe('REVIEW-UX-002', () => {
    it('migrates legacy key to v1 and removes legacy key', async () => {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(['legacy-dec-1', 'legacy-dec-2']));

      const { isReviewedLocally } = await loadStore();

      expect(isReviewedLocally('legacy-dec-1')).toBe(true);
      expect(isReviewedLocally('legacy-dec-2')).toBe(true);
      expect(localStorage.getItem(LEGACY_KEY)).toBeNull();

      const v1Raw = localStorage.getItem(V1_KEY);
      expect(v1Raw).not.toBeNull();

      const records = JSON.parse(v1Raw!) as DecisionReviewRecord[];
      expect(records).toHaveLength(2);
      expect(records[0]).toMatchObject({
        decisionId: 'legacy-dec-1',
        action: 'approve',
        learnerReference: '',
        decisionType: 'intervene',
        source: 'legacy',
      });
      expect(records[0]?.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('REVIEW-UX-003', () => {
    it('undoReview removes record and ID is no longer reviewed', async () => {
      const { recordReview, undoReview, isReviewedLocally } = await loadStore();

      recordReview(sampleRecord({ decisionId: 'dec-undo' }));
      expect(isReviewedLocally('dec-undo')).toBe(true);

      undoReview('dec-undo');
      expect(isReviewedLocally('dec-undo')).toBe(false);
    });
  });

  describe('updateReviewFromApi', () => {
    it('merges feedbackId and server reviewedAt without losing other fields', async () => {
      const { recordReview, updateReviewFromApi, listRecentReviews } = await loadStore();

      recordReview(
        sampleRecord({
          decisionId: 'dec-api',
          action: 'reject',
          learnerReference: 'Leilani',
          decisionType: 'pause',
          educatorSummary: 'High decay risk',
          reviewedAt: '2026-06-24T11:59:50.000Z',
          source: 'local',
        })
      );

      updateReviewFromApi('dec-api', {
        feedbackId: 'fb-123',
        reviewedAt: '2026-06-24T12:00:00.000Z',
      });

      const [record] = listRecentReviews(1);
      expect(record).toMatchObject({
        decisionId: 'dec-api',
        action: 'reject',
        learnerReference: 'Leilani',
        decisionType: 'pause',
        educatorSummary: 'High decay risk',
        feedbackId: 'fb-123',
        reviewedAt: '2026-06-24T12:00:00.000Z',
        source: 'api',
      });
    });
  });

  describe('REVIEW-UX-004', () => {
    it('countReviewedToday respects local calendar day boundary', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const todayNoon = new Date(today);
      todayNoon.setHours(12, 0, 0, 0);

      const yesterdayLate = new Date(yesterday);
      yesterdayLate.setHours(23, 59, 59, 999);

      localStorage.setItem(
        V1_KEY,
        JSON.stringify([
          sampleRecord({ decisionId: 'today-1', reviewedAt: todayNoon.toISOString() }),
          sampleRecord({ decisionId: 'today-2', reviewedAt: today.toISOString() }),
          sampleRecord({ decisionId: 'yesterday-1', reviewedAt: yesterdayLate.toISOString() }),
        ])
      );

      const { countReviewedToday } = await loadStore();
      expect(countReviewedToday()).toBe(2);
    });
  });

  describe('getSessionReviewedIdSet', () => {
    it('returns a stable Set reference for useSyncExternalStore', async () => {
      const { getSessionReviewedIdSet, recordReview } = await loadStore();

      const before = getSessionReviewedIdSet();
      const again = getSessionReviewedIdSet();
      expect(again).toBe(before);

      recordReview(sampleRecord({ decisionId: 'dec-stable' }));
      const afterReview = getSessionReviewedIdSet();
      expect(afterReview).toBe(before);
      expect(afterReview.has('dec-stable')).toBe(true);
    });
  });
});
