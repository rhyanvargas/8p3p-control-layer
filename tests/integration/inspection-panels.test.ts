/**
 * Integration Tests: Inspection API (data endpoints formerly consumed by /inspect panels)
 * Plan: .cursor/plans/inspection-panels.plan.md (TASK-010)
 *
 * TEST-PANEL-011 through TEST-PANEL-013: API callability (static /inspect serving retired)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerIngestionRoutes } from '../../src/ingestion/routes.js';
import { registerStateRoutes } from '../../src/state/routes.js';
import { registerSignalLogRoutes } from '../../src/signalLog/routes.js';
import { registerDecisionRoutes } from '../../src/decision/routes.js';
import { apiKeyPreHandler } from '../../src/auth/api-key-middleware.js';
import {
  initIdempotencyStore,
  closeIdempotencyStore,
  clearIdempotencyStore,
} from '../../src/ingestion/idempotency.js';
import {
  initIngestionLogStore,
  closeIngestionLogStore,
  clearIngestionLogStore,
} from '../../src/ingestion/ingestion-log-store.js';
import {
  initSignalLogStore,
  closeSignalLogStore,
  clearSignalLogStore,
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
} from '../../src/decision/store.js';
import { loadPolicy } from '../../src/decision/policy-loader.js';

const TEST_API_KEY = 'test-panel-api-key';

describe('Inspection API integration', () => {
  let app: FastifyInstance;
  let originalApiKey: string | undefined;

  function validSignal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      org_id: 'test-org',
      signal_id: `panel-signal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source_system: 'inspection-panel-test',
      learner_reference: 'panel-learner-1',
      timestamp: '2026-02-24T00:00:00Z',
      schema_version: 'v1',
      payload: {
        stabilityScore: 0.28,
        masteryScore: 0.45,
        confidenceInterval: 0.65,
        riskSignal: 0.15,
        timeSinceReinforcement: 90000,
      },
      ...overrides,
    };
  }

  beforeAll(async () => {
    originalApiKey = process.env.API_KEY;
    process.env.API_KEY = TEST_API_KEY;

    initIdempotencyStore(':memory:');
    initSignalLogStore(':memory:');
    initStateStore(':memory:');
    initIngestionLogStore(':memory:');
    initDecisionStore(':memory:');
    loadPolicy();

    app = Fastify({ logger: false });

    app.register(
      async (v1) => {
        v1.addHook('preHandler', apiKeyPreHandler);
        registerIngestionRoutes(v1);
        registerStateRoutes(v1);
        registerSignalLogRoutes(v1);
        registerDecisionRoutes(v1);
      },
      { prefix: '/v1' }
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    if (originalApiKey !== undefined) {
      process.env.API_KEY = originalApiKey;
    } else {
      delete process.env.API_KEY;
    }
    closeDecisionStore();
    closeStateStore();
    closeSignalLogStore();
    closeIngestionLogStore();
    closeIdempotencyStore();
  });

  beforeEach(() => {
    clearIdempotencyStore();
    clearSignalLogStore();
    clearStateStore();
    clearIngestionLogStore();
    clearDecisionStore();
  });

  // ---------------------------------------------------------------------------
  // TEST-PANEL-011: GET /v1/ingestion with API key returns expected shape
  // ---------------------------------------------------------------------------
  it('TEST-PANEL-011: GET /v1/ingestion with API key returns expected shape', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/ingestion?org_id=test-org&limit=10',
      headers: { 'x-api-key': TEST_API_KEY },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('org_id');
    expect(body).toHaveProperty('entries');
    expect(Array.isArray(body.entries)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // TEST-PANEL-012: GET /v1/ingestion without API key returns 401
  // ---------------------------------------------------------------------------
  it('TEST-PANEL-012: GET /v1/ingestion without API key returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/ingestion?org_id=test-org&limit=10',
    });
    expect(res.statusCode).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // TEST-PANEL-013: Signal ingestion flows into inspection endpoints
  // ---------------------------------------------------------------------------
  it('TEST-PANEL-013: POST /v1/signals produces data for ingestion, state, and decisions endpoints', async () => {
    const learnerRef = 'panel-flow-learner';
    const signal = validSignal({
      learner_reference: learnerRef,
      signal_id: `panel-flow-${Date.now()}`,
    });

    const postRes = await app.inject({
      method: 'POST',
      url: '/v1/signals',
      payload: signal,
      headers: { 'x-api-key': TEST_API_KEY },
    });
    expect(postRes.statusCode).toBe(200);

    const ingestionRes = await app.inject({
      method: 'GET',
      url: '/v1/ingestion?org_id=test-org&limit=50',
      headers: { 'x-api-key': TEST_API_KEY },
    });
    expect(ingestionRes.statusCode).toBe(200);
    const ingestionBody = ingestionRes.json();
    expect(Array.isArray(ingestionBody.entries)).toBe(true);
    expect(ingestionBody.entries.some((e: { signal_id?: string }) => e.signal_id === signal.signal_id)).toBe(true);

    const listRes = await app.inject({
      method: 'GET',
      url: '/v1/state/list?org_id=test-org&limit=50',
      headers: { 'x-api-key': TEST_API_KEY },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json();
    expect(Array.isArray(listBody.learners)).toBe(true);
    expect(listBody.learners.some((l: { learner_reference?: string }) => l.learner_reference === learnerRef)).toBe(true);

    const stateRes = await app.inject({
      method: 'GET',
      url: `/v1/state?org_id=test-org&learner_reference=${learnerRef}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });
    expect(stateRes.statusCode).toBe(200);
    const stateBody = stateRes.json();
    expect(stateBody.learner_reference).toBe(learnerRef);
    expect(stateBody.state_version).toBeGreaterThanOrEqual(1);

    const decisionsRes = await app.inject({
      method: 'GET',
      url: `/v1/decisions?org_id=test-org&learner_reference=${learnerRef}&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      headers: { 'x-api-key': TEST_API_KEY },
    });
    expect(decisionsRes.statusCode).toBe(200);
    const decisionsBody = decisionsRes.json();
    expect(Array.isArray(decisionsBody.decisions)).toBe(true);
    expect(decisionsBody.decisions.length).toBeGreaterThan(0);

    const receiptsRes = await app.inject({
      method: 'GET',
      url: `/v1/receipts?org_id=test-org&learner_reference=${learnerRef}&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      headers: { 'x-api-key': TEST_API_KEY },
    });
    expect(receiptsRes.statusCode).toBe(200);
    const receiptsBody = receiptsRes.json();
    expect(Array.isArray(receiptsBody.receipts)).toBe(true);
    expect(receiptsBody.receipts.length).toBe(decisionsBody.decisions.length);
  });
});
