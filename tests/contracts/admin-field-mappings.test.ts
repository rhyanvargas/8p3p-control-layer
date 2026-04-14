/**
 * Contract Tests: Admin Field Mappings API
 * SIG-API-017: Invalid expression rejected at admin PUT
 *
 * Additional coverage: valid PUT, GET list, expression validation edge cases.
 * DynamoDB is mocked via _setFieldMappingsDynamoClientForTesting.
 *
 * @see docs/specs/tenant-field-mappings.md §Admin API
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
import { adminApiKeyPreHandler } from '../../src/auth/admin-api-key-middleware.js';
import { registerAdminFieldMappingsRoutes } from '../../src/routes/admin-field-mappings.js';
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

function validMappingBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    required: ['stabilityScore'],
    aliases: { stabilityScore: ['stability_score'] },
    types: { stabilityScore: 'number' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('Admin Field Mappings Contract Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.register(
      async (admin) => {
        admin.addHook('preHandler', adminApiKeyPreHandler);
        registerAdminFieldMappingsRoutes(admin);
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
  // Auth
  // -------------------------------------------------------------------------

  describe('Auth — missing or invalid admin key', () => {
    it('should return 401 when x-admin-api-key header is absent', async () => {
      const { client } = createMockClient();
      _setFieldMappingsDynamoClientForTesting(client);

      const response = await contractHttp(app, {
        method: 'PUT',
        url: '/v1/admin/mappings/springs/canvas-lms',
        payload: validMappingBody(),
        // No auth header
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 when x-admin-api-key header is wrong', async () => {
      const { client } = createMockClient();
      _setFieldMappingsDynamoClientForTesting(client);

      const response = await app.inject({
        method: 'PUT',
        url: '/v1/admin/mappings/springs/canvas-lms',
        headers: { 'x-admin-api-key': 'wrong-key', 'content-type': 'application/json' },
        payload: JSON.stringify(validMappingBody()),
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // PUT — SIG-API-017: Invalid expression rejected
  // -------------------------------------------------------------------------

  describe('SIG-API-017: Invalid expression rejected at admin PUT', () => {
    it('should return 400 when expression contains eval(...)', async () => {
      const { client } = createMockClient();
      _setFieldMappingsDynamoClientForTesting(client);

      const body = validMappingBody({
        transforms: [
          { target: 'stabilityScore', source: 'raw_score', expression: "eval('process.env')" },
        ],
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/v1/admin/mappings/springs/canvas-lms',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify(body),
      });

      expect(response.statusCode).toBe(400);
      const responseBody = response.json() as { error: { code: string; message: string } };
      expect(responseBody.error.code).toBe(ErrorCodes.INVALID_MAPPING_EXPRESSION);
    });

    it('should return 400 when expression uses a forbidden identifier', async () => {
      const { client } = createMockClient();
      _setFieldMappingsDynamoClientForTesting(client);

      const body = validMappingBody({
        transforms: [
          { target: 'stabilityScore', source: 'raw_score', expression: 'process.env.SECRET' },
        ],
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/v1/admin/mappings/springs/canvas-lms',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify(body),
      });

      expect(response.statusCode).toBe(400);
      const responseBody = response.json() as { error: { code: string } };
      expect(responseBody.error.code).toBe(ErrorCodes.INVALID_MAPPING_EXPRESSION);
    });

    it('should return 400 when expression uses Math.abs (not in whitelist)', async () => {
      const { client } = createMockClient();
      _setFieldMappingsDynamoClientForTesting(client);

      const body = validMappingBody({
        transforms: [
          { target: 'x', source: 'y', expression: 'Math.abs(value)' },
        ],
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/v1/admin/mappings/springs/canvas-lms',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify(body),
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when expression uses bracket access', async () => {
      const { client } = createMockClient();
      _setFieldMappingsDynamoClientForTesting(client);

      const body = validMappingBody({
        transforms: [{ target: 'x', source: 'y', expression: 'value[0]' }],
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/v1/admin/mappings/springs/canvas-lms',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify(body),
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // PUT — valid mapping
  // -------------------------------------------------------------------------

  describe('PUT /mappings/:org_id/:source_system — valid mapping', () => {
    it('should accept a valid mapping without transforms and return 200', async () => {
      const { client } = createMockClient(() => ({}));
      _setFieldMappingsDynamoClientForTesting(client);

      const response = await app.inject({
        method: 'PUT',
        url: '/v1/admin/mappings/springs/canvas-lms',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify(validMappingBody()),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { org_id: string; source_system: string; mapping_version: number };
      expect(body.org_id).toBe('springs');
      expect(body.source_system).toBe('canvas-lms');
      expect(body.mapping_version).toBe(1);
    });

    it('should accept mapping with valid transforms (value / 100)', async () => {
      const { client } = createMockClient(() => ({}));
      _setFieldMappingsDynamoClientForTesting(client);

      const body = validMappingBody({
        transforms: [
          { target: 'stabilityScore', source: 'raw_score', expression: 'value / 100' },
        ],
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/v1/admin/mappings/springs/canvas-lms',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify(body),
      });

      expect(response.statusCode).toBe(200);
    });

    it('should store template_id and template_version from query params', async () => {
      const { client, spy } = createMockClient(() => ({}));
      _setFieldMappingsDynamoClientForTesting(client);

      const response = await app.inject({
        method: 'PUT',
        url: '/v1/admin/mappings/springs/canvas-lms?template_id=canvas-lms-v1&template_version=1.0.0',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify(validMappingBody()),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { template_id: string; template_version: string };
      expect(body.template_id).toBe('canvas-lms-v1');
      expect(body.template_version).toBe('1.0.0');
      expect(spy).toHaveBeenCalled();
    });

    it('should return 400 when body is not a JSON object', async () => {
      const { client } = createMockClient();
      _setFieldMappingsDynamoClientForTesting(client);

      const response = await app.inject({
        method: 'PUT',
        url: '/v1/admin/mappings/springs/canvas-lms',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify([]),
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /mappings/:org_id
  // -------------------------------------------------------------------------

  describe('GET /mappings/:org_id — list mappings', () => {
    it('should return empty list when DynamoDB Query returns no items', async () => {
      const { client } = createMockClient(() => ({ Items: [] }));
      _setFieldMappingsDynamoClientForTesting(client);

      const response = await app.inject({
        method: 'GET',
        url: '/v1/admin/mappings/springs',
        headers: { 'x-admin-api-key': ADMIN_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { mappings: unknown[]; count: number };
      expect(body.count).toBe(0);
      expect(body.mappings).toEqual([]);
    });

    it('should return mapping records when DynamoDB Query returns items', async () => {
      const items = [
        {
          org_id: 'springs',
          source_system: 'canvas-lms',
          mapping: { required: ['stabilityScore'] },
          mapping_version: 2,
          updated_at: '2026-04-01T00:00:00.000Z',
          updated_by: 'admin-key-prefix',
        },
      ];

      const { client } = createMockClient(() => ({ Items: items }));
      _setFieldMappingsDynamoClientForTesting(client);

      const response = await app.inject({
        method: 'GET',
        url: '/v1/admin/mappings/springs',
        headers: { 'x-admin-api-key': ADMIN_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { mappings: Array<{ source_system: string; mapping_version: number }>; count: number };
      expect(body.count).toBe(1);
      expect(body.mappings[0]?.source_system).toBe('canvas-lms');
      expect(body.mappings[0]?.mapping_version).toBe(2);
    });

    it('should return 401 when x-admin-api-key is absent', async () => {
      const response = await contractHttp(app, {
        method: 'GET',
        url: '/v1/admin/mappings/springs',
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
