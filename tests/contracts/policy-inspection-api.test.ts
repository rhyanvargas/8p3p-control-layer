/**
 * Contract Tests: Policy Inspection API (POL-API-001 through POL-API-005)
 * Covers GET /v1/policies and GET /v1/policies/:policy_key
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as path from 'path';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadPolicy } from '../../src/decision/policy-loader.js';
import {
  clearRoutingConfigCache,
  clearDynamoContextCache,
} from '../../src/decision/policy-loader.js';
import { registerPolicyInspectionRoutes } from '../../src/policies/routes.js';
import { contractHttp } from '../helpers/contract-http.js';

const TEST_API_KEY = 'test-key-pol-api';

describe('Policy Inspection API Contract Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    loadPolicy(path.join(process.cwd(), 'src/decision/policies/default.json'));

    app = Fastify({ logger: false });
    app.register(
      async (v1) => {
        registerPolicyInspectionRoutes(v1);
      },
      { prefix: '/v1' }
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    clearRoutingConfigCache();
    clearDynamoContextCache();
    delete process.env.API_KEY;
    delete process.env.POLICIES_TABLE;
  });

  // ---------------------------------------------------------------------------
  // POL-API-001: List policies for org with routing
  // ---------------------------------------------------------------------------
  describe('POL-API-001: List policies for org with routing', () => {
    it('GET /v1/policies?org_id=springs → 200 with learner + staff policies and routing config', async () => {
      const response = await contractHttp(app, {
        method: 'GET',
        url: '/v1/policies?org_id=springs',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        org_id: string;
        policies: Array<{
          policy_key: string;
          policy_id: string;
          policy_version: string;
          description: string;
          rule_count: number;
          default_decision_type: string;
        }>;
        routing: {
          source_system_map: Record<string, string>;
          default_policy_key: string;
        } | null;
      };

      expect(body.org_id).toBe('springs');
      expect(Array.isArray(body.policies)).toBe(true);

      const keys = body.policies.map((p) => p.policy_key).sort();
      expect(keys).toContain('learner');
      expect(keys).toContain('staff');

      const learner = body.policies.find((p) => p.policy_key === 'learner')!;
      expect(learner.policy_id).toBe('springs:learner');
      expect(learner.policy_version).toBe('1.0.0');
      expect(typeof learner.description).toBe('string');
      expect(learner.rule_count).toBeGreaterThan(0);
      expect(typeof learner.default_decision_type).toBe('string');

      const staff = body.policies.find((p) => p.policy_key === 'staff')!;
      expect(staff.policy_id).toBe('springs:staff');

      expect(body.routing).not.toBeNull();
      expect(typeof body.routing!.source_system_map).toBe('object');
      expect(typeof body.routing!.default_policy_key).toBe('string');
      expect(body.routing!.default_policy_key).toBe('learner');
    });
  });

  // ---------------------------------------------------------------------------
  // POL-API-002: List policies for org without routing (default only)
  // ---------------------------------------------------------------------------
  describe('POL-API-002: List policies for org without routing (default only)', () => {
    it('GET /v1/policies?org_id=unknown-org → 200 with default policy, routing null', async () => {
      const response = await contractHttp(app, {
        method: 'GET',
        url: '/v1/policies?org_id=unknown-org',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        org_id: string;
        policies: Array<{ policy_key: string }>;
        routing: null | object;
      };

      expect(body.org_id).toBe('unknown-org');
      expect(Array.isArray(body.policies)).toBe(true);
      expect(body.policies.length).toBeGreaterThanOrEqual(1);

      const keys = body.policies.map((p) => p.policy_key);
      expect(keys).toContain('default');

      expect(body.routing).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // POL-API-003: Get full policy by key
  // ---------------------------------------------------------------------------
  describe('POL-API-003: Get full policy by key', () => {
    it('GET /v1/policies/learner?org_id=springs → 200 with full rules and conditions', async () => {
      const response = await contractHttp(app, {
        method: 'GET',
        url: '/v1/policies/learner?org_id=springs',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        org_id: string;
        policy_key: string;
        policy: {
          policy_id: string;
          policy_version: string;
          description: string;
          rules: Array<{
            rule_id: string;
            decision_type: string;
            condition: unknown;
          }>;
          default_decision_type: string;
        };
      };

      expect(body.org_id).toBe('springs');
      expect(body.policy_key).toBe('learner');
      expect(body.policy.policy_id).toBe('springs:learner');
      expect(body.policy.policy_version).toBe('1.0.0');
      expect(typeof body.policy.description).toBe('string');
      expect(Array.isArray(body.policy.rules)).toBe(true);
      expect(body.policy.rules.length).toBeGreaterThan(0);

      const rule = body.policy.rules[0]!;
      expect(typeof rule.rule_id).toBe('string');
      expect(typeof rule.decision_type).toBe('string');
      expect(rule.condition).toBeDefined();

      expect(typeof body.policy.default_decision_type).toBe('string');
    });
  });

  // ---------------------------------------------------------------------------
  // POL-API-004: Get policy — not found
  // ---------------------------------------------------------------------------
  describe('POL-API-004: Get policy — not found', () => {
    it('GET /v1/policies/admin?org_id=springs → 404 with policy_not_found', async () => {
      const response = await contractHttp(app, {
        method: 'GET',
        url: '/v1/policies/admin?org_id=springs',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json() as {
        error: { code: string; message: string };
      };

      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('policy_not_found');
      expect(typeof body.error.message).toBe('string');
      expect(body.error.message).toContain('admin');
    });
  });

  // ---------------------------------------------------------------------------
  // POL-API-005: Auth required
  // ---------------------------------------------------------------------------
  describe('POL-API-005: Auth required', () => {
    it('GET /v1/policies without x-api-key when API_KEY is set → 401', async () => {
      process.env.API_KEY = TEST_API_KEY;

      // Re-register app with auth preHandler enabled
      const authApp = Fastify({ logger: false });
      const { apiKeyPreHandler } = await import('../../src/auth/api-key-middleware.js');
      authApp.register(
        async (v1) => {
          v1.addHook('preHandler', apiKeyPreHandler);
          registerPolicyInspectionRoutes(v1);
        },
        { prefix: '/v1' }
      );
      await authApp.ready();

      try {
        const response = await contractHttp(authApp, {
          method: 'GET',
          url: '/v1/policies?org_id=springs',
          // No x-api-key header
        });

        expect(response.statusCode).toBe(401);
        const body = response.json() as { code: string };
        expect(['api_key_required', 'api_key_invalid']).toContain(body.code);
      } finally {
        await authApp.close();
        delete process.env.API_KEY;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Validation: missing org_id
  // ---------------------------------------------------------------------------
  describe('Validation: missing org_id on list', () => {
    it('GET /v1/policies without org_id → 400 with missing_required_field', async () => {
      const response = await contractHttp(app, {
        method: 'GET',
        url: '/v1/policies',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json() as { code: string; field_path: string };
      expect(body.code).toBe('missing_required_field');
      expect(body.field_path).toBe('org_id');
    });
  });

  describe('Validation: missing org_id on detail', () => {
    it('GET /v1/policies/learner without org_id → 400 with missing_required_field', async () => {
      const response = await contractHttp(app, {
        method: 'GET',
        url: '/v1/policies/learner',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json() as { code: string; field_path: string };
      expect(body.code).toBe('missing_required_field');
      expect(body.field_path).toBe('org_id');
    });
  });
});
