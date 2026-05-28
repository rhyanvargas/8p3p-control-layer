/**
 * Contract Tests for Learner Summary API (SUM-001 through SUM-008)
 * Tests GET /v1/learners/:learner_reference/summary endpoint
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import * as path from 'path';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerLearnerRoutes } from '../../src/learners/routes.js';
import {
  initStateStore,
  closeStateStore,
  clearStateStore,
  saveState,
} from '../../src/state/store.js';
import {
  initDecisionStore,
  closeDecisionStore,
  clearDecisionStore,
  saveDecision,
} from '../../src/decision/store.js';
import {
  initSignalLogStore,
  closeSignalLogStore,
  clearSignalLogStore,
  appendSignal,
} from '../../src/signalLog/store.js';
import * as policyLoader from '../../src/decision/policy-loader.js';
import { loadPolicy, clearRoutingConfigCache } from '../../src/decision/policy-loader.js';
import { ErrorCodes } from '../../src/shared/error-codes.js';
import { apiKeyPreHandler } from '../../src/auth/api-key-middleware.js';
import { FORBIDDEN_KEYS } from '../../src/ingestion/forbidden-keys.js';
import type { LearnerState, Decision, SignalEnvelope } from '../../src/shared/types.js';
import { contractHttp } from '../helpers/contract-http.js';

const ORG = 'springs';
const LEARNER = 'learner_001';

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

let decisionCounter = 0;

function seedDecision(overrides: Partial<Decision> = {}): Decision {
  decisionCounter++;
  const decision: Decision = {
    org_id: ORG,
    decision_id: `dec-sum-${decisionCounter}`,
    learner_reference: LEARNER,
    decision_type: 'intervene',
    decided_at: `2026-03-0${Math.min(decisionCounter, 9)}T12:00:00Z`,
    decision_context: {},
    trace: {
      state_id: `${ORG}:${LEARNER}:v3`,
      state_version: 3,
      policy_id: 'springs:learner',
      policy_version: '1.1.0',
      matched_rule_id: 'rule-decay-intervene',
      state_snapshot: { stabilityScore: 0.28 },
      matched_rule: null,
      rationale: 'Rule fired for declining stability',
      educator_summary: 'Learner needs support',
    },
    ...overrides,
  };
  saveDecision(decision);
  return decision;
}

function seedSignal(timestamp: string, overrides: Partial<SignalEnvelope> = {}): void {
  appendSignal(
    {
      org_id: ORG,
      signal_id: `signal-${timestamp}`,
      source_system: 'test-system',
      learner_reference: LEARNER,
      timestamp,
      schema_version: 'v1',
      payload: {},
      ...overrides,
    },
    timestamp
  );
}

describe('Learner Summary API Contract Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    initStateStore(':memory:');
    initDecisionStore(':memory:');
    initSignalLogStore(':memory:');
    loadPolicy(path.join(process.cwd(), 'src/decision/policies/default.json'));

    app = Fastify({ logger: false });
    app.register(
      async (v1) => {
        registerLearnerRoutes(v1);
      },
      { prefix: '/v1' }
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeStateStore();
    closeDecisionStore();
    closeSignalLogStore();
  });

  beforeEach(() => {
    decisionCounter = 0;
    clearStateStore();
    clearDecisionStore();
    clearSignalLogStore();
    clearRoutingConfigCache();
  });

  // ---------------------------------------------------------------------------
  // SUM-001: Full summary for learner with history
  // ---------------------------------------------------------------------------
  describe('SUM-001: Full summary for learner with history', () => {
    it('should return 200 with all five top-level sections', async () => {
      saveState(createState({
        state_version: 1,
        state_id: `${ORG}:${LEARNER}:v1`,
        updated_at: '2026-03-01T10:00:00Z',
        state: { stabilityScore: 0.72, masteryScore: 0.65 },
      }));
      saveState(createState({
        state_version: 2,
        state_id: `${ORG}:${LEARNER}:v2`,
        updated_at: '2026-03-02T10:00:00Z',
        state: { stabilityScore: 0.55, masteryScore: 0.70 },
      }));
      saveState(createState({
        state_version: 3,
        state_id: `${ORG}:${LEARNER}:v3`,
        updated_at: '2026-03-03T10:00:00Z',
        state: { stabilityScore: 0.28, masteryScore: 0.75 },
      }));
      seedDecision({ decision_id: 'dec-1', decided_at: '2026-03-03T12:00:00Z' });
      seedDecision({ decision_id: 'dec-2', decided_at: '2026-03-03T13:00:00Z' });
      seedSignal('2026-03-01T10:00:00Z', { signal_id: 'sig-1' });
      seedSignal('2026-03-02T10:00:00Z', { signal_id: 'sig-2' });
      seedSignal('2026-03-03T10:00:00Z', { signal_id: 'sig-3' });

      const response = await contractHttp(app, {
        method: 'GET',
        url: `/v1/learners/${LEARNER}/summary?org_id=${ORG}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as Record<string, unknown>;

      expect(body).toHaveProperty('current_state');
      expect(body).toHaveProperty('recent_decisions');
      expect(body).toHaveProperty('field_trajectories');
      expect(body).toHaveProperty('active_policy');
      expect(body).toHaveProperty('signals_summary');

      const recentDecisions = body.recent_decisions as unknown[];
      expect(recentDecisions.length).toBeLessThanOrEqual(10);

      expect(body.generated_at).toBeTruthy();
      expect(new Date(body.generated_at as string).toISOString()).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // SUM-002: recent_decisions_limit respected
  // ---------------------------------------------------------------------------
  describe('SUM-002: recent_decisions_limit respected', () => {
    it('should return exactly 2 most recent decisions in DESC order', async () => {
      saveState(createState({
        state_version: 1,
        state: { stabilityScore: 0.5 },
      }));

      const times = [
        '2026-03-01T10:00:00Z',
        '2026-03-02T10:00:00Z',
        '2026-03-03T10:00:00Z',
        '2026-03-04T10:00:00Z',
        '2026-03-05T10:00:00Z',
      ];
      for (let i = 0; i < times.length; i++) {
        seedDecision({
          decision_id: `dec-limit-${i}`,
          decided_at: times[i],
        });
      }

      const response = await contractHttp(app, {
        method: 'GET',
        url: `/v1/learners/${LEARNER}/summary?org_id=${ORG}&recent_decisions_limit=2`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        recent_decisions: Array<{ decided_at: string }>;
      };
      expect(body.recent_decisions).toHaveLength(2);
      expect(body.recent_decisions[0].decided_at).toBe('2026-03-05T10:00:00Z');
      expect(body.recent_decisions[1].decided_at).toBe('2026-03-04T10:00:00Z');
    });
  });

  // ---------------------------------------------------------------------------
  // SUM-003: Learner not found
  // ---------------------------------------------------------------------------
  describe('SUM-003: Learner not found', () => {
    it('should return 404 state_not_found with spec message', async () => {
      const response = await contractHttp(app, {
        method: 'GET',
        url: `/v1/learners/nobody/summary?org_id=${ORG}`,
      });

      expect(response.statusCode).toBe(404);
      const body = response.json() as { code: string; message: string };
      expect(body.code).toBe(ErrorCodes.STATE_NOT_FOUND);
      expect(body.message).toBe("No state found for learner 'nobody' in org 'springs'");
    });
  });

  // ---------------------------------------------------------------------------
  // SUM-004: Auth required
  // ---------------------------------------------------------------------------
  describe('SUM-004: Auth required', () => {
    let authApp: FastifyInstance;
    const testApiKey = 'test-secret-key-sum004';

    beforeAll(async () => {
      process.env.API_KEY = testApiKey;

      authApp = Fastify({ logger: false });
      authApp.register(
        async (v1) => {
          v1.addHook('preHandler', apiKeyPreHandler);
          registerLearnerRoutes(v1);
        },
        { prefix: '/v1' }
      );
      await authApp.ready();
    });

    afterAll(async () => {
      delete process.env.API_KEY;
      await authApp.close();
    });

    it('should return 401 api_key_required when x-api-key is missing', async () => {
      saveState(createState({ state: { stabilityScore: 0.72 } }));

      const response = await contractHttp(authApp, {
        method: 'GET',
        url: `/v1/learners/${LEARNER}/summary?org_id=${ORG}`,
        auth: false,
      });

      expect(response.statusCode).toBe(401);
      const body = response.json() as { code: string };
      expect(body.code).toBe(ErrorCodes.API_KEY_REQUIRED);
    });
  });

  // ---------------------------------------------------------------------------
  // SUM-005: PII not leaked
  // ---------------------------------------------------------------------------
  describe('SUM-005: PII not leaked', () => {
    it('should exclude state_snapshot from recent_decisions and forbidden keys from fields', async () => {
      saveState(createState({
        state_version: 1,
        state: { stabilityScore: 0.28 },
      }));
      seedDecision({
        trace: {
          state_id: `${ORG}:${LEARNER}:v1`,
          state_version: 1,
          policy_id: 'springs:learner',
          policy_version: '1.1.0',
          matched_rule_id: 'rule-1',
          state_snapshot: { stabilityScore: 0.28, masteryScore: 0.75 },
          matched_rule: null,
          rationale: 'test',
          educator_summary: 'summary',
        },
      });

      const response = await contractHttp(app, {
        method: 'GET',
        url: `/v1/learners/${LEARNER}/summary?org_id=${ORG}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        recent_decisions: Record<string, unknown>[];
        current_state: { fields: Record<string, unknown> };
      };

      for (const item of body.recent_decisions) {
        expect(item).not.toHaveProperty('state_snapshot');
      }

      const fieldKeys = Object.keys(body.current_state.fields);
      for (const key of FORBIDDEN_KEYS) {
        expect(fieldKeys).not.toContain(key);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // SUM-006: Active policy null when no policy for org
  // ---------------------------------------------------------------------------
  describe('SUM-006: Active policy null when no policy for org', () => {
    it('should return 200 with active_policy null and other sections populated', async () => {
      // Filesystem resolution always falls back to policies/default.json, so simulate
      // policy_not_found (e.g. DynamoDB org with no policy row) via loader spy.
      const policySpy = vi.spyOn(policyLoader, 'loadPolicyForContext').mockImplementation(() => {
        const err = new Error("No policy found for org='no_policy_org'") as Error & { code: string };
        err.code = ErrorCodes.POLICY_NOT_FOUND;
        throw err;
      });

      try {
        saveState(createState({
          state: { stabilityScore: 0.5 },
        }));
        seedDecision();
        seedSignal('2026-03-01T10:00:00Z', { signal_id: 'sig-np-1' });

        const response = await contractHttp(app, {
          method: 'GET',
          url: `/v1/learners/${LEARNER}/summary?org_id=${ORG}`,
        });

        expect(response.statusCode).toBe(200);
        const body = response.json() as Record<string, unknown>;
        expect(body.active_policy).toBeNull();
        expect(body.current_state).toBeTruthy();
        expect(body.recent_decisions).toBeTruthy();
        expect(body.field_trajectories).toBeTruthy();
        expect(body.signals_summary).toBeTruthy();
      } finally {
        policySpy.mockRestore();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // SUM-007: Delta fields in current_state
  // ---------------------------------------------------------------------------
  describe('SUM-007: Delta fields in current_state', () => {
    it('should pass through stabilityScore_direction from latest state', async () => {
      saveState(createState({
        state_version: 1,
        state_id: `${ORG}:${LEARNER}:v1`,
        updated_at: '2026-03-01T10:00:00Z',
        state: { stabilityScore: 0.72 },
      }));
      saveState(createState({
        state_version: 2,
        state_id: `${ORG}:${LEARNER}:v2`,
        updated_at: '2026-03-02T10:00:00Z',
        state: {
          stabilityScore: 0.55,
          stabilityScore_delta: -0.17,
          stabilityScore_direction: 'declining',
        },
      }));

      const response = await contractHttp(app, {
        method: 'GET',
        url: `/v1/learners/${LEARNER}/summary?org_id=${ORG}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        current_state: { fields: Record<string, unknown> };
      };
      expect(body.current_state.fields.stabilityScore_direction).toBe('declining');
    });
  });

  // ---------------------------------------------------------------------------
  // SUM-008: field_trajectories.overall_direction consistent
  // ---------------------------------------------------------------------------
  describe('SUM-008: field_trajectories.overall_direction consistent', () => {
    it('should compute declining trajectory across three versions', async () => {
      saveState(createState({
        state_version: 1,
        state_id: `${ORG}:${LEARNER}:v1`,
        updated_at: '2026-03-01T10:00:00Z',
        state: { stabilityScore: 0.72 },
      }));
      saveState(createState({
        state_version: 2,
        state_id: `${ORG}:${LEARNER}:v2`,
        updated_at: '2026-03-02T10:00:00Z',
        state: { stabilityScore: 0.55 },
      }));
      saveState(createState({
        state_version: 3,
        state_id: `${ORG}:${LEARNER}:v3`,
        updated_at: '2026-03-03T10:00:00Z',
        state: { stabilityScore: 0.28 },
      }));

      const response = await contractHttp(app, {
        method: 'GET',
        url: `/v1/learners/${LEARNER}/summary?org_id=${ORG}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        field_trajectories: Record<
          string,
          {
            first_value: number;
            latest_value: number;
            overall_direction: string;
            version_count: number;
          }
        >;
      };
      const traj = body.field_trajectories.stabilityScore;
      expect(traj.overall_direction).toBe('declining');
      expect(traj.first_value).toBe(0.72);
      expect(traj.latest_value).toBe(0.28);
      expect(traj.version_count).toBe(3);
    });
  });
});
