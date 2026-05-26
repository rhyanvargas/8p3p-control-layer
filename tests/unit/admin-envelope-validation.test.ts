/**
 * Unit Tests: Admin envelope-block validation (PUT /v1/admin/mappings/:org_id/:source_system)
 *
 * Validates the `envelope` block validation logic added to validateMappingBody.
 * @see docs/specs/webhook-adapters.md §Admin API: Envelope Mapping
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
} from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { adminApiKeyPreHandler } from '../../src/auth/admin-api-key-middleware.js';
import { registerAdminFieldMappingsRoutes } from '../../src/routes/admin-field-mappings.js';
import {
  _setFieldMappingsDynamoClientForTesting,
  clearFieldMappingCache,
} from '../../src/config/field-mappings-dynamo.js';

const ADMIN_KEY = 'test-admin-key-abc';
const ORIG_TABLE = process.env.FIELD_MAPPINGS_TABLE;

function createMockClient() {
  const spy = vi.fn(() => ({}));
  const client = { send: spy } as unknown as DynamoDBDocumentClient;
  return { client, spy };
}

function putMapping(app: FastifyInstance, body: unknown) {
  return app.inject({
    method: 'PUT',
    url: '/v1/admin/mappings/springs/canvas-lms',
    headers: {
      'content-type': 'application/json',
      'x-admin-api-key': ADMIN_KEY,
    },
    payload: body,
  });
}

describe('envelope block validation', () => {
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
    const { client } = createMockClient();
    _setFieldMappingsDynamoClientForTesting(client);
  });

  afterEach(() => {
    process.env.FIELD_MAPPINGS_TABLE = ORIG_TABLE;
    delete process.env.ADMIN_API_KEY;
    _setFieldMappingsDynamoClientForTesting(null);
    clearFieldMappingCache();
  });

  it('accepts valid envelope with all fields set', async () => {
    const res = await putMapping(app, {
      required: ['stabilityScore'],
      envelope: {
        learner_reference_path: 'submission.user_id',
        signal_id_path: 'submission.id',
        timestamp_path: 'submission.submitted_at',
        event_type_path: 'event_type',
        allowed_event_types: ['submission_created', 'submission_updated'],
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it('accepts valid minimal envelope (only learner_reference_path)', async () => {
    const res = await putMapping(app, {
      required: ['stabilityScore'],
      envelope: {
        learner_reference_path: 'submission.user_id',
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects missing learner_reference_path when envelope is present', async () => {
    const res = await putMapping(app, {
      required: ['stabilityScore'],
      envelope: {
        signal_id_path: 'submission.id',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('invalid_format');
    expect(body.error.message).toContain('learner_reference_path');
  });

  it('rejects allowed_event_types without event_type_path', async () => {
    const res = await putMapping(app, {
      required: ['stabilityScore'],
      envelope: {
        learner_reference_path: 'submission.user_id',
        allowed_event_types: ['submission_created'],
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('invalid_format');
    expect(body.error.message).toContain('allowed_event_types requires envelope.event_type_path');
  });

  it('rejects unknown key inside envelope', async () => {
    const res = await putMapping(app, {
      required: ['stabilityScore'],
      envelope: {
        learner_reference_path: 'submission.user_id',
        foo: 'bar',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('invalid_format');
    expect(body.error.message).toContain('unknown key "foo"');
  });

  it('rejects empty learner_reference_path', async () => {
    const res = await putMapping(app, {
      required: ['stabilityScore'],
      envelope: {
        learner_reference_path: '',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('invalid_format');
    expect(body.error.message).toContain('learner_reference_path');
  });

  it('rejects allowed_event_types containing non-strings', async () => {
    const res = await putMapping(app, {
      required: ['stabilityScore'],
      envelope: {
        learner_reference_path: 'submission.user_id',
        event_type_path: 'event_type',
        allowed_event_types: ['submission_created', 123],
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('invalid_format');
    expect(body.error.message).toContain('allowed_event_types');
  });
});
