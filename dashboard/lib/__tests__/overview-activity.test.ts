import { describe, expect, it } from 'vitest';

import type { Decision } from '@/lib/api/types';
import {
  buildActivityCsvRows,
  buildCumulativeSeries,
  buildStackedDecisionTrendSeries,
  formatActivityInsight,
  formatPeriodRangeLabel,
} from '@/lib/overview-activity';
import { buildMasteryTrendSeries, localDateKeyFromDate } from '@/lib/overview-metrics';

const NOW = new Date(2026, 5, 26, 12, 0, 0);

function isoOnDay(offsetFromNow: number, hour = 10): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - offsetFromNow);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function makeDecision(
  overrides: Partial<Decision> & Pick<Decision, 'decision_id' | 'decision_type' | 'decided_at'>
): Decision {
  return {
    org_id: 'org-1',
    learner_reference: 'learner-1',
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
      educator_summary: 'test',
    },
    output_metadata: { priority: null },
    ...overrides,
  };
}

describe('OVACT-001: buildStackedDecisionTrendSeries daily counts by type', () => {
  it('buckets decisions into daily intervene/pause/reinforce/advance counts', () => {
    const todayKey = localDateKeyFromDate(NOW);
    const yesterdayKey = localDateKeyFromDate(new Date(NOW.getTime() - 86_400_000));

    const decisions = [
      makeDecision({ decision_id: 'd1', decision_type: 'intervene', decided_at: isoOnDay(0) }),
      makeDecision({ decision_id: 'd2', decision_type: 'pause', decided_at: isoOnDay(0) }),
      makeDecision({ decision_id: 'd3', decision_type: 'reinforce', decided_at: isoOnDay(0) }),
      makeDecision({ decision_id: 'd4', decision_type: 'advance', decided_at: isoOnDay(1) }),
      makeDecision({ decision_id: 'd5', decision_type: 'intervene', decided_at: isoOnDay(1) }),
    ];

    const points = buildStackedDecisionTrendSeries(decisions, 7, 'decision_type', NOW);

    expect(points).toHaveLength(7);

    const today = points.find((point) => point.date === todayKey);
    expect(today).toMatchObject({
      intervene: 1,
      pause: 1,
      reinforce: 1,
      advance: 0,
    });

    const yesterday = points.find((point) => point.date === yesterdayKey);
    expect(yesterday).toMatchObject({
      intervene: 1,
      pause: 0,
      reinforce: 0,
      advance: 1,
    });
  });
});

describe('OVACT-002: cumulative needs-review metric excludes reinforce/advance', () => {
  it('emits only cumulative_intervene and cumulative_pause for decision_type groupBy', () => {
    const decisions = [
      makeDecision({ decision_id: 'd1', decision_type: 'intervene', decided_at: isoOnDay(0) }),
      makeDecision({ decision_id: 'd2', decision_type: 'pause', decided_at: isoOnDay(0) }),
      makeDecision({ decision_id: 'd3', decision_type: 'reinforce', decided_at: isoOnDay(0) }),
      makeDecision({ decision_id: 'd4', decision_type: 'advance', decided_at: isoOnDay(0) }),
    ];

    const daily = buildStackedDecisionTrendSeries(decisions, 7, 'decision_type', NOW);
    const cumulative = buildCumulativeSeries(daily, 'cumulative_needs_review', 'decision_type');

    expect(cumulative.length).toBeGreaterThan(0);
    for (const point of cumulative) {
      expect(point).toHaveProperty('cumulative_intervene');
      expect(point).toHaveProperty('cumulative_pause');
      expect(point).not.toHaveProperty('cumulative_reinforce');
      expect(point).not.toHaveProperty('cumulative_advance');
      expect(point).not.toHaveProperty('reinforce');
      expect(point).not.toHaveProperty('advance');
    }

    const last = cumulative[cumulative.length - 1] as {
      cumulative_intervene: number;
      cumulative_pause: number;
    };
    expect(last.cumulative_intervene + last.cumulative_pause).toBe(2);
  });
});

describe('OVACT-003: buildCumulativeSeries monotonicity', () => {
  it('never decreases cumulative series values day over day', () => {
    const decisions = [
      makeDecision({ decision_id: 'd1', decision_type: 'intervene', decided_at: isoOnDay(6) }),
      makeDecision({ decision_id: 'd2', decision_type: 'pause', decided_at: isoOnDay(4) }),
      makeDecision({ decision_id: 'd3', decision_type: 'intervene', decided_at: isoOnDay(2) }),
      makeDecision({ decision_id: 'd4', decision_type: 'reinforce', decided_at: isoOnDay(1) }),
      makeDecision({ decision_id: 'd5', decision_type: 'pause', decided_at: isoOnDay(0) }),
    ];

    const daily = buildStackedDecisionTrendSeries(decisions, 7, 'decision_type', NOW);
    const cumulative = buildCumulativeSeries(
      daily,
      'cumulative_needs_review',
      'decision_type'
    ) as Array<{ cumulative_intervene: number; cumulative_pause: number }>;

    for (let i = 1; i < cumulative.length; i += 1) {
      expect(cumulative[i]!.cumulative_intervene).toBeGreaterThanOrEqual(
        cumulative[i - 1]!.cumulative_intervene
      );
      expect(cumulative[i]!.cumulative_pause).toBeGreaterThanOrEqual(
        cumulative[i - 1]!.cumulative_pause
      );
    }
  });
});

describe('OVACT-004: formatPeriodRangeLabel', () => {
  it('formats Jun 20 – Jun 26 with en dash for 7-day range ending 2026-06-26', () => {
    expect(formatPeriodRangeLabel(7, NOW)).toBe('Jun 20 \u2013 Jun 26');
  });
});

describe('OVACT-005: formatActivityInsight educator copy', () => {
  it('uses vs start of period for cumulative needs review (no prior half jargon)', () => {
    const decisions = [
      makeDecision({ decision_id: 'd1', decision_type: 'intervene', decided_at: isoOnDay(6) }),
      makeDecision({ decision_id: 'd2', decision_type: 'pause', decided_at: isoOnDay(0) }),
    ];
    const daily = buildStackedDecisionTrendSeries(decisions, 7, 'decision_type', NOW);

    const insight = formatActivityInsight(daily, 'cumulative_needs_review', 'decision_type');

    expect(insight).toMatch(/\d+ learners need review \([+-]?\d+ vs start of period\)\./);
    expect(insight).not.toContain('prior half');
  });

  it('describes daily totals with busiest day label', () => {
    const decisions = [
      makeDecision({ decision_id: 'd1', decision_type: 'reinforce', decided_at: isoOnDay(0) }),
      makeDecision({ decision_id: 'd2', decision_type: 'advance', decided_at: isoOnDay(0) }),
      makeDecision({ decision_id: 'd3', decision_type: 'intervene', decided_at: isoOnDay(1) }),
    ];
    const daily = buildStackedDecisionTrendSeries(decisions, 7, 'decision_type', NOW);

    const insight = formatActivityInsight(daily, 'daily', 'decision_type');

    expect(insight).toMatch(/\d+ decisions in this period \(.* busiest\)\./);
    expect(insight).not.toContain('prior half');
  });

  it('replaces prior half phrasing for avg mastery insight', () => {
    const masteryPoints = buildMasteryTrendSeries([], 7, NOW);
    const insight = formatActivityInsight(masteryPoints, 'avg_mastery', 'decision_type');

    expect(insight).toContain('vs start of period');
    expect(insight).not.toContain('prior half');
  });
});

describe('OVACT-006: CSV export rows and headers for stacked daily export', () => {
  it('matches Concrete Values headers and row shape for daily decision_type export', () => {
    const decisions = [
      makeDecision({ decision_id: 'd1', decision_type: 'intervene', decided_at: isoOnDay(0) }),
      makeDecision({ decision_id: 'd2', decision_type: 'pause', decided_at: isoOnDay(0) }),
    ];
    const daily = buildStackedDecisionTrendSeries(decisions, 7, 'decision_type', NOW);
    const { headers, rows } = buildActivityCsvRows(daily, 'daily', 'decision_type');

    expect(headers).toEqual(['date', 'intervene', 'pause', 'reinforce', 'advance']);
    expect(rows).toHaveLength(7);

    const todayKey = localDateKeyFromDate(NOW);
    const todayRow = rows.find((row) => row[0] === todayKey);
    expect(todayRow).toEqual([todayKey, '1', '1', '0', '0']);

    for (const row of rows) {
      expect(row[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.slice(1)).toEqual(
        row.slice(1).map((cell) => String(Number(cell)))
      );
    }
  });
});
