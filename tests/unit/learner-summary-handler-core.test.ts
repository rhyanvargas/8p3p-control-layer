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
import { getState, getStateVersionRange } from '../../src/state/store.js';
import { getRecentDecisionsByLearner } from '../../src/decision/store.js';
import { getSignalSummary } from '../../src/signalLog/store.js';
import { loadPolicyForContext, loadRoutingConfigForOrg } from '../../src/decision/policy-loader.js';
import { buildSummary, buildVersions } from '../../src/state/trajectory-handler-core.js';

const mockGetState = vi.mocked(getState);
const mockGetStateVersionRange = vi.mocked(getStateVersionRange);
const mockGetRecentDecisionsByLearner = vi.mocked(getRecentDecisionsByLearner);
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

    it('caps derived fields at 10', async () => {
      const state: Record<string, unknown> = {};
      for (let i = 0; i < 15; i++) state[`f${i}`] = i;
      mockGetState.mockReturnValue(makeLearnerState({ state_version: 1, state }));

      await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
      });

      const fieldsArg = mockBuildVersions.mock.calls[0]?.[1] as string[];
      expect(fieldsArg).toHaveLength(10);
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

    it('sets recent_decisions_count to projected array length', async () => {
      mockGetRecentDecisionsByLearner.mockReturnValue([
        makeDecision({ decision_id: 'd1' }),
        makeDecision({ decision_id: 'd2' }),
        makeDecision({ decision_id: 'd3' }),
      ]);

      const result = await handleLearnerSummaryCore({
        org_id: 'test-org',
        learner_reference: 'learner-001',
      });

      const body = result.body as { recent_decisions: unknown[]; recent_decisions_count: number };
      expect(body.recent_decisions).toHaveLength(3);
      expect(body.recent_decisions_count).toBe(3);
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
});

