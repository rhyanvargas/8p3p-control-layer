/**
 * Unit tests for Skill-Level Tracking & Assessment Type Classification
 * Covers: dot-path policy evaluation, extractCanonicalSnapshot, computeStateDeltas
 *
 * Plan: .cursor/plans/skill-level-tracking.plan.md (TASK-010)
 * Tests: SKL-001 through SKL-009
 */

import { describe, it, expect } from 'vitest';
import { evaluateCondition, evaluatePolicy } from '../../src/decision/policy-loader.js';
import { extractCanonicalSnapshot } from '../../src/decision/engine.js';
import { computeStateDeltas } from '../../src/state/engine.js';
import type { ConditionNode, PolicyDefinition } from '../../src/shared/types.js';

// =============================================================================
// Helpers
// =============================================================================

function makePolicy(field: string, operator: ConditionNode['operator'] extends undefined ? never : 'lt' | 'gt' | 'eq', value: number): PolicyDefinition {
  return {
    policy_id: 'test-skl',
    policy_version: '1.0.0',
    description: 'Skill-level tracking test policy',
    default_decision_type: 'reinforce',
    rules: [
      {
        rule_id: 'skl-rule-1',
        decision_type: 'intervene',
        condition: { field, operator, value },
      },
    ],
  };
}

// =============================================================================
// SKL-001 through SKL-003: dot-path policy evaluation (evaluateConditionCollecting)
// =============================================================================

describe('Dot-path policy evaluation', () => {
  it('SKL-001: nested field skills.fractions.stabilityScore = 0.28 matches lt 0.5', () => {
    const state: Record<string, unknown> = {
      skills: {
        fractions: {
          stabilityScore: 0.28,
        },
      },
    };
    const condition: ConditionNode = {
      field: 'skills.fractions.stabilityScore',
      operator: 'lt',
      value: 0.5,
    };
    expect(evaluateCondition(state, condition)).toBe(true);
  });

  it('SKL-002: nested field skills.fractions.stabilityScore = 0.72 does NOT match lt 0.5', () => {
    const state: Record<string, unknown> = {
      skills: {
        fractions: {
          stabilityScore: 0.72,
        },
      },
    };
    const condition: ConditionNode = {
      field: 'skills.fractions.stabilityScore',
      operator: 'lt',
      value: 0.5,
    };
    expect(evaluateCondition(state, condition)).toBe(false);
  });

  it('SKL-003: flat-field stabilityScore = 0.28 still matches lt 0.5 (backward compat)', () => {
    const state: Record<string, unknown> = { stabilityScore: 0.28 };
    const condition: ConditionNode = {
      field: 'stabilityScore',
      operator: 'lt',
      value: 0.5,
    };
    expect(evaluateCondition(state, condition)).toBe(true);
  });
});

// =============================================================================
// SKL-004 through SKL-005: extractCanonicalSnapshot
// =============================================================================

describe('extractCanonicalSnapshot', () => {
  it('SKL-004: snapshot includes nested structure for nested policy field', () => {
    const state: Record<string, unknown> = {
      skills: {
        fractions: {
          stabilityScore: 0.28,
          attempts: 5,
        },
      },
      unrelated: 'should not appear',
    };
    const policy = makePolicy('skills.fractions.stabilityScore', 'lt', 0.5);
    const snapshot = extractCanonicalSnapshot(state, policy);

    expect(snapshot).toEqual({
      skills: {
        fractions: {
          stabilityScore: 0.28,
        },
      },
    });
    expect(snapshot).not.toHaveProperty('unrelated');
  });

  it('SKL-005: evaluatePolicy evaluated_fields actual_value is 0.28 for skills.fractions.stabilityScore', () => {
    const state: Record<string, unknown> = {
      skills: {
        fractions: {
          stabilityScore: 0.28,
        },
      },
    };
    const policy = makePolicy('skills.fractions.stabilityScore', 'lt', 0.5);
    const result = evaluatePolicy(state, policy);

    expect(result.matched_rule_id).toBe('skl-rule-1');
    expect(result.evaluated_fields).toBeDefined();
    const ef = result.evaluated_fields?.find((f) => f.field === 'skills.fractions.stabilityScore');
    expect(ef).toBeDefined();
    expect(ef?.actual_value).toBe(0.28);
  });
});

// =============================================================================
// SKL-006 through SKL-009: computeStateDeltas nested delta detection
// =============================================================================

describe('computeStateDeltas — nested delta detection', () => {
  it('SKL-006: prior 0.72 → next 0.55 produces _delta: -0.17, _direction: "declining"', () => {
    const prior: Record<string, unknown> = {
      skills: { fractions: { stabilityScore: 0.72 } },
    };
    const next: Record<string, unknown> = {
      skills: { fractions: { stabilityScore: 0.55 } },
    };
    const result = computeStateDeltas(prior, next);

    const fractionsResult = (result['skills'] as Record<string, unknown>)?.['fractions'] as Record<string, unknown>;
    expect(fractionsResult).toBeDefined();
    expect(fractionsResult['stabilityScore_delta']).toBeCloseTo(-0.17, 10);
    expect(fractionsResult['stabilityScore_direction']).toBe('declining');
  });

  it('SKL-007: first signal (no prior nested obj) → no _delta fields in nested result', () => {
    const prior: Record<string, unknown> = {};
    const next: Record<string, unknown> = {
      skills: { fractions: { stabilityScore: 0.55 } },
    };
    const result = computeStateDeltas(prior, next);

    const fractionsResult = (result['skills'] as Record<string, unknown> | undefined)?.['fractions'] as Record<string, unknown> | undefined;
    expect(fractionsResult?.['stabilityScore_delta']).toBeUndefined();
    expect(fractionsResult?.['stabilityScore_direction']).toBeUndefined();
  });

  it('SKL-008: flat-field stabilityScore_delta still produced correctly (regression)', () => {
    const prior: Record<string, unknown> = { stabilityScore: 0.72 };
    const next: Record<string, unknown> = { stabilityScore: 0.55 };
    const result = computeStateDeltas(prior, next);

    expect(result['stabilityScore_delta']).toBeCloseTo(-0.17, 10);
    expect(result['stabilityScore_direction']).toBe('declining');
  });

  it('SKL-009: 6-level nesting → no crash, no delta fields emitted for deepest level', () => {
    const prior: Record<string, unknown> = {
      a: { b: { c: { d: { e: { f: { score: 1 } } } } } },
    };
    const next: Record<string, unknown> = {
      a: { b: { c: { d: { e: { f: { score: 2 } } } } } },
    };

    expect(() => computeStateDeltas(prior, next)).not.toThrow();

    const result = computeStateDeltas(prior, next);
    // Depth 5 is the limit (depth >= 5 returns). The path a.b.c.d.e.f is 6 levels deep,
    // so the f-level deltas should not be computed (guard kicks in at level 5 = e level).
    const eLevel = (
      ((((result['a'] as Record<string, unknown>)?.['b'] as Record<string, unknown>)?.['c'] as Record<string, unknown>)?.['d'] as Record<string, unknown>)?.['e'] as Record<string, unknown>
    );
    // f.score_delta should not be present since depth guard triggers at level 5
    const fLevel = eLevel?.['f'] as Record<string, unknown> | undefined;
    expect(fLevel?.['score_delta']).toBeUndefined();
  });

  it('SKL-W3: nested null-removal — prior skill removed via deepMerge null cleans up delta companions', () => {
    const prior: Record<string, unknown> = {
      skills: {
        fractions: { stabilityScore: 0.72, stabilityScore_delta: -0.05, stabilityScore_direction: 'declining' },
      },
    };
    // deepMerge with null removes fractions; next reflects post-merge state
    const next: Record<string, unknown> = {
      skills: {},
    };
    const result = computeStateDeltas(prior, next);

    const skillsResult = result['skills'] as Record<string, unknown>;
    expect(skillsResult).toBeDefined();
    // fractions was removed — its delta companions must not persist
    expect(skillsResult['fractions_delta']).toBeUndefined();
    expect(skillsResult['fractions_direction']).toBeUndefined();
  });
});
