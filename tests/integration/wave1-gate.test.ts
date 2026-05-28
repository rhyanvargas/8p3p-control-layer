/**
 * Wave 1 Gate Verification Test
 *
 * Proves the URS master plan Wave 1 Gate criteria in a single integration test:
 *   1. Springs pilot can ingest a Canvas-shaped webhook payload end-to-end
 *   2. Decision emitted (policy rule fires after state merge)
 *   3. No PII leakage (decision does not contain forbidden PII keys)
 *
 * Scenario:
 *   - Springs learner already has timeSinceReinforcement=90000 in state
 *   - Canvas webhook delivers submission with points=50 → stabilityScore=0.50
 *   - After state merge: { stabilityScore: 0.50, timeSinceReinforcement: 90000 }
 *   - Policy rule-reinforce matches: stabilityScore < 0.65 AND timeSinceReinforcement > 86400
 *   - Decision of type "reinforce" is stored
 *
 * @see .cursor/plans/urs_product_readiness_55b0b52e.plan.md § Wave 1 Gate
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { apiKeyPreHandler } from '../../src/auth/api-key-middleware.js';
import { registerWebhookRoutes } from '../../src/routes/webhooks.js';
import {
  _setFieldMappingsDynamoClientForTesting,
  clearFieldMappingCache,
} from '../../src/config/field-mappings-dynamo.js';
import {
  initIdempotencyStore,
  closeIdempotencyStore,
  clearIdempotencyStore,
} from '../../src/ingestion/idempotency.js';
import {
  initSignalLogStore,
  closeSignalLogStore,
  clearSignalLogStore,
} from '../../src/signalLog/store.js';
import {
  initStateStore,
  closeStateStore,
  clearStateStore,
  saveState,
} from '../../src/state/store.js';
import {
  initIngestionLogStore,
  closeIngestionLogStore,
  clearIngestionLogStore,
} from '../../src/ingestion/ingestion-log-store.js';
import {
  initDecisionStore,
  closeDecisionStore,
  clearDecisionStore,
  getDecisions,
} from '../../src/decision/store.js';
import { FORBIDDEN_PII_KEYS } from '../../src/ingestion/forbidden-keys.js';
import type { LearnerState } from '../../src/shared/types.js';

const API_KEY = 'test-wave1-gate-key';
const ORG_ID = 'springs';
const LEARNER_REF = 'canvas_learner_gate_001';

const CANVAS_MAPPING_WITH_ENVELOPE = {
  Item: {
    org_id: ORG_ID,
    source_system: 'canvas-lms',
    mapping: {
      required: ['stabilityScore'],
      transforms: [
        { target: 'stabilityScore', source: 'submission.points', expression: 'value / 100' },
      ],
      envelope: {
        learner_reference_path: 'submission.user_id',
        signal_id_path: 'submission.id',
        timestamp_path: 'submission.submitted_at',
        event_type_path: 'event_type',
        allowed_event_types: ['submission_created', 'submission_updated'],
      },
    },
    mapping_version: 1,
  },
};

describe('Wave 1 Gate: Springs Canvas webhook → decision emitted, no PII', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    initIdempotencyStore(':memory:');
    initSignalLogStore(':memory:');
    initStateStore(':memory:');
    initIngestionLogStore(':memory:');
    initDecisionStore(':memory:');

    app = Fastify({ logger: false });
    app.register(
      async (v1) => {
        v1.addHook('preHandler', apiKeyPreHandler);
        registerWebhookRoutes(v1);
      },
      { prefix: '/v1' },
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDecisionStore();
    closeStateStore();
    closeSignalLogStore();
    closeIngestionLogStore();
    closeIdempotencyStore();
  });

  beforeEach(() => {
    process.env.FIELD_MAPPINGS_TABLE = 'test-field-mappings-table';
    process.env.API_KEY = API_KEY;
    process.env.API_KEY_ORG_ID = ORG_ID;
    clearFieldMappingCache();
    clearIdempotencyStore();
    clearSignalLogStore();
    clearStateStore();
    clearIngestionLogStore();
    clearDecisionStore();
  });

  afterEach(() => {
    delete process.env.FIELD_MAPPINGS_TABLE;
    delete process.env.API_KEY;
    delete process.env.API_KEY_ORG_ID;
    _setFieldMappingsDynamoClientForTesting(null);
    clearFieldMappingCache();
  });

  it('Canvas webhook with pre-existing state triggers reinforce decision and contains no PII', async () => {
    const spy = vi.fn((command: unknown) => {
      if (command instanceof GetCommand) return CANVAS_MAPPING_WITH_ENVELOPE;
      return {};
    });
    const client = { send: spy } as unknown as DynamoDBDocumentClient;
    _setFieldMappingsDynamoClientForTesting(client);

    // Pre-seed learner state so that after Canvas webhook merges stabilityScore,
    // rule-reinforce matches: stabilityScore < 0.65 AND timeSinceReinforcement > 86400
    const seedState: LearnerState = {
      org_id: ORG_ID,
      learner_reference: LEARNER_REF,
      state_id: 'seed-state-001',
      state_version: 1,
      state: { timeSinceReinforcement: 90000 },
      updated_at: new Date().toISOString(),
      provenance: {
        last_signal_id: 'seed-signal-001',
        last_signal_timestamp: new Date().toISOString(),
      },
    };
    saveState(seedState);

    // Send Canvas webhook: points=50 → stabilityScore = 0.50
    const webhookPayload = {
      submission: {
        id: 'sub_gate_001',
        user_id: LEARNER_REF,
        submitted_at: '2026-05-20T10:00:00Z',
        points: 50,
      },
      event_type: 'submission_created',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/canvas-lms',
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      payload: webhookPayload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('accepted');
    expect(body.signal_id).toBe('sub_gate_001');

    // Verify decision was emitted
    const { decisions } = getDecisions({
      org_id: ORG_ID,
      learner_reference: LEARNER_REF,
      from_time: '2020-01-01T00:00:00Z',
      to_time: '2099-12-31T23:59:59Z',
    });

    expect(decisions.length).toBeGreaterThanOrEqual(1);
    const decision = decisions[0]!;
    expect(decision.decision_type).toBe('reinforce');
    expect(decision.org_id).toBe(ORG_ID);
    expect(decision.learner_reference).toBe(LEARNER_REF);

    // Verify no PII leakage in decision payload
    const decisionJson = JSON.stringify(decision);
    for (const piiKey of FORBIDDEN_PII_KEYS) {
      expect(decisionJson).not.toContain(`"${piiKey}"`);
    }
  });
});
