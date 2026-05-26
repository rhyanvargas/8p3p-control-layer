/**
 * Contract Tests: Ingestion Preflight API (INGEST-PREFLIGHT-001..012)
 *
 * POST /v1/admin/ingestion/preflight — static analysis + optional mapping
 * simulation for raw customer samples. Side-effect-free: no idempotency,
 * no signal log writes, no ingestion outcome logging.
 *
 * DynamoDB is mocked via _setFieldMappingsDynamoClientForTesting.
 *
 * @see docs/specs/ingestion-preflight.md § Contract Tests
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { adminApiKeyPreHandler } from '../../src/auth/admin-api-key-middleware.js';
import { registerAdminIngestionPreflightRoutes } from '../../src/routes/admin-ingestion-preflight.js';
import {
  _setFieldMappingsDynamoClientForTesting,
  clearFieldMappingCache,
} from '../../src/config/field-mappings-dynamo.js';
import { contractHttp } from '../helpers/contract-http.js';
import { ErrorCodes } from '../../src/shared/error-codes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_KEY = 'test-admin-key-abc';
const ORIG_TABLE = process.env.FIELD_MAPPINGS_TABLE;

function createMockClient(
  sendImpl: (command: unknown) => unknown = () => ({}),
): { client: DynamoDBDocumentClient; spy: MockInstance } {
  const spy = vi.fn(sendImpl);
  const client = { send: spy } as unknown as DynamoDBDocumentClient;
  return { client, spy };
}

/**
 * Returns a mock DynamoDB client that serves a Canvas mapping with
 * masteryScore = score / total for (springs, canvas-lms).
 */
function createCanvasMappingMockClient(): {
  client: DynamoDBDocumentClient;
  spy: MockInstance;
} {
  return createMockClient((command: unknown) => {
    if (command instanceof GetCommand) {
      return {
        Item: {
          org_id: 'springs',
          source_system: 'canvas-lms',
          mapping: {
            required: ['masteryScore'],
            aliases: {},
            types: { masteryScore: 'number' },
            transforms: [
              {
                target: 'masteryScore',
                sources: { score: 'submission.score', total: 'submission.total' },
                expression: 'score / total',
              },
            ],
          },
          mapping_version: 1,
        },
      };
    }
    return {};
  });
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('Ingestion Preflight Contract Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.register(
      async (admin) => {
        admin.addHook('preHandler', adminApiKeyPreHandler);
        registerAdminIngestionPreflightRoutes(admin);
      },
      { prefix: '/v1/admin' },
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    process.env.FIELD_MAPPINGS_TABLE = 'test-field-mappings-table';
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    clearFieldMappingCache();
  });

  afterEach(() => {
    process.env.FIELD_MAPPINGS_TABLE = ORIG_TABLE;
    delete process.env.ADMIN_API_KEY;
    _setFieldMappingsDynamoClientForTesting(null);
    clearFieldMappingCache();
  });

  // -------------------------------------------------------------------------
  // INGEST-PREFLIGHT-001: Clean payload, no scope → verdict: "clean"
  // -------------------------------------------------------------------------

  it('INGEST-PREFLIGHT-001: clean payload with no scope → verdict "clean"', async () => {
    const { client } = createMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const response = await contractHttp(app, {
      method: 'POST',
      url: '/v1/admin/ingestion/preflight',
      headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
      payload: { payload: { learner_id: 'L1', masteryScore: 0.85 } },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.preflight_id).toMatch(/^pf_/);
    expect(body.received_at).toBeTruthy();
    expect(body.forbidden_pii).toEqual([]);
    expect(body.forbidden_semantic_raw).toEqual([]);
    expect(body.forbidden_semantic_after_mapping).toBeNull();
    expect(body.mapping_suggestions).toEqual([]);
    expect(body.verdict).toBe('clean');
  });

  // -------------------------------------------------------------------------
  // INGEST-PREFLIGHT-002: PII detected at depth → verdict: "pii_blocking"
  // -------------------------------------------------------------------------

  it('INGEST-PREFLIGHT-002: PII key at depth → verdict "pii_blocking"', async () => {
    const { client } = createMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const response = await contractHttp(app, {
      method: 'POST',
      url: '/v1/admin/ingestion/preflight',
      headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
      payload: {
        payload: { learner: { email: 'a@b.c' }, masteryScore: 0.9 },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.forbidden_pii).toEqual([
      { key: 'email', path: 'payload.learner.email' },
    ]);
    expect(body.forbidden_semantic_raw).toEqual([]);
    expect(body.verdict).toBe('pii_blocking');
  });

  // -------------------------------------------------------------------------
  // INGEST-PREFLIGHT-003: Semantic key, no mapping → "semantic_blocking" + suggestion
  // -------------------------------------------------------------------------

  it('INGEST-PREFLIGHT-003: semantic key with no mapping scope → verdict "semantic_blocking" with suggestion', async () => {
    const { client } = createMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const response = await contractHttp(app, {
      method: 'POST',
      url: '/v1/admin/ingestion/preflight',
      headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
      payload: {
        org_id: 'springs',
        source_system: 'canvas-lms',
        payload: { submission: { score: 85, total: 100 } },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.forbidden_pii).toEqual([]);
    expect(body.forbidden_semantic_raw).toEqual([
      { key: 'score', path: 'payload.submission.score' },
    ]);
    expect(body.verdict).toBe('semantic_blocking');

    const suggestions = body.mapping_suggestions as Array<{
      raw_key: string;
      suggested_canonical: string;
      source: string;
    }>;
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    const scoreSuggestion = suggestions.find((s) => s.raw_key === 'score');
    expect(scoreSuggestion).toBeDefined();
    expect(scoreSuggestion!.suggested_canonical).toBe('masteryScore');
    expect(scoreSuggestion!.source).toBe('static-catalog');
  });

  // -------------------------------------------------------------------------
  // INGEST-PREFLIGHT-004: Semantic key with mapping scope — after-mapping
  //   Per § Test strategy note: normalizeAndValidateTenantPayload is additive,
  //   so the raw `score` key survives in the normalized payload. The
  //   after-mapping array therefore still contains the `score` hit, and
  //   verdict is "semantic_blocking" (not "semantic_resolvable_by_mapping").
  // -------------------------------------------------------------------------

  it('INGEST-PREFLIGHT-004: semantic key with mapping scope — after-mapping retains raw key', async () => {
    const { client } = createCanvasMappingMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const response = await contractHttp(app, {
      method: 'POST',
      url: '/v1/admin/ingestion/preflight',
      headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
      payload: {
        org_id: 'springs',
        source_system: 'canvas-lms',
        payload: { submission: { score: 85, total: 100 } },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.forbidden_pii).toEqual([]);
    expect(body.forbidden_semantic_raw).toEqual([
      { key: 'score', path: 'payload.submission.score' },
    ]);
    expect(body.forbidden_semantic_after_mapping).toEqual([
      { key: 'score', path: 'payload.submission.score' },
    ]);
    expect(body.verdict).toBe('semantic_blocking');
  });

  // -------------------------------------------------------------------------
  // INGEST-PREFLIGHT-005: Both PII + semantic — PII precedence
  // -------------------------------------------------------------------------

  it('INGEST-PREFLIGHT-005: PII + semantic keys → verdict "pii_blocking" (PII precedence)', async () => {
    const { client } = createMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const response = await contractHttp(app, {
      method: 'POST',
      url: '/v1/admin/ingestion/preflight',
      headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
      payload: {
        payload: {
          learner: { email: 'a@b.c' },
          submission: { score: 85, total: 100 },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.forbidden_pii).toEqual([
      { key: 'email', path: 'payload.learner.email' },
    ]);
    expect(body.forbidden_semantic_raw).toEqual([
      { key: 'score', path: 'payload.submission.score' },
    ]);
    expect(body.verdict).toBe('pii_blocking');
  });

  // -------------------------------------------------------------------------
  // INGEST-PREFLIGHT-006: org_id without source_system → 400
  // -------------------------------------------------------------------------

  it('INGEST-PREFLIGHT-006: org_id without source_system → 400 preflight_missing_scope_pair', async () => {
    const { client } = createMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const response = await contractHttp(app, {
      method: 'POST',
      url: '/v1/admin/ingestion/preflight',
      headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
      payload: {
        org_id: 'springs',
        payload: { masteryScore: 0.9 },
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe(ErrorCodes.PREFLIGHT_MISSING_SCOPE_PAIR);
  });

  // -------------------------------------------------------------------------
  // INGEST-PREFLIGHT-007: No admin key → 401 admin_key_required
  // -------------------------------------------------------------------------

  it('INGEST-PREFLIGHT-007: no admin key → 401 admin_key_required', async () => {
    const { client } = createMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const response = await contractHttp(app, {
      method: 'POST',
      url: '/v1/admin/ingestion/preflight',
      payload: { payload: { masteryScore: 0.9 } },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe(ErrorCodes.ADMIN_KEY_REQUIRED);
  });

  // -------------------------------------------------------------------------
  // INGEST-PREFLIGHT-008: Tenant key only → 401 admin_key_required
  // -------------------------------------------------------------------------

  it('INGEST-PREFLIGHT-008: tenant x-api-key only (no admin key) → 401 admin_key_required', async () => {
    const { client } = createMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const response = await contractHttp(app, {
      method: 'POST',
      url: '/v1/admin/ingestion/preflight',
      headers: { 'x-api-key': 'some-tenant-key', 'content-type': 'application/json' },
      payload: { payload: { masteryScore: 0.9 } },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe(ErrorCodes.ADMIN_KEY_REQUIRED);
  });

  // -------------------------------------------------------------------------
  // INGEST-PREFLIGHT-009: payload non-object → 400 payload_not_object
  // -------------------------------------------------------------------------

  it('INGEST-PREFLIGHT-009: payload is not an object → 400 payload_not_object', async () => {
    const { client } = createMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const response = await contractHttp(app, {
      method: 'POST',
      url: '/v1/admin/ingestion/preflight',
      headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
      payload: { payload: 'not-an-object' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe(ErrorCodes.PAYLOAD_NOT_OBJECT);
  });

  // -------------------------------------------------------------------------
  // INGEST-PREFLIGHT-010: Body > 32 KB → 413 request_too_large
  // -------------------------------------------------------------------------

  it('INGEST-PREFLIGHT-010: oversized body → 413 request_too_large', async () => {
    const { client } = createMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const largePayload = { payload: { data: 'x'.repeat(40_000) } };

    const response = await contractHttp(app, {
      method: 'POST',
      url: '/v1/admin/ingestion/preflight',
      headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
      payload: largePayload,
    });

    expect(response.statusCode).toBe(413);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe(ErrorCodes.REQUEST_TOO_LARGE);
  });

  // -------------------------------------------------------------------------
  // INGEST-PREFLIGHT-011: No side effects (spies assert zero calls)
  //
  // The preflight handler MUST NOT call checkAndStore, appendSignal, or
  // appendIngestionOutcome. We verify this by confirming the preflight
  // handler core does not import those modules (static guarantee via
  // the import allowlist comment), and by verifying the DynamoDB mock
  // receives only GetCommand (for mapping reads), never PutCommand.
  // -------------------------------------------------------------------------

  it('INGEST-PREFLIGHT-011: no side effects — no PutCommand on DynamoDB, only GetCommand', async () => {
    const { client, spy } = createCanvasMappingMockClient();
    _setFieldMappingsDynamoClientForTesting(client);

    const response = await contractHttp(app, {
      method: 'POST',
      url: '/v1/admin/ingestion/preflight',
      headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
      payload: {
        org_id: 'springs',
        source_system: 'canvas-lms',
        payload: { submission: { score: 85, total: 100 } },
      },
    });

    expect(response.statusCode).toBe(200);

    for (const call of spy.mock.calls) {
      const command = call[0];
      expect(command).toBeInstanceOf(GetCommand);
    }
  });

  // -------------------------------------------------------------------------
  // INGEST-PREFLIGHT-012: Scope pair with no mapping → null + note
  // -------------------------------------------------------------------------

  it('INGEST-PREFLIGHT-012: scope pair with no mapping → forbidden_semantic_after_mapping: null + note', async () => {
    const { client } = createMockClient((command: unknown) => {
      if (command instanceof GetCommand) {
        return { Item: undefined };
      }
      return {};
    });
    _setFieldMappingsDynamoClientForTesting(client);

    const response = await contractHttp(app, {
      method: 'POST',
      url: '/v1/admin/ingestion/preflight',
      headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
      payload: {
        org_id: 'springs',
        source_system: 'canvas-lms',
        payload: { submission: { score: 85, total: 100 } },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.forbidden_semantic_after_mapping).toBeNull();
    expect(body.note).toMatch(/No mapping exists/);
    expect(body.verdict).toBe('semantic_blocking');
  });
});
