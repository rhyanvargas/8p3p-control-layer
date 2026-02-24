/**
 * Integration Tests: Inspection Panels
 * Plan: .cursor/plans/inspection-panels.plan.md (TASK-010)
 *
 * TEST-PANEL-001 through TEST-PANEL-012: static assets, HTML structure, API callability
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { resolve } from 'path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
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
const PANELS_ROOT = resolve(process.cwd(), 'src/panels');

describe('Inspection Panels Integration', () => {
  let app: FastifyInstance;
  let originalApiKey: string | undefined;

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

    app.get('/inspect', async (_request, reply) => {
      return reply.redirect('/inspect/');
    });

    await app.register(fastifyStatic, {
      root: PANELS_ROOT,
      prefix: '/inspect/',
    });

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
  // TEST-PANEL-001: GET /inspect/ returns 200 HTML
  // ---------------------------------------------------------------------------
  it('TEST-PANEL-001: GET /inspect/ returns 200 with HTML content-type', async () => {
    const res = await app.inject({ method: 'GET', url: '/inspect/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  // ---------------------------------------------------------------------------
  // TEST-PANEL-002: GET /inspect/styles.css returns 200 CSS
  // ---------------------------------------------------------------------------
  it('TEST-PANEL-002: GET /inspect/styles.css returns 200 with CSS content-type', async () => {
    const res = await app.inject({ method: 'GET', url: '/inspect/styles.css' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/css/);
  });

  // ---------------------------------------------------------------------------
  // TEST-PANEL-003: GET /inspect/app.js returns 200 JS
  // ---------------------------------------------------------------------------
  it('TEST-PANEL-003: GET /inspect/app.js returns 200 with JS content-type', async () => {
    const res = await app.inject({ method: 'GET', url: '/inspect/app.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
  });

  // ---------------------------------------------------------------------------
  // TEST-PANEL-004 through TEST-PANEL-007: Panel JS files
  // ---------------------------------------------------------------------------
  it('TEST-PANEL-004: GET /inspect/panel-signal-intake.js returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/inspect/panel-signal-intake.js' });
    expect(res.statusCode).toBe(200);
  });

  it('TEST-PANEL-005: GET /inspect/panel-state-viewer.js returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/inspect/panel-state-viewer.js' });
    expect(res.statusCode).toBe(200);
  });

  it('TEST-PANEL-006: GET /inspect/panel-decision-stream.js returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/inspect/panel-decision-stream.js' });
    expect(res.statusCode).toBe(200);
  });

  it('TEST-PANEL-007: GET /inspect/panel-decision-trace.js returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/inspect/panel-decision-trace.js' });
    expect(res.statusCode).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // TEST-PANEL-008: HTML contains all four panel container divs
  // ---------------------------------------------------------------------------
  it('TEST-PANEL-008: GET /inspect/ HTML contains all four panel container divs', async () => {
    const res = await app.inject({ method: 'GET', url: '/inspect/' });
    expect(res.statusCode).toBe(200);
    const html = res.payload;
    expect(html).toContain('id="panel-signal"');
    expect(html).toContain('id="panel-state"');
    expect(html).toContain('id="panel-decisions"');
    expect(html).toContain('id="panel-trace"');
  });

  // ---------------------------------------------------------------------------
  // TEST-PANEL-009: HTML includes script refs to all panel JS files
  // ---------------------------------------------------------------------------
  it('TEST-PANEL-009: GET /inspect/ HTML includes script refs to all panel JS files', async () => {
    const res = await app.inject({ method: 'GET', url: '/inspect/' });
    expect(res.statusCode).toBe(200);
    const html = res.payload;
    expect(html).toContain('panel-signal-intake.js');
    expect(html).toContain('panel-state-viewer.js');
    expect(html).toContain('panel-decision-stream.js');
    expect(html).toContain('panel-decision-trace.js');
    expect(html).toContain('app.js');
  });

  // ---------------------------------------------------------------------------
  // TEST-PANEL-010: /inspect redirects to /inspect/
  // ---------------------------------------------------------------------------
  it('TEST-PANEL-010: GET /inspect redirects to /inspect/', async () => {
    const res = await app.inject({ method: 'GET', url: '/inspect' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/inspect/');
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
});
