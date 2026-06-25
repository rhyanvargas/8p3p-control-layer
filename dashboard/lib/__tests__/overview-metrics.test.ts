import { describe, expect, it } from 'vitest';

import type { Decision } from '@/lib/api/types';
import {
  buildDecisionTrendSeries,
  localDateKeyFromDate,
  toLocalDateKey,
} from '@/lib/overview-metrics';

function decisionAt(iso: string): Decision {
  return {
    org_id: 'org-1',
    decision_id: `decision-${iso}`,
    learner_reference: 'learner-1',
    decision_type: 'intervene',
    decided_at: iso,
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
  };
}

describe('toLocalDateKey', () => {
  it('matches the local calendar day used by formatDecisionTime', () => {
    const localLateNight = new Date(2026, 5, 23, 22, 51, 0);
    expect(toLocalDateKey(localLateNight.toISOString())).toBe(
      localDateKeyFromDate(localLateNight)
    );
  });
});

describe('buildDecisionTrendSeries', () => {
  it('counts late-evening local decisions on the same day shown in the table', () => {
    const now = new Date(2026, 5, 23, 23, 0, 0);
    const lateEvening = new Date(2026, 5, 23, 22, 51, 0);

    const points = buildDecisionTrendSeries(
      [decisionAt(lateEvening.toISOString())],
      7,
      'all',
      now
    );

    const todayKey = localDateKeyFromDate(now);
    const todayPoint = points.find((point) => point.date === todayKey);

    expect(todayPoint?.value).toBe(1);
    expect(points.at(-1)?.value).toBe(1);
  });
});
