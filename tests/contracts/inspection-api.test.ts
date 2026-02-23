/**
 * Contract Tests for Inspection API (INSP-001 through INSP-017)
 * Tests ingestion log, state query, and decision trace endpoints
 *
 * Implemented incrementally as tasks complete:
 * - INSP-001..INSP-005: Ingestion log (TASK-002, TASK-003, TASK-004)
 * - INSP-006..INSP-009: State query (TASK-005, TASK-006)
 * - INSP-010..INSP-017: Enriched trace, output_metadata (TASK-007..TASK-011)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerIngestionRoutes } from '../../src/ingestion/routes.js';
import { registerStateRoutes } from '../../src/state/routes.js';
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
  saveState,
} from '../../src/state/store.js';
import {
  initIngestionLogStore,
  closeIngestionLogStore,
  clearIngestionLogStore,
} from '../../src/ingestion/ingestion-log-store.js';
import type { LearnerState } from '../../src/shared/types.js';

describe('Inspection API Contract Tests', () => {
  let app: FastifyInstance;

  function createState(overrides: Partial<LearnerState> = {}): LearnerState {
    return {
      org_id: 'test-org',
      learner_reference: 'learner-123',
      state_id: 'test-org:learner-123:v1',
      state_version: 1,
      updated_at: '2026-02-07T10:00:00Z',
      state: { skill: 'math', level: 5 },
      provenance: {
        last_signal_id: 'signal-001',
        last_signal_timestamp: '2026-02-07T09:55:00Z',
      },
      ...overrides,
    };
  }

  beforeAll(async () => {
    initIdempotencyStore(':memory:');
    initSignalLogStore(':memory:');
    initStateStore(':memory:');
    initIngestionLogStore(':memory:');

    app = Fastify({ logger: false });
    app.register(
      async (v1) => {
        registerIngestionRoutes(v1);
        registerStateRoutes(v1);
      },
      { prefix: '/v1' }
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeIdempotencyStore();
    closeSignalLogStore();
    closeStateStore();
    closeIngestionLogStore();
  });

  beforeEach(() => {
    clearIdempotencyStore();
    clearSignalLogStore();
    clearStateStore();
    clearIngestionLogStore();
  });

  // ---------------------------------------------------------------------------
  // INSP-006: GET /v1/state returns current learner state
  // ---------------------------------------------------------------------------
  describe('INSP-006: GET /v1/state returns current learner state', () => {
    it('should return full LearnerState for learner with state', async () => {
      const state = createState();
      saveState(state);

      const response = await app.inject({
        method: 'GET',
        url: '/v1/state?org_id=test-org&learner_reference=learner-123',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.org_id).toBe('test-org');
      expect(body.learner_reference).toBe('learner-123');
      expect(body.state_id).toBe(state.state_id);
      expect(body.state_version).toBe(1);
      expect(body.updated_at).toBe(state.updated_at);
      expect(body.state).toEqual({ skill: 'math', level: 5 });
      expect(body.provenance).toEqual({
        last_signal_id: 'signal-001',
        last_signal_timestamp: '2026-02-07T09:55:00Z',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // INSP-007: GET /v1/state?version=N returns specific version
  // ---------------------------------------------------------------------------
  describe('INSP-007: GET /v1/state?version=N returns specific version', () => {
    it('should return correct state_version when version param provided', async () => {
      saveState(
        createState({
          state_id: 'test-org:learner-123:v1',
          state_version: 1,
          updated_at: '2026-02-07T10:00:00Z',
          state: { v: 1 },
        })
      );
      saveState(
        createState({
          state_id: 'test-org:learner-123:v2',
          state_version: 2,
          updated_at: '2026-02-07T11:00:00Z',
          state: { v: 2 },
        })
      );

      const response = await app.inject({
        method: 'GET',
        url: '/v1/state?org_id=test-org&learner_reference=learner-123&version=2',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.state_version).toBe(2);
      expect(body.state).toEqual({ v: 2 });
    });
  });

  // ---------------------------------------------------------------------------
  // INSP-008: GET /v1/state for unknown learner returns 404
  // ---------------------------------------------------------------------------
  describe('INSP-008: GET /v1/state for unknown learner returns 404', () => {
    it('should return 404 with state_not_found for unknown learner', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/state?org_id=test-org&learner_reference=unknown-learner',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.code).toBe('state_not_found');
    });
  });

  // ---------------------------------------------------------------------------
  // INSP-009: GET /v1/state/list returns learner index
  // ---------------------------------------------------------------------------
  describe('INSP-009: GET /v1/state/list returns learner index', () => {
    it('should return array of learner summaries', async () => {
      saveState(
        createState({
          learner_reference: 'L1',
          state_id: 'test-org:L1:v1',
          state_version: 1,
          updated_at: '2026-02-07T10:00:00Z',
        })
      );
      saveState(
        createState({
          learner_reference: 'L2',
          state_id: 'test-org:L2:v1',
          state_version: 1,
          updated_at: '2026-02-07T09:00:00Z',
        })
      );

      const response = await app.inject({
        method: 'GET',
        url: '/v1/state/list?org_id=test-org',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.org_id).toBe('test-org');
      expect(body.learners).toBeInstanceOf(Array);
      expect(body.learners.length).toBe(2);
      expect(body.learners).toContainEqual(
        expect.objectContaining({
          learner_reference: 'L1',
          state_version: 1,
          updated_at: '2026-02-07T10:00:00Z',
        })
      );
      expect(body.learners).toContainEqual(
        expect.objectContaining({
          learner_reference: 'L2',
          state_version: 1,
          updated_at: '2026-02-07T09:00:00Z',
        })
      );
      expect(body).toHaveProperty('next_cursor');
    });
  });
});
