/**
 * Unit tests for dominant-skill top-level score promotion (v1.1).
 * @see docs/specs/state-engine.md § "Top-level skill score promotion (v1.1)"
 */

import { describe, it, expect } from 'vitest';
import {
  computeNewState,
  computeStateDeltas,
  promoteDominantSkillScores,
} from '../../../src/state/engine.js';
import type { LearnerState, SignalRecord } from '../../../src/shared/types.js';

function createSignalRecord(
  payload: Record<string, unknown>,
  acceptedAt?: string
): SignalRecord {
  const accepted_at = acceptedAt ?? new Date().toISOString();
  return {
    org_id: 'org-A',
    signal_id: `sig-${accepted_at}`,
    source_system: 'test',
    learner_reference: 'learner-1',
    timestamp: accepted_at,
    schema_version: 'v1',
    payload,
    accepted_at,
  };
}

describe('promoteDominantSkillScores', () => {
  it('mirrors masteryScore from skills[skill] when skill is MATH-301', () => {
    const state: Record<string, unknown> = {
      skill: 'MATH-301',
      skills: { 'MATH-301': { masteryScore: 0.9 } },
    };
    promoteDominantSkillScores(state);
    expect(state.masteryScore).toBe(0.9);
  });

  it('does not promote when skill field is absent', () => {
    const state: Record<string, unknown> = {
      skills: { 'MATH-301': { masteryScore: 0.9 } },
      masteryScore: 0.5,
    };
    promoteDominantSkillScores(state);
    expect(state.masteryScore).toBe(0.5);
  });

  it('does not promote when skill is set but skills[skill] is missing', () => {
    const state: Record<string, unknown> = {
      skill: 'X',
      skills: { 'MATH-301': { masteryScore: 0.9 } },
      masteryScore: 0.5,
    };
    promoteDominantSkillScores(state);
    expect(state.masteryScore).toBe(0.5);
  });

  it('mirrors both masteryScore and stabilityScore when present on dominant skill', () => {
    const state: Record<string, unknown> = {
      skill: 'MATH-301',
      skills: { 'MATH-301': { masteryScore: 0.9, stabilityScore: 0.81 } },
    };
    promoteDominantSkillScores(state);
    expect(state.masteryScore).toBe(0.9);
    expect(state.stabilityScore).toBe(0.81);
  });
});

describe('computeNewState with dominant-skill promotion', () => {
  it('promotes top-level masteryScore after a single skill signal', () => {
    const signals = [
      createSignalRecord({
        skill: 'MATH-301',
        skills: { 'MATH-301': { masteryScore: 0.9 } },
      }),
    ];
    const state = computeNewState(null, signals);
    expect(state.masteryScore).toBe(0.9);
  });

  it('computes improving masteryScore_direction across consecutive signals for same skill', () => {
    const current: LearnerState = {
      org_id: 'org-A',
      learner_reference: 'learner-1',
      state_id: 'org-A:learner-1:v1',
      state_version: 1,
      updated_at: '2026-02-07T10:00:00Z',
      state: {
        skill: 'MATH-301',
        skills: { 'MATH-301': { masteryScore: 0.45 } },
        masteryScore: 0.45,
      },
      provenance: { last_signal_id: 'prev', last_signal_timestamp: '2026-02-07T09:00:00Z' },
    };
    const signals = [
      createSignalRecord({
        skill: 'MATH-301',
        skills: { 'MATH-301': { masteryScore: 0.68 } },
      }),
      createSignalRecord({
        skill: 'MATH-301',
        skills: { 'MATH-301': { masteryScore: 0.9 } },
      }),
    ];
    const merged = computeNewState(current, signals);
    const priorObj = current.state as Record<string, unknown>;
    const withDeltas = computeStateDeltas(priorObj, merged);

    expect(withDeltas.masteryScore).toBe(0.9);
    expect(withDeltas.masteryScore_direction).toBe('improving');
    expect(withDeltas.masteryScore_delta as number).toBeCloseTo(0.45, 10);
  });
});
