/**
 * Contract Tests for Output API (OUT-API-001 through OUT-API-003)
 * HTTP-level tests for GET /decisions endpoint using Fastify app.inject().
 * Follows tests/contracts/signal-ingestion.test.ts pattern.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerDecisionRoutes } from '../../src/decision/routes.js';
import {
  initDecisionStore,
  closeDecisionStore,
  clearDecisionStore,
  saveDecision,
} from '../../src/decision/store.js';
import type { Decision } from '../../src/shared/types.js';

describe('Output API Contract Tests', () => {
  let app: FastifyInstance;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  let decisionCounter = 0;

  /**
   * Create and persist a test Decision with configurable overrides.
   */
  function createDecision(overrides: Partial<Decision> = {}): Decision {
    decisionCounter += 1;
    const decision: Decision = {
      org_id: 'test-org',
      decision_id: `dec-${Date.now()}-${decisionCounter}-${Math.random().toString(36).slice(2, 9)}`,
      learner_reference: 'learner-123',
      decision_type: 'reinforce',
      decided_at: '2026-01-30T10:00:00Z',
      decision_context: {},
      trace: {
        state_id: 'test-org:learner-123:v1',
        state_version: 1,
        policy_version: '1.0.0',
        matched_rule_id: 'rule-reinforce',
      },
      ...overrides,
    };
    saveDecision(decision);
    return decision;
  }

  /**
   * Query decisions (helper).
   */
  async function queryDecisions(params: Record<string, string | number | undefined>) {
    const queryString = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');

    return app.inject({
      method: 'GET',
      url: `/decisions?${queryString}`,
    });
  }

  // ---------------------------------------------------------------------------
  // Setup / Teardown
  // ---------------------------------------------------------------------------

  beforeAll(async () => {
    initDecisionStore(':memory:');

    app = Fastify({ logger: false });
    registerDecisionRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDecisionStore();
  });

  beforeEach(() => {
    clearDecisionStore();
    decisionCounter = 0;
  });

  // ---------------------------------------------------------------------------
  // OUT-API-001: GetDecisions Happy Path
  // ---------------------------------------------------------------------------

  describe('OUT-API-001: GetDecisions Happy Path', () => {
    it('should return 200 with decisions array for valid query', async () => {
      const d1 = createDecision({ decided_at: '2026-01-30T10:00:00Z' });
      const d2 = createDecision({ decided_at: '2026-01-30T11:00:00Z' });

      const response = await queryDecisions({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.org_id).toBe('test-org');
      expect(body.learner_reference).toBe('learner-123');
      expect(body.decisions).toBeInstanceOf(Array);
      expect(body.decisions.length).toBe(2);

      // Decisions ordered by decided_at ASC
      expect(body.decisions[0].decision_id).toBe(d1.decision_id);
      expect(body.decisions[1].decision_id).toBe(d2.decision_id);

      // Each decision has the full shape
      for (const dec of body.decisions) {
        expect(dec.org_id).toBe('test-org');
        expect(dec.learner_reference).toBe('learner-123');
        expect(dec.decision_type).toBeDefined();
        expect(dec.decided_at).toBeDefined();
        expect(dec.decision_context).toBeDefined();
        expect(dec.trace).toBeDefined();
        expect(dec.trace.state_id).toBeDefined();
        expect(dec.trace.state_version).toBeDefined();
        expect(dec.trace.policy_version).toBeDefined();
        expect(dec.trace).toHaveProperty('matched_rule_id');
      }

      // No more pages
      expect(body.next_page_token).toBe(null);
    });

    it('should return empty decisions array when no matches', async () => {
      const response = await queryDecisions({
        org_id: 'test-org',
        learner_reference: 'nonexistent-learner',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.decisions).toEqual([]);
      expect(body.next_page_token).toBe(null);
    });

    it('should isolate decisions by org_id', async () => {
      createDecision({ org_id: 'org-A', learner_reference: 'learner-shared' });
      createDecision({ org_id: 'org-B', learner_reference: 'learner-shared' });

      const response = await queryDecisions({
        org_id: 'org-A',
        learner_reference: 'learner-shared',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.decisions.length).toBe(1);
      expect(body.decisions[0].org_id).toBe('org-A');
    });

    it('should filter by time range', async () => {
      createDecision({ decided_at: '2026-01-15T10:00:00Z' });
      createDecision({ decided_at: '2026-03-15T10:00:00Z' }); // outside range
      createDecision({ decided_at: '2026-01-20T10:00:00Z' });

      const response = await queryDecisions({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-01-31T23:59:59Z',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.decisions.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // OUT-API-002: Invalid Time Range
  // ---------------------------------------------------------------------------

  describe('OUT-API-002: Invalid Time Range', () => {
    it('should reject with 400 and invalid_time_range when from_time > to_time', async () => {
      const response = await queryDecisions({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-06-01T00:00:00Z',
        to_time: '2026-01-01T00:00:00Z',
      });

      expect(response.statusCode).toBe(400);

      const body = response.json();
      expect(body.code).toBe('invalid_time_range');
    });
  });

  // ---------------------------------------------------------------------------
  // OUT-API-003: Paging Determinism
  // ---------------------------------------------------------------------------

  describe('OUT-API-003: Paging Determinism', () => {
    it('should paginate with page_size=1 and verify deterministic ordering', async () => {
      // Create 3 decisions with distinct decided_at values for deterministic ordering
      const d1 = createDecision({ decided_at: '2026-01-30T10:00:00Z' });
      const d2 = createDecision({ decided_at: '2026-01-30T11:00:00Z' });
      const d3 = createDecision({ decided_at: '2026-01-30T12:00:00Z' });

      const baseParams = {
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      };

      // --- First run ---
      // Page 1
      const page1 = await queryDecisions({ ...baseParams, page_size: 1 });
      expect(page1.statusCode).toBe(200);
      const page1Body = page1.json();
      expect(page1Body.decisions.length).toBe(1);
      expect(page1Body.decisions[0].decision_id).toBe(d1.decision_id);
      expect(page1Body.next_page_token).not.toBeNull();

      // Page 2 using token from page 1
      const page2 = await queryDecisions({
        ...baseParams,
        page_size: 1,
        page_token: page1Body.next_page_token,
      });
      expect(page2.statusCode).toBe(200);
      const page2Body = page2.json();
      expect(page2Body.decisions.length).toBe(1);
      expect(page2Body.decisions[0].decision_id).toBe(d2.decision_id);
      expect(page2Body.next_page_token).not.toBeNull();

      // Page 3 using token from page 2
      const page3 = await queryDecisions({
        ...baseParams,
        page_size: 1,
        page_token: page2Body.next_page_token,
      });
      expect(page3.statusCode).toBe(200);
      const page3Body = page3.json();
      expect(page3Body.decisions.length).toBe(1);
      expect(page3Body.decisions[0].decision_id).toBe(d3.decision_id);
      expect(page3Body.next_page_token).toBe(null); // No more pages

      // Verify no overlap across pages
      const allIds = [
        page1Body.decisions[0].decision_id,
        page2Body.decisions[0].decision_id,
        page3Body.decisions[0].decision_id,
      ];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(3);

      // --- Second run with same queries → identical decision_id sequence ---
      const page1Again = await queryDecisions({ ...baseParams, page_size: 1 });
      const page1AgainBody = page1Again.json();
      expect(page1AgainBody.decisions[0].decision_id).toBe(d1.decision_id);
      expect(page1AgainBody.next_page_token).toBe(page1Body.next_page_token);

      const page2Again = await queryDecisions({
        ...baseParams,
        page_size: 1,
        page_token: page1AgainBody.next_page_token,
      });
      const page2AgainBody = page2Again.json();
      expect(page2AgainBody.decisions[0].decision_id).toBe(d2.decision_id);
      expect(page2AgainBody.next_page_token).toBe(page2Body.next_page_token);
    });

    it('should return all decisions across pages without loss or duplication', async () => {
      // Create 5 decisions
      const allDecisions: Decision[] = [];
      for (let i = 0; i < 5; i++) {
        allDecisions.push(
          createDecision({
            decided_at: `2026-01-30T${String(10 + i).padStart(2, '0')}:00:00Z`,
          })
        );
      }

      const baseParams = {
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      };

      // Collect all decision_ids across paginated requests (page_size=2)
      const collectedIds: string[] = [];
      let pageToken: string | undefined;

      while (true) {
        const params: Record<string, string | number | undefined> = {
          ...baseParams,
          page_size: 2,
        };
        if (pageToken) params.page_token = pageToken;

        const response = await queryDecisions(params);
        expect(response.statusCode).toBe(200);

        const body = response.json();
        for (const dec of body.decisions) {
          collectedIds.push(dec.decision_id);
        }

        if (body.next_page_token === null) break;
        pageToken = body.next_page_token;
      }

      // All 5 decisions collected, no duplicates
      expect(collectedIds.length).toBe(5);
      expect(new Set(collectedIds).size).toBe(5);

      // Order matches original insertion order (decided_at ASC)
      for (let i = 0; i < allDecisions.length; i++) {
        expect(collectedIds[i]).toBe(allDecisions[i].decision_id);
      }
    });
  });
});
