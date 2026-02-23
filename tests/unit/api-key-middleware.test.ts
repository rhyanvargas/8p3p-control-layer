/**
 * Unit Tests for API Key Middleware
 * Tests validateKey, org override, and disabled behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { apiKeyPreHandler } from '../../src/auth/api-key-middleware.js';
import { ErrorCodes } from '../../src/shared/error-codes.js';

describe('API Key Middleware', () => {
  let app: FastifyInstance | undefined;
  const savedEnv: Record<string, string | undefined> = {};

  function saveEnv(): void {
    savedEnv.API_KEY = process.env.API_KEY;
    savedEnv.API_KEY_ORG_ID = process.env.API_KEY_ORG_ID;
  }

  function restoreEnv(): void {
    if (savedEnv.API_KEY !== undefined) process.env.API_KEY = savedEnv.API_KEY;
    else delete process.env.API_KEY;
    if (savedEnv.API_KEY_ORG_ID !== undefined) process.env.API_KEY_ORG_ID = savedEnv.API_KEY_ORG_ID;
    else delete process.env.API_KEY_ORG_ID;
  }

  beforeEach(saveEnv);
  afterEach(async () => {
    if (app) {
      await app.close();
    }
    restoreEnv();
  });

  async function createApp(): Promise<FastifyInstance> {
    const fastify = Fastify({ logger: false });
    fastify.register(
      async (v1) => {
        v1.addHook('preHandler', apiKeyPreHandler);
        v1.post('/signals', async (req, reply) => {
          const body = req.body as Record<string, unknown>;
          return reply.send({ org_id: body?.org_id ?? 'none' });
        });
        v1.get('/signals', async (req, reply) => {
          const query = req.query as Record<string, unknown>;
          return reply.send({ org_id: query?.org_id ?? 'none' });
        });
      },
      { prefix: '/v1' }
    );
    await fastify.ready();
    return fastify;
  }

  describe('Auth disabled (API_KEY unset)', () => {
    it('allows request without key when API_KEY is unset', async () => {
      delete process.env.API_KEY;
      delete process.env.API_KEY_ORG_ID;
      app = await createApp();

      const response = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: { org_id: 'org1' },
      });

      expect(response.statusCode).not.toBe(401);
      expect(response.json()).toEqual({ org_id: 'org1' });
    });
  });

  describe('Missing key', () => {
    it('returns 401 api_key_required when x-api-key header is absent', async () => {
      process.env.API_KEY = 'secret-key-123';
      app = await createApp();

      const response = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: { org_id: 'org1' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.code).toBe(ErrorCodes.API_KEY_REQUIRED);
      expect(body.message).toContain('x-api-key');
    });
  });

  describe('Invalid key', () => {
    it('returns 401 api_key_invalid when key does not match', async () => {
      process.env.API_KEY = 'secret-key-123';
      app = await createApp();

      const response = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        headers: { 'x-api-key': 'wrong-key' },
        payload: { org_id: 'org1' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.code).toBe(ErrorCodes.API_KEY_INVALID);
    });

    it('returns 401 when key length differs (constant-time safe)', async () => {
      process.env.API_KEY = 'abc';
      app = await createApp();

      const response = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        headers: { 'x-api-key': 'abcd' },
        payload: { org_id: 'org1' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe(ErrorCodes.API_KEY_INVALID);
    });
  });

  describe('Valid key', () => {
    it('allows request when key matches', async () => {
      process.env.API_KEY = 'secret-key-123';
      app = await createApp();

      const response = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        headers: { 'x-api-key': 'secret-key-123' },
        payload: { org_id: 'org1' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ org_id: 'org1' });
    });
  });

  describe('Org override', () => {
    it('overrides body org_id when API_KEY_ORG_ID is set', async () => {
      process.env.API_KEY = 'key1';
      process.env.API_KEY_ORG_ID = 'org_pilot1';
      app = await createApp();

      const response = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        headers: { 'x-api-key': 'key1' },
        payload: { org_id: 'org_other' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().org_id).toBe('org_pilot1');
    });

    it('overrides query org_id for GET when API_KEY_ORG_ID is set', async () => {
      process.env.API_KEY = 'key1';
      process.env.API_KEY_ORG_ID = 'org_pilot1';
      app = await createApp();

      const response = await app.inject({
        method: 'GET',
        url: '/v1/signals?org_id=org_other&learner_reference=l1&from_time=2026-01-01T00:00:00Z&to_time=2026-01-02T00:00:00Z',
        headers: { 'x-api-key': 'key1' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().org_id).toBe('org_pilot1');
    });

    it('does not override when API_KEY_ORG_ID is unset', async () => {
      process.env.API_KEY = 'key1';
      delete process.env.API_KEY_ORG_ID;
      app = await createApp();

      const response = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        headers: { 'x-api-key': 'key1' },
        payload: { org_id: 'org_pilot1' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().org_id).toBe('org_pilot1');
    });
  });
});
