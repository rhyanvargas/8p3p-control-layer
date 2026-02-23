/**
 * Contract Tests for API Key Middleware (AUTH-001 through AUTH-007)
 * @see docs/specs/api-key-middleware.md
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { apiKeyPreHandler } from '../../src/auth/api-key-middleware.js';
import { registerIngestionRoutes } from '../../src/ingestion/routes.js';
import { registerSignalLogRoutes } from '../../src/signalLog/routes.js';
import { registerDecisionRoutes } from '../../src/decision/routes.js';
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
} from '../../src/state/store.js';
import {
  initDecisionStore,
  closeDecisionStore,
  clearDecisionStore,
} from '../../src/decision/store.js';
import { loadPolicy } from '../../src/decision/policy-loader.js';
import { ErrorCodes } from '../../src/shared/error-codes.js';

function validSignal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    org_id: 'test-org',
    signal_id: `signal-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    source_system: 'test-system',
    learner_reference: 'learner-123',
    timestamp: '2026-01-30T10:00:00Z',
    schema_version: 'v1',
    payload: { skill: 'math', level: 5 },
    ...overrides,
  };
}

describe('API Key Middleware Contract Tests', () => {
  let app: FastifyInstance;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    initIdempotencyStore(':memory:');
    initSignalLogStore(':memory:');
    initStateStore(':memory:');
    initDecisionStore(':memory:');
    loadPolicy();

    app = Fastify({ logger: false });
    // Exempt routes (outside /v1 — never hit by middleware)
    app.get('/health', async () => ({ status: 'ok' }));
    app.get('/docs', async () => ({ docs: true }));
    // v1 routes with auth middleware
    app.register(
      async (v1) => {
        v1.addHook('preHandler', apiKeyPreHandler);
        registerIngestionRoutes(v1);
        registerSignalLogRoutes(v1);
        registerDecisionRoutes(v1);
      },
      { prefix: '/v1' }
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDecisionStore();
    closeStateStore();
    closeSignalLogStore();
    closeIdempotencyStore();
  });

  beforeEach(() => {
    savedEnv.API_KEY = process.env.API_KEY;
    savedEnv.API_KEY_ORG_ID = process.env.API_KEY_ORG_ID;
    clearIdempotencyStore();
    clearSignalLogStore();
    clearStateStore();
    clearDecisionStore();
  });

  afterEach(() => {
    if (savedEnv.API_KEY !== undefined) process.env.API_KEY = savedEnv.API_KEY;
    else delete process.env.API_KEY;
    if (savedEnv.API_KEY_ORG_ID !== undefined) process.env.API_KEY_ORG_ID = savedEnv.API_KEY_ORG_ID;
    else delete process.env.API_KEY_ORG_ID;
  });

  describe('AUTH-001: Valid key, org override', () => {
    it('processes request with org_id overridden to API_KEY_ORG_ID', async () => {
      process.env.API_KEY = 'key1';
      process.env.API_KEY_ORG_ID = 'org_pilot1';

      const response = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        headers: { 'x-api-key': 'key1' },
        payload: validSignal({ org_id: 'org_other' }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.org_id).toBe('org_pilot1');
      expect(body.status).toBe('accepted');
    });
  });

  describe('AUTH-002: Valid key, no org override', () => {
    it('processes request with org_id unchanged when API_KEY_ORG_ID unset', async () => {
      process.env.API_KEY = 'key1';
      delete process.env.API_KEY_ORG_ID;

      const signal = validSignal({ org_id: 'org_pilot1' });
      const response = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        headers: { 'x-api-key': 'key1' },
        payload: signal,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.org_id).toBe('org_pilot1');
      expect(body.status).toBe('accepted');
    });
  });

  describe('AUTH-003: Missing key rejected', () => {
    it('returns 401 api_key_required when x-api-key header is absent', async () => {
      process.env.API_KEY = 'key1';

      const response = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: validSignal(),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.code).toBe(ErrorCodes.API_KEY_REQUIRED);
      expect(body.message).toBeDefined();
    });
  });

  describe('AUTH-004: Invalid key rejected', () => {
    it('returns 401 api_key_invalid when x-api-key is wrong', async () => {
      process.env.API_KEY = 'key1';

      const response = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        headers: { 'x-api-key': 'wrong_value' },
        payload: validSignal(),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.code).toBe(ErrorCodes.API_KEY_INVALID);
    });
  });

  describe('AUTH-005: Auth disabled when API_KEY unset', () => {
    it('allows request without key when API_KEY is unset', async () => {
      delete process.env.API_KEY;
      delete process.env.API_KEY_ORG_ID;

      const signal = validSignal();
      const response = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });

      expect(response.statusCode).not.toBe(401);
      expect([200, 400]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        expect(response.json().status).toBe('accepted');
      }
    });
  });

  describe('AUTH-006: Exempt route /health', () => {
    it('returns 200 for GET /health without key when API_KEY is set', async () => {
      process.env.API_KEY = 'key1';

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    });
  });

  describe('AUTH-007: Exempt route /docs', () => {
    it('returns 200 or redirect for GET /docs without key when API_KEY is set', async () => {
      process.env.API_KEY = 'key1';

      const response = await app.inject({
        method: 'GET',
        url: '/docs',
      });

      expect([200, 302]).toContain(response.statusCode);
    });
  });
});
