/**
 * Unit tests for Lambda handler exports (AWS-DEPLOY-UT-001)
 *
 * Uses vi.resetModules() to ensure fresh module state per test (initialized = false).
 * DynamoDB repositories are mocked via vi.mock at the top level.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

vi.mock('../../../src/ingestion/dynamodb-idempotency-repository.js', () => {
  class MockIdempotencyRepo {
    checkAndStore = vi.fn().mockResolvedValue({ isDuplicate: false, receivedAt: '2026-01-01T00:00:00.000Z' });
  }
  return { DynamoDbIdempotencyRepository: MockIdempotencyRepo };
});

vi.mock('../../../src/signalLog/dynamodb-repository.js', () => {
  class MockSignalLogRepo {
    appendSignal = vi.fn().mockImplementation(async (signal: { org_id: string; signal_id: string; source_system: string; learner_reference: string; timestamp: string; schema_version: string; payload: unknown }, acceptedAt: string) => ({
      ...signal,
      accepted_at: acceptedAt,
    }));
    querySignals = vi.fn().mockResolvedValue({ signals: [], hasMore: false });
    getSignalsByIds = vi.fn().mockImplementation(async (orgId: string, signalIds: string[]) => {
      const now = '2026-01-01T00:00:00.000Z';
      return signalIds.map((signal_id) => ({
        org_id: orgId,
        signal_id,
        source_system: 'test-lms',
        learner_reference: 'learner-1',
        timestamp: now,
        schema_version: 'v1',
        payload: { engagement_level: 'high', time_on_task: 300 },
        accepted_at: now,
      }));
    });
  }
  return { DynamoDbSignalLogRepository: MockSignalLogRepo };
});

vi.mock('../../../src/state/dynamodb-repository.js', () => {
  class MockStateRepo {
    getState = vi.fn().mockResolvedValue(null);
    isSignalApplied = vi.fn().mockResolvedValue(false);
    saveStateWithAppliedSignals = vi.fn().mockResolvedValue(undefined);
    listLearners = vi.fn().mockResolvedValue({ learners: [], nextCursor: null });
    getStateByVersion = vi.fn().mockResolvedValue(null);
  }
  return { DynamoDbStateRepository: MockStateRepo };
});

vi.mock('../../../src/decision/dynamodb-repository.js', () => {
  class MockDecisionRepo {
    saveDecision = vi.fn().mockResolvedValue(undefined);
    getDecisions = vi.fn().mockResolvedValue({ decisions: [], hasMore: false });
  }
  return { DynamoDbDecisionRepository: MockDecisionRepo };
});

vi.mock('../../../src/ingestion/dynamodb-ingestion-log-repository.js', () => {
  class MockIngestionLogRepo {
    appendIngestionOutcome = vi.fn().mockResolvedValue(undefined);
    getIngestionOutcomes = vi.fn().mockResolvedValue({ entries: [], nextCursor: null });
  }
  return { DynamoDbIngestionLogRepository: MockIngestionLogRepo };
});

vi.mock('../../../src/decision/policy-loader.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/decision/policy-loader.js')>();
  return {
    ...actual,
    loadPolicy: vi.fn(),
    resolveUserTypeFromSourceSystem: vi.fn().mockReturnValue('learner'),
    warmupPolicyForContext: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../../src/config/tenant-field-mappings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/config/tenant-field-mappings.js')>();
  const pass = (payload: unknown) =>
    payload !== null && typeof payload === 'object' && !Array.isArray(payload)
      ? { ok: true as const, payload: payload as Record<string, unknown> }
      : { ok: false as const, errors: [] };
  return {
    ...actual,
    normalizeAndValidateTenantPayload: vi.fn().mockImplementation(
      (req: { orgId: string; payload: unknown }) => pass(req.payload)
    ),
    normalizeAndValidateTenantPayloadAsync: vi.fn().mockImplementation(async (req: { payload: unknown }) => pass(req.payload)),
  };
});

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/',
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '/',
    body: null,
    isBase64Encoded: false,
    ...overrides,
  };
}

function validSignalBody() {
  return {
    org_id: 'test-org',
    signal_id: `sig-${Date.now()}`,
    source_system: 'test-lms',
    learner_reference: 'learner-1',
    timestamp: '2026-01-15T10:00:00Z',
    schema_version: 'v1',
    payload: { engagement_level: 'high', time_on_task: 300 },
  };
}

function setEnv() {
  process.env.SIGNALS_TABLE = 'test-signals';
  process.env.STATE_TABLE = 'test-state';
  process.env.APPLIED_SIGNALS_TABLE = 'test-applied-signals';
  process.env.DECISIONS_TABLE = 'test-decisions';
  process.env.IDEMPOTENCY_TABLE = 'test-idempotency';
  process.env.INGESTION_LOG_TABLE = 'test-ingestion-log';
}

describe('Lambda: IngestFunction handler (AWS-DEPLOY-UT-001)', () => {
  beforeEach(() => {
    setEnv();
  });

  it('exports a handler function', async () => {
    const mod = await import('../../../src/lambda/ingest.js');
    expect(typeof mod.handler).toBe('function');
  });

  it('returns 200 with accepted status for a valid signal', async () => {
    const { handler } = await import('../../../src/lambda/ingest.js');
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/v1/signals',
      body: JSON.stringify(validSignalBody()),
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as { status: string };
    expect(body.status).toMatch(/^(accepted|duplicate)$/);
  });

  it('returns 400 for missing required fields', async () => {
    const { handler } = await import('../../../src/lambda/ingest.js');
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/v1/signals',
      body: JSON.stringify({ org_id: 'test' }),
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    const { handler } = await import('../../../src/lambda/ingest.js');
    const event = makeEvent({ httpMethod: 'POST', path: '/v1/signals', body: 'not-json' });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });
});

describe('Lambda: QueryFunction handler (AWS-DEPLOY-UT-001)', () => {
  beforeEach(() => {
    process.env.SIGNALS_TABLE = 'test-signals';
    process.env.DECISIONS_TABLE = 'test-decisions';
  });

  it('exports a handler function', async () => {
    const mod = await import('../../../src/lambda/query.js');
    expect(typeof mod.handler).toBe('function');
  });

  it('returns 400 for GET /v1/signals without required params', async () => {
    const { handler } = await import('../../../src/lambda/query.js');
    const event = makeEvent({ httpMethod: 'GET', path: '/v1/signals', queryStringParameters: {} });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 for unknown path', async () => {
    const { handler } = await import('../../../src/lambda/query.js');
    const event = makeEvent({ httpMethod: 'GET', path: '/v1/unknown' });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });
});

describe('Lambda: AdminFunction handler (AWS-DEPLOY-UT-001)', () => {
  beforeEach(() => {
    process.env.POLICIES_TABLE = 'test-policies';
    process.env.ADMIN_API_KEY = 'test-admin-secret-key';
  });

  it('exports a handler function', async () => {
    const mod = await import('../../../src/lambda/admin.js');
    expect(typeof mod.handler).toBe('function');
  });

  it('returns 401 for GET /v1/admin/policies without x-admin-api-key', async () => {
    const { handler } = await import('../../../src/lambda/admin.js');
    const event = makeEvent({ httpMethod: 'GET', path: '/v1/admin/policies' });
    // aws-lambda-fastify wraps Fastify — the adminApiKeyPreHandler rejects before
    // any DynamoDB call, so no mock needed for this path.
    const result = await (handler as (e: typeof event) => Promise<{ statusCode: number; body: string }>)(event);
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 for PUT /v1/admin/policies/:org_id/:key without x-admin-api-key', async () => {
    const { handler } = await import('../../../src/lambda/admin.js');
    const event = makeEvent({
      httpMethod: 'PUT',
      path: '/v1/admin/policies/test-org/learner',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rules: [] }),
    });
    const result = await (handler as (e: typeof event) => Promise<{ statusCode: number; body: string }>)(event);
    expect(result.statusCode).toBe(401);
  });
});

describe('Lambda: InspectFunction handler (AWS-DEPLOY-UT-001)', () => {
  beforeEach(() => {
    process.env.STATE_TABLE = 'test-state';
    process.env.APPLIED_SIGNALS_TABLE = 'test-applied-signals';
    process.env.INGESTION_LOG_TABLE = 'test-ingestion-log';
  });

  it('exports a handler function', async () => {
    const mod = await import('../../../src/lambda/inspect.js');
    expect(typeof mod.handler).toBe('function');
  });

  it('returns 400 for GET /v1/state without org_id', async () => {
    const { handler } = await import('../../../src/lambda/inspect.js');
    const event = makeEvent({ httpMethod: 'GET', path: '/v1/state', queryStringParameters: {} });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 for GET /v1/state when learner not found', async () => {
    const { handler } = await import('../../../src/lambda/inspect.js');
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/v1/state',
      queryStringParameters: { org_id: 'test-org', learner_reference: 'learner-1' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('returns 200 JSON for GET /docs (public docs stub)', async () => {
    const { handler } = await import('../../../src/lambda/inspect.js');
    const event = makeEvent({ httpMethod: 'GET', path: '/docs' });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as { service?: string };
    expect(body.service).toBe('8p3p-control-layer');
  });

  it('returns 200 with empty learners list for GET /v1/state/list', async () => {
    const { handler } = await import('../../../src/lambda/inspect.js');
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/v1/state/list',
      queryStringParameters: { org_id: 'test-org' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as { learners: unknown[] };
    expect(Array.isArray(body.learners)).toBe(true);
  });
});
