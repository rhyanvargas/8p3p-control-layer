import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LearnerSummaryResponse, RecentDecisionItem } from '@/lib/api/types';

const isReviewedLocallyMock = vi.hoisted(() => vi.fn((_id: string) => false));

vi.mock('@/lib/decision-review', () => ({
  isReviewedLocally: (decisionId: string) => isReviewedLocallyMock(decisionId),
}));

import {
  listPendingUrgentDecisionIds,
  nextPendingDecisionId,
  pendingQueuePosition,
} from '@/lib/pending-review-presentation';

function makeRecentDecision(
  overrides: Partial<RecentDecisionItem> &
    Pick<RecentDecisionItem, 'decision_id' | 'decision_type'>
): RecentDecisionItem {
  return {
    decided_at: '2026-01-15T10:00:00Z',
    matched_rule_id: 'rule-1',
    educator_summary: 'Needs support',
    rationale: 'test',
    policy_version: '1.0.0',
    ...overrides,
  };
}

function makeSummary(
  learnerRef: string,
  recentDecisions: RecentDecisionItem[]
): LearnerSummaryResponse {
  return {
    org_id: 'org-1',
    learner_reference: learnerRef,
    generated_at: '2026-01-15T12:00:00Z',
    current_state: {
      state_id: 'state-1',
      state_version: 1,
      updated_at: '2026-01-15T10:00:00Z',
      fields: { skill: 'algebra' },
      mastery_breakdown: null,
    },
    recent_decisions: recentDecisions,
    field_trajectories: {},
    active_policy: null,
    signals_summary: { total_count: 0, first_signal_at: null, last_signal_at: null },
  };
}

describe('pending-review-presentation', () => {
  beforeEach(() => {
    isReviewedLocallyMock.mockReset();
    isReviewedLocallyMock.mockReturnValue(false);
  });

  describe('listPendingUrgentDecisionIds', () => {
    it('orders intervene before pause then decided_at descending', () => {
      const summary = makeSummary('Malosi', [
        makeRecentDecision({
          decision_id: 'dec-pause',
          decision_type: 'pause',
          decided_at: '2026-01-16T10:00:00Z',
        }),
        makeRecentDecision({
          decision_id: 'dec-intervene',
          decision_type: 'intervene',
          decided_at: '2026-01-15T10:00:00Z',
        }),
      ]);

      expect(listPendingUrgentDecisionIds(summary)).toEqual([
        'dec-intervene',
        'dec-pause',
      ]);
    });

    it('excludes server-reviewed and locally reviewed ids', () => {
      const summary = makeSummary('Malosi', [
        makeRecentDecision({
          decision_id: 'dec-a',
          decision_type: 'intervene',
          decided_at: '2026-01-16T10:00:00Z',
        }),
        makeRecentDecision({
          decision_id: 'dec-b',
          decision_type: 'intervene',
          decided_at: '2026-01-15T10:00:00Z',
        }),
        makeRecentDecision({
          decision_id: 'dec-c',
          decision_type: 'pause',
          decided_at: '2026-01-14T10:00:00Z',
        }),
      ]);

      isReviewedLocallyMock.mockImplementation((id) => id === 'dec-b');

      expect(
        listPendingUrgentDecisionIds(summary, new Set(['dec-a']))
      ).toEqual(['dec-c']);
    });
  });

  describe('RTC-003: pendingQueuePosition', () => {
    it('returns 1-based index and total when effective is first of two pending', () => {
      const orderedIds = ['dec-a', 'dec-b'];
      const position = pendingQueuePosition(orderedIds, 'dec-a');

      expect(position).toEqual({ index: 1, total: 2 });
      // Queue position copy shape consumed by the bar: `{n} of {total} pending`
      expect(`${position!.index} of ${position!.total} pending`).toBe('1 of 2 pending');
    });

    it('returns null when current id is not in the pending list', () => {
      expect(pendingQueuePosition(['dec-a', 'dec-b'], 'dec-missing')).toBeNull();
    });
  });

  describe('RTC-004: nextPendingDecisionId', () => {
    it('advances A → B and wraps B → A when wrap is enabled (default)', () => {
      const orderedIds = ['dec-a', 'dec-b'];

      expect(nextPendingDecisionId(orderedIds, 'dec-a')).toBe('dec-b');
      expect(nextPendingDecisionId(orderedIds, 'dec-b')).toBe('dec-a');
      expect(nextPendingDecisionId(orderedIds, 'dec-b', { wrap: true })).toBe(
        'dec-a'
      );
    });

    it('returns null at end when wrap is disabled', () => {
      expect(
        nextPendingDecisionId(['dec-a', 'dec-b'], 'dec-b', { wrap: false })
      ).toBeNull();
    });

    it('returns null when current id is not in the list', () => {
      expect(nextPendingDecisionId(['dec-a', 'dec-b'], 'dec-missing')).toBeNull();
    });
  });
});
