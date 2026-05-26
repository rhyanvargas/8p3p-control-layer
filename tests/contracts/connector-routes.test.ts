/**
 * Contract Tests: Connector Routes (INT-001 through INT-007, INT-015, INT-016)
 *
 * Tests GET /v1/admin/connectors and POST /v1/admin/connectors/activate.
 * DynamoDB mocked via _setFieldMappingsDynamoClientForTesting.
 * Template registry overridden via CONNECTOR_TEMPLATES_DIR env var.
 *
 * @see docs/specs/integration-templates.md
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
import { resolve } from 'path';
import Fastify, { type FastifyInstance } from 'fastify';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { adminApiKeyPreHandler } from '../../src/auth/admin-api-key-middleware.js';
import { apiKeyPreHandler } from '../../src/auth/api-key-middleware.js';
import { registerConnectorRoutes } from '../../src/connectors/connector-routes.js';
import { registerWebhookRoutes } from '../../src/routes/webhooks.js';
import {
  _setFieldMappingsDynamoClientForTesting,
  clearFieldMappingCache,
} from '../../src/config/field-mappings-dynamo.js';
import { _resetTemplateRegistryCacheForTesting } from '../../src/connectors/template-registry.js';
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
import * as signalLogStore from '../../src/signalLog/store.js';
import {
  initStateStore,
  closeStateStore,
  clearStateStore,
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
import { ErrorCodes } from '../../src/shared/error-codes.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADMIN_KEY = 'test-admin-key-connectors';
const API_KEY = 'test-api-key-connectors';
const ORG_ID = 'springs';
const FIXTURES_DIR = resolve(import.meta.dirname, '..', 'fixtures', 'connector-templates');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockClient(
  sendImpl?: (command: unknown) => unknown,
): { client: DynamoDBDocumentClient; spy: MockInstance } {
  const spy = vi.fn(sendImpl ?? (() => ({})));
  const client = { send: spy } as unknown as DynamoDBDocumentClient;
  return { client, spy };
}

function activateBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { org_id: ORG_ID, source_system: 'canvas-lms', ...overrides };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Connector Routes Contract Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.CONNECTOR_TEMPLATES_DIR = FIXTURES_DIR;
    _resetTemplateRegistryCacheForTesting();

    app = Fastify({ logger: false });
    app.register(
      async (admin) => {
        admin.addHook('preHandler', adminApiKeyPreHandler);
        registerConnectorRoutes(admin);
      },
      { prefix: '/v1/admin' },
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.CONNECTOR_TEMPLATES_DIR;
    _resetTemplateRegistryCacheForTesting();
  });

  beforeEach(() => {
    process.env.FIELD_MAPPINGS_TABLE = 'test-field-mappings-table';
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    clearFieldMappingCache();
  });

  afterEach(() => {
    delete process.env.FIELD_MAPPINGS_TABLE;
    delete process.env.ADMIN_API_KEY;
    _setFieldMappingsDynamoClientForTesting(null);
    clearFieldMappingCache();
  });

  // -------------------------------------------------------------------------
  // INT-015: Auth required
  // -------------------------------------------------------------------------

  describe('INT-015: Auth — missing admin key → 401', () => {
    it('GET /connectors without x-admin-api-key returns 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/admin/connectors?org_id=springs',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json() as { error: { code: string } };
      expect(body.error.code).toBe(ErrorCodes.ADMIN_KEY_REQUIRED);
    });

    it('POST /connectors/activate without x-admin-api-key returns 401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/connectors/activate',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify(activateBody()),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json() as { error: { code: string } };
      expect(body.error.code).toBe(ErrorCodes.ADMIN_KEY_REQUIRED);
    });
  });

  // -------------------------------------------------------------------------
  // INT-001: Happy path activate
  // -------------------------------------------------------------------------

  describe('INT-001: Happy path activate Canvas', () => {
    it('POST /connectors/activate with valid canvas-lms returns 201 with webhook_url, setup_instructions, event_types', async () => {
      const { client, spy } = createMockClient((command: unknown) => {
        if (command instanceof GetCommand) return { Item: undefined };
        if (command instanceof PutCommand) return {};
        return {};
      });
      _setFieldMappingsDynamoClientForTesting(client);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/connectors/activate',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify(activateBody()),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json() as {
        source_system: string;
        status: string;
        webhook_url: string;
        event_types: string[];
        setup_instructions: string;
        template_id: string;
        template_version: string;
        activated_at: string;
      };

      expect(body.source_system).toBe('canvas-lms');
      expect(body.status).toBe('activated');
      expect(body.webhook_url).toBe('http://localhost:3000/v1/webhooks/canvas-lms');
      expect(body.event_types).toEqual(['submission_created', 'grade_updated']);
      expect(body.setup_instructions).toBeTruthy();
      expect(body.template_id).toBe('canvas-lms-v1');
      expect(body.template_version).toBe('1.0.0');
      expect(body.activated_at).toBeTruthy();

      const putCalls = spy.mock.calls.filter(
        ([cmd]) => cmd instanceof PutCommand,
      );
      expect(putCalls.length).toBe(1);
      const putItem = (putCalls[0]![0] as { input: { Item: Record<string, unknown> } }).input.Item;
      expect(putItem.template_id).toBe('canvas-lms-v1');
      expect(putItem.mapping_version).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // INT-002: Already-activated (no force) → 409
  // -------------------------------------------------------------------------

  describe('INT-002: Already-activated without force → 409', () => {
    it('returns 409 connector_already_activated when record has template_id and force is not set', async () => {
      const { client, spy } = createMockClient((command: unknown) => {
        if (command instanceof GetCommand) {
          return {
            Item: {
              org_id: ORG_ID,
              source_system: 'canvas-lms',
              mapping: { required: ['stabilityScore'], aliases: {}, types: {} },
              mapping_version: 1,
              template_id: 'canvas-lms-v1',
              template_version: '1.0.0',
              updated_at: '2026-04-01T00:00:00.000Z',
              updated_by: 'some-key',
            },
          };
        }
        return {};
      });
      _setFieldMappingsDynamoClientForTesting(client);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/connectors/activate',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify(activateBody()),
      });

      expect(response.statusCode).toBe(409);
      const body = response.json() as { error: { code: string } };
      expect(body.error.code).toBe(ErrorCodes.CONNECTOR_ALREADY_ACTIVATED);

      const putCalls = spy.mock.calls.filter(([cmd]) => cmd instanceof PutCommand);
      expect(putCalls.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // INT-003: force=true over existing activated row → 201
  // -------------------------------------------------------------------------

  describe('INT-003: force=true overwrites activated row → 201', () => {
    it('returns 201 and issues PutCommand when force is true', async () => {
      const existingVersion = 2;
      const { client, spy } = createMockClient((command: unknown) => {
        if (command instanceof GetCommand) {
          return {
            Item: {
              org_id: ORG_ID,
              source_system: 'canvas-lms',
              mapping: { required: ['stabilityScore'], aliases: {}, types: {} },
              mapping_version: existingVersion,
              template_id: 'canvas-lms-v1',
              template_version: '1.0.0',
              updated_at: '2026-04-01T00:00:00.000Z',
              updated_by: 'old-key',
            },
          };
        }
        if (command instanceof PutCommand) return {};
        return {};
      });
      _setFieldMappingsDynamoClientForTesting(client);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/connectors/activate',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify(activateBody({ force: true })),
      });

      expect(response.statusCode).toBe(201);

      const putCalls = spy.mock.calls.filter(([cmd]) => cmd instanceof PutCommand);
      expect(putCalls.length).toBe(1);
      const putItem = (putCalls[0]![0] as { input: { Item: Record<string, unknown> } }).input.Item;
      expect(putItem.mapping_version).toBe(existingVersion + 1);
    });
  });

  // -------------------------------------------------------------------------
  // INT-004: Custom mapping exists (no template_id) without force → 409
  // -------------------------------------------------------------------------

  describe('INT-004: Custom mapping without force → 409 custom_mapping_exists', () => {
    it('returns 409 when existing record has no template_id and force is not set', async () => {
      const { client, spy } = createMockClient((command: unknown) => {
        if (command instanceof GetCommand) {
          return {
            Item: {
              org_id: ORG_ID,
              source_system: 'canvas-lms',
              mapping: { required: ['stabilityScore'], aliases: {}, types: {} },
              mapping_version: 3,
              updated_at: '2026-04-01T00:00:00.000Z',
              updated_by: 'manual-admin',
            },
          };
        }
        return {};
      });
      _setFieldMappingsDynamoClientForTesting(client);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/connectors/activate',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify(activateBody()),
      });

      expect(response.statusCode).toBe(409);
      const body = response.json() as { error: { code: string } };
      expect(body.error.code).toBe(ErrorCodes.CUSTOM_MAPPING_EXISTS);

      const putCalls = spy.mock.calls.filter(([cmd]) => cmd instanceof PutCommand);
      expect(putCalls.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // INT-005: Stub template → 400 template_not_ready
  // -------------------------------------------------------------------------

  describe('INT-005: Stub template (iready) → 400 template_not_ready', () => {
    it('returns 400 and does not issue any DynamoDB call', async () => {
      const { client, spy } = createMockClient();
      _setFieldMappingsDynamoClientForTesting(client);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/connectors/activate',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify(activateBody({ source_system: 'iready' })),
      });

      expect(response.statusCode).toBe(400);
      const body = response.json() as { error: { code: string } };
      expect(body.error.code).toBe(ErrorCodes.TEMPLATE_NOT_READY);

      expect(spy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // INT-006: Unknown source_system → 404 template_not_found
  // -------------------------------------------------------------------------

  describe('INT-006: Unknown source_system → 404 template_not_found', () => {
    it('returns 404 and does not issue any DynamoDB call', async () => {
      const { client, spy } = createMockClient();
      _setFieldMappingsDynamoClientForTesting(client);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/connectors/activate',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify(activateBody({ source_system: 'unknown-lms' })),
      });

      expect(response.statusCode).toBe(404);
      const body = response.json() as { error: { code: string } };
      expect(body.error.code).toBe(ErrorCodes.TEMPLATE_NOT_FOUND);

      expect(spy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // INT-007: GET /connectors — mixed statuses
  // -------------------------------------------------------------------------

  describe('INT-007: GET /connectors returns mixed statuses (activated, not_ready, not_ready)', () => {
    it('Canvas activated + I-Ready not_ready + Branching Minds not_ready', async () => {
      const { client } = createMockClient((command: unknown) => {
        if (command instanceof QueryCommand) {
          return {
            Items: [
              {
                org_id: ORG_ID,
                source_system: 'canvas-lms',
                mapping: { required: ['stabilityScore'], aliases: {}, types: {} },
                mapping_version: 1,
                template_id: 'canvas-lms-v1',
                template_version: '1.0.0',
                updated_at: '2026-04-15T12:00:00.000Z',
                updated_by: ADMIN_KEY,
              },
            ],
          };
        }
        return {};
      });
      _setFieldMappingsDynamoClientForTesting(client);

      const response = await app.inject({
        method: 'GET',
        url: '/v1/admin/connectors?org_id=springs',
        headers: { 'x-admin-api-key': ADMIN_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        connectors: Array<{
          source_system: string;
          status: string;
          webhook_url: string | null;
          event_types: string[] | null;
          activated_at: string | null;
        }>;
      };

      expect(body.connectors.length).toBe(3);

      const canvas = body.connectors.find((c) => c.source_system === 'canvas-lms');
      const iready = body.connectors.find((c) => c.source_system === 'iready');
      const branchingMinds = body.connectors.find((c) => c.source_system === 'branching-minds');

      expect(canvas).toBeDefined();
      expect(canvas!.status).toBe('activated');
      expect(canvas!.webhook_url).toBe('http://localhost:3000/v1/webhooks/canvas-lms');
      expect(canvas!.event_types).toBeTruthy();
      expect(canvas!.activated_at).toBeTruthy();

      expect(iready).toBeDefined();
      expect(iready!.status).toBe('not_ready');
      expect(iready!.webhook_url).toBeNull();

      expect(branchingMinds).toBeDefined();
      expect(branchingMinds!.status).toBe('not_ready');
      expect(branchingMinds!.webhook_url).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // INT-016: E2E — activate Canvas → webhook → signal accepted
  // -------------------------------------------------------------------------

  describe('INT-016: E2E — activate Canvas then send webhook → signal accepted', () => {
    let e2eApp: FastifyInstance;

    beforeAll(async () => {
      initIdempotencyStore(':memory:');
      initSignalLogStore(':memory:');
      initStateStore(':memory:');
      initIngestionLogStore(':memory:');
      initDecisionStore(':memory:');

      e2eApp = Fastify({ logger: false });

      e2eApp.register(
        async (admin) => {
          admin.addHook('preHandler', adminApiKeyPreHandler);
          registerConnectorRoutes(admin);
        },
        { prefix: '/v1/admin' },
      );

      e2eApp.register(
        async (v1) => {
          v1.addHook('preHandler', apiKeyPreHandler);
          registerWebhookRoutes(v1);
        },
        { prefix: '/v1' },
      );

      await e2eApp.ready();
    });

    afterAll(async () => {
      await e2eApp.close();
      closeDecisionStore();
      closeStateStore();
      closeSignalLogStore();
      closeIngestionLogStore();
      closeIdempotencyStore();
    });

    it('activating Canvas then posting a webhook payload results in an accepted signal', async () => {
      process.env.ADMIN_API_KEY = ADMIN_KEY;
      process.env.API_KEY = API_KEY;
      process.env.API_KEY_ORG_ID = ORG_ID;
      process.env.FIELD_MAPPINGS_TABLE = 'test-field-mappings-table';

      const activatedMapping: Record<string, unknown> = {};

      const { client } = createMockClient((command: unknown) => {
        if (command instanceof GetCommand) {
          const input = (command as { input: { Key?: { org_id?: string; source_system?: string } } }).input;
          if (input.Key?.source_system === 'canvas-lms' && Object.keys(activatedMapping).length > 0) {
            return { Item: activatedMapping };
          }
          return { Item: undefined };
        }
        if (command instanceof PutCommand) {
          const input = (command as { input: { Item: Record<string, unknown> } }).input;
          Object.assign(activatedMapping, input.Item);
          return {};
        }
        if (command instanceof QueryCommand) {
          if (Object.keys(activatedMapping).length > 0) {
            return { Items: [activatedMapping] };
          }
          return { Items: [] };
        }
        return {};
      });
      _setFieldMappingsDynamoClientForTesting(client);

      // Spy on appendSignal to verify signal ingestion at the store boundary
      const appendSignalSpy = vi.spyOn(signalLogStore, 'appendSignal');

      // Step 1: Activate Canvas
      const activateRes = await e2eApp.inject({
        method: 'POST',
        url: '/v1/admin/connectors/activate',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify({ org_id: ORG_ID, source_system: 'canvas-lms' }),
      });

      expect(activateRes.statusCode).toBe(201);

      // Step 2: Post a Canvas-shaped webhook payload (uses 'points' not 'score'
      // because 'score' is a forbidden semantic key in the ingestion pipeline)
      const webhookBody = {
        submission: {
          id: 'sub_e2e_001',
          user_id: 'learner_e2e_001',
          submitted_at: '2026-05-01T09:00:00Z',
          points: 85,
          points_possible: 100,
        },
        event_type: 'submission_created',
      };

      const webhookRes = await e2eApp.inject({
        method: 'POST',
        url: '/v1/webhooks/canvas-lms',
        headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
        payload: webhookBody,
      });

      expect(webhookRes.statusCode).toBe(200);
      const webhookResponseBody = webhookRes.json() as { status: string; signal_id: string };
      expect(webhookResponseBody.status).toBe('accepted');
      expect(webhookResponseBody.signal_id).toBe('sub_e2e_001');

      // Step 3: Verify appendSignal was called with expected signal data
      expect(appendSignalSpy).toHaveBeenCalledTimes(1);
      const signalArg = appendSignalSpy.mock.calls[0]![0] as {
        org_id: string;
        signal_id: string;
        source_system: string;
        learner_reference: string;
      };
      expect(signalArg.org_id).toBe(ORG_ID);
      expect(signalArg.signal_id).toBe('sub_e2e_001');
      expect(signalArg.source_system).toBe('canvas-lms');
      expect(signalArg.learner_reference).toBe('learner_e2e_001');

      // Cleanup
      appendSignalSpy.mockRestore();
      clearIdempotencyStore();
      clearSignalLogStore();
      clearStateStore();
      clearIngestionLogStore();
      clearDecisionStore();
      delete process.env.API_KEY;
      delete process.env.API_KEY_ORG_ID;
    });
  });
});
