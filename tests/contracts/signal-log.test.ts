 /**
 * Contract Tests for Signal Log (SIGLOG-001 through SIGLOG-010)
 * Tests the GET /signals endpoint against the spec contract
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerIngestionRoutes } from '../../src/ingestion/routes.js';
import { registerSignalLogRoutes } from '../../src/signalLog/routes.js';
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

describe('Signal Log Contract Tests', () => {
  let app: FastifyInstance;

  /**
   * Create a valid signal envelope for testing
   */
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

  /**
   * Post a signal through ingestion (helper)
   */
  async function postSignal(signal: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/v1/signals',
      payload: signal,
    });
  }

  /**
   * Query signals (helper)
   */
  async function querySignals(params: Record<string, string | number | undefined>) {
    const queryString = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    
    return app.inject({
      method: 'GET',
      url: `/v1/signals?${queryString}`,
    });
  }

  beforeAll(async () => {
    // Initialize in-memory SQLite for test isolation
    initIdempotencyStore(':memory:');
    initSignalLogStore(':memory:');
    initStateStore(':memory:');

    // Create Fastify app for testing
    app = Fastify({ logger: false });
    // Match production routing: routes are served under /v1 prefix (see src/server.ts)
    app.register(
      async (v1) => {
        registerIngestionRoutes(v1);
        registerSignalLogRoutes(v1);
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
  });

  beforeEach(() => {
    // Clear stores between tests
    clearIdempotencyStore();
    clearSignalLogStore();
    clearStateStore();
  });

  describe('SIGLOG-001: Query valid time window', () => {
    it('should return signals within time window', async () => {
      // Post a signal through ingestion
      const signal = validSignal({ signal_id: 'siglog-001-test' });
      const postResponse = await postSignal(signal);
      expect(postResponse.statusCode).toBe(200);
      
      // Query for the signal
      const response = await querySignals({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });
      
      expect(response.statusCode).toBe(200);
      
      const body = response.json();
      expect(body.org_id).toBe('test-org');
      expect(body.learner_reference).toBe('learner-123');
      expect(body.signals).toBeInstanceOf(Array);
      expect(body.signals.length).toBe(1);
      expect(body.signals[0].signal_id).toBe('siglog-001-test');
      expect(body.signals[0].accepted_at).toBeDefined();
      expect(body.next_page_token).toBe(null);
    });

    it('should return next_page_token when more results exist', async () => {
      // Post 3 signals
      for (let i = 1; i <= 3; i++) {
        await postSignal(validSignal({ signal_id: `siglog-001-page-${i}` }));
      }
      
      // Query with page_size=2
      const response = await querySignals({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
        page_size: 2,
      });
      
      expect(response.statusCode).toBe(200);
      
      const body = response.json();
      expect(body.signals.length).toBe(2);
      expect(body.next_page_token).not.toBeNull();
    });
  });

  describe('SIGLOG-002: Invalid time range (from > to)', () => {
    it('should reject when from_time is after to_time', async () => {
      const response = await querySignals({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-02-01T00:00:00Z',
        to_time: '2026-01-01T00:00:00Z',
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.code).toBe('invalid_time_range');
    });
  });

  describe('SIGLOG-003: Page size = 0', () => {
    it('should reject page_size of 0', async () => {
      const response = await querySignals({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
        page_size: 0,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.code).toBe('page_size_out_of_range');
    });

    it('should reject page_size greater than 1000', async () => {
      const response = await querySignals({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
        page_size: 1001,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.code).toBe('page_size_out_of_range');
    });
  });

  describe('SIGLOG-004: Paging determinism', () => {
    it('should return identical results for same query twice', async () => {
      // Post 5 signals
      for (let i = 1; i <= 5; i++) {
        await postSignal(validSignal({ signal_id: `siglog-004-det-${i}` }));
      }
      
      const params = {
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      };
      
      // Query twice
      const response1 = await querySignals(params);
      const response2 = await querySignals(params);
      
      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);
      
      const body1 = response1.json();
      const body2 = response2.json();
      
      // Same number of signals
      expect(body1.signals.length).toBe(body2.signals.length);
      
      // Same signal sequence (order matters)
      for (let i = 0; i < body1.signals.length; i++) {
        expect(body1.signals[i].signal_id).toBe(body2.signals[i].signal_id);
        expect(body1.signals[i].accepted_at).toBe(body2.signals[i].accepted_at);
      }
    });
  });

  describe('SIGLOG-005: Immutability guarantee', () => {
    it('should return unchanged record on re-read', async () => {
      // Post a signal
      const signal = validSignal({ 
        signal_id: 'siglog-005-immutable',
        payload: { test: 'immutability', nested: { value: 42 } },
      });
      await postSignal(signal);
      
      const params = {
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      };
      
      // Query first time
      const response1 = await querySignals(params);
      const record1 = response1.json().signals[0];
      
      // Query second time
      const response2 = await querySignals(params);
      const record2 = response2.json().signals[0];
      
      // All fields should be identical
      expect(record1.org_id).toBe(record2.org_id);
      expect(record1.signal_id).toBe(record2.signal_id);
      expect(record1.source_system).toBe(record2.source_system);
      expect(record1.learner_reference).toBe(record2.learner_reference);
      expect(record1.timestamp).toBe(record2.timestamp);
      expect(record1.schema_version).toBe(record2.schema_version);
      expect(record1.payload).toEqual(record2.payload);
      expect(record1.accepted_at).toBe(record2.accepted_at);
    });
  });

  describe('SIGLOG-006: org_id isolation', () => {
    it('should not return signals from different org', async () => {
      // Post signals for two different orgs
      await postSignal(validSignal({ 
        org_id: 'org-A', 
        signal_id: 'siglog-006-orgA',
        learner_reference: 'learner-shared',
      }));
      await postSignal(validSignal({ 
        org_id: 'org-B', 
        signal_id: 'siglog-006-orgB',
        learner_reference: 'learner-shared',
      }));
      
      // Query for org-A
      const response = await querySignals({
        org_id: 'org-A',
        learner_reference: 'learner-shared',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });
      
      expect(response.statusCode).toBe(200);
      
      const body = response.json();
      expect(body.signals.length).toBe(1);
      expect(body.signals[0].org_id).toBe('org-A');
      expect(body.signals[0].signal_id).toBe('siglog-006-orgA');
    });

    it('should reject missing org_id', async () => {
      const response = await querySignals({
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      } as Record<string, string>);
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.code).toBe('org_scope_required');
    });

    it('should reject empty org_id', async () => {
      const response = await querySignals({
        org_id: '',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.code).toBe('org_scope_required');
    });
  });

  describe('SIGLOG-007: Empty result', () => {
    it('should return empty signals array for valid query with no matches', async () => {
      // Don't post any signals
      
      const response = await querySignals({
        org_id: 'test-org',
        learner_reference: 'nonexistent-learner',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });
      
      expect(response.statusCode).toBe(200);
      
      const body = response.json();
      expect(body.signals).toEqual([]);
      expect(body.next_page_token).toBe(null);
    });
  });

  describe('SIGLOG-008: Pagination continuation', () => {
    it('should return next page with token', async () => {
      // Post 5 signals
      for (let i = 1; i <= 5; i++) {
        await postSignal(validSignal({ signal_id: `siglog-008-page-${i}` }));
      }
      
      // First page
      const page1Response = await querySignals({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
        page_size: 2,
      });
      
      expect(page1Response.statusCode).toBe(200);
      const page1 = page1Response.json();
      expect(page1.signals.length).toBe(2);
      expect(page1.next_page_token).not.toBeNull();
      
      // Second page using token
      const page2Response = await querySignals({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
        page_size: 2,
        page_token: page1.next_page_token,
      });
      
      expect(page2Response.statusCode).toBe(200);
      const page2 = page2Response.json();
      expect(page2.signals.length).toBe(2);
      expect(page2.next_page_token).not.toBeNull();
      
      // Verify no overlap between pages
      const page1Ids = page1.signals.map((s: { signal_id: string }) => s.signal_id);
      const page2Ids = page2.signals.map((s: { signal_id: string }) => s.signal_id);
      for (const id of page2Ids) {
        expect(page1Ids).not.toContain(id);
      }
      
      // Third page (last item)
      const page3Response = await querySignals({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
        page_size: 2,
        page_token: page2.next_page_token,
      });
      
      expect(page3Response.statusCode).toBe(200);
      const page3 = page3Response.json();
      expect(page3.signals.length).toBe(1);
      expect(page3.next_page_token).toBe(null); // No more pages
    });

    it('should reject invalid page token', async () => {
      const response = await querySignals({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
        page_token: 'invalid-token-not-base64',
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.code).toBe('invalid_page_token');
    });
  });

  describe('SIGLOG-009: Default page_size', () => {
    it('should default to 100 when page_size not provided', async () => {
      // Post 105 signals (to trigger pagination at default 100)
      for (let i = 1; i <= 105; i++) {
        await postSignal(validSignal({ signal_id: `siglog-009-default-${i}` }));
      }
      
      // Query without page_size
      const response = await querySignals({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });
      
      expect(response.statusCode).toBe(200);
      
      const body = response.json();
      expect(body.signals.length).toBe(100); // Default page size
      expect(body.next_page_token).not.toBeNull(); // More results exist
    });
  });

  describe('SIGLOG-010: Integration with ingestion', () => {
    it('should store accepted signal in Signal Log', async () => {
      const signal = validSignal({ 
        signal_id: 'siglog-010-integration',
        payload: { integration: 'test', value: 123 },
        metadata: { correlation_id: 'corr-integration' },
      });
      
      // Post through ingestion
      const postResponse = await postSignal(signal);
      expect(postResponse.statusCode).toBe(200);
      expect(postResponse.json().status).toBe('accepted');
      
      const receivedAt = postResponse.json().received_at;
      
      // Query from Signal Log
      const queryResponse = await querySignals({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });
      
      expect(queryResponse.statusCode).toBe(200);
      
      const body = queryResponse.json();
      expect(body.signals.length).toBe(1);
      
      const storedSignal = body.signals[0];
      expect(storedSignal.org_id).toBe(signal.org_id);
      expect(storedSignal.signal_id).toBe(signal.signal_id);
      expect(storedSignal.source_system).toBe(signal.source_system);
      expect(storedSignal.learner_reference).toBe(signal.learner_reference);
      expect(storedSignal.timestamp).toBe(signal.timestamp);
      expect(storedSignal.schema_version).toBe(signal.schema_version);
      expect(storedSignal.payload).toEqual(signal.payload);
      expect(storedSignal.metadata).toEqual(signal.metadata);
      expect(storedSignal.accepted_at).toBe(receivedAt);
    });

    it('should not store rejected signal in Signal Log', async () => {
      // Post an invalid signal (missing timestamp timezone)
      const invalidSignal = validSignal({ 
        signal_id: 'siglog-010-rejected',
        timestamp: '2026-01-30T10:00:00', // Missing timezone
      });
      
      const postResponse = await postSignal(invalidSignal);
      expect(postResponse.statusCode).toBe(400);
      expect(postResponse.json().status).toBe('rejected');
      
      // Query - should be empty
      const queryResponse = await querySignals({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });
      
      expect(queryResponse.statusCode).toBe(200);
      expect(queryResponse.json().signals.length).toBe(0);
    });

    it('should not store duplicate signal again in Signal Log', async () => {
      const signal = validSignal({ signal_id: 'siglog-010-duplicate' });
      
      // Post first time (accepted)
      const first = await postSignal(signal);
      expect(first.statusCode).toBe(200);
      expect(first.json().status).toBe('accepted');
      
      // Post second time (duplicate)
      const second = await postSignal(signal);
      expect(second.statusCode).toBe(200);
      expect(second.json().status).toBe('duplicate');
      
      // Query - should only have 1 signal
      const queryResponse = await querySignals({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      });
      
      expect(queryResponse.statusCode).toBe(200);
      expect(queryResponse.json().signals.length).toBe(1);
    });
  });

  describe('Validation edge cases', () => {
    it('should reject missing learner_reference', async () => {
      const response = await querySignals({
        org_id: 'test-org',
        from_time: '2026-01-01T00:00:00Z',
        to_time: '2026-12-31T23:59:59Z',
      } as Record<string, string>);
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.code).toBe('missing_required_field');
    });

    it('should reject missing from_time', async () => {
      const response = await querySignals({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        to_time: '2026-12-31T23:59:59Z',
      } as Record<string, string>);
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.code).toBe('missing_required_field');
    });

    it('should reject invalid timestamp format', async () => {
      const response = await querySignals({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01 00:00:00', // Space instead of T
        to_time: '2026-12-31T23:59:59Z',
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.code).toBe('invalid_timestamp');
    });

    it('should reject timestamp without timezone', async () => {
      const response = await querySignals({
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-01T00:00:00', // Missing timezone
        to_time: '2026-12-31T23:59:59Z',
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.code).toBe('invalid_timestamp');
    });
  });
});
