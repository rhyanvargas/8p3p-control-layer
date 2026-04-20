/**
 * Integration & Contract Tests for Skill-Level Tracking & Assessment Type Classification
 *
 * Plan: .cursor/plans/skill-level-tracking.plan.md (TASK-011)
 * Tests: SKL-010 through SKL-014
 *
 * Pattern: Fastify inject() matching e2e-signal-to-decision.test.ts + in-memory stores.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerIngestionRoutes } from '../../src/ingestion/routes.js';
import { registerSignalLogRoutes } from '../../src/signalLog/routes.js';
import { registerDecisionRoutes } from '../../src/decision/routes.js';
import {
  initIdempotencyStore,
  closeIdempotencyStore,
  clearIdempotencyStore,
} from '../../src/ingestion/idempotency.js';
import {
  initSignalLogStore,
  closeSignalLogStore,
  clearSignalLogStore,
  appendSignal,
} from '../../src/signalLog/store.js';
import {
  initStateStore,
  closeStateStore,
  clearStateStore,
} from '../../src/state/store.js';
import {
  initDecisionStore,
  closeDecisionStore,
  clearDecisionStore,
  saveDecision,
} from '../../src/decision/store.js';
import { loadPolicy } from '../../src/decision/policy-loader.js';
import type { Decision, SignalEnvelope } from '../../src/shared/types.js';

// =============================================================================
// Constants
// =============================================================================

const ORG_ID = 'org_skl_test';
const ORG_FRACTIONS = 'skl-test-14';
const LEARNER = 'learner-skl-001';

const FROM_TIME = '2020-01-01T00:00:00Z';
const TO_TIME = '2099-12-31T23:59:59Z';

let sigCounter = 0;

function buildSignal(
  learnerReference: string,
  payload: Record<string, unknown>,
  overrides: Partial<SignalEnvelope> = {}
): SignalEnvelope {
  sigCounter++;
  return {
    org_id: ORG_ID,
    signal_id: `skl-sig-${Date.now()}-${sigCounter}`,
    source_system: 'external-lms',
    learner_reference: learnerReference,
    timestamp: new Date().toISOString(),
    schema_version: 'v1',
    payload,
    ...overrides,
  };
}

function makeDecision(overrides: Partial<Decision> & { decisionContext?: Record<string, unknown> } = {}): Decision {
  return {
    org_id: overrides.org_id ?? ORG_ID,
    decision_id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    learner_reference: overrides.learner_reference ?? LEARNER,
    decision_type: 'reinforce',
    decided_at: new Date().toISOString(),
    decision_context: overrides.decisionContext ?? {},
    trace: {
      state_id: `${ORG_ID}:${LEARNER}:v1`,
      state_version: 1,
      policy_id: 'default',
      policy_version: '1.0.0',
      matched_rule_id: null,
      state_snapshot: {},
      matched_rule: null,
      rationale: 'test decision',
      educator_summary: 'Needs more practice',
    },
    output_metadata: { priority: null },
    ...overrides,
  };
}

// =============================================================================
// Test suite
// =============================================================================

describe('SKL Integration & Contract Tests', () => {
  let app: FastifyInstance;
  let fractionsOrgPolicyPath: string;

  beforeAll(async () => {
    initIdempotencyStore(':memory:');
    initSignalLogStore(':memory:');
    initStateStore(':memory:');
    initDecisionStore(':memory:');
    loadPolicy();

    // Write a custom policy for SKL-014 (dot-path condition: skills.fractions.stabilityScore lt 0.5)
    const policiesRoot = path.join(process.cwd(), 'src/decision/policies');
    const fractionsOrgDir = path.join(policiesRoot, ORG_FRACTIONS);
    fs.mkdirSync(fractionsOrgDir, { recursive: true });
    fractionsOrgPolicyPath = path.join(fractionsOrgDir, 'learner.json');
    fs.writeFileSync(
      fractionsOrgPolicyPath,
      JSON.stringify({
        policy_id: 'fractions-skill-policy',
        policy_version: '1.0.0',
        description: 'Policy evaluating nested skills.fractions.stabilityScore',
        rules: [
          {
            rule_id: 'rule-fractions-intervene',
            decision_type: 'intervene',
            condition: {
              field: 'skills.fractions.stabilityScore',
              operator: 'lt',
              value: 0.5,
            },
          },
        ],
      }),
      'utf-8'
    );

    app = Fastify({ logger: false });
    app.register(
      async (v1) => {
        registerIngestionRoutes(v1);
        registerSignalLogRoutes(v1);
        registerDecisionRoutes(v1);
      },
      { prefix: '/v1' }
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDecisionStore();
    closeStateStore();
    closeSignalLogStore();
    closeIdempotencyStore();

    // Clean up temp policy file
    if (fs.existsSync(fractionsOrgPolicyPath)) {
      fs.rmSync(fractionsOrgPolicyPath, { force: true });
    }
    const fractionsOrgDir = path.join(process.cwd(), 'src/decision/policies', ORG_FRACTIONS);
    if (fs.existsSync(fractionsOrgDir)) {
      fs.rmdirSync(fractionsOrgDir);
    }
  });

  beforeEach(() => {
    clearIdempotencyStore();
    clearSignalLogStore();
    clearStateStore();
    clearDecisionStore();
    sigCounter = 0;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SKL-010: POST signal with payload.skill → decision_context.skill propagation
  // ─────────────────────────────────────────────────────────────────────────

  it('SKL-010: POST signal with skill=fractions → decision_context.skill === "fractions"', async () => {
    const payload = {
      skill: 'fractions',
      stabilityScore: 0.28,
      confidenceInterval: 0.25,
      timeSinceReinforcement: 90000,
    };

    const postResp = await app.inject({
      method: 'POST',
      url: '/v1/signals',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        org_id: ORG_ID,
        signal_id: `skl-010-sig-${Date.now()}`,
        source_system: 'external-lms',
        learner_reference: LEARNER,
        timestamp: new Date().toISOString(),
        schema_version: 'v1',
        payload,
      }),
    });

    expect(postResp.statusCode).toBe(200);
    const ingestBody = postResp.json<{ status: string }>();
    expect(ingestBody.status).toBe('accepted');

    const decisionsResp = await app.inject({
      method: 'GET',
      url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=${LEARNER}&from_time=${FROM_TIME}&to_time=${TO_TIME}`,
    });
    expect(decisionsResp.statusCode).toBe(200);
    const decisionsBody = decisionsResp.json<{ decisions: Decision[] }>();
    expect(decisionsBody.decisions.length).toBeGreaterThan(0);
    const decision = decisionsBody.decisions[0]!;
    expect(decision.decision_context['skill']).toBe('fractions');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SKL-011: GET /v1/decisions?skill=fractions filters correctly
  // ─────────────────────────────────────────────────────────────────────────

  it('SKL-011: GET /v1/decisions?skill=fractions returns 1 of 2 seeded decisions', async () => {
    saveDecision(makeDecision({ decisionContext: { skill: 'fractions' } }));
    saveDecision(makeDecision({ decisionContext: { skill: 'reading' } }));

    const resp = await app.inject({
      method: 'GET',
      url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=${LEARNER}&from_time=${FROM_TIME}&to_time=${TO_TIME}&skill=fractions`,
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json<{ decisions: Decision[] }>();
    expect(body.decisions).toHaveLength(1);
    expect(body.decisions[0]!.decision_context['skill']).toBe('fractions');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SKL-012: GET /v1/decisions without filter returns both seeded decisions
  // ─────────────────────────────────────────────────────────────────────────

  it('SKL-012: GET /v1/decisions without skill filter returns both seeded decisions', async () => {
    saveDecision(makeDecision({ decisionContext: { skill: 'fractions' } }));
    saveDecision(makeDecision({ decisionContext: { skill: 'reading' } }));

    const resp = await app.inject({
      method: 'GET',
      url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=${LEARNER}&from_time=${FROM_TIME}&to_time=${TO_TIME}`,
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json<{ decisions: Decision[] }>();
    expect(body.decisions).toHaveLength(2);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SKL-013: GET /v1/signals?assessment_type=diagnostic filters correctly
  // ─────────────────────────────────────────────────────────────────────────

  it('SKL-013: GET /v1/signals?assessment_type=diagnostic returns only diagnostic signals', async () => {
    const now = new Date().toISOString();
    appendSignal(buildSignal(LEARNER, { assessment_type: 'diagnostic', score: 0.8 }), now);
    appendSignal(buildSignal(LEARNER, { assessment_type: 'formative', score: 0.6 }), now);

    const resp = await app.inject({
      method: 'GET',
      url: `/v1/signals?org_id=${ORG_ID}&learner_reference=${LEARNER}&from_time=${FROM_TIME}&to_time=${TO_TIME}&assessment_type=diagnostic`,
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json<{ signals: Array<{ payload: Record<string, unknown> }> }>();
    expect(body.signals).toHaveLength(1);
    expect(body.signals[0]!.payload['assessment_type']).toBe('diagnostic');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SKL-014: Full pipeline — fractions signal → nested delta state → dot-path
  //          policy match → decision with decision_context.skill + nested actual_value
  // ─────────────────────────────────────────────────────────────────────────

  it('SKL-014: Full pipeline: fractions skill signal → dot-path policy match → decision_context.skill + nested actual_value', async () => {
    const fractionsPayload = {
      skill: 'fractions',
      assessment_type: 'diagnostic',
      skills: {
        fractions: {
          stabilityScore: 0.28,
          attempts: 5,
        },
      },
    };

    const postResp = await app.inject({
      method: 'POST',
      url: '/v1/signals',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        org_id: ORG_FRACTIONS,
        signal_id: `skl-014-sig-${Date.now()}`,
        source_system: 'external-lms',
        learner_reference: LEARNER,
        timestamp: new Date().toISOString(),
        schema_version: 'v1',
        payload: fractionsPayload,
      }),
    });

    expect(postResp.statusCode).toBe(200);
    expect(postResp.json<{ status: string }>().status).toBe('accepted');

    const decisionsResp = await app.inject({
      method: 'GET',
      url: `/v1/decisions?org_id=${ORG_FRACTIONS}&learner_reference=${LEARNER}&from_time=${FROM_TIME}&to_time=${TO_TIME}`,
    });

    expect(decisionsResp.statusCode).toBe(200);
    const body = decisionsResp.json<{ decisions: Decision[] }>();
    expect(body.decisions.length).toBeGreaterThan(0);

    const decision = body.decisions[0]!;

    // decision_context.skill populated from signal payload
    expect(decision.decision_context['skill']).toBe('fractions');
    expect(decision.decision_context['assessment_type']).toBe('diagnostic');

    // The dot-path policy matched rule-fractions-intervene
    expect(decision.decision_type).toBe('intervene');
    expect(decision.trace.matched_rule_id).toBe('rule-fractions-intervene');

    // evaluated_fields includes the nested field with correct actual_value
    const ef = decision.trace.matched_rule?.evaluated_fields?.find(
      (f) => f.field === 'skills.fractions.stabilityScore'
    );
    expect(ef).toBeDefined();
    expect(ef?.actual_value).toBe(0.28);
  });
});
