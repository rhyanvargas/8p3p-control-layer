/**
 * Unit tests for summary-handler-core.
 * Mirrors TASK-015 plan cases: validation, paging loop, projection, and policy behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../src/shared/error-codes.js';
import type { Decision, LearnerState } from '../../src/shared/types.js';

vi.mock('../../src/state/store.js', () => ({
  getState: vi.fn(),
  getStateVersionRange: vi.fn(),
}));

vi.mock('../../src/decision/store.js', () => ({
  getRecentDecisionsByLearner: vi.fn(),
  getDecisionTypeSummaryForLearner: vi.fn(),
}));

vi.mock('../../src/signalLog/store.js', () => ({
  getSignalSummary: vi.fn(),
}));

vi.mock('../../src/decision/policy-loader.js', () => ({
  loadPolicyForContext: vi.fn(),
  loadRoutingConfigForOrg: vi.fn(),
}));

vi.mock('../../src/state/trajectory-handler-core.js', () => ({
  buildVersions: vi.fn(),
  buildSummary: vi.fn(),
}));

import { handleLearnerSummaryCore } from '../../src/learners/summary-handler-core.js';
import { roundNumeric } from '../../src/learners/state-projection.js';
import { getState, getStateVersionRange } from '../../src/state/store.js';
import { getRecentDecisionsByLearner, getDecisionTypeSummaryForLearner } from '../../src/decision/store.js';
import { getSignalSummary } from '../../src/signalLog/store.js';
import { loadPolicyForContext, loadRoutingConfigForOrg } from '../../src/decision/policy-loader.js';
import { buildSummary, buildVersions } from '../../src/state/trajectory-handler-core.js';

const mockGetState = vi.mocked(getState);
const mockGetStateVersionRange = vi.mocked(getStateVersionRange);
const mockGetRecentDecisionsByLearner = vi.mocked(getRecentDecisionsByLearner);
const mockGetDecisionTypeSummaryForLearner = vi.mocked(getDecisionTypeSummaryForLearner);
const mockGetSignalSummary = vi.mocked(getSignalSummary);
const mockLoadPolicyForContext = vi.mocked(loadPolicyForContext);
const mockLoadRoutingConfigForOrg = vi.mocked(loadRoutingConfigForOrg);
const mockBuildVersions = vi.mocked(buildVersions);
const mockBuildSummary = vi.mocked(buildSummary);

function makeLearnerState(overrides: Partial<LearnerState> = {}): LearnerState {
  return {
    org_id: 'test-org',
    learner_reference: 'learner-001',
    state_id: 'test-org:learner-001:v1',
    state_version: 1,
    updated_at: '2026-03-01T10:00:00Z',
    state: {},
    provenance: {
      last_signal_id: 'sig-001',
      last_signal_timestamp: '2026-03-01T09:55:00Z',
    },
    ...overrides,
  };
}

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    org_id: 'test-org',
    decision_id: 'dec-1',
    learner_reference: 'learner-001',
    decision_type: 'intervene',
    decided_at: '2026-03-28T14:45:30Z',
    decision_context: {},
    trace: {
      state_id: 'test-org:learner-001:v3',
      state_version: 3,
      policy_id: 'test-org:learner',
      policy_version: '1.1.0',
      matched_rule_id: 'rule-decay-intervene',
      state_snapshot: { stabilityScore: 0.28 },
      matched_rule: null,
      rationale: 'Rule fired',
      educator_summary: 'summary',
    },
    ...overrides,
  };
}

describe('summary-handler-core', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockGetState.mockReturnValue(makeLearnerState({ state_version: 3 }));
    mockGetStateVersionRange.mockReturnValue({ states: [], nextCursor: null });
    mockGetRecentDecisionsByLearner.mockReturnValue([]);
    mockGetDecisionTypeSummaryForLearner.mockReturnValue({
      total: 0,
      types: { advance: 0, reinforce: 0, intervene: 0, pause: 0 },
    });
    mockGetSignalSummary.mockReturnValue({
      total_count: 0,
      first_signal_at: null,
      last_signal_at: null,
    });
    mockLoadRoutingConfigForOrg.mockReturnValue(undefined);
    mockLoadPolicyForContext.mockReturnValue({
      policy_id: 'test-org:learner',
      policy_version: '1.1.0',
      description: 'test policy',
      rules: [{ id: 'r1' }],
    } as unknown as ReturnType<typeof loadPolicyForContext>);

    mockBuildVersions.mockReturnValue([] as unknown as ReturnType<typeof buildVersions>);
    mockBuildSummary.mockReturnValue({} as unknown as ReturnType<typeof buildSummary>);
  });

  // =========================================================================
  // Validation
  // =========================================================================
  describe('validation — missing/invalid params', () => {
    it('rejects missing org_id', async () => {
      const result = await handleLearnerSummaryCore({ learner_reference: 'learner-001' });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({
        code: ErrorCodes.ORG_SCOPE_REQUIRED,
        field_path: 'org_id',
      });
    });

    it('rejects missing learner_reference', async () => {
      const result = await handleLearnerSummaryCore({ org_id: 'test-org', learner_reference: '' });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({
        code: ErrorCodes.MISSING_REQUIRED_FIELD,
        field_path: 'learner_reference',
      });
    });

    it('rejects recent_decisions_limit = 0', async () => {
      const result = await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        recent_decisions_limit: '0',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({
        code: ErrorCodes.INVALID_FORMAT,
        field_path: 'recent_decisions_limit',
      });
    });

    it('rejects recent_decisions_limit = 51', async () => {
      const result = await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        recent_decisions_limit: '51',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({
        code: ErrorCodes.INVALID_FORMAT,
        field_path: 'recent_decisions_limit',
      });
    });

    it('rejects trajectory_fields with 11 fields', async () => {
      const fields = Array.from({ length: 11 }, (_, i) => `field${i}`).join(',');
      const result = await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        trajectory_fields: fields,
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({
        code: ErrorCodes.INVALID_FORMAT,
        field_path: 'trajectory_fields',
      });
      expect((result.body as { message: string }).message).toBe(
        'Maximum 10 fields per trajectory request. Got 11.'
      );
    });

    it('rejects trajectory_fields with dot-path', async () => {
      const result = await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
        trajectory_fields: 'skills.fractions.stabilityScore',
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).toMatchObject({
        code: ErrorCodes.INVALID_FORMAT,
        field_path: 'trajectory_fields',
      });
      expect((result.body as { message: string }).message).toBe(
        'Dot-path fields are not supported in v1.1. Use top-level canonical field names.'
      );
    });
  });

  // =========================================================================
  // 404 logic
  // =========================================================================
  describe('404 — state not found', () => {
    it('returns 404 when getState returns null', async () => {
      mockGetState.mockReturnValue(null);
      const result = await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'ghost',
      });
      expect(result.statusCode).toBe(404);
      expect(result.body).toMatchObject({
        code: ErrorCodes.STATE_NOT_FOUND,
        message: "No state found for learner 'ghost' in org 'test-org'",
      });
    });
  });

  // =========================================================================
  // Default trajectory_fields derivation
  // =========================================================================
  describe('default trajectory_fields derivation', () => {
    it('derives numeric non-_delta fields from current state', async () => {
      mockGetState.mockReturnValue(
        makeLearnerState({
          state_version: 2,
          state: {
            stabilityScore: 0.5,
            masteryScore: 0.7,
            stabilityScore_delta: 0.1,
            stabilityScore_direction: 'improving',
            nonNumeric: 'foo',
          },
        })
      );

      await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
      });

      expect(mockBuildVersions).toHaveBeenCalledTimes(1);
      const fieldsArg = mockBuildVersions.mock.calls[0]?.[1];
      expect(fieldsArg).toEqual(['stabilityScore', 'masteryScore']);
    });

    it('ignores non-URS numeric keys and includes only projected fields', async () => {
      const state: Record<string, unknown> = {
        masteryScore: 0.7,
        stabilityScore: 0.5,
      };
      for (let i = 0; i < 15; i++) state[`f${i}`] = i;
      mockGetState.mockReturnValue(makeLearnerState({ state_version: 1, state }));

      await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
      });

      expect(mockBuildVersions).toHaveBeenCalledTimes(1);
      const fieldsArg = mockBuildVersions.mock.calls[0]?.[1] as string[];
      expect(fieldsArg).toEqual(['masteryScore', 'stabilityScore']);
      expect(fieldsArg.every((k) => !k.startsWith('f'))).toBe(true);
    });
  });

  // =========================================================================
  // Paging loop
  // =========================================================================
  describe('paging loop', () => {
    it('concatenates pages until nextCursor is null and passes to buildVersions/buildSummary', async () => {
      const page1States = [makeLearnerState({ state_version: 1, state: { stabilityScore: 0.7 } })];
      const page2States = [makeLearnerState({ state_version: 2, state: { stabilityScore: 0.5 } })];

      mockGetState.mockReturnValue(makeLearnerState({ state_version: 2, state: { stabilityScore: 0.5 } }));
      mockGetStateVersionRange
        .mockReturnValueOnce({ states: page1States, nextCursor: 50 })
        .mockReturnValueOnce({ states: page2States, nextCursor: null });

      mockBuildVersions.mockReturnValue(['versions'] as unknown as ReturnType<typeof buildVersions>);
      mockBuildSummary.mockReturnValue({
        stabilityScore: {
          first_value: 0.7,
          latest_value: 0.5,
          overall_direction: 'declining',
          version_count: 2,
        },
      } as unknown as ReturnType<typeof buildSummary>);

      const result = await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
      });

      expect(result.statusCode).toBe(200);
      expect(mockGetStateVersionRange).toHaveBeenCalledTimes(2);

      expect(mockBuildVersions).toHaveBeenCalledWith(
        [...page1States, ...page2States],
        ['stabilityScore']
      );
      expect(mockBuildSummary).toHaveBeenCalledWith(['versions'], ['stabilityScore']);
    });
  });

  // =========================================================================
  // Policy behavior
  // =========================================================================
  describe('active_policy behavior', () => {
    it('sets active_policy to null on policy_not_found', async () => {
      mockLoadPolicyForContext.mockImplementation(() => {
        const err = new Error('no policy') as Error & { code: string };
        err.code = ErrorCodes.POLICY_NOT_FOUND;
        throw err;
      });

      const result = await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
      });

      expect(result.statusCode).toBe(200);
      const body = result.body as { active_policy: unknown };
      expect(body.active_policy).toBeNull();
    });

    it('rethrows non-policy_not_found errors from loadPolicyForContext', async () => {
      mockLoadPolicyForContext.mockImplementation(() => {
        const err = new Error('bad policy') as Error & { code: string };
        err.code = 'invalid_policy_structure';
        throw err;
      });

      await expect(
        handleLearnerSummaryCore({
          org_id: 'test-org',
          learner_reference: 'learner-001',
        })
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // Recent decisions projection + counts
  // =========================================================================
  describe('recent decisions projection', () => {
    it('projects only the seven spec-listed keys (including educator_summary)', async () => {
      mockGetRecentDecisionsByLearner.mockReturnValue([
        makeDecision({
          trace: {
            ...makeDecision().trace,
            state_snapshot: { shouldNotLeak: true },
          },
        }),
      ]);

      const result = await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
      });

      expect(result.statusCode).toBe(200);
      const body = result.body as {
        recent_decisions: Array<Record<string, unknown>>;
      };
      expect(body.recent_decisions).toHaveLength(1);
      const keys = Object.keys(body.recent_decisions[0]!).toSorted();
      expect(keys).toEqual(
        [
          'decided_at',
          'decision_id',
          'decision_type',
          'educator_summary',
          'matched_rule_id',
          'policy_version',
          'rationale',
        ].toSorted()
      );
      expect(body.recent_decisions[0]!.educator_summary).toBe('summary');
    });

  });

  // =========================================================================
  // Signals summary + generated_at
  // =========================================================================
  describe('signals_summary and generated_at', () => {
    it('passes through signals summary', async () => {
      mockGetSignalSummary.mockReturnValue({
        total_count: 7,
        first_signal_at: '2026-03-01T00:00:00Z',
        last_signal_at: '2026-03-28T00:00:00Z',
      });

      const result = await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
      });

      expect(result.statusCode).toBe(200);
      const body = result.body as { signals_summary: unknown };
      expect(body.signals_summary).toEqual({
        total_count: 7,
        first_signal_at: '2026-03-01T00:00:00Z',
        last_signal_at: '2026-03-28T00:00:00Z',
      });
    });

    it('returns generated_at as ISO 8601', async () => {
      const result = await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
      });
      const body = result.body as { generated_at: string };
      expect(new Date(body.generated_at).toISOString()).toBe(body.generated_at);
    });
  });

  // =========================================================================
  // mastery_breakdown projection
  // =========================================================================
  describe('mastery_breakdown projection', () => {
    it('includes mastery_breakdown null when learner has no skills', async () => {
      mockGetState.mockReturnValue(
        makeLearnerState({
          state: { masteryScore: 0.8, stabilityScore: 0.7 },
        })
      );

      const result = await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
      });

      expect(result.statusCode).toBe(200);
      const body = result.body as { current_state: { mastery_breakdown: unknown } };
      expect(body.current_state.mastery_breakdown).toBeNull();
    });

    it('projects mastery_breakdown from state.aggregation when skills present', async () => {
      mockGetState.mockReturnValue(
        makeLearnerState({
          state: {
            masteryScore: 0.9,
            skills: { 'MATH-301': { masteryScore: 0.9 } },
            aggregation: {
              computed_at_version: 1,
              overall: {
                masteryScore: 0.9,
                subject_count: 1,
                skill_count: 1,
              },
              subjects: {
                Math: {
                  masteryScore: 0.9,
                  skill_count: 1,
                  strongest_skill: 'MATH-301',
                  weakest_skill: 'MATH-301',
                  skills: ['MATH-301'],
                },
              },
              skills: {
                'MATH-301': {
                  subject: 'Math',
                  masteryScore: 0.9,
                  masteryScore_direction: 'improving',
                  evidenceCount: 3,
                },
              },
            },
          },
        })
      );

      const result = await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
      });

      expect(result.statusCode).toBe(200);
      const body = result.body as {
        current_state: {
          fields: Record<string, unknown>;
          mastery_breakdown: {
            overall: { masteryScore: number };
            subjects: Record<string, unknown>;
          } | null;
        };
      };
      expect(body.current_state.fields).not.toHaveProperty('skills');
      expect(body.current_state.mastery_breakdown?.overall.masteryScore).toBe(0.9);
      expect(body.current_state.mastery_breakdown?.subjects.Math).toEqual({
        masteryScore: 0.9,
        skill_count: 1,
        strongest_skill: 'MATH-301',
        weakest_skill: 'MATH-301',
      });
    });

    it('includes learning_gaps and gifted_interest from aggregation (AGG-009, AGG-011)', async () => {
      mockGetState.mockReturnValue(
        makeLearnerState({
          state: {
            masteryScore: 0.55,
            skills: {
              'ELA-201': { masteryScore: 0.28 },
              'ELA-202': { masteryScore: 0.82 },
            },
            aggregation: {
              computed_at_version: 1,
              overall: {
                masteryScore: 0.55,
                subject_count: 1,
                skill_count: 2,
              },
              subjects: {
                English: {
                  masteryScore: 0.55,
                  skill_count: 2,
                  strongest_skill: 'ELA-202',
                  weakest_skill: 'ELA-201',
                  skills: ['ELA-201', 'ELA-202'],
                },
              },
              skills: {
                'ELA-201': {
                  subject: 'English',
                  masteryScore: 0.28,
                  masteryScore_direction: 'declining',
                  evidenceCount: 2,
                },
                'ELA-202': {
                  subject: 'English',
                  masteryScore: 0.82,
                  masteryScore_direction: 'improving',
                  evidenceCount: 3,
                },
              },
            },
          },
        })
      );

      mockGetDecisionTypeSummaryForLearner.mockReturnValue({
        total: 4,
        types: { advance: 4, reinforce: 0, intervene: 0, pause: 0 },
      });

      const result = await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
      });

      expect(result.statusCode).toBe(200);
      const body = result.body as {
        current_state: {
          mastery_breakdown: {
            learning_gaps: Array<{ skill: string; gap: number }>;
            gifted_interest: { flagged: boolean; label: string | null };
          } | null;
        };
      };

      expect(body.current_state.mastery_breakdown?.learning_gaps).toEqual([
        expect.objectContaining({ skill: 'ELA-201', gap: 0.27 }),
      ]);
      expect(body.current_state.mastery_breakdown?.gifted_interest).toEqual({
        flagged: false,
        label: null,
      });
    });

    it('flags gifted_interest when all criteria pass (AGG-011 via handler)', async () => {
      mockGetState.mockReturnValue(
        makeLearnerState({
          state: {
            skills: {
              'MATH-301': { masteryScore: 0.96 },
              'HIST-202': { masteryScore: 0.98 },
            },
            aggregation: {
              computed_at_version: 1,
              overall: {
                masteryScore: 0.97,
                subject_count: 2,
                skill_count: 2,
              },
              subjects: {
                Math: {
                  masteryScore: 0.96,
                  skill_count: 1,
                  strongest_skill: 'MATH-301',
                  weakest_skill: 'MATH-301',
                  skills: ['MATH-301'],
                },
                History: {
                  masteryScore: 0.98,
                  skill_count: 1,
                  strongest_skill: 'HIST-202',
                  weakest_skill: 'HIST-202',
                  skills: ['HIST-202'],
                },
              },
              skills: {
                'MATH-301': {
                  subject: 'Math',
                  masteryScore: 0.96,
                  masteryScore_direction: 'improving',
                  evidenceCount: 3,
                },
                'HIST-202': {
                  subject: 'History',
                  masteryScore: 0.98,
                  masteryScore_direction: 'improving',
                  evidenceCount: 4,
                },
              },
            },
          },
        })
      );

      mockGetDecisionTypeSummaryForLearner.mockReturnValue({
        total: 3,
        types: { advance: 3, reinforce: 0, intervene: 0, pause: 0 },
      });

      const result = await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
      });

      expect(result.statusCode).toBe(200);
      const body = result.body as {
        current_state: {
          mastery_breakdown: {
            gifted_interest: { flagged: boolean; label: string | null };
          } | null;
        };
      };

      expect(body.current_state.mastery_breakdown?.gifted_interest).toEqual({
        flagged: true,
        label: 'Person of interest',
      });
    });
  });

  // =========================================================================
  // Numeric rounding at projection boundary
  // =========================================================================
  describe('numeric rounding', () => {
    it('roundNumeric rounds floats to 4 decimal places', () => {
      expect(roundNumeric(0.21999999999999997)).toBe(0.22);
    });

    it('roundNumeric passes integers through unchanged', () => {
      expect(roundNumeric(100000)).toBe(100000);
    });

    it('roundNumeric passes non-finite numbers through unchanged', () => {
      expect(roundNumeric(Number.NaN)).toBe(Number.NaN);
      expect(roundNumeric(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    });

    it('rounds top-level current_state.fields and field_trajectories values', async () => {
      mockGetState.mockReturnValue(
        makeLearnerState({
          state_version: 2,
          state: {
            stabilityScore: 0.21999999999999997,
            masteryScore: 0.19800000000000006,
            timeSinceReinforcement: 100000,
          },
        })
      );

      mockBuildSummary.mockReturnValue({
        stabilityScore: {
          first_value: 0.21999999999999997,
          latest_value: 0.19800000000000006,
          overall_direction: 'declining',
          version_count: 2,
        },
      } as unknown as ReturnType<typeof buildSummary>);

      const result = await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
      });

      expect(result.statusCode).toBe(200);
      const body = result.body as {
        current_state: { fields: Record<string, unknown> };
        field_trajectories: Record<string, { first_value: number; latest_value: number }>;
      };
      expect(body.current_state.fields.stabilityScore).toBe(0.22);
      expect(body.current_state.fields.masteryScore).toBe(0.198);
      expect(body.current_state.fields.timeSinceReinforcement).toBe(100000);
      expect(body.field_trajectories.stabilityScore.first_value).toBe(0.22);
      expect(body.field_trajectories.stabilityScore.latest_value).toBe(0.198);
    });
  });
});

