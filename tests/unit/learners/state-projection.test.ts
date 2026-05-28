import { describe, it, expect } from 'vitest';
import { projectLearnerState, roundNumeric } from '../../../src/learners/state-projection.js';
import { isAllowedURSKey } from '../../../src/learners/urs-allowlist.js';

/** Representative Springs Jordan-shape state with xAPI envelope noise. */
const JORDAN_SHAPE_STATE: Record<string, unknown> = {
  stabilityScore: 0.58,
  timeSinceReinforcement: 100000,
  masteryScore: 0.21999999999999997,
  skill: 'MATH-301',
  stabilityScore_delta: -0.12,
  stabilityScore_direction: 'declining',
  generated: {
    scoreGiven: 90,
    scoreGiven_delta_delta_delta: 105,
  },
  group: { courseNumber: 'MATH-301' },
  object: {
    extensions: {
      com_instructure_canvas: { submission_type: 'online_quiz' },
    },
    assignable: { title: 'Quiz 1' },
  },
  extensions: {
    timeSinceLastActivity: 30000,
    bb_action_name: 'GradeSubmission',
  },
  skills: {
    'MATH-301': { masteryScore: 0.9, stabilityScore: 0.81 },
    'HIST-202': { masteryScore: 0.45 },
  },
  email: 'learner@example.com',
  student_name: 'Jordan',
};

describe('state-projection', () => {
  describe('projectLearnerState', () => {
    it('projects Jordan-shape state to canonical URS scalars only', () => {
      const projected = projectLearnerState(JORDAN_SHAPE_STATE);

      expect(projected).toEqual({
        stabilityScore: 0.58,
        timeSinceReinforcement: 100000,
        masteryScore: 0.22,
        skill: 'MATH-301',
        stabilityScore_delta: -0.12,
        stabilityScore_direction: 'declining',
      });
    });

    it('returns empty object for empty state', () => {
      expect(projectLearnerState({})).toEqual({});
    });

    it('passes through state with only canonical fields', () => {
      const state = {
        masteryScore: 0.75,
        stabilityScore: 0.5,
        timeSinceReinforcement: 5000,
        riskSignal: 0.1,
        skill: 'HIST-202',
      };
      expect(projectLearnerState(state)).toEqual(state);
    });

    it('omits nested skills map', () => {
      const projected = projectLearnerState({
        masteryScore: 0.8,
        skills: { 'MATH-301': { masteryScore: 0.9 } },
      });
      expect(projected).not.toHaveProperty('skills');
      expect(projected.masteryScore).toBe(0.8);
    });

    it('omits nested extensions object', () => {
      const projected = projectLearnerState({
        stabilityScore: 0.5,
        extensions: { bb_action_name: 'GradeSubmission' },
      });
      expect(projected).not.toHaveProperty('extensions');
      expect(projected.stabilityScore).toBe(0.5);
    });

    it('drops allowlisted keys whose values are non-scalar', () => {
      const projected = projectLearnerState({
        masteryScore: { nested: true } as unknown as number,
        skill: ['MATH-301'] as unknown as string,
      });
      expect(projected).toEqual({});
    });

    it('preserves null direction companions', () => {
      const projected = projectLearnerState({
        masteryScore: 0.5,
        masteryScore_direction: null,
      });
      expect(projected.masteryScore_direction).toBeNull();
    });

    it('output keys are all allowlisted', () => {
      const projected = projectLearnerState(JORDAN_SHAPE_STATE);
      for (const key of Object.keys(projected)) {
        expect(isAllowedURSKey(key)).toBe(true);
      }
    });
  });

  describe('roundNumeric', () => {
    it('rounds floats to 4 decimal places', () => {
      expect(roundNumeric(0.21999999999999997)).toBe(0.22);
    });

    it('leaves integers unchanged', () => {
      expect(roundNumeric(100000)).toBe(100000);
    });
  });
});
