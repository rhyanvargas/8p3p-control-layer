/**
 * Contract Tests for Inspection API (INSP-001 through INSP-017)
 * Tests ingestion log, state query, and decision trace endpoints
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as path from 'path';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerIngestionRoutes } from '../../src/ingestion/routes.js';
import { registerStateRoutes } from '../../src/state/routes.js';
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
  saveState,
} from '../../src/state/store.js';
import {
  initIngestionLogStore,
  closeIngestionLogStore,
  clearIngestionLogStore,
} from '../../src/ingestion/ingestion-log-store.js';
import {
  initDecisionStore,
  closeDecisionStore,
  clearDecisionStore,
  saveDecision,
} from '../../src/decision/store.js';
import { loadPolicy } from '../../src/decision/policy-loader.js';
import { ErrorCodes } from '../../src/shared/error-codes.js';
import type { LearnerState, Decision } from '../../src/shared/types.js';
import { contractHttp } from '../helpers/contract-http.js';

describe('Inspection API Contract Tests', () => {
  let app: FastifyInstance;

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
    initDecisionStore(':memory:');
    loadPolicy(path.join(process.cwd(), 'src/decision/policies/default.json'));

    app = Fastify({ logger: false });
    app.register(
      async (v1) => {
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
    closeIdempotencyStore();
    closeSignalLogStore();
    closeStateStore();
    closeIngestionLogStore();
    closeDecisionStore();
  });

  beforeEach(() => {
    clearIdempotencyStore();
    clearSignalLogStore();
    clearStateStore();
    clearIngestionLogStore();
    clearDecisionStore();
  });

  // ---------------------------------------------------------------------------
  // INSP-001: Ingestion log captures accepted signal
  // ---------------------------------------------------------------------------
  describe('INSP-001: Ingestion log captures accepted signal', () => {
    it('should show outcome accepted in GET /v1/ingestion after POST valid signal', async () => {
      const signal = validSignal();
      await contractHttp(app,{ method: 'POST', url: '/v1/signals', payload: signal });

      const response = await contractHttp(app,{
        method: 'GET',
        url: '/v1/ingestion?org_id=test-org',
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0].outcome).toBe('accepted');
      expect(body.entries[0].signal_id).toBe(signal.signal_id);
    });
  });

  // ---------------------------------------------------------------------------
  // INSP-002: Ingestion log captures rejected signal
  // ---------------------------------------------------------------------------
  describe('INSP-002: Ingestion log captures rejected signal', () => {
    it('should show outcome rejected with rejection_reason.code in GET /v1/ingestion', async () => {
      await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: { org_id: 'test-org', signal_id: 's1', learner_reference: '' }, // missing required
      });

      const response = await contractHttp(app,{
        method: 'GET',
        url: '/v1/ingestion?org_id=test-org',
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0].outcome).toBe('rejected');
      expect(body.entries[0].rejection_reason).toBeDefined();
      expect(body.entries[0].rejection_reason.code).toBe(ErrorCodes.MISSING_REQUIRED_FIELD);
    });
  });

  // ---------------------------------------------------------------------------
  // INSP-003: Ingestion log captures duplicate signal
  // ---------------------------------------------------------------------------
  describe('INSP-003: Ingestion log captures duplicate signal', () => {
    it('should show outcome duplicate in GET /v1/ingestion after duplicate POST', async () => {
      const signal = validSignal();
      await contractHttp(app,{ method: 'POST', url: '/v1/signals', payload: signal });
      await contractHttp(app,{ method: 'POST', url: '/v1/signals', payload: signal });

      const response = await contractHttp(app,{
        method: 'GET',
        url: '/v1/ingestion?org_id=test-org',
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.entries.length).toBeGreaterThanOrEqual(1);
      const dupEntry = body.entries.find((e: { outcome: string }) => e.outcome === 'duplicate');
      expect(dupEntry).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // INSP-004: GET /v1/ingestion returns entries received_at DESC
  // ---------------------------------------------------------------------------
  describe('INSP-004: GET /v1/ingestion returns entries received_at DESC', () => {
    it('should return entries most recent first', async () => {
      await contractHttp(app,{ method: 'POST', url: '/v1/signals', payload: validSignal() });
      await contractHttp(app,{ method: 'POST', url: '/v1/signals', payload: validSignal() });

      const response = await contractHttp(app,{
        method: 'GET',
        url: '/v1/ingestion?org_id=test-org',
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.entries.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < body.entries.length; i++) {
        expect(new Date(body.entries[i].received_at).getTime()).toBeLessThanOrEqual(
          new Date(body.entries[i - 1].received_at).getTime()
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // INSP-005: GET /v1/ingestion?outcome=rejected filters correctly
  // ---------------------------------------------------------------------------
  describe('INSP-005: GET /v1/ingestion?outcome=rejected filters correctly', () => {
    it('should return only rejected entries when outcome=rejected', async () => {
      await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: { org_id: 'test-org', signal_id: 's1' }, // invalid
      });
      await contractHttp(app,{ method: 'POST', url: '/v1/signals', payload: validSignal() });

      const response = await contractHttp(app,{
        method: 'GET',
        url: '/v1/ingestion?org_id=test-org&outcome=rejected',
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.entries.every((e: { outcome: string }) => e.outcome === 'rejected')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // INSP-006: GET /v1/state returns current learner state
  // ---------------------------------------------------------------------------
  describe('INSP-006: GET /v1/state returns current learner state', () => {
    it('should return full LearnerState for learner with state', async () => {
      const state = createState();
      saveState(state);

      const response = await contractHttp(app,{
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

      const response = await contractHttp(app,{
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
      const response = await contractHttp(app,{
        method: 'GET',
        url: '/v1/state?org_id=test-org&learner_reference=unknown-learner',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.code).toBe(ErrorCodes.STATE_NOT_FOUND);
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

      const response = await contractHttp(app,{
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

  // ---------------------------------------------------------------------------
  // INSP-010..INSP-013: New decision includes enriched trace and output_metadata
  // ---------------------------------------------------------------------------
  describe('INSP-010..013: New decision includes enriched trace and output_metadata', () => {
    async function createDecisionViaSignal(payload: Record<string, unknown>) {
      const state = createState({ state: payload });
      saveState(state);
      const signal = validSignal({ payload });
      await contractHttp(app,{ method: 'POST', url: '/v1/signals', payload: signal });

      const decisionsRes = await contractHttp(app,{
        method: 'GET',
        url: `/v1/decisions?org_id=test-org&learner_reference=learner-123&from_time=2026-01-01T00:00:00Z&to_time=2026-12-31T23:59:59Z`,
      });
      expect(decisionsRes.statusCode).toBe(200);
      const decisions = decisionsRes.json().decisions;
      expect(decisions.length).toBeGreaterThanOrEqual(1);
      return decisions[decisions.length - 1];
    }

    it('INSP-010: includes trace.state_snapshot matching evaluated state', async () => {
      const d = await createDecisionViaSignal({
        stabilityScore: 0.5,
        timeSinceReinforcement: 100000,
      });
      expect(d.trace.state_snapshot).toMatchObject({
        stabilityScore: 0.5,
        timeSinceReinforcement: 100000,
      });
    });

    it('INSP-011: includes trace.matched_rule with evaluated_fields matching state', async () => {
      const d = await createDecisionViaSignal({
        stabilityScore: 0.5,
        timeSinceReinforcement: 100000,
      });
      expect(d.trace.matched_rule).toBeDefined();
      expect(d.trace.matched_rule.rule_id).toBe('rule-reinforce');
      expect(Array.isArray(d.trace.matched_rule.evaluated_fields)).toBe(true);
      expect(
        d.trace.matched_rule.evaluated_fields.some(
          (ef: { field: string; operator: string; threshold: unknown; actual_value: unknown }) =>
            ef.field === 'stabilityScore' &&
            ef.operator === 'lt' &&
            ef.threshold === 0.7 &&
            ef.actual_value === 0.5
        )
      ).toBe(true);
    });

    it('INSP-012: includes non-empty trace.rationale', async () => {
      const d = await createDecisionViaSignal({
        stabilityScore: 0.5,
        timeSinceReinforcement: 100000,
      });
      expect(typeof d.trace.rationale).toBe('string');
      expect(d.trace.rationale.length).toBeGreaterThan(0);
    });

    it('INSP-013: includes output_metadata.priority matching rule position', async () => {
      const d = await createDecisionViaSignal({
        stabilityScore: 0.5,
        timeSinceReinforcement: 100000,
      });
      expect(d.output_metadata).toBeDefined();
      expect(d.output_metadata.priority).toBe(4); // rule-reinforce is 4th in default policy
    });
  });

  // ---------------------------------------------------------------------------
  // INSP-014: Historical decision without enriched trace returns cleanly
  // ---------------------------------------------------------------------------
  describe('INSP-014: Historical decision without enriched trace returns cleanly', () => {
    it('should return decision without error when trace lacks enriched fields', async () => {
      const historicalDecision: Decision = {
        org_id: 'test-org',
        decision_id: `dec-hist-${Date.now()}`,
        learner_reference: 'learner-123',
        decision_type: 'reinforce',
        decided_at: '2026-01-15T10:00:00Z',
        decision_context: {},
        trace: {
          state_id: 'test-org:learner-123:v1',
          state_version: 1,
          policy_version: '1.0.0',
          matched_rule_id: 'rule-reinforce',
          state_snapshot: {},
          matched_rule: null,
          rationale: 'legacy decision: rationale unavailable',
        },
      };
      saveDecision(historicalDecision);

      const response = await contractHttp(app,{
        method: 'GET',
        url: `/v1/decisions?org_id=test-org&learner_reference=learner-123&from_time=2026-01-01T00:00:00Z&to_time=2026-12-31T23:59:59Z`,
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.decisions.length).toBeGreaterThanOrEqual(1);
      const d = body.decisions.find((x: { decision_id: string }) => x.decision_id === historicalDecision.decision_id);
      expect(d).toBeDefined();
      expect(d.trace.state_id).toBe(historicalDecision.trace.state_id);
      // Enriched fields are always present (legacy decisions get safe defaults)
      expect(typeof d.trace.state_snapshot).toBe('object');
      expect(d.trace).toHaveProperty('matched_rule');
      expect(typeof d.trace.rationale).toBe('string');
    });
  });

  // ---------------------------------------------------------------------------
  // INSP-015: Org isolation on GET /v1/ingestion
  // ---------------------------------------------------------------------------
  describe('INSP-015: Org isolation on GET /v1/ingestion', () => {
    it('should not return org B entries when querying org A', async () => {
      await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: validSignal({ org_id: 'org-B', signal_id: 'sig-org-b' }),
      });

      const response = await contractHttp(app,{
        method: 'GET',
        url: '/v1/ingestion?org_id=org-A',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().entries).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // INSP-016: Org isolation on GET /v1/state
  // ---------------------------------------------------------------------------
  describe('INSP-016: Org isolation on GET /v1/state', () => {
    it('should not return org B state when querying org A', async () => {
      saveState(
        createState({
          org_id: 'org-B',
          learner_reference: 'L1',
          state_id: 'org-B:L1:v1',
        })
      );

      const response = await contractHttp(app,{
        method: 'GET',
        url: '/v1/state?org_id=org-A&learner_reference=L1',
      });
      expect(response.statusCode).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // INSP-017: Default-path decision has rationale "No rules matched"
  // ---------------------------------------------------------------------------
  describe('INSP-017: Default-path decision has rationale "No rules matched"', () => {
    it('should include "No rules matched" in rationale when default decision', async () => {
      // State that matches default path: high stability, recently reinforced
      const state = createState({
        state: { stabilityScore: 0.9, timeSinceReinforcement: 3600 },
      });
      saveState(state);

      const signal = validSignal({
        payload: { stabilityScore: 0.9, timeSinceReinforcement: 3600 },
      });
      await contractHttp(app,{ method: 'POST', url: '/v1/signals', payload: signal });

      const decisionsRes = await contractHttp(app,{
        method: 'GET',
        url: `/v1/decisions?org_id=test-org&learner_reference=learner-123&from_time=2026-01-01T00:00:00Z&to_time=2026-12-31T23:59:59Z`,
      });
      expect(decisionsRes.statusCode).toBe(200);
      const decisions = decisionsRes.json().decisions;
      expect(decisions.length).toBeGreaterThanOrEqual(1);
      const defaultDec = decisions.find((d: { trace: { matched_rule_id: string | null } }) => d.trace.matched_rule_id === null);
      expect(defaultDec).toBeDefined();
      expect(defaultDec.trace.rationale).toContain('No rules matched');
    });
  });
});
