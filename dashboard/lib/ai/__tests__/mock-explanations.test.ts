import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isAiExplanationsDemoEnabled,
  mockEducatorExplanation,
  resolveEducatorExplanation,
} from '@/lib/ai/mock-explanations';

describe('mock AI explanations', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is off by default', () => {
    vi.stubEnv('NEXT_PUBLIC_AI_EXPLANATIONS_DEMO', undefined);
    expect(isAiExplanationsDemoEnabled()).toBe(false);
  });

  it('returns real explanation when present', () => {
    vi.stubEnv('NEXT_PUBLIC_AI_EXPLANATIONS_DEMO', 'true');
    expect(
      resolveEducatorExplanation({
        educator_explanation: 'Real cached narrative.',
        educator_summary: 'Needs support',
        decision_type: 'intervene',
        skill: 'Reading',
      })
    ).toBe('Real cached narrative.');
  });

  it('fills mock narrative when demo on and explanation empty', () => {
    vi.stubEnv('NEXT_PUBLIC_AI_EXPLANATIONS_DEMO', 'true');
    const text = resolveEducatorExplanation({
      educator_explanation: null,
      educator_summary: 'Needs stronger support now',
      decision_type: 'intervene',
      skill: 'Reading',
    });
    expect(text).toMatch(/less confident/i);
    expect(text).toMatch(/Reading/);
  });

  it('returns null when demo off and explanation empty', () => {
    vi.stubEnv('NEXT_PUBLIC_AI_EXPLANATIONS_DEMO', 'false');
    expect(
      resolveEducatorExplanation({
        educator_explanation: null,
        decision_type: 'advance',
        skill: 'MATH-301',
      })
    ).toBeNull();
  });

  it('shapes advance / reinforce / pause copy', () => {
    expect(mockEducatorExplanation({ decisionType: 'advance', skill: 'MATH-301' })).toMatch(
      /ready to move/i
    );
    expect(mockEducatorExplanation({ decisionType: 'reinforce', skill: 'ELA-201' })).toMatch(
      /reinforcement/i
    );
    expect(mockEducatorExplanation({ decisionType: 'pause', skill: 'SCI-101' })).toMatch(/pausing/i);
  });
});
