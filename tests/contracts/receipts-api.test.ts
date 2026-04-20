/**
 * Contract Tests for Receipts API (RCPT-API-001 through RCPT-API-005)
 * HTTP-level tests for GET /v1/receipts using Fastify app.inject().
 * Mirrors tests/contracts/output-api.test.ts pattern.
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
import { ErrorCodes } from '../../src/shared/error-codes.js';
import { contractHttp } from '../helpers/contract-http.js';

describe('Receipts API Contract Tests', () => {
  let app: FastifyInstance;

  let decisionCounter = 0;

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
        policy_id: 'default',
        policy_version: '1.0.0',
        matched_rule_id: 'rule-reinforce',
        state_snapshot: { progress: 0.5 },
        matched_rule: {
          rule_id: 'rule-reinforce',
          decision_type: 'reinforce',
          condition: { field: 'progress', operator: 'gte', value: 0.5 },
          evaluated_fields: [{ field: 'progress', operator: 'gte', threshold: 0.5, actual_value: 0.5 }],
        },
        rationale: 'Learner progress meets reinforce threshold',
        educator_summary: 'Needs more practice',
      },
      ...overrides,
    };
    saveDecision(decision);
    return decision;
  }

  async function queryReceipts(params: Record<string, string | number | undefined>) {
    const queryString = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');

    return contractHttp(app, {
      method: 'GET',
      url: `/v1/receipts?${queryString}`,
    });
  }

  beforeAll(async () => {
    initDecisionStore(':memory:');

    app = Fastify({ logger: false });
    app.register(
      async (v1) => {
        registerDecisionRoutes(v1);
      },
      { prefix: '/v1' }
    );
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
  // RCPT-API-001: Happy path receipts query
  // ---------------------------------------------------------------------------

  describe('RCPT-API-001: Happy path receipts query', () => {
    it('should return 200 with receipts array and next_page_token for valid params', async () => {
      const d1 = createDecision({ decided_at: '2026-01-30T10:00:00Z' });
      const d2 = createDecision({ decided_at: '2026-01-30T11:00:00Z' });

      const response = await queryReceipts({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.org_id).toBe('test-org');
      expect(body.learner_reference).toBe('learner-123');
      expect(body.receipts).toBeInstanceOf(Array);
      expect(body.receipts.length).toBe(2);

      expect(body.receipts[0].decision_id).toBe(d1.decision_id);
      expect(body.receipts[1].decision_id).toBe(d2.decision_id);

      for (const r of body.receipts) {
        expect(r).toHaveProperty('decision_id');
        expect(r).toHaveProperty('decision_type');
        expect(r).toHaveProperty('decided_at');
        expect(r).toHaveProperty('trace');
        // Receipt is projection only — must not include full Decision fields
        expect(r).not.toHaveProperty('org_id');
        expect(r).not.toHaveProperty('decision_context');
        expect(r).not.toHaveProperty('output_metadata');
      }

      expect(body.next_page_token).toBe(null);
    });
  });

  // ---------------------------------------------------------------------------
  // RCPT-API-002: Invalid time range rejected
  // ---------------------------------------------------------------------------

  describe('RCPT-API-002: Invalid time range rejected', () => {
    it('should return 400 with invalid_time_range when from_time > to_time', async () => {
      const response = await queryReceipts({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-06-01T00:00:00Z',
        to_time: '2026-01-01T00:00:00Z',
      });

      expect(response.statusCode).toBe(400);

      const body = response.json();
      expect(body.code).toBe(ErrorCodes.INVALID_TIME_RANGE);
    });
  });

  // ---------------------------------------------------------------------------
  // RCPT-API-003: Paging determinism
  // ---------------------------------------------------------------------------

  describe('RCPT-API-003: Paging determinism', () => {
    it('should paginate with page_size=1 across pages, stable order, no duplication', async () => {
      const d1 = createDecision({ decided_at: '2026-01-30T10:00:00Z' });
      const d2 = createDecision({ decided_at: '2026-01-30T11:00:00Z' });
      const d3 = createDecision({ decided_at: '2026-01-30T12:00:00Z' });

      const baseParams = {
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      };

      const page1 = await queryReceipts({ ...baseParams, page_size: 1 });
      expect(page1.statusCode).toBe(200);
      const page1Body = page1.json();
      expect(page1Body.receipts.length).toBe(1);
      expect(page1Body.receipts[0].decision_id).toBe(d1.decision_id);
      expect(page1Body.next_page_token).not.toBeNull();

      const page2 = await queryReceipts({
        ...baseParams,
        page_size: 1,
        page_token: page1Body.next_page_token,
      });
      expect(page2.statusCode).toBe(200);
      const page2Body = page2.json();
      expect(page2Body.receipts.length).toBe(1);
      expect(page2Body.receipts[0].decision_id).toBe(d2.decision_id);
      expect(page2Body.next_page_token).not.toBeNull();

      const page3 = await queryReceipts({
        ...baseParams,
        page_size: 1,
        page_token: page2Body.next_page_token,
      });
      expect(page3.statusCode).toBe(200);
      const page3Body = page3.json();
      expect(page3Body.receipts.length).toBe(1);
      expect(page3Body.receipts[0].decision_id).toBe(d3.decision_id);
      expect(page3Body.next_page_token).toBe(null);

      const allIds = [
        page1Body.receipts[0].decision_id,
        page2Body.receipts[0].decision_id,
        page3Body.receipts[0].decision_id,
      ];
      expect(new Set(allIds).size).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // RCPT-API-004: Org isolation
  // ---------------------------------------------------------------------------

  describe('RCPT-API-004: Org isolation', () => {
    it('should return only org-scoped receipts for mixed-org dataset', async () => {
      createDecision({ org_id: 'org-A', learner_reference: 'learner-shared' });
      createDecision({ org_id: 'org-B', learner_reference: 'learner-shared' });

      const response = await queryReceipts({
        org_id: 'org-A',
        learner_reference: 'learner-shared',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.receipts.length).toBe(1);
      expect(body.receipts[0].decision_id).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // RCPT-API-005: Receipt contains enriched trace
  // ---------------------------------------------------------------------------

  describe('RCPT-API-005: Receipt contains enriched trace', () => {
    /**
     * Runbook § What a receipt should show — "Any explanation text shown to the school"
     * projects through Decision.trace (receipts-api spec: same fields as Decision.trace).
     */
    it('should include trace.state_snapshot, trace.matched_rule, trace.rationale, trace.educator_summary', async () => {
      const rows: { educator_summary: string; decided_at: string }[] = [
        { educator_summary: 'Ready to move on', decided_at: '2026-01-30T10:00:00Z' },
        { educator_summary: 'Needs more practice', decided_at: '2026-01-30T11:00:00Z' },
        { educator_summary: 'Needs stronger support now', decided_at: '2026-01-30T12:00:00Z' },
        {
          educator_summary: 'Possible learning decay detected; watch closely',
          decided_at: '2026-01-30T13:00:00Z',
        },
      ];

      for (const { educator_summary, decided_at } of rows) {
        createDecision({
          decided_at,
          trace: {
            state_id: 'test-org:learner-123:v1',
            state_version: 1,
            policy_id: 'default',
            policy_version: '1.0.0',
            matched_rule_id: 'rule-advance',
            state_snapshot: { score: 85, level: 3 },
            matched_rule: {
              rule_id: 'rule-advance',
              decision_type: 'advance',
              condition: { field: 'score', operator: 'gte', value: 80 },
              evaluated_fields: [{ field: 'score', operator: 'gte', threshold: 80, actual_value: 85 }],
            },
            rationale: 'Score exceeds advance threshold',
            educator_summary,
          },
        });
      }

      const response = await queryReceipts({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.receipts.length).toBe(4);

      for (const receipt of body.receipts) {
        expect(receipt.trace).toBeDefined();
        expect(receipt.trace.state_snapshot).toEqual({ score: 85, level: 3 });
        expect(receipt.trace.matched_rule).toBeDefined();
        expect(receipt.trace.matched_rule.rule_id).toBe('rule-advance');
        expect(receipt.trace.rationale).toBe('Score exceeds advance threshold');
        expect(typeof receipt.trace.educator_summary).toBe('string');
        expect(receipt.trace.educator_summary.length).toBeGreaterThan(0);
        expect(rows.map((r) => r.educator_summary)).toContain(receipt.trace.educator_summary);
      }
    });
  });
});
