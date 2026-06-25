import { describe, expect, it } from 'vitest';

import type { Decision } from '@/lib/api/types';
import {
  filterDecisionsByReviewStatus,
  parseDecisionsReviewFilter,
} from '@/lib/decisions-review-filter';

function sampleDecision(
  overrides: Partial<Decision> & Pick<Decision, 'decision_id' | 'decision_type'>
): Decision {
  return {
    org_id: 'org-1',
    learner_reference: 'Malosi',
    decided_at: '2026-06-24T12:00:00.000Z',
    decision_context: {},
    trace: {
      state_id: 's1',
      state_version: 1,
      policy_id: 'p1',
      policy_version: 'v1',
      matched_rule_id: 'rule-1',
      state_snapshot: {},
      matched_rule: {},
      rationale: 'test',
      educator_summary: 'summary',
    },
    ...overrides,
  };
}

describe('decisions-review-filter', () => {
  it('parseDecisionsReviewFilter maps reviewed query param', () => {
    expect(parseDecisionsReviewFilter(null)).toBe('all');
    expect(parseDecisionsReviewFilter('pending')).toBe('pending');
    expect(parseDecisionsReviewFilter('session')).toBe('session');
    expect(parseDecisionsReviewFilter('unknown')).toBe('all');
  });

  it('session filter returns only session-reviewed decision IDs', () => {
    const decisions = [
      sampleDecision({ decision_id: 'd1', decision_type: 'intervene' }),
      sampleDecision({ decision_id: 'd2', decision_type: 'pause' }),
      sampleDecision({ decision_id: 'd3', decision_type: 'advance' }),
    ];

    const filtered = filterDecisionsByReviewStatus(decisions, {
      filter: 'session',
      sessionReviewedIds: new Set(['d1', 'd3']),
    });

    expect(filtered.map((d) => d.decision_id)).toEqual(['d1', 'd3']);
  });

  it('pending filter excludes reviewed urgent decisions', () => {
    const decisions = [
      sampleDecision({ decision_id: 'd1', decision_type: 'intervene' }),
      sampleDecision({ decision_id: 'd2', decision_type: 'pause' }),
      sampleDecision({ decision_id: 'd3', decision_type: 'intervene' }),
      sampleDecision({ decision_id: 'd4', decision_type: 'advance' }),
    ];

    const filtered = filterDecisionsByReviewStatus(decisions, {
      filter: 'pending',
      sessionReviewedIds: new Set(['d1']),
      serverReviewedIds: new Set(['d3']),
    });

    expect(filtered.map((d) => d.decision_id)).toEqual(['d2']);
  });
});
