/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { scoreToLevel } from '../../dashboard/src/lib/score-levels.ts';
import { isReviewed, markReviewed } from '../../dashboard/src/lib/decision-review.ts';
import { skillDisplayLine } from '../../dashboard/src/lib/panel-helpers.ts';

describe('DPU-007: score-to-level mapping', () => {
  it('DPU-007: 0.20 → emerging', () => expect(scoreToLevel(0.2)).toBe('emerging'));
  it('DPU-007: 0.25 → emerging (boundary)', () => expect(scoreToLevel(0.25)).toBe('emerging'));
  it('DPU-007: 0.40 → novice', () => expect(scoreToLevel(0.4)).toBe('novice'));
  it('DPU-007: 0.50 → novice (boundary)', () => expect(scoreToLevel(0.5)).toBe('novice'));
  it('DPU-007: 0.60 → proficient', () => expect(scoreToLevel(0.6)).toBe('proficient'));
  it('DPU-007: 0.75 → proficient (boundary)', () => expect(scoreToLevel(0.75)).toBe('proficient'));
  it('DPU-007: 0.90 → mastery', () => expect(scoreToLevel(0.9)).toBe('mastery'));
  it('DPU-007: 1.00 → mastery (boundary)', () => expect(scoreToLevel(1.0)).toBe('mastery'));
});

describe('DPU-008: graceful degradation', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('DPU-008: absent skill field renders no "Skill:" line', () => {
    expect(skillDisplayLine(undefined)).toBe(null);
    expect(skillDisplayLine('')).toBe(null);
    expect(skillDisplayLine('Weather Patterns')).toBe('Skill: Weather Patterns');
  });

  it('DPU-008: decision-review localStorage approve/reject state', () => {
    expect(isReviewed('decision-xyz')).toBe(false);
    markReviewed('decision-abc');
    expect(isReviewed('decision-abc')).toBe(true);
  });
});
