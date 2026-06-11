/**
 * Unit tests for URS aggregation (AGG-001..013, AGG-017, AGG-018).
 * Spec: docs/specs/urs-aggregation.md § Contract Tests
 */

import { describe, it, expect } from 'vitest';
import {
  computeLearnerAggregation,
  incrementSkillEvidenceCounts,
} from '../../src/state/aggregation.js';
import { resolveSubjectForSkill } from '../../src/state/subject-config.js';
import {
  computeLearningGaps,
  evaluateGiftedInterest,
} from '../../src/learners/state-projection.js';
import type { DecisionTypeSummary, LearnerAggregation, SignalRecord } from '../../src/shared/types.js';

function makeState(skills: Record<string, Record<string, unknown>>): Record<string, unknown> {
  return { skills };
}

function aggregate(
  skills: Record<string, Record<string, unknown>>,
  subjectConfig: Parameters<typeof computeLearnerAggregation>[1] = null,
  version = 1
): LearnerAggregation | undefined {
  const state = makeState(skills);
  computeLearnerAggregation(state, subjectConfig, version);
  return state.aggregation as LearnerAggregation | undefined;
}

function makeSignal(payload: Record<string, unknown>): SignalRecord {
  return {
    org_id: 'test-org',
    signal_id: 'sig-1',
    source_system: 'test',
    learner_reference: 'learner-1',
    timestamp: '2026-03-01T10:00:00Z',
    schema_version: 'v1',
    payload,
    accepted_at: '2026-03-01T10:00:00Z',
  };
}

const emptyDecisionSummary: DecisionTypeSummary = {
  total: 0,
  types: { advance: 0, reinforce: 0, intervene: 0, pause: 0 },
};

describe('URS aggregation — computeLearnerAggregation', () => {
  it('AGG-001: subject mean — two skills same subject', () => {
    const result = aggregate({
      'MATH-301': { masteryScore: 0.8 },
      'MATH-302': { masteryScore: 0.6 },
    }, {
      prefix_rules: [{ prefix: 'MATH', subject: 'Math' }],
    });

    expect(result?.subjects.Math.masteryScore).toBe(0.7);
  });

  it('AGG-002: overall mean — equal weight per subject', () => {
    const result = aggregate({
      'MATH-301': { masteryScore: 0.9 },
      'ELA-201': { masteryScore: 0.5 },
    }, {
      explicit_map: { 'MATH-301': 'Math', 'ELA-201': 'English' },
    });

    expect(result?.overall.masteryScore).toBe(0.7);
  });

  it('AGG-003: overall mean — multi-skill subject still one subject vote', () => {
    const result = aggregate({
      'MATH-301': { masteryScore: 0.9 },
      'MATH-302': { masteryScore: 0.7 },
      'HIST-202': { masteryScore: 0.8 },
    }, {
      explicit_map: {
        'MATH-301': 'Math',
        'MATH-302': 'Math',
        'HIST-202': 'History',
      },
    });

    expect(result?.subjects.Math.masteryScore).toBe(0.8);
    expect(result?.overall.masteryScore).toBe(0.8);
  });

  it('AGG-007: empty skills — no aggregation written', () => {
    const state: Record<string, unknown> = { skills: {} };
    computeLearnerAggregation(state, null, 1);
    expect(state.aggregation).toBeUndefined();
  });

  it('AGG-008: strongest/weakest tie-break — lexicographic ascending', () => {
    const result = aggregate({
      B: { masteryScore: 0.5 },
      A: { masteryScore: 0.5 },
    }, { default_subject: 'General' });

    expect(result?.subjects.General.weakest_skill).toBe('A');
    expect(result?.subjects.General.strongest_skill).toBe('A');
  });
});

describe('URS aggregation — resolveSubjectForSkill', () => {
  it('AGG-004: subject resolution — explicit_map wins', () => {
    expect(
      resolveSubjectForSkill('X', {}, { explicit_map: { X: 'Science' } })
    ).toBe('Science');
  });

  it('AGG-005: subject resolution — prefix rule', () => {
    expect(
      resolveSubjectForSkill(
        'MATH-301',
        {},
        { prefix_rules: [{ prefix: 'MATH', subject: 'Math' }] }
      )
    ).toBe('Math');
  });

  it('AGG-006: subject resolution — default_subject fallback', () => {
    expect(
      resolveSubjectForSkill('Unknown-999', {}, { default_subject: 'General' })
    ).toBe('General');
  });
});

describe('URS aggregation — computeLearningGaps', () => {
  it('AGG-009: learning gap — relative + absolute thresholds', () => {
    const aggregation = aggregate({
      'ELA-201': { masteryScore: 0.28 },
      'ELA-202': { masteryScore: 0.82 },
    }, {
      explicit_map: { 'ELA-201': 'English', 'ELA-202': 'English' },
    })!;

    const gaps = computeLearningGaps(aggregation);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.skill).toBe('ELA-201');
    expect(gaps[0]!.gap).toBe(0.27);
    expect(gaps[0]!.subject_masteryScore).toBe(0.55);
  });

  it('AGG-010: learning gap — excluded when above absolute floor', () => {
    const aggregation = aggregate({
      'MATH-301': { masteryScore: 0.65 },
      'MATH-302': { masteryScore: 0.95 },
    }, {
      prefix_rules: [{ prefix: 'MATH', subject: 'Math' }],
    })!;

    const gaps = computeLearningGaps(aggregation);
    expect(gaps).toHaveLength(0);
  });
});

describe('URS aggregation — evaluateGiftedInterest', () => {
  function giftedAggregation(
    skills: Record<string, Record<string, unknown>>
  ): LearnerAggregation {
    return aggregate(skills, {
      explicit_map: Object.fromEntries(Object.keys(skills).map((id) => [id, 'Subject'])),
    })!;
  }

  it('AGG-011: gifted flag — all criteria pass', () => {
    const aggregation = giftedAggregation({
      'MATH-301': { masteryScore: 0.96, evidenceCount: 3 },
      'HIST-202': { masteryScore: 0.98, evidenceCount: 4 },
    });

    const result = evaluateGiftedInterest(aggregation, {
      total: 3,
      types: { advance: 3, reinforce: 0, intervene: 0, pause: 0 },
    });

    expect(result).toEqual({ flagged: true, label: 'Person of interest' });
  });

  it('AGG-012: gifted flag — fails on reinforce decision', () => {
    const aggregation = giftedAggregation({
      'MATH-301': { masteryScore: 0.96, evidenceCount: 3 },
      'HIST-202': { masteryScore: 0.98, evidenceCount: 3 },
    });

    const result = evaluateGiftedInterest(aggregation, {
      total: 2,
      types: { advance: 1, reinforce: 1, intervene: 0, pause: 0 },
    });

    expect(result).toEqual({ flagged: false, label: null });
  });

  it('AGG-013: gifted flag — fails on single skill (G1)', () => {
    const aggregation = giftedAggregation({
      'MATH-301': { masteryScore: 0.98, evidenceCount: 5 },
    });

    const result = evaluateGiftedInterest(aggregation, {
      total: 5,
      types: { advance: 5, reinforce: 0, intervene: 0, pause: 0 },
    });

    expect(result).toEqual({ flagged: false, label: null });
  });

  it('AGG-017: gifted flag — fails on insufficient evidence (G6)', () => {
    const aggregation = giftedAggregation({
      'MATH-301': { masteryScore: 0.96, evidenceCount: 3 },
      'HIST-202': { masteryScore: 0.98, evidenceCount: 2 },
    });

    const result = evaluateGiftedInterest(aggregation, {
      total: 3,
      types: { advance: 3, reinforce: 0, intervene: 0, pause: 0 },
    });

    expect(result).toEqual({ flagged: false, label: null });
  });

  it('treats missing evidenceCount as 0 for G6', () => {
    const aggregation = giftedAggregation({
      'MATH-301': { masteryScore: 0.96, evidenceCount: 3 },
      'HIST-202': { masteryScore: 0.98 },
    });

    const result = evaluateGiftedInterest(aggregation, {
      total: 3,
      types: { advance: 3, reinforce: 0, intervene: 0, pause: 0 },
    });

    expect(result.flagged).toBe(false);
  });

  it('fails G5 when no decisions exist', () => {
    const aggregation = giftedAggregation({
      'MATH-301': { masteryScore: 0.96, evidenceCount: 3 },
      'HIST-202': { masteryScore: 0.98, evidenceCount: 3 },
    });

    const result = evaluateGiftedInterest(aggregation, emptyDecisionSummary);
    expect(result.flagged).toBe(false);
  });
});

describe('URS aggregation — incrementSkillEvidenceCounts', () => {
  it('AGG-018: evidenceCount increments per masteryScore signal', () => {
    const state: Record<string, unknown> = {
      skills: { 'MATH-301': { masteryScore: 0.5 } },
    };

    const signals = [
      makeSignal({ skills: { 'MATH-301': { masteryScore: 0.5 } } }),
      makeSignal({ skills: { 'MATH-301': { masteryScore: 0.7 } } }),
      makeSignal({ skills: { 'MATH-301': { masteryScore: 0.9 } } }),
    ];

    for (const signal of signals) {
      incrementSkillEvidenceCounts({}, state, [signal]);
    }

    const entry = (state.skills as Record<string, Record<string, unknown>>)['MATH-301'];
    expect(entry!.evidenceCount).toBe(3);
  });

  it('increments dominant skill when top-level masteryScore is present', () => {
    const state: Record<string, unknown> = {
      skills: { 'MATH-301': {} },
    };

    incrementSkillEvidenceCounts({}, state, [
      makeSignal({ skill: 'MATH-301', masteryScore: 0.8 }),
    ]);

    const entry = (state.skills as Record<string, Record<string, unknown>>)['MATH-301'];
    expect(entry!.evidenceCount).toBe(1);
  });

  it('skips signals without finite masteryScore', () => {
    const state: Record<string, unknown> = {
      skills: { 'MATH-301': { evidenceCount: 1 } },
    };

    incrementSkillEvidenceCounts({}, state, [
      makeSignal({ skills: { 'MATH-301': { stabilityScore: 0.5 } } }),
    ]);

    const entry = (state.skills as Record<string, Record<string, unknown>>)['MATH-301'];
    expect(entry!.evidenceCount).toBe(1);
  });
});
