import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleLearnerSummaryCore } from '../../../src/learners/summary-handler-core.js';
import { initStateStore, closeStateStore, clearStateStore, saveState } from '../../../src/state/store.js';
import {
  initDecisionStore,
  closeDecisionStore,
  clearDecisionStore,
  saveDecision,
} from '../../../src/decision/store.js';
import {
  initSignalLogStore,
  closeSignalLogStore,
  clearSignalLogStore,
  appendSignal,
} from '../../../src/signalLog/store.js';
import { ErrorCodes } from '../../../src/shared/error-codes.js';
import type { Decision, LearnerState, SignalEnvelope } from '../../../src/shared/types.js';
import * as policyLoader from '../../../src/decision/policy-loader.js';

const ORG = 'test-org';
const LEARNER = 'learner-1';

function createState(overrides: Partial<LearnerState> = {}): LearnerState {
  return {
    org_id: ORG,
    learner_reference: LEARNER,
    state_id: `${ORG}:${LEARNER}:v1`,
    state_version: 1,
    updated_at: '2026-03-01T10:00:00Z',
    state: {},
    provenance: {
      last_signal_id: 'signal-001',
      last_signal_timestamp: '2026-03-01T09:55:00Z',
    },
    ...overrides,
  };
}

function createDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    org_id: ORG,
    decision_id: 'dec-1',
    learner_reference: LEARNER,
    decision_type: 'intervene',
    decided_at: '2026-03-02T12:00:00Z',
    decision_context: {},
    trace: {
      state_id: `${ORG}:${LEARNER}:v1`,
      state_version: 1,
      policy_id: `${ORG}:learner`,
      policy_version: '1.0.0',
      matched_rule_id: 'rule-1',
      state_snapshot: { stabilityScore: 0.5 },
      matched_rule: null,
      rationale: 'test rationale',
      educator_summary: 'test educator summary',
    },
    ...overrides,
  };
}

function createSignal(overrides: Partial<SignalEnvelope> = {}): SignalEnvelope {
  return {
    org_id: ORG,
    signal_id: 'sig-1',
    source_system: 'test-system',
    learner_reference: LEARNER,
    timestamp: '2026-03-01T10:00:00Z',
    schema_version: 'v1',
    payload: {},
    ...overrides,
  };
}

describe('summary-handler-core', () => {
  beforeEach(() => {
    initStateStore(':memory:');
    initDecisionStore(':memory:');
    initSignalLogStore(':memory:');

    clearStateStore();
    clearDecisionStore();
    clearSignalLogStore();
  });

  afterEach(() => {
    closeStateStore();
    closeDecisionStore();
    closeSignalLogStore();
    vi.restoreAllMocks();
  });

  it('returns 400 when learner_reference missing', async () => {
    const result = await handleLearnerSummaryCore({ org_id: ORG } as unknown as { learner_reference: string });
    expect(result.statusCode).toBe(400);
    expect(result.body).toEqual({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: "'learner_reference' is required",
      field_path: 'learner_reference',
    });
  });

  it('returns 400 when org_id missing', async () => {
    const result = await handleLearnerSummaryCore({ learner_reference: LEARNER } as unknown as {
      learner_reference: string;
    });
    expect(result.statusCode).toBe(400);
    expect(result.body).toEqual({
      code: ErrorCodes.ORG_SCOPE_REQUIRED,
      message: 'org_id is required and must be non-empty',
      field_path: 'org_id',
    });
  });

  it('returns 400 when trajectory_fields not a string', async () => {
    const result = await handleLearnerSummaryCore({
      org_id: ORG,
      learner_reference: LEARNER,
      trajectory_fields: ['stabilityScore'],
    } as unknown as { learner_reference: string } & Record<string, unknown>);
    expect(result.statusCode).toBe(400);
    expect(result.body).toEqual({
      code: ErrorCodes.INVALID_TYPE,
      message: 'trajectory_fields must be a comma-separated string',
      field_path: 'trajectory_fields',
    });
  });

  it('returns 400 for dot-path trajectory_fields', async () => {
    const result = await handleLearnerSummaryCore({
      org_id: ORG,
      learner_reference: LEARNER,
      trajectory_fields: 'a.b',
    });
    expect(result.statusCode).toBe(400);
    expect(result.body).toEqual({
      code: ErrorCodes.INVALID_FORMAT,
      message: 'Dot-path fields are not supported in v1.1. Use top-level canonical field names.',
      field_path: 'trajectory_fields',
    });
  });

  it('returns 404 when no current state exists', async () => {
    const result = await handleLearnerSummaryCore({ org_id: ORG, learner_reference: LEARNER });
    expect(result.statusCode).toBe(404);
    expect(result.body).toEqual({
      code: ErrorCodes.STATE_NOT_FOUND,
      message: `No state found for learner '${LEARNER}' in org '${ORG}'`,
    });
  });

  it('returns 200 with computed default trajectories (numeric fields excluding *_delta)', async () => {
    // Seed 3 versions: numeric field + delta field + non-numeric field.
    saveState(
      createState({
        state_id: `${ORG}:${LEARNER}:v1`,
        state_version: 1,
        updated_at: '2026-03-01T10:00:00Z',
        state: { stabilityScore: 0.9, stabilityScore_delta: 0.1, status: 'ok' },
      })
    );
    saveState(
      createState({
        state_id: `${ORG}:${LEARNER}:v2`,
        state_version: 2,
        updated_at: '2026-03-02T10:00:00Z',
        state: { stabilityScore: 0.6, stabilityScore_delta: -0.3, status: 'ok' },
      })
    );
    saveState(
      createState({
        state_id: `${ORG}:${LEARNER}:v3`,
        state_version: 3,
        updated_at: '2026-03-03T10:00:00Z',
        state: { stabilityScore: 0.4, stabilityScore_delta: -0.2, status: 'warn' },
      })
    );

    // Seed signals (for signals_summary)
    appendSignal(createSignal({ signal_id: 'sig-a' }), '2026-03-01T10:00:00Z');
    appendSignal(createSignal({ signal_id: 'sig-b' }), '2026-03-02T10:00:00Z');

    // Seed a decision (for recent_decisions)
    saveDecision(createDecision({ decision_id: 'dec-a', decided_at: '2026-03-03T11:00:00Z' }));

    // Avoid filesystem dependencies for policy loading; return a deterministic policy.
    vi.spyOn(policyLoader, 'loadRoutingConfigForOrg').mockReturnValue({
      org_id: ORG,
      default_policy_key: 'learner',
    } as unknown as ReturnType<typeof policyLoader.loadRoutingConfigForOrg>);
    vi.spyOn(policyLoader, 'loadPolicyForContext').mockReturnValue({
      policy_id: `${ORG}:learner`,
      policy_version: '1.2.3',
      description: 'Test policy',
      rules: [],
    } as unknown as ReturnType<typeof policyLoader.loadPolicyForContext>);

    const result = await handleLearnerSummaryCore({ org_id: ORG, learner_reference: LEARNER });
    expect(result.statusCode).toBe(200);
    const body = result.body as unknown as {
      org_id: string;
      learner_reference: string;
      current_state: { state_version: number };
      field_trajectories: Record<
        string,
        {
          first_value: number;
          latest_value: number;
          overall_direction: string | null;
          version_count: number;
        }
      >;
      recent_decisions: unknown[];
      signals_summary: {
        total_count: number;
        first_signal_at: string | null;
        last_signal_at: string | null;
      };
      active_policy:
        | {
            policy_id: string;
            policy_key: string;
            policy_version: string;
            description: string;
            rule_count: number;
          }
        | null;
    };

    expect(body.org_id).toBe(ORG);
    expect(body.learner_reference).toBe(LEARNER);
    expect(body.current_state.state_version).toBe(3);

    // Default trajectories should include stabilityScore (numeric), exclude stabilityScore_delta and status.
    expect(body.field_trajectories).toHaveProperty('stabilityScore');
    expect(body.field_trajectories).not.toHaveProperty('stabilityScore_delta');
    expect(body.field_trajectories).not.toHaveProperty('status');
    expect(body.field_trajectories.stabilityScore).toMatchObject({
      first_value: 0.9,
      latest_value: 0.4,
      overall_direction: 'declining',
      version_count: 3,
    });

    expect(Array.isArray(body.recent_decisions)).toBe(true);

    expect(body.signals_summary).toEqual({
      total_count: 2,
      first_signal_at: '2026-03-01T10:00:00Z',
      last_signal_at: '2026-03-02T10:00:00Z',
    });

    expect(body.active_policy).toEqual({
      policy_id: `${ORG}:learner`,
      policy_key: 'learner',
      policy_version: '1.2.3',
      description: 'Test policy',
      rule_count: 0,
    });
  });

  it('returns 200 with explicit trajectory_fields (deduped & trimmed) even when default would be empty', async () => {
    // Current state has no numeric fields, so default would be empty; explicit should still compute.
    saveState(
      createState({
        state_id: `${ORG}:${LEARNER}:v1`,
        state_version: 1,
        updated_at: '2026-03-01T10:00:00Z',
        state: { status: 'ok', stabilityScore: 0.5 },
      })
    );
    saveState(
      createState({
        state_id: `${ORG}:${LEARNER}:v2`,
        state_version: 2,
        updated_at: '2026-03-02T10:00:00Z',
        state: { status: 'ok', stabilityScore: 0.6 },
      })
    );

    vi.spyOn(policyLoader, 'loadRoutingConfigForOrg').mockReturnValue(undefined);
    vi.spyOn(policyLoader, 'loadPolicyForContext').mockReturnValue({
      policy_id: `${ORG}:learner`,
      policy_version: '1.0.0',
      description: 'Test policy',
      rules: [],
    } as unknown as ReturnType<typeof policyLoader.loadPolicyForContext>);

    const result = await handleLearnerSummaryCore({
      org_id: ORG,
      learner_reference: LEARNER,
      trajectory_fields: ' stabilityScore , stabilityScore ',
    });
    expect(result.statusCode).toBe(200);
    const body = result.body as unknown as {
      field_trajectories: Record<
        string,
        {
          first_value: number;
          latest_value: number;
          overall_direction: string | null;
          version_count: number;
        }
      >;
    };
    expect(body.field_trajectories).toHaveProperty('stabilityScore');
    expect(body.field_trajectories.stabilityScore).toMatchObject({
      first_value: 0.5,
      latest_value: 0.6,
      overall_direction: 'improving',
      version_count: 2,
    });
  });

  it('sets active_policy to null when policy loader throws policy_not_found', async () => {
    saveState(createState({ state: { stabilityScore: 0.5 } }));
    vi.spyOn(policyLoader, 'loadRoutingConfigForOrg').mockReturnValue(undefined);
    vi.spyOn(policyLoader, 'loadPolicyForContext').mockImplementation(() => {
      const err = new Error('no policy') as Error & { code: string };
      err.code = ErrorCodes.POLICY_NOT_FOUND;
      throw err;
    });

    const result = await handleLearnerSummaryCore({ org_id: ORG, learner_reference: LEARNER });
    expect(result.statusCode).toBe(200);
    const body = result.body as unknown as { active_policy: unknown };
    expect(body.active_policy).toBeNull();
  });
});

