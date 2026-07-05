import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LearnerSummaryResponse, RecentDecisionItem } from '@/lib/api/types';

const isReviewedLocallyMock = vi.hoisted(() => vi.fn((_id: string) => false));

vi.mock('@/lib/decision-review', () => ({
  isReviewedLocally: (decisionId: string) => isReviewedLocallyMock(decisionId),
}));

import {
  resolveEffectivePendingDecisionId,
  selectPendingDecisionForLearner,
} from '@/lib/attention-decisions';

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

describe('selectPendingDecisionForLearner', () => {
  beforeEach(() => {
    isReviewedLocallyMock.mockReset();
    isReviewedLocallyMock.mockReturnValue(false);
  });

  it('LPR-001: returns a single unreviewed intervene decision', () => {
    const summary = makeSummary('Malosi', [
      makeRecentDecision({ decision_id: 'dec-intervene', decision_type: 'intervene' }),
    ]);

    expect(selectPendingDecisionForLearner(summary)).toBe('dec-intervene');
  });

  it('LPR-002: excludes server-reviewed decisions', () => {
    const summary = makeSummary('Malosi', [
      makeRecentDecision({ decision_id: 'dec-intervene', decision_type: 'intervene' }),
    ]);

    expect(
      selectPendingDecisionForLearner(summary, new Set(['dec-intervene']))
    ).toBeNull();
  });

  it('LPR-003: excludes locally reviewed decisions', () => {
    const summary = makeSummary('Malosi', [
      makeRecentDecision({ decision_id: 'dec-intervene', decision_type: 'intervene' }),
    ]);

    isReviewedLocallyMock.mockImplementation((id) => id === 'dec-intervene');

    expect(selectPendingDecisionForLearner(summary)).toBeNull();
  });

  it('LPR-004: prioritizes intervene over pause when both are unreviewed', () => {
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

    expect(selectPendingDecisionForLearner(summary)).toBe('dec-intervene');
  });
});

describe('resolveEffectivePendingDecisionId', () => {
  beforeEach(() => {
    isReviewedLocallyMock.mockReset();
    isReviewedLocallyMock.mockReturnValue(false);
  });

  it('LPR-005: uses a valid URL override when the decision is pending', () => {
    const summary = makeSummary('Malosi', [
      makeRecentDecision({
        decision_id: 'dec-intervene',
        decision_type: 'intervene',
        decided_at: '2026-01-15T10:00:00Z',
      }),
      makeRecentDecision({
        decision_id: 'dec-pause',
        decision_type: 'pause',
        decided_at: '2026-01-16T10:00:00Z',
      }),
    ]);

    expect(
      resolveEffectivePendingDecisionId({
        summary,
        urlReviewDecisionId: 'dec-pause',
      })
    ).toBe('dec-pause');
  });

  it('LPR-006: falls back to auto-detected pending when URL override is stale', () => {
    const summary = makeSummary('Malosi', [
      makeRecentDecision({
        decision_id: 'dec-intervene',
        decision_type: 'intervene',
        decided_at: '2026-01-15T10:00:00Z',
      }),
      makeRecentDecision({
        decision_id: 'dec-pause',
        decision_type: 'pause',
        decided_at: '2026-01-16T10:00:00Z',
      }),
    ]);

    expect(
      resolveEffectivePendingDecisionId({
        summary,
        serverReviewedIds: new Set(['dec-intervene']),
        urlReviewDecisionId: 'dec-intervene',
      })
    ).toBe('dec-pause');
  });
});
