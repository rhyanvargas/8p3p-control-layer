import { describe, expect, it } from 'vitest';

import type { Decision, IngestionLogEntry, LearnerStateResponse } from '@/lib/api/types';
import {
  applyOverviewFilter,
  DEFAULT_OVERVIEW_FILTER,
  type OverviewFilterData,
} from '@/lib/overview/overview-filter';
import {
  computeOverviewKpis,
  computeRecentDecisions,
  localDateKeyFromDate,
  toLocalDateKey,
} from '@/lib/overview-metrics';

const NOW = new Date(2026, 5, 25, 12, 0, 0);

function daysAgo(days: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

function makeDecision(
  overrides: Partial<Decision> & Pick<Decision, 'decision_id' | 'learner_reference' | 'decision_type' | 'decided_at'>
): Decision {
  return {
    org_id: 'org-1',
    decision_context: {},
    trace: {
      state_id: 'state-1',
      state_version: 1,
      policy_id: 'policy-1',
      policy_version: '1.0.0',
      matched_rule_id: 'rule-1',
      state_snapshot: {},
      matched_rule: {
        rule_id: 'rule-1',
        condition: { field: 'riskSignal', op: 'gte', value: 0.5 },
        evaluated_fields: [],
      },
      rationale: 'test',
    },
    output_metadata: {},
    ...overrides,
  };
}

const FIXTURE_DECISIONS: Decision[] = [
  makeDecision({
    decision_id: 'd1',
    learner_reference: 'stu-40123',
    decision_type: 'reinforce',
    decided_at: daysAgo(0),
  }),
  makeDecision({
    decision_id: 'd2',
    learner_reference: 'stu-50000',
    decision_type: 'reinforce',
    decided_at: daysAgo(1),
  }),
  makeDecision({
    decision_id: 'd3',
    learner_reference: 'stu-40123',
    decision_type: 'intervene',
    decided_at: daysAgo(2),
  }),
  makeDecision({
    decision_id: 'd4',
    learner_reference: 'stu-99999',
    decision_type: 'advance',
    decided_at: daysAgo(5),
  }),
  makeDecision({
    decision_id: 'd5',
    learner_reference: 'stu-40123',
    decision_type: 'reinforce',
    decided_at: daysAgo(20),
  }),
  makeDecision({
    decision_id: 'd6',
    learner_reference: 'stu-40123',
    decision_type: 'pause',
    decided_at: daysAgo(40),
  }),
];

const FIXTURE_INGESTION: IngestionLogEntry[] = [
  {
    signal_id: 'sig-1',
    source_system: 'lms',
    learner_reference: 'stu-40123',
    timestamp: daysAgo(0),
    schema_version: '1',
    outcome: 'rejected',
    received_at: daysAgo(0),
    rejection_reason: { code: 'INVALID' },
  },
  {
    signal_id: 'sig-2',
    source_system: 'lms',
    learner_reference: 'stu-50000',
    timestamp: daysAgo(0),
    schema_version: '1',
    outcome: 'accepted',
    received_at: daysAgo(0),
    rejection_reason: null,
  },
];

const FIXTURE_LEARNER_STATES: LearnerStateResponse[] = [
  {
    org_id: 'org-1',
    learner_reference: 'stu-40123',
    state_id: 'state-1',
    state_version: 1,
    updated_at: daysAgo(0),
    state: {
      masteryScore: 0.8,
      masteryScore_direction: 'improving',
    },
    provenance: { source: 'test' },
  },
  {
    org_id: 'org-1',
    learner_reference: 'stu-50000',
    state_id: 'state-2',
    state_version: 1,
    updated_at: daysAgo(0),
    state: {
      masteryScore: 0.5,
      masteryScore_direction: 'stable',
    },
    provenance: { source: 'test' },
  },
];

const FIXTURE_DATA: OverviewFilterData = {
  decisions: FIXTURE_DECISIONS,
  ingestionToday: FIXTURE_INGESTION,
  learnerStates: FIXTURE_LEARNER_STATES,
};

function rangeScopedDecisions(decisions: Decision[], rangeDays: 7 | 30 | 90): Decision[] {
  const end = new Date(NOW);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - (rangeDays - 1) * 86_400_000);
  const startKey = localDateKeyFromDate(start);
  return decisions.filter((d) => toLocalDateKey(d.decided_at) >= startKey);
}

describe('XFILTER-001: filter identity when filter empty', () => {
  it('returns range-scoped full set without type/learner narrowing', () => {
    const filter = { ...DEFAULT_OVERVIEW_FILTER };
    const result = applyOverviewFilter(FIXTURE_DATA, filter, NOW);

    const expectedRangeScoped = rangeScopedDecisions(FIXTURE_DECISIONS, 30);
    expect(result.filteredDecisions).toHaveLength(expectedRangeScoped.length);
    expect(result.filteredDecisions.map((d) => d.decision_id).sort()).toEqual(
      expectedRangeScoped.map((d) => d.decision_id).sort()
    );
    expect(result.filteredRecentDecisions).toEqual(
      computeRecentDecisions(expectedRangeScoped, 20)
    );

    const derivedFromRange = computeOverviewKpis(
      expectedRangeScoped,
      FIXTURE_INGESTION,
      FIXTURE_LEARNER_STATES
    );
    expect(result.decisionDerivedKpis).toEqual({
      needsAttention: derivedFromRange.needsAttention,
      pendingDecisions: derivedFromRange.pendingDecisions,
    });

    const programWide = computeOverviewKpis(
      FIXTURE_DECISIONS,
      FIXTURE_INGESTION,
      FIXTURE_LEARNER_STATES
    );
    expect(result.programWideKpis).toEqual({
      signalsToday: programWide.signalsToday,
      improvingLearners: programWide.improvingLearners,
    });
  });
});

describe('XFILTER-002: decision-type filter narrows + partial KPI recompute', () => {
  it('keeps only reinforce decisions and recomputes decision-derived KPIs', () => {
    const filter = { ...DEFAULT_OVERVIEW_FILTER, decisionType: 'reinforce' as const };
    const result = applyOverviewFilter(FIXTURE_DATA, filter, NOW);

    expect(result.filteredDecisions.every((d) => d.decision_type === 'reinforce')).toBe(true);
    expect(result.filteredDecisions.map((d) => d.decision_id).sort()).toEqual(
      ['d1', 'd2', 'd5'].sort()
    );

    const reinforceScoped = result.filteredDecisions;
    const derived = computeOverviewKpis(reinforceScoped, FIXTURE_INGESTION, FIXTURE_LEARNER_STATES);
    expect(result.decisionDerivedKpis).toEqual({
      needsAttention: derived.needsAttention,
      pendingDecisions: derived.pendingDecisions,
    });
    expect(result.decisionDerivedKpis.pendingDecisions).toBe(0);

    const programWide = computeOverviewKpis(
      FIXTURE_DECISIONS,
      FIXTURE_INGESTION,
      FIXTURE_LEARNER_STATES
    );
    expect(result.programWideKpis.signalsToday).toEqual(programWide.signalsToday);
    expect(result.programWideKpis.improvingLearners).toBe(programWide.improvingLearners);
    expect(programWide.signalsToday.rejected).toBe(1);
    expect(programWide.improvingLearners).toBe(1);
  });
});

describe('XFILTER-003: learner filter narrows chart/table + partial KPIs', () => {
  it('scopes decisions to the learner and recomputes decision-derived KPIs', () => {
    const filter = { ...DEFAULT_OVERVIEW_FILTER, learner: 'stu-40123' };
    const result = applyOverviewFilter(FIXTURE_DATA, filter, NOW);

    expect(result.filteredDecisions.every((d) => d.learner_reference.includes('stu-40123'))).toBe(
      true
    );
    expect(result.filteredDecisions.map((d) => d.decision_id).sort()).toEqual(
      ['d1', 'd3', 'd5'].sort()
    );

    const learnerScoped = result.filteredDecisions;
    const derived = computeOverviewKpis(learnerScoped, FIXTURE_INGESTION, FIXTURE_LEARNER_STATES);
    expect(result.decisionDerivedKpis).toEqual({
      needsAttention: derived.needsAttention,
      pendingDecisions: derived.pendingDecisions,
    });

    const programWide = computeOverviewKpis(
      FIXTURE_DECISIONS,
      FIXTURE_INGESTION,
      FIXTURE_LEARNER_STATES
    );
    expect(result.programWideKpis).toEqual({
      signalsToday: programWide.signalsToday,
      improvingLearners: programWide.improvingLearners,
    });
  });
});

describe('XFILTER-004: range filter scopes time window only', () => {
  it('limits dataset to the last 7 days without type/learner narrowing', () => {
    const filter = { ...DEFAULT_OVERVIEW_FILTER, range: 7 as const };
    const result = applyOverviewFilter(FIXTURE_DATA, filter, NOW);

    const expected = rangeScopedDecisions(FIXTURE_DECISIONS, 7);
    expect(result.filteredDecisions.map((d) => d.decision_id).sort()).toEqual(
      expected.map((d) => d.decision_id).sort()
    );
    expect(expected.map((d) => d.decision_id).sort()).toEqual(['d1', 'd2', 'd3', 'd4'].sort());
  });
});

describe('XFILTER-005: combined filters compose with AND semantics', () => {
  it('returns only decisions matching both decision type and learner', () => {
    const filter = {
      ...DEFAULT_OVERVIEW_FILTER,
      decisionType: 'reinforce' as const,
      learner: 'stu-40123',
    };
    const result = applyOverviewFilter(FIXTURE_DATA, filter, NOW);

    expect(result.filteredDecisions).toHaveLength(2);
    expect(result.filteredDecisions.map((d) => d.decision_id).sort()).toEqual(['d1', 'd5'].sort());
    expect(
      result.filteredDecisions.every(
        (d) => d.decision_type === 'reinforce' && d.learner_reference === 'stu-40123'
      )
    ).toBe(true);
  });
});
