/**
 * Contract Tests for Learner Trajectory API (TRAJ-001 through TRAJ-008)
 * Tests GET /v1/state/trajectory endpoint
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerStateRoutes } from '../../src/state/routes.js';
import {
  initStateStore,
  closeStateStore,
  clearStateStore,
  saveState,
} from '../../src/state/store.js';
import { ErrorCodes } from '../../src/shared/error-codes.js';
import { apiKeyPreHandler } from '../../src/auth/api-key-middleware.js';
import type { LearnerState } from '../../src/shared/types.js';
import { contractHttp } from '../helpers/contract-http.js';

function createState(overrides: Partial<LearnerState> = {}): LearnerState {
  return {
    org_id: 'springs',
    learner_reference: 'learner_001',
    state_id: 'springs:learner_001:v1',
    state_version: 1,
    updated_at: '2026-03-01T10:00:00Z',
    state: {},
    provenance: {
      last_signal_id: 'signal-001',
      last_signal_timestamp: '2026-03-01T09:55:00Z',
    },
    ...overrides,
  };
}

describe('Learner Trajectory API Contract Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    initStateStore(':memory:');

    app = Fastify({ logger: false });
    app.register(
      async (v1) => {
        registerStateRoutes(v1);
      },
      { prefix: '/v1' }
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeStateStore();
  });

  beforeEach(() => {
    clearStateStore();
  });

  // ---------------------------------------------------------------------------
  // TRAJ-001: Full trajectory with 3 versions; directions populated
  // ---------------------------------------------------------------------------
  describe('TRAJ-001: Full trajectory with directions populated', () => {
    it('should return 3 versions in ASC order with correct directions', async () => {
      saveState(createState({
        state_version: 1,
        state_id: 'springs:learner_001:v1',
        updated_at: '2026-03-01T10:00:00Z',
        state: { stabilityScore: 0.72 },
      }));
      saveState(createState({
        state_version: 2,
        state_id: 'springs:learner_001:v2',
        updated_at: '2026-03-02T10:00:00Z',
        state: { stabilityScore: 0.55, stabilityScore_direction: 'declining' },
      }));
      saveState(createState({
        state_version: 3,
        state_id: 'springs:learner_001:v3',
        updated_at: '2026-03-03T10:00:00Z',
        state: { stabilityScore: 0.28, stabilityScore_direction: 'declining' },
      }));

      const response = await contractHttp(app, {
        method: 'GET',
        url: '/v1/state/trajectory?org_id=springs&learner_reference=learner_001&fields=stabilityScore',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as Record<string, unknown>;
      const versions = body.versions as Array<{
        state_version: number;
        directions: Record<string, string | null>;
      }>;
      expect(versions).toHaveLength(3);
      expect(versions[0].state_version).toBe(1);
      expect(versions[1].state_version).toBe(2);
      expect(versions[2].state_version).toBe(3);
      expect(versions[1].directions.stabilityScore).toBe('declining');
      expect(versions[2].directions.stabilityScore).toBe('declining');
    });
  });

  // ---------------------------------------------------------------------------
  // TRAJ-002: Direction null for first version (no prior state)
  // ---------------------------------------------------------------------------
  describe('TRAJ-002: Direction null for first version', () => {
    it('should return null direction for v1 when no stabilityScore_direction exists', async () => {
      saveState(createState({
        state_version: 1,
        state_id: 'springs:learner_001:v1',
        updated_at: '2026-03-01T10:00:00Z',
        state: { stabilityScore: 0.72 },
      }));
      saveState(createState({
        state_version: 2,
        state_id: 'springs:learner_001:v2',
        updated_at: '2026-03-02T10:00:00Z',
        state: { stabilityScore: 0.55, stabilityScore_direction: 'declining' },
      }));

      const response = await contractHttp(app, {
        method: 'GET',
        url: '/v1/state/trajectory?org_id=springs&learner_reference=learner_001&fields=stabilityScore',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as Record<string, unknown>;
      const versions = body.versions as Array<{
        state_version: number;
        directions: Record<string, string | null>;
      }>;
      expect(versions[0].directions.stabilityScore).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // TRAJ-003: Version range filter from_version=2&to_version=3
  // ---------------------------------------------------------------------------
  describe('TRAJ-003: Version range filter', () => {
    it('should return only versions 2 and 3 when from_version=2&to_version=3', async () => {
      for (let v = 1; v <= 5; v++) {
        saveState(createState({
          state_version: v,
          state_id: `springs:learner_001:v${v}`,
          updated_at: `2026-03-0${v}T10:00:00Z`,
          state: { stabilityScore: 0.5 + v * 0.05 },
        }));
      }

      const response = await contractHttp(app, {
        method: 'GET',
        url: '/v1/state/trajectory?org_id=springs&learner_reference=learner_001&fields=stabilityScore&from_version=2&to_version=3',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as Record<string, unknown>;
      const versions = body.versions as Array<{ state_version: number }>;
      expect(versions).toHaveLength(2);
      expect(versions[0].state_version).toBe(2);
      expect(versions[1].state_version).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // TRAJ-004: Learner not found → 404 state_not_found
  // ---------------------------------------------------------------------------
  describe('TRAJ-004: Learner not found', () => {
    it('should return 404 with state_not_found for non-existent learner', async () => {
      const response = await contractHttp(app, {
        method: 'GET',
        url: '/v1/state/trajectory?org_id=springs&learner_reference=nonexistent&fields=stabilityScore',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json() as { code: string };
      expect(body.code).toBe(ErrorCodes.STATE_NOT_FOUND);
    });
  });

  // ---------------------------------------------------------------------------
  // TRAJ-005: 11 fields → 400 invalid_format
  // ---------------------------------------------------------------------------
  describe('TRAJ-005: Too many fields', () => {
    it('should return 400 invalid_format when fields exceed 10', async () => {
      const fields = 'a,b,c,d,e,f,g,h,i,j,k';
      const response = await contractHttp(app, {
        method: 'GET',
        url: `/v1/state/trajectory?org_id=springs&learner_reference=learner_001&fields=${fields}`,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json() as { code: string; message: string };
      expect(body.code).toBe(ErrorCodes.INVALID_FORMAT);
      expect(body.message).toContain('Maximum 10 fields per trajectory request. Got 11.');
    });
  });

  // ---------------------------------------------------------------------------
  // TRAJ-006: Dot-path field → 400 invalid_format
  // ---------------------------------------------------------------------------
  describe('TRAJ-006: Dot-path field rejected', () => {
    it('should return 400 invalid_format with v1.1 message for dot-path field', async () => {
      const response = await contractHttp(app, {
        method: 'GET',
        url: '/v1/state/trajectory?org_id=springs&learner_reference=learner_001&fields=skills.fractions.stabilityScore',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json() as { code: string; message: string };
      expect(body.code).toBe(ErrorCodes.INVALID_FORMAT);
      expect(body.message).toBe('Dot-path fields are not supported in v1.1. Use top-level canonical field names.');
    });
  });

  // ---------------------------------------------------------------------------
  // TRAJ-007: Summary accuracy (first/latest/overall_direction)
  // ---------------------------------------------------------------------------
  describe('TRAJ-007: Summary accuracy', () => {
    it('should compute correct summary with declining direction', async () => {
      saveState(createState({
        state_version: 1,
        state_id: 'springs:learner_001:v1',
        updated_at: '2026-03-01T10:00:00Z',
        state: { stabilityScore: 0.72 },
      }));
      saveState(createState({
        state_version: 2,
        state_id: 'springs:learner_001:v2',
        updated_at: '2026-03-02T10:00:00Z',
        state: { stabilityScore: 0.55, stabilityScore_direction: 'declining' },
      }));
      saveState(createState({
        state_version: 3,
        state_id: 'springs:learner_001:v3',
        updated_at: '2026-03-03T10:00:00Z',
        state: { stabilityScore: 0.28, stabilityScore_direction: 'declining' },
      }));

      const response = await contractHttp(app, {
        method: 'GET',
        url: '/v1/state/trajectory?org_id=springs&learner_reference=learner_001&fields=stabilityScore',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        summary: Record<string, {
          first_value: number;
          latest_value: number;
          overall_direction: string | null;
          version_count: number;
        }>;
      };
      expect(body.summary.stabilityScore.first_value).toBe(0.72);
      expect(body.summary.stabilityScore.latest_value).toBe(0.28);
      expect(body.summary.stabilityScore.overall_direction).toBe('declining');
      expect(body.summary.stabilityScore.version_count).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // TRAJ-008: Auth required — no x-api-key → 401
  // ---------------------------------------------------------------------------
  describe('TRAJ-008: Auth required', () => {
    let authApp: FastifyInstance;
    const testApiKey = 'test-secret-key-traj008';

    beforeAll(async () => {
      process.env.API_KEY = testApiKey;

      authApp = Fastify({ logger: false });
      authApp.register(
        async (v1) => {
          v1.addHook('preHandler', apiKeyPreHandler);
          registerStateRoutes(v1);
        },
        { prefix: '/v1' }
      );
      await authApp.ready();
    });

    afterAll(async () => {
      delete process.env.API_KEY;
      await authApp.close();
    });

    it('should return 401 when x-api-key is missing', async () => {
      saveState(createState({
        state_version: 1,
        state_id: 'springs:learner_001:v1',
        state: { stabilityScore: 0.72 },
      }));

      const response = await contractHttp(authApp, {
        method: 'GET',
        url: '/v1/state/trajectory?org_id=springs&learner_reference=learner_001&fields=stabilityScore',
        auth: false,
      });

      expect(response.statusCode).toBe(401);
      const body = response.json() as { code: string };
      expect(body.code).toBe(ErrorCodes.API_KEY_REQUIRED);
    });
  });
});
