/**
 * Contract Tests for Signal Ingestion (SIG-API-001 through SIG-API-019)
 * Tests the POST /signals endpoint against the spec contract
 *
 * SIG-API-012–015: Tenant mapping regression after async + source_system wiring.
 * SIG-API-016: Computed transform produces canonical field.
 * SIG-API-018: DynamoDB mapping wins for org + source_system (mocked client).
 * SIG-API-019: Fallback to file when DynamoDB is unavailable; warning logged.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { registerIngestionRoutes } from '../../src/ingestion/routes.js';
import { setTenantFieldMappings } from '../../src/config/tenant-field-mappings.js';
import {
  _setFieldMappingsDynamoClientForTesting,
  clearFieldMappingCache,
} from '../../src/config/field-mappings-dynamo.js';
import {
  initIdempotencyStore,
  closeIdempotencyStore,
  clearIdempotencyStore,
} from '../../src/ingestion/idempotency.js';
import {
  initSignalLogStore,
  closeSignalLogStore,
  clearSignalLogStore,
  getSignalsByIds,
} from '../../src/signalLog/store.js';
import {
  initStateStore,
  closeStateStore,
  clearStateStore,
} from '../../src/state/store.js';
import { contractHttp } from '../helpers/contract-http.js';

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
    // Match production routing: routes are served under /v1 prefix (see src/server.ts)
    app.register(
      async (v1) => {
        registerIngestionRoutes(v1);
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
    // Reset tenant mappings between tests (global singleton)
    setTenantFieldMappings(null);
  });

  describe('SIG-API-001: Accept valid signal', () => {
    it('should accept a valid signal envelope', async () => {
      const signal = validSignal();
      
      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
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
      
      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('accepted');
    });

    it('should accept signal with timezone offset', async () => {
      const signal = validSignal({
        timestamp: '2026-01-30T10:00:00-05:00',
      });
      
      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
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
        
        const response = await contractHttp(app,{
          method: 'POST',
          url: '/v1/signals',
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
      
      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.status).toBe('rejected');
      expect(body.rejection_reason.code).toBe('payload_not_object');
    });

    it('should reject when payload is null', async () => {
      const signal = validSignal({ payload: null });
      
      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.status).toBe('rejected');
    });

    it('should reject when payload is a string', async () => {
      const signal = validSignal({ payload: 'not-an-object' });
      
      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
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
      
      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
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
      
      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
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
      
      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
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
        
        const response = await contractHttp(app,{
          method: 'POST',
          url: '/v1/signals',
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
        
        const response = await contractHttp(app,{
          method: 'POST',
          url: '/v1/signals',
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
      
      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
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
      
      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
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
      
      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
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
      
      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
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
      
      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.status).toBe('rejected');
      expect(body.rejection_reason.code).toBe('invalid_charset');
    });

    it('should reject signal_id with special characters', async () => {
      const signal = validSignal({ signal_id: 'signal@#$%' });
      
      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });
      
      expect(response.statusCode).toBe(400);
      
      const body = response.json();
      expect(body.status).toBe('rejected');
      expect(body.rejection_reason.code).toBe('invalid_charset');
    });

    it('should accept signal_id with allowed chars (A-Z, a-z, 0-9, ., _, :, -)', async () => {
      const signal = validSignal({ signal_id: 'Signal_123.test:abc-XYZ' });
      
      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
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
      const first = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });
      
      expect(first.statusCode).toBe(200);
      expect(first.json().status).toBe('accepted');
      
      // Second submission (same org_id + signal_id)
      const second = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });
      
      expect(second.statusCode).toBe(200);
      expect(second.json().status).toBe('duplicate');
    });

    it('should return original received_at for duplicate', async () => {
      const signal = validSignal({ signal_id: 'dup-test-002' });
      
      const first = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });
      
      const second = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });
      
      expect(second.json().received_at).toBe(first.json().received_at);
    });

    it('should allow same signal_id from different org_id', async () => {
      const signalOrg1 = validSignal({ org_id: 'org-1', signal_id: 'shared-signal' });
      const signalOrg2 = validSignal({ org_id: 'org-2', signal_id: 'shared-signal' });
      
      const first = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: signalOrg1,
      });
      
      const second = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
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
      const first = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: invalidSignal,
      });
      
      // Second rejection (same input)
      const second = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: invalidSignal,
      });
      
      expect(first.statusCode).toBe(second.statusCode);
      expect(first.json().rejection_reason.code).toBe(second.json().rejection_reason.code);
      expect(first.json().rejection_reason.message).toBe(second.json().rejection_reason.message);
    });

    it('should be deterministic for schema_version errors', async () => {
      const invalidSignal = validSignal({ schema_version: 'invalid' });
      
      const first = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: invalidSignal,
      });
      
      const second = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: invalidSignal,
      });
      
      expect(first.json().rejection_reason.code).toBe('invalid_schema_version');
      expect(second.json().rejection_reason.code).toBe('invalid_schema_version');
    });

    it('should be deterministic for forbidden key errors', async () => {
      const invalidSignal = validSignal({
        payload: { ui: 'forbidden' },
      });
      
      const first = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: invalidSignal,
      });
      
      const second = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: invalidSignal,
      });
      
      expect(first.json().rejection_reason.code).toBe('forbidden_semantic_key_detected');
      expect(second.json().rejection_reason.code).toBe('forbidden_semantic_key_detected');
      expect(first.json().rejection_reason.field_path).toBe(second.json().rejection_reason.field_path);
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 2: Tenant-scoped payload semantics (DEF-DEC-006)
  // ---------------------------------------------------------------------------

  describe('SIG-API-012: Tenant payload mappings - required canonical field', () => {
    it('should reject when tenant requires a canonical payload field that is missing', async () => {
      setTenantFieldMappings({
        version: 1,
        tenants: {
          'test-org': {
            payload: {
              required: ['stabilityScore'],
            },
          },
        },
      });

      const signal = validSignal({ payload: { level: 5 } });

      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.status).toBe('rejected');
      expect(body.rejection_reason.code).toBe('missing_required_field');
      expect(body.rejection_reason.field_path).toBe('payload.stabilityScore');
    });
  });

  describe('SIG-API-013: Tenant payload mappings - alias normalization', () => {
    it('should accept when alias can be normalized into required canonical field', async () => {
      setTenantFieldMappings({
        version: 1,
        tenants: {
          'test-org': {
            payload: {
              required: ['stabilityScore'],
              aliases: {
                stabilityScore: ['stability_score'],
              },
              types: {
                stabilityScore: 'number',
              },
            },
          },
        },
      });

      const signal = validSignal({
        payload: { stability_score: 0.5 },
      });

      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('accepted');

      // Side effect: signal log stores normalized payload (canonical field added)
      const stored = getSignalsByIds(signal.org_id, [signal.signal_id]);
      expect(stored).toHaveLength(1);
      expect(stored[0]!.payload).toMatchObject({
        stability_score: 0.5,
        stabilityScore: 0.5,
      });
    });
  });

  describe('SIG-API-014: Tenant payload mappings - alias conflict', () => {
    it('should reject when multiple alias candidates are present for a missing canonical field', async () => {
      setTenantFieldMappings({
        version: 1,
        tenants: {
          'test-org': {
            payload: {
              aliases: {
                stabilityScore: ['a', 'b'],
              },
            },
          },
        },
      });

      const signal = validSignal({
        payload: { a: 1, b: 2 },
      });

      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.status).toBe('rejected');
      expect(body.rejection_reason.code).toBe('invalid_format');
      expect(body.rejection_reason.field_path).toBe('payload.stabilityScore');
    });
  });

  describe('SIG-API-015: Tenant payload mappings - type enforcement', () => {
    it('should reject when a mapped payload field has the wrong primitive type', async () => {
      setTenantFieldMappings({
        version: 1,
        tenants: {
          'test-org': {
            payload: {
              required: ['level'],
              types: {
                level: 'number',
              },
            },
          },
        },
      });

      const signal = validSignal({ payload: { level: '5' } });

      const response = await contractHttp(app,{
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.status).toBe('rejected');
      expect(body.rejection_reason.code).toBe('invalid_type');
      expect(body.rejection_reason.field_path).toBe('payload.level');
    });
  });

  // ---------------------------------------------------------------------------
  // v1.1: Computed transforms (SIG-API-016)
  // ---------------------------------------------------------------------------

  describe('SIG-API-016: Computed transform produces canonical field', () => {
    it('should accept signal and produce stabilityScore=0.65 from raw_score=65 via value/100', async () => {
      setTenantFieldMappings({
        version: 1,
        tenants: {
          'test-org': {
            payload: {
              required: ['stabilityScore'],
              types: { stabilityScore: 'number' },
              transforms: [
                { target: 'stabilityScore', source: 'raw_score', expression: 'value / 100' },
              ],
            },
          },
        },
      });

      const signal = validSignal({ payload: { raw_score: 65 } });

      const response = await contractHttp(app, {
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('accepted');

      const stored = getSignalsByIds(signal.org_id as string, [signal.signal_id as string]);
      expect(stored).toHaveLength(1);
      expect((stored[0]!.payload as Record<string, unknown>).stabilityScore).toBeCloseTo(0.65);
    });
  });

  // ---------------------------------------------------------------------------
  // v1.1: DynamoDB mapping lookup (SIG-API-018, SIG-API-019)
  // SIG-API-017 (invalid expression at admin PUT) lives in admin-field-mappings.test.ts
  // ---------------------------------------------------------------------------

  describe('SIG-API-018: DynamoDB mapping loaded for org + source_system', () => {
    const ORG = 'springs';
    const SOURCE = 'canvas-lms';
    const ORIG_TABLE = process.env.FIELD_MAPPINGS_TABLE;

    afterEach(() => {
      process.env.FIELD_MAPPINGS_TABLE = ORIG_TABLE;
      _setFieldMappingsDynamoClientForTesting(null);
      clearFieldMappingCache();
    });

    it('should use DynamoDB mapping (not file config) when DynamoDB item exists', async () => {
      process.env.FIELD_MAPPINGS_TABLE = 'test-field-mappings-table';

      // DynamoDB item: mapping for springs + canvas-lms with stabilityScore required
      const dynamoItem = {
        org_id: ORG,
        source_system: SOURCE,
        mapping: {
          required: ['stabilityScore'],
          types: { stabilityScore: 'number' },
        },
      };

      const mockSend = vi.fn().mockResolvedValue({
        Item: dynamoItem,
      });
      _setFieldMappingsDynamoClientForTesting({ send: mockSend } as unknown as DynamoDBDocumentClient);

      // File config for the same org with different (looser) rules — DynamoDB should win
      setTenantFieldMappings({
        version: 1,
        tenants: { [ORG]: { payload: {} } },
      });

      const signal = validSignal({
        org_id: ORG,
        source_system: SOURCE,
        payload: { stabilityScore: 0.8 },
      });

      const response = await contractHttp(app, {
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('accepted');

      // Verify DynamoDB was queried with correct key
      const calls = mockSend.mock.calls;
      const getItemCall = calls.find(
        ([cmd]: [unknown]) => cmd instanceof GetCommand,
      );
      expect(getItemCall).toBeDefined();
    });

    it('should reject when DynamoDB mapping requires a field not in payload', async () => {
      process.env.FIELD_MAPPINGS_TABLE = 'test-field-mappings-table';

      const dynamoItem = {
        org_id: ORG,
        source_system: SOURCE,
        mapping: { required: ['stabilityScore'] },
      };

      const mockSend = vi.fn().mockResolvedValue({
        Item: dynamoItem,
      });
      _setFieldMappingsDynamoClientForTesting({ send: mockSend } as unknown as DynamoDBDocumentClient);

      const signal = validSignal({
        org_id: ORG,
        source_system: SOURCE,
        payload: { other_field: 1 },
      });

      const response = await contractHttp(app, {
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().rejection_reason.code).toBe('missing_required_field');
    });
  });

  describe('SIG-API-019: Fallback to file when DynamoDB miss/unavailable + warning', () => {
    const ORIG_TABLE = process.env.FIELD_MAPPINGS_TABLE;

    afterEach(() => {
      process.env.FIELD_MAPPINGS_TABLE = ORIG_TABLE;
      _setFieldMappingsDynamoClientForTesting(null);
      clearFieldMappingCache();
    });

    it('should fall back to file mapping and log a warning when DynamoDB throws', async () => {
      process.env.FIELD_MAPPINGS_TABLE = 'test-field-mappings-table';

      const mockSend = vi.fn().mockRejectedValue(new Error('DynamoDB connection refused'));
      _setFieldMappingsDynamoClientForTesting({ send: mockSend } as unknown as DynamoDBDocumentClient);

      // File config: loose mapping — no required fields — signal should be accepted
      setTenantFieldMappings({
        version: 1,
        tenants: { 'test-org': { payload: {} } },
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const signal = validSignal({ payload: { skill: 'math' } });

      const response = await contractHttp(app, {
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('accepted');

      // Warning should mention field_mappings_dynamo_degraded
      const warnArgs = warnSpy.mock.calls.map((c) => JSON.stringify(c)).join(' ');
      expect(warnArgs).toMatch(/field_mappings_dynamo_degraded/);

      warnSpy.mockRestore();
    });

    it('should use file mapping when DynamoDB has no item for org+source_system', async () => {
      process.env.FIELD_MAPPINGS_TABLE = 'test-field-mappings-table';

      // DynamoDB returns empty (no item)
      const mockSend = vi.fn().mockResolvedValue({ Item: undefined });
      _setFieldMappingsDynamoClientForTesting({ send: mockSend } as unknown as DynamoDBDocumentClient);

      setTenantFieldMappings({
        version: 1,
        tenants: {
          'test-org': {
            payload: {
              required: ['stabilityScore'],
            },
          },
        },
      });

      const signal = validSignal({ payload: { other: 1 } });

      const response = await contractHttp(app, {
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().rejection_reason.code).toBe('missing_required_field');
    });
  });
});
