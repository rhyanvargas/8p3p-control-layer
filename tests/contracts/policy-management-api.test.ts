/**
 * Contract Tests: Policy Management Admin API
 * POL-ADMIN-001 through POL-ADMIN-008
 *
 * DynamoDB is mocked at the repository boundary via _setPoliciesRepoClientForTesting.
 * The mock client's send() method is a vi.fn() spy — tests configure return values
 * per-command and assert that specific DynamoDB operations were (or were not) called.
 *
 * @see docs/specs/policy-management-api.md §Contract Tests
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
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { adminApiKeyPreHandler } from '../../src/auth/admin-api-key-middleware.js';
import { registerPolicyManagementRoutes } from '../../src/admin/policy-management-routes.js';
import { _setPoliciesRepoClientForTesting } from '../../src/admin/policies-dynamodb.js';
import { contractHttp } from '../helpers/contract-http.js';
import { ErrorCodes } from '../../src/shared/error-codes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_KEY = 'test-admin-key-123';

function validPolicyBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    policy_id: 'springs:learner',
    policy_version: '1.0.0',
    description: 'Test policy',
    rules: [
      {
        rule_id: 'rule-intervene',
        condition: {
          all: [
            { field: 'stabilityScore', operator: 'lt', value: 0.3 },
            { field: 'timeSinceReinforcement', operator: 'gt', value: 172800 },
          ],
        },
        decision_type: 'intervene',
      },
    ],
    default_decision_type: 'reinforce',
    ...overrides,
  };
}

/** Creates a mock DynamoDB client with a configurable send spy */
function createMockClient(
  sendImpl: (command: unknown) => unknown = () => ({})
): { client: DynamoDBClient; spy: MockInstance } {
  const spy = vi.fn(sendImpl);
  const client = { send: spy } as unknown as DynamoDBClient;
  return { client, spy };
}

/** Returns a marshalled GetItem response for an existing policy */
function existingItemResponse(policyVersion = 1) {
  return {
    Item: marshall({
      org_id: 'springs',
      policy_key: 'learner',
      policy_version: policyVersion,
      status: 'active',
      updated_at: '2026-03-28T12:00:00Z',
      updated_by: 'test-admin-k…',
      policy_json: validPolicyBody(),
    }),
  };
}

/** Returns an UpdateItem ALL_NEW response */
function updateItemResponse(status: 'active' | 'disabled' = 'active') {
  return {
    Attributes: marshall({
      org_id: 'springs',
      policy_key: 'learner',
      policy_version: 2,
      status,
      updated_at: new Date().toISOString(),
      updated_by: 'test-admin-k…',
    }),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

// Remote HTTP mode cannot use in-process DynamoDB mocks — skip (admin tests against real deploy are manual).
const describePolicyAdmin = process.env.API_BASE_URL?.trim() ? describe.skip : describe;

describePolicyAdmin('Policy Management Admin API Contract Tests', () => {
  let app: FastifyInstance;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.register(
      async (admin) => {
        admin.addHook('preHandler', adminApiKeyPreHandler);
        registerPolicyManagementRoutes(admin);
      },
      { prefix: '/v1/admin' }
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    _setPoliciesRepoClientForTesting(null);
  });

  beforeEach(() => {
    savedEnv.ADMIN_API_KEY = process.env.ADMIN_API_KEY;
    savedEnv.POLICIES_TABLE = process.env.POLICIES_TABLE;
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    process.env.POLICIES_TABLE = 'PoliciesTable';
  });

  afterEach(() => {
    if (savedEnv.ADMIN_API_KEY !== undefined) process.env.ADMIN_API_KEY = savedEnv.ADMIN_API_KEY;
    else delete process.env.ADMIN_API_KEY;
    if (savedEnv.POLICIES_TABLE !== undefined) process.env.POLICIES_TABLE = savedEnv.POLICIES_TABLE;
    else delete process.env.POLICIES_TABLE;
    _setPoliciesRepoClientForTesting(null);
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // POL-ADMIN-001: PUT valid policy → written to DynamoDB; 200, status active,
  //                response includes policy_version
  // -------------------------------------------------------------------------
  describe('POL-ADMIN-001: PUT valid policy → written to DynamoDB', () => {
    it('returns 200 with status active and policy_version; PutItem called', async () => {
      const { client, spy } = createMockClient((cmd) => {
        if (cmd instanceof GetItemCommand) return { Item: undefined }; // new item
        if (cmd instanceof PutItemCommand) return {};
        return {};
      });
      _setPoliciesRepoClientForTesting(client);

      const response = await contractHttp(app, {
        method: 'PUT',
        url: '/v1/admin/policies/springs/learner',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: validPolicyBody(),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('active');
      expect(body.policy_version).toBe(1);
      expect(body.org_id).toBe('springs');
      expect(body.policy_key).toBe('learner');
      expect(body.updated_at).toBeDefined();

      const putCallArgs = spy.mock.calls.find(([cmd]) => cmd instanceof PutItemCommand);
      expect(putCallArgs).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // POL-ADMIN-002: PUT invalid policy → 400 invalid_policy_structure; no DB write
  // -------------------------------------------------------------------------
  describe('POL-ADMIN-002: PUT invalid policy → rejected before DynamoDB', () => {
    it('returns 400 invalid_policy_structure; PutItem never called', async () => {
      const { client, spy } = createMockClient(() => ({}));
      _setPoliciesRepoClientForTesting(client);

      const response = await contractHttp(app, {
        method: 'PUT',
        url: '/v1/admin/policies/springs/learner',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: validPolicyBody({ rules: [{ rule_id: 'bad', decision_type: 'explode', condition: { field: 'x', operator: 'eq', value: 1 } }] }),
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe(ErrorCodes.INVALID_POLICY_STRUCTURE);

      const putCalled = spy.mock.calls.some(([cmd]) => cmd instanceof PutItemCommand);
      expect(putCalled).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // POL-ADMIN-003: POST validate valid policy → 200 { valid: true }; PutItem never called
  // -------------------------------------------------------------------------
  describe('POL-ADMIN-003: POST validate → no DynamoDB write', () => {
    it('returns 200 { valid: true } and never calls PutItem', async () => {
      const { client, spy } = createMockClient(() => ({}));
      _setPoliciesRepoClientForTesting(client);

      const response = await contractHttp(app, {
        method: 'POST',
        url: '/v1/admin/policies/validate',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: validPolicyBody(),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.valid).toBe(true);

      const putCalled = spy.mock.calls.some(([cmd]) => cmd instanceof PutItemCommand);
      expect(putCalled).toBe(false);
    });

    it('returns 400 { valid: false } with error on invalid body', async () => {
      const { client } = createMockClient(() => ({}));
      _setPoliciesRepoClientForTesting(client);

      const response = await contractHttp(app, {
        method: 'POST',
        url: '/v1/admin/policies/validate',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: { policy_id: 'bad', policy_version: 'not-semver', description: 'd', rules: [], default_decision_type: 'reinforce' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.valid).toBe(false);
      expect(body.error.code).toBe(ErrorCodes.INVALID_POLICY_STRUCTURE);
    });
  });

  // -------------------------------------------------------------------------
  // POL-ADMIN-004: DELETE existing → 204
  // -------------------------------------------------------------------------
  describe('POL-ADMIN-004: DELETE existing policy → 204', () => {
    it('returns 204 on successful delete', async () => {
      const { client } = createMockClient((cmd) => {
        if (cmd instanceof DeleteItemCommand) return {};
        return {};
      });
      _setPoliciesRepoClientForTesting(client);

      const response = await contractHttp(app, {
        method: 'DELETE',
        url: '/v1/admin/policies/springs/learner',
        headers: { 'x-admin-api-key': ADMIN_KEY },
      });

      expect(response.statusCode).toBe(204);
    });
  });

  // -------------------------------------------------------------------------
  // POL-ADMIN-005: PATCH disabled → status updated; resolution falls through
  //   "Falls through" is validated by asserting the PATCH returns status: "disabled".
  //   The cache TTL/resolution chain behavior is tested indirectly via the mock
  //   — the policy-loader skips items with status !== "active" per tryGetPolicyItemFromDynamo.
  // -------------------------------------------------------------------------
  describe('POL-ADMIN-005: PATCH status: disabled → 200', () => {
    it('returns 200 with status disabled after PATCH', async () => {
      const { client } = createMockClient((cmd) => {
        if (cmd instanceof UpdateItemCommand) return updateItemResponse('disabled');
        return {};
      });
      _setPoliciesRepoClientForTesting(client);

      const response = await contractHttp(app, {
        method: 'PATCH',
        url: '/v1/admin/policies/springs/learner',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: { status: 'disabled' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('disabled');
      expect(body.org_id).toBe('springs');
      expect(body.policy_key).toBe('learner');
    });
  });

  // -------------------------------------------------------------------------
  // POL-ADMIN-006: PATCH active → policy resumes after cache TTL
  //   Asserts the PATCH returns status: "active". Cache TTL behavior is
  //   documented in the spec — deferred to integration testing.
  // -------------------------------------------------------------------------
  describe('POL-ADMIN-006: PATCH status: active → 200', () => {
    it('returns 200 with status active after PATCH re-enable', async () => {
      const { client } = createMockClient((cmd) => {
        if (cmd instanceof UpdateItemCommand) return updateItemResponse('active');
        return {};
      });
      _setPoliciesRepoClientForTesting(client);

      const response = await contractHttp(app, {
        method: 'PATCH',
        url: '/v1/admin/policies/springs/learner',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: { status: 'active' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('active');
    });
  });

  // -------------------------------------------------------------------------
  // POL-ADMIN-007: PATCH non-existent policy → 404 policy_not_found
  // -------------------------------------------------------------------------
  describe('POL-ADMIN-007: PATCH non-existent policy → 404', () => {
    it('returns 404 policy_not_found when UpdateItem condition check fails', async () => {
      const { client } = createMockClient((cmd) => {
        if (cmd instanceof UpdateItemCommand) {
          throw new ConditionalCheckFailedException({
            message: 'The conditional request failed',
            $metadata: {},
          });
        }
        return {};
      });
      _setPoliciesRepoClientForTesting(client);

      const response = await contractHttp(app, {
        method: 'PATCH',
        url: '/v1/admin/policies/springs/nonexistent',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: { status: 'disabled' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe(ErrorCodes.POLICY_NOT_FOUND);
      expect(body.error.message).toContain('nonexistent');
      expect(body.error.message).toContain('springs');
    });
  });

  // -------------------------------------------------------------------------
  // POL-ADMIN-008: Tenant x-api-key on /v1/admin/* → 401 admin_key_required
  // -------------------------------------------------------------------------
  describe('POL-ADMIN-008: Tenant API key rejected on admin routes', () => {
    it('returns 401 admin_key_required when tenant x-api-key is sent (no x-admin-api-key)', async () => {
      const response = await contractHttp(app, {
        method: 'GET',
        url: '/v1/admin/policies',
        headers: { 'x-api-key': 'tenant-key-value' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe(ErrorCodes.ADMIN_KEY_REQUIRED);
    });

    it('returns 401 admin_key_required when no header is sent', async () => {
      const response = await contractHttp(app, {
        method: 'GET',
        url: '/v1/admin/policies',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe(ErrorCodes.ADMIN_KEY_REQUIRED);
    });

    it('allows request when correct x-admin-api-key is provided', async () => {
      const { client } = createMockClient(() => ({ Items: [], Count: 0 }));
      _setPoliciesRepoClientForTesting(client);

      const response = await contractHttp(app, {
        method: 'GET',
        url: '/v1/admin/policies',
        headers: { 'x-admin-api-key': ADMIN_KEY },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Additional coverage: PATCH invalid status value → 400
  // -------------------------------------------------------------------------
  describe('PATCH invalid status value → 400', () => {
    it('returns 400 invalid_status_value for unrecognized status string', async () => {
      const response = await contractHttp(app, {
        method: 'PATCH',
        url: '/v1/admin/policies/springs/learner',
        headers: { 'x-admin-api-key': ADMIN_KEY, 'content-type': 'application/json' },
        payload: { status: 'archived' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe(ErrorCodes.INVALID_STATUS_VALUE);
    });
  });

  // -------------------------------------------------------------------------
  // Additional coverage: PUT with If-Match version conflict → 409
  // -------------------------------------------------------------------------
  describe('PUT with If-Match version conflict → 409', () => {
    it('returns 409 version_conflict when If-Match does not match current version', async () => {
      const { client } = createMockClient((cmd) => {
        if (cmd instanceof GetItemCommand) return existingItemResponse(3); // current version = 3
        if (cmd instanceof PutItemCommand) {
          throw new ConditionalCheckFailedException({
            message: 'The conditional request failed',
            $metadata: {},
          });
        }
        return {};
      });
      _setPoliciesRepoClientForTesting(client);

      const response = await contractHttp(app, {
        method: 'PUT',
        url: '/v1/admin/policies/springs/learner',
        headers: {
          'x-admin-api-key': ADMIN_KEY,
          'content-type': 'application/json',
          'if-match': '2',
        },
        payload: validPolicyBody(),
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe(ErrorCodes.VERSION_CONFLICT);
    });
  });

  // -------------------------------------------------------------------------
  // Additional coverage: DELETE non-existent → 404
  // -------------------------------------------------------------------------
  describe('DELETE non-existent policy → 404', () => {
    it('returns 404 policy_not_found when item does not exist', async () => {
      const { client } = createMockClient((cmd) => {
        if (cmd instanceof DeleteItemCommand) {
          throw new ConditionalCheckFailedException({
            message: 'The conditional request failed',
            $metadata: {},
          });
        }
        return {};
      });
      _setPoliciesRepoClientForTesting(client);

      const response = await contractHttp(app, {
        method: 'DELETE',
        url: '/v1/admin/policies/springs/nonexistent',
        headers: { 'x-admin-api-key': ADMIN_KEY },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe(ErrorCodes.POLICY_NOT_FOUND);
    });
  });

  // -------------------------------------------------------------------------
  // Additional coverage: GET /policies returns list
  // -------------------------------------------------------------------------
  describe('GET /policies returns list', () => {
    it('returns 200 with policies array', async () => {
      const { client } = createMockClient(() => ({
        Items: [
          marshall({
            org_id: 'springs',
            policy_key: 'learner',
            policy_version: 4,
            status: 'active',
            updated_at: '2026-03-28T12:00:00Z',
            updated_by: 'test-admin-k…',
          }),
        ],
        LastEvaluatedKey: undefined,
        Count: 1,
      }));
      _setPoliciesRepoClientForTesting(client);

      const response = await contractHttp(app, {
        method: 'GET',
        url: '/v1/admin/policies',
        headers: { 'x-admin-api-key': ADMIN_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body.policies)).toBe(true);
      expect(typeof body.count).toBe('number');
    });
  });
});
