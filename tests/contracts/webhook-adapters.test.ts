/**
 * Contract Tests: Webhook Adapters (WHK-001 through WHK-011)
 *
 * Tests POST /v1/webhooks/:source_system against the webhook-adapters spec.
 * Pattern matches signal-ingestion.test.ts: Fastify inject + mocked FieldMappingsTable.
 *
 * @see docs/specs/webhook-adapters.md
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
  getState,
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
} from '../../src/decision/store.js';

const API_KEY = 'test-api-key-xyz';
const ORG_ID = 'springs';

const CANVAS_MAPPING_ITEM = {
  Item: {
    org_id: ORG_ID,
    source_system: 'canvas-lms',
    mapping: {
      required: ['stabilityScore'],
      transforms: [{ target: 'stabilityScore', source: 'submission.points', expression: 'value / 100' }],
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

function canvasBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    submission: {
      id: 'sub_98765',
      user_id: 'canvas_student_001',
      submitted_at: '2026-03-28T10:30:00Z',
      points: 65,
    },
    event_type: 'submission_created',
    ...overrides,
  };
}

function createMockClient(getResponse: unknown = CANVAS_MAPPING_ITEM) {
  const spy = vi.fn((command: unknown) => {
    if (command instanceof GetCommand) return getResponse;
    return {};
  });
  const client = { send: spy } as unknown as DynamoDBDocumentClient;
  return { client, spy };
}

describe('Webhook Adapters Contract Tests', () => {
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

  function webhookRequest(body: unknown, opts: { apiKey?: string; sourceSystem?: string } = {}) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.apiKey !== undefined) {
      if (opts.apiKey !== '') headers['x-api-key'] = opts.apiKey;
    } else {
      headers['x-api-key'] = API_KEY;
    }
    return app.inject({
      method: 'POST',
      url: `/v1/webhooks/${opts.sourceSystem ?? 'canvas-lms'}`,
      headers,
      payload: body,
    });
  }

  // WHK-001: Happy path — valid webhook + envelope mapping → 200 accepted
  it('WHK-001: Happy path — valid webhook returns 200 accepted with correct learner_reference', async () => {
    const { client } = createMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const res = await webhookRequest(canvasBody());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('accepted');
    expect(body.org_id).toBe(ORG_ID);
    expect(body.signal_id).toBe('sub_98765');
  });

  // WHK-002: Missing envelope mapping → 400 missing_envelope_mapping
  it('WHK-002: Missing envelope mapping returns 400 missing_envelope_mapping', async () => {
    const { client } = createMockClient({ Item: undefined });
    _setFieldMappingsDynamoClientForTesting(client);

    const res = await webhookRequest(canvasBody());
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('missing_envelope_mapping');
    expect(body.error.message).toContain(ORG_ID);
    expect(body.error.message).toContain('canvas-lms');
  });

  // WHK-003: Envelope extraction failure — learner_reference_path missing in body
  it('WHK-003: Missing learner_reference in body returns 400 envelope_extraction_failed', async () => {
    const { client } = createMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const bodyMissing = canvasBody();
    delete (bodyMissing.submission as Record<string, unknown>).user_id;

    const res = await webhookRequest(bodyMissing);
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('envelope_extraction_failed');
    expect(body.error.message).toContain('submission.user_id');
  });

  // WHK-004: Auto-generated signal_id when signal_id_path absent
  it('WHK-004: Auto-generated signal_id when signal_id_path absent', async () => {
    const mappingNoSignalId = JSON.parse(JSON.stringify(CANVAS_MAPPING_ITEM));
    delete mappingNoSignalId.Item.mapping.envelope.signal_id_path;
    const { client } = createMockClient(mappingNoSignalId);
    _setFieldMappingsDynamoClientForTesting(client);

    const res = await webhookRequest(canvasBody());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('accepted');
    expect(body.signal_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  // WHK-005: Idempotency — same extracted signal_id sent twice; second returns duplicate
  it('WHK-005: Idempotency — duplicate signal_id returns status duplicate', async () => {
    const { client } = createMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const payload = canvasBody();
    const res1 = await webhookRequest(payload);
    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.body);
    expect(body1.status).toBe('accepted');

    const res2 = await webhookRequest(payload);
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.status).toBe('duplicate');
    expect(body2.received_at).toBe(body1.received_at);
  });

  // WHK-006: Tenant field mapping transforms execute on payload
  it('WHK-006: Transforms execute — submission.points/100 → stabilityScore 0.65', async () => {
    const { client } = createMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const res = await webhookRequest(canvasBody());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('accepted');

    const state = getState(ORG_ID, 'canvas_student_001');
    expect(state).not.toBeNull();
    if (state) {
      expect((state.state as Record<string, unknown>).stabilityScore).toBe(0.65);
    }
  });

  // WHK-007: Auth required — no x-api-key → 401
  it('WHK-007: Missing x-api-key returns 401', async () => {
    const { client } = createMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const res = await webhookRequest(canvasBody(), { apiKey: '' });
    expect(res.statusCode).toBe(401);
  });

  // WHK-008: Timestamp fallback — timestamp_path absent; response shows valid ISO 8601
  it('WHK-008: Timestamp fallback when timestamp_path absent', async () => {
    const mappingNoTs = JSON.parse(JSON.stringify(CANVAS_MAPPING_ITEM));
    delete mappingNoTs.Item.mapping.envelope.timestamp_path;
    const { client } = createMockClient(mappingNoTs);
    _setFieldMappingsDynamoClientForTesting(client);

    const res = await webhookRequest(canvasBody());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('accepted');
    expect(body.received_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  // WHK-009: Event type filter — allowed event proceeds → 200 accepted
  it('WHK-009: Allowed event type proceeds to ingestion', async () => {
    const { client } = createMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const res = await webhookRequest(canvasBody({ event_type: 'submission_created' }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('accepted');
  });

  // WHK-010: Event type filter — disallowed event silently dropped → 204 No Content
  it('WHK-010: Disallowed event type returns 204 No Content', async () => {
    const { client } = createMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const res = await webhookRequest(canvasBody({ event_type: 'enrollment_created' }));
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
  });

  // WHK-011: Event type filter not configured — all events pass to ingestion
  it('WHK-011: No event_type_path configured — all events pass to ingestion', async () => {
    const mappingNoEventFilter = JSON.parse(JSON.stringify(CANVAS_MAPPING_ITEM));
    delete mappingNoEventFilter.Item.mapping.envelope.event_type_path;
    delete mappingNoEventFilter.Item.mapping.envelope.allowed_event_types;
    const { client } = createMockClient(mappingNoEventFilter);
    _setFieldMappingsDynamoClientForTesting(client);

    const res = await webhookRequest(canvasBody({ event_type: 'totally_random_event' }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('accepted');
  });
});
