/**
 * Contract Tests for Signal Ingestion (SIG-API-001 through SIG-API-011)
 * Tests the POST /signals endpoint against the spec contract
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerIngestionRoutes } from '../../src/ingestion/routes.js';
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

describe('Signal Ingestion Contract Tests', () => {
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

  beforeAll(async () => {
    // Initialize in-memory SQLite for test isolation
    initIdempotencyStore(':memory:');
    initSignalLogStore(':memory:');
    initStateStore(':memory:');

    // Create Fastify app for testing
    app = Fastify({ logger: false });
    registerIngestionRoutes(app);
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

  describe('SIG-API-001: Accept valid signal', () => {
    it('should accept a valid signal envelope', async () => {
      const signal = validSignal();
      
      const response = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(200);
      
      const body = response.json();
      expect(body.status).toBe('accepted');
      expect(body.org_id).toBe(signal.org_id);
      expect(body.signal_id).toBe(signal.signal_id);
      expect(body.received_at).toBeDefined();
      expect(body.rejection_reason).toBeUndefined();
    });

    it('should accept signal with optional metadata', async () => {
      const signal = validSignal({
        metadata: {
          correlation_id: 'corr-123',
          trace_id: 'trace-456',
        },
      });
      
      const response = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('accepted');
    });

    it('should accept signal with timezone offset', async () => {
      const signal = validSignal({
        timestamp: '2026-01-30T10:00:00-05:00',
      });
      
      const response = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('accepted');
    });
  });

  describe('SIG-API-002: Missing required field', () => {
    const requiredFields = [
      'org_id',
      'signal_id',
      'source_system',
      'learner_reference',
      'timestamp',
      'schema_version',
      'payload',
    ];

    for (const field of requiredFields) {
      it(`should reject when ${field} is missing`, async () => {
        const signal = validSignal();
        delete signal[field];
        
        const response = await app.inject({
          method: 'POST',
          url: '/signals',
          payload: signal,
        });
        
        expect(response.statusCode).toBe(400);
        
        const body = response.json();
        expect(body.status).toBe('rejected');
        expect(body.rejection_reason).toBeDefined();
        expect(body.rejection_reason.code).toBe('missing_required_field');
      });
    }
  });

  describe('SIG-API-003: Invalid type (payload=[])', () => {
    it('should reject when payload is an array', async () => {
      const signal = validSignal({ payload: [] });
      
      const response = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.status).toBe('rejected');
      expect(body.rejection_reason.code).toBe('payload_not_object');
    });

    it('should reject when payload is null', async () => {
      const signal = validSignal({ payload: null });
      
      const response = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.status).toBe('rejected');
    });

    it('should reject when payload is a string', async () => {
      const signal = validSignal({ payload: 'not-an-object' });
      
      const response = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.status).toBe('rejected');
    });
  });

  describe('SIG-API-004: Invalid timestamp format', () => {
    it('should reject timestamp with space separator', async () => {
      const signal = validSignal({
        timestamp: '2026-01-30 10:00:00Z',
      });
      
      const response = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.status).toBe('rejected');
      expect(body.rejection_reason.code).toBe('invalid_timestamp');
    });

    it('should reject non-ISO timestamp', async () => {
      const signal = validSignal({
        timestamp: 'January 30, 2026',
      });
      
      const response = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.status).toBe('rejected');
      expect(body.rejection_reason.code).toBe('invalid_timestamp');
    });
  });

  describe('SIG-API-005: Missing timezone', () => {
    it('should reject timestamp without timezone', async () => {
      const signal = validSignal({
        timestamp: '2026-01-30T10:00:00',
      });
      
      const response = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.status).toBe('rejected');
      expect(body.rejection_reason.code).toBe('invalid_timestamp');
      expect(body.rejection_reason.field_path).toBe('timestamp');
    });
  });

  describe('SIG-API-006: Invalid schema_version', () => {
    const invalidVersions = ['math-v2', 'lms-v1', '1.0', 'v', 'version1', ''];

    for (const version of invalidVersions) {
      it(`should reject schema_version "${version}"`, async () => {
        const signal = validSignal({ schema_version: version });
        
        const response = await app.inject({
          method: 'POST',
          url: '/signals',
          payload: signal,
        });
        
        expect(response.statusCode).toBe(400);
        
        const body = response.json();
        expect(body.status).toBe('rejected');
        expect(body.rejection_reason.code).toBe('invalid_schema_version');
      });
    }

    it('should accept valid schema versions (v1, v2, v10)', async () => {
      for (const version of ['v1', 'v2', 'v10']) {
        const signal = validSignal({ schema_version: version });
        
        const response = await app.inject({
          method: 'POST',
          url: '/signals',
          payload: signal,
        });
        
        expect(response.statusCode).toBe(200);
        expect(response.json().status).toBe('accepted');
      }
    });
  });

  describe('SIG-API-007: Forbidden key (top-level)', () => {
    it('should reject payload with top-level "ui" key', async () => {
      const signal = validSignal({
        payload: { ui: { screen: 'home' } },
      });
      
      const response = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.status).toBe('rejected');
      expect(body.rejection_reason.code).toBe('forbidden_semantic_key_detected');
      expect(body.rejection_reason.field_path).toBe('payload.ui');
    });

    it('should reject payload with top-level "course" key', async () => {
      const signal = validSignal({
        payload: { course: 'math-101' },
      });
      
      const response = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.status).toBe('rejected');
      expect(body.rejection_reason.code).toBe('forbidden_semantic_key_detected');
    });
  });

  describe('SIG-API-008: Forbidden key (nested)', () => {
    it('should reject payload with deeply nested "workflow" key', async () => {
      const signal = validSignal({
        payload: { x: { y: { workflow: { step: '1' } } } },
      });
      
      const response = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.status).toBe('rejected');
      expect(body.rejection_reason.code).toBe('forbidden_semantic_key_detected');
      expect(body.rejection_reason.field_path).toBe('payload.x.y.workflow');
    });

    it('should reject payload with nested "score" key', async () => {
      const signal = validSignal({
        payload: { results: { assessment: { score: 95 } } },
      });
      
      const response = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.status).toBe('rejected');
      expect(body.rejection_reason.code).toBe('forbidden_semantic_key_detected');
    });
  });

  describe('SIG-API-009: Invalid signal_id charset', () => {
    it('should reject signal_id with spaces', async () => {
      const signal = validSignal({ signal_id: 'signal with spaces' });
      
      const response = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.status).toBe('rejected');
      expect(body.rejection_reason.code).toBe('invalid_charset');
    });

    it('should reject signal_id with special characters', async () => {
      const signal = validSignal({ signal_id: 'signal@#$%' });
      
      const response = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.status).toBe('rejected');
      expect(body.rejection_reason.code).toBe('invalid_charset');
    });

    it('should accept signal_id with allowed chars (A-Z, a-z, 0-9, ., _, :, -)', async () => {
      const signal = validSignal({ signal_id: 'Signal_123.test:abc-XYZ' });
      
      const response = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('accepted');
    });
  });

  describe('SIG-API-010: Duplicate signal_id', () => {
    it('should accept first submission and return duplicate for second', async () => {
      const signal = validSignal({ signal_id: 'dup-test-001' });
      
      // First submission
      const first = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(first.statusCode).toBe(200);
      expect(first.json().status).toBe('accepted');
      
      // Second submission (same org_id + signal_id)
      const second = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(second.statusCode).toBe(200);
      expect(second.json().status).toBe('duplicate');
    });

    it('should return original received_at for duplicate', async () => {
      const signal = validSignal({ signal_id: 'dup-test-002' });
      
      const first = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      const second = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signal,
      });
      
      expect(second.json().received_at).toBe(first.json().received_at);
    });

    it('should allow same signal_id from different org_id', async () => {
      const signalOrg1 = validSignal({ org_id: 'org-1', signal_id: 'shared-signal' });
      const signalOrg2 = validSignal({ org_id: 'org-2', signal_id: 'shared-signal' });
      
      const first = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signalOrg1,
      });
      
      const second = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: signalOrg2,
      });
      
      expect(first.statusCode).toBe(200);
      expect(first.json().status).toBe('accepted');
      expect(second.statusCode).toBe(200);
      expect(second.json().status).toBe('accepted');
    });
  });

  describe('SIG-API-011: Deterministic rejection', () => {
    it('should return same error for same invalid input', async () => {
      const invalidSignal = validSignal({
        timestamp: '2026-01-30T10:00:00', // Missing timezone
      });
      
      // First rejection
      const first = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: invalidSignal,
      });
      
      // Second rejection (same input)
      const second = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: invalidSignal,
      });
      
      expect(first.statusCode).toBe(second.statusCode);
      expect(first.json().rejection_reason.code).toBe(second.json().rejection_reason.code);
      expect(first.json().rejection_reason.message).toBe(second.json().rejection_reason.message);
    });

    it('should be deterministic for schema_version errors', async () => {
      const invalidSignal = validSignal({ schema_version: 'invalid' });
      
      const first = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: invalidSignal,
      });
      
      const second = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: invalidSignal,
      });
      
      expect(first.json().rejection_reason.code).toBe('invalid_schema_version');
      expect(second.json().rejection_reason.code).toBe('invalid_schema_version');
    });

    it('should be deterministic for forbidden key errors', async () => {
      const invalidSignal = validSignal({
        payload: { ui: 'forbidden' },
      });
      
      const first = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: invalidSignal,
      });
      
      const second = await app.inject({
        method: 'POST',
        url: '/signals',
        payload: invalidSignal,
      });
      
      expect(first.json().rejection_reason.code).toBe('forbidden_semantic_key_detected');
      expect(second.json().rejection_reason.code).toBe('forbidden_semantic_key_detected');
      expect(first.json().rejection_reason.field_path).toBe(second.json().rejection_reason.field_path);
    });
  });
});
