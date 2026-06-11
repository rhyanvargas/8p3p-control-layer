import { describe, it, expect } from 'vitest';
import {
  completeMasteryBreakdown,
  computeLearningGaps,
  evaluateGiftedInterest,
  projectLearnerState,
  projectMasteryBreakdown,
  roundNumeric,
} from '../../../src/learners/state-projection.js';
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

  describe('projectMasteryBreakdown', () => {
    const aggregation = {
      computed_at_version: 3,
      overall: {
        masteryScore: 0.67501,
        stabilityScore: 0.6525,
        subject_count: 2,
        skill_count: 2,
      },
      subjects: {
        Math: {
          masteryScore: 0.9,
          stabilityScore: 0.81,
          skill_count: 1,
          strongest_skill: 'MATH-301',
          weakest_skill: 'MATH-301',
          skills: ['MATH-301'],
        },
        History: {
          masteryScore: 0.45,
          skill_count: 1,
          strongest_skill: 'HIST-202',
          weakest_skill: 'HIST-202',
          skills: ['HIST-202'],
        },
      },
      skills: {
        'MATH-301': {
          subject: 'Math',
          masteryScore: 0.9,
          stabilityScore: 0.81,
          masteryScore_direction: 'improving' as const,
          evidenceCount: 5,
        },
        'HIST-202': {
          subject: 'History',
          masteryScore: 0.45,
          masteryScore_direction: null,
          evidenceCount: 2,
        },
        'BAD-SKILL': {
          subject: 'General',
          masteryScore: Number.NaN,
          masteryScore_direction: null,
          evidenceCount: 0,
        },
      },
    };

    it('returns null when skills are absent or empty', () => {
      expect(projectMasteryBreakdown({})).toBeNull();
      expect(projectMasteryBreakdown({ skills: {} })).toBeNull();
      expect(projectMasteryBreakdown({ aggregation })).toBeNull();
    });

    it('returns null when aggregation is missing despite skills present', () => {
      expect(
        projectMasteryBreakdown({
          skills: { 'MATH-301': { masteryScore: 0.9 } },
        })
      ).toBeNull();
    });

    it('projects aggregation with rounded numerics and stripped subject skills lists', () => {
      const breakdown = projectMasteryBreakdown({
        skills: { 'MATH-301': {}, 'HIST-202': {} },
        aggregation,
      });

      expect(breakdown).not.toBeNull();
      expect(breakdown!.overall).toEqual({
        masteryScore: 0.675,
        stabilityScore: 0.6525,
        subject_count: 2,
        skill_count: 2,
      });
      expect(breakdown!.subjects.Math).toEqual({
        masteryScore: 0.9,
        stabilityScore: 0.81,
        skill_count: 1,
        strongest_skill: 'MATH-301',
        weakest_skill: 'MATH-301',
      });
      expect(breakdown!.subjects.Math).not.toHaveProperty('skills');
      expect(Object.keys(breakdown!.skills)).toEqual(['MATH-301', 'HIST-202']);
      expect(breakdown!.skills['MATH-301']).toEqual({
        subject: 'Math',
        masteryScore: 0.9,
        stabilityScore: 0.81,
        masteryScore_direction: 'improving',
        evidenceCount: 5,
      });
      expect(breakdown!.learning_gaps).toEqual([]);
      expect(breakdown!.gifted_interest).toEqual({ flagged: false, label: null });
    });
  });

  describe('computeLearningGaps', () => {
    it('includes skills below relative and absolute thresholds with gap sorted desc', () => {
      const aggregation = {
        computed_at_version: 1,
        overall: { masteryScore: 0.415, subject_count: 2, skill_count: 3 },
        subjects: {
          English: {
            masteryScore: 0.55,
            skill_count: 2,
            strongest_skill: 'ELA-101',
            weakest_skill: 'ELA-201',
            skills: ['ELA-101', 'ELA-201'],
          },
          Math: {
            masteryScore: 0.9,
            skill_count: 1,
            strongest_skill: 'MATH-301',
            weakest_skill: 'MATH-301',
            skills: ['MATH-301'],
          },
        },
        skills: {
          'ELA-201': {
            subject: 'English',
            masteryScore: 0.28,
            masteryScore_direction: 'declining',
            evidenceCount: 4,
          },
          'ELA-101': {
            subject: 'English',
            masteryScore: 0.82,
            masteryScore_direction: null,
            evidenceCount: 3,
          },
          'MATH-301': {
            subject: 'Math',
            masteryScore: 0.9,
            masteryScore_direction: null,
            evidenceCount: 5,
          },
        },
      };

      expect(computeLearningGaps(aggregation)).toEqual([
        {
          skill: 'ELA-201',
          subject: 'English',
          masteryScore: 0.28,
          subject_masteryScore: 0.55,
          gap: 0.27,
          masteryScore_direction: 'declining',
        },
      ]);
    });

    it('excludes skills above absolute floor even when relative gap exists', () => {
      const aggregation = {
        computed_at_version: 1,
        overall: { masteryScore: 0.75, subject_count: 1, skill_count: 2 },
        subjects: {
          Math: {
            masteryScore: 0.75,
            skill_count: 2,
            strongest_skill: 'MATH-301',
            weakest_skill: 'MATH-302',
            skills: ['MATH-301', 'MATH-302'],
          },
        },
        skills: {
          'MATH-301': {
            subject: 'Math',
            masteryScore: 0.8,
            masteryScore_direction: null,
            evidenceCount: 3,
          },
          'MATH-302': {
            subject: 'Math',
            masteryScore: 0.7,
            masteryScore_direction: null,
            evidenceCount: 3,
          },
        },
      };

      expect(computeLearningGaps(aggregation)).toEqual([]);
    });
  });

  describe('evaluateGiftedInterest', () => {
    const giftedReadyAggregation = {
      computed_at_version: 1,
      overall: { masteryScore: 0.96, subject_count: 2, skill_count: 2 },
      subjects: {
        Math: {
          masteryScore: 0.96,
          skill_count: 1,
          strongest_skill: 'MATH-301',
          weakest_skill: 'MATH-301',
          skills: ['MATH-301'],
        },
        Science: {
          masteryScore: 0.96,
          skill_count: 1,
          strongest_skill: 'SCI-101',
          weakest_skill: 'SCI-101',
          skills: ['SCI-101'],
        },
      },
      skills: {
        'MATH-301': {
          subject: 'Math',
          masteryScore: 0.96,
          masteryScore_direction: null,
          evidenceCount: 3,
        },
        'SCI-101': {
          subject: 'Science',
          masteryScore: 0.98,
          masteryScore_direction: null,
          evidenceCount: 4,
        },
      },
    };

    it('flags when all criteria pass', () => {
      expect(
        evaluateGiftedInterest(giftedReadyAggregation, {
          total: 2,
          types: { advance: 2, reinforce: 0, intervene: 0, pause: 0 },
        })
      ).toEqual({ flagged: true, label: 'Person of interest' });
    });

    it('fails G2 when one skill is below mastery threshold', () => {
      const aggregation = {
        ...giftedReadyAggregation,
        skills: {
          ...giftedReadyAggregation.skills,
          'MATH-301': {
            ...giftedReadyAggregation.skills['MATH-301'],
            masteryScore: 0.8,
          },
        },
      };
      expect(
        evaluateGiftedInterest(aggregation, {
          total: 1,
          types: { advance: 1, reinforce: 0, intervene: 0, pause: 0 },
        })
      ).toEqual({ flagged: false, label: null });
    });

    it('fails G4 when a reinforce decision exists', () => {
      expect(
        evaluateGiftedInterest(giftedReadyAggregation, {
          total: 2,
          types: { advance: 1, reinforce: 1, intervene: 0, pause: 0 },
        })
      ).toEqual({ flagged: false, label: null });
    });

    it('fails G1 with only one skill', () => {
      const aggregation = {
        ...giftedReadyAggregation,
        skills: { 'MATH-301': giftedReadyAggregation.skills['MATH-301'] },
      };
      expect(
        evaluateGiftedInterest(aggregation, {
          total: 1,
          types: { advance: 1, reinforce: 0, intervene: 0, pause: 0 },
        })
      ).toEqual({ flagged: false, label: null });
    });

    it('fails G6 when evidenceCount is insufficient', () => {
      const aggregation = {
        ...giftedReadyAggregation,
        skills: {
          ...giftedReadyAggregation.skills,
          'SCI-101': {
            ...giftedReadyAggregation.skills['SCI-101'],
            evidenceCount: 2,
          },
        },
      };
      expect(
        evaluateGiftedInterest(aggregation, {
          total: 1,
          types: { advance: 1, reinforce: 0, intervene: 0, pause: 0 },
        })
      ).toEqual({ flagged: false, label: null });
    });
  });

  describe('completeMasteryBreakdown', () => {
    it('assembles projected breakdown with learning gaps and gifted interest', () => {
      const state = {
        skills: { 'ELA-201': {}, 'ELA-101': {} },
        aggregation: {
          computed_at_version: 1,
          overall: { masteryScore: 0.55, subject_count: 1, skill_count: 2 },
          subjects: {
            English: {
              masteryScore: 0.55,
              skill_count: 2,
              strongest_skill: 'ELA-101',
              weakest_skill: 'ELA-201',
              skills: ['ELA-101', 'ELA-201'],
            },
          },
          skills: {
            'ELA-201': {
              subject: 'English',
              masteryScore: 0.28,
              masteryScore_direction: 'declining',
              evidenceCount: 4,
            },
            'ELA-101': {
              subject: 'English',
              masteryScore: 0.82,
              masteryScore_direction: null,
              evidenceCount: 3,
            },
          },
        },
      };

      const breakdown = completeMasteryBreakdown(state, {
        total: 0,
        types: { advance: 0, reinforce: 0, intervene: 0, pause: 0 },
      });

      expect(breakdown!.learning_gaps).toHaveLength(1);
      expect(breakdown!.learning_gaps[0]!.skill).toBe('ELA-201');
      expect(breakdown!.gifted_interest).toEqual({ flagged: false, label: null });
    });
  });
});
