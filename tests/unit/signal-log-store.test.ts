/**
 * Unit tests for Signal Log Store
 * Tests the SQLite-backed signal storage layer
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initSignalLogStore,
  closeSignalLogStore,
  appendSignal,
  querySignals,
  getSignalsByIds,
  clearSignalLogStore,
  encodePageToken,
  decodePageToken,
} from '../../src/signalLog/store.js';
import type { SignalEnvelope, SignalLogReadRequest } from '../../src/shared/types.js';

/**
 * Create a valid signal envelope for testing
 */
function createSignal(overrides: Partial<SignalEnvelope> = {}): SignalEnvelope {
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

describe('Signal Log Store', () => {
  beforeEach(() => {
    // Use in-memory SQLite for test isolation
    initSignalLogStore(':memory:');
  });

  afterEach(() => {
    closeSignalLogStore();
  });

  describe('STORE-001: appendSignal stores correctly', () => {
    it('should store and return a SignalRecord with accepted_at', () => {
      const signal = createSignal({ signal_id: 'store-test-001' });
      const acceptedAt = '2026-01-30T10:05:00Z';
      
      const record = appendSignal(signal, acceptedAt);
      
      expect(record.org_id).toBe(signal.org_id);
      expect(record.signal_id).toBe(signal.signal_id);
      expect(record.source_system).toBe(signal.source_system);
      expect(record.learner_reference).toBe(signal.learner_reference);
      expect(record.timestamp).toBe(signal.timestamp);
      expect(record.schema_version).toBe(signal.schema_version);
      expect(record.payload).toEqual(signal.payload);
      expect(record.accepted_at).toBe(acceptedAt);
    });

    it('should store signal with metadata', () => {
      const signal = createSignal({
        signal_id: 'store-test-002',
        metadata: { correlation_id: 'corr-123', trace_id: 'trace-456' },
      });
      const acceptedAt = '2026-01-30T10:05:00Z';
      
      const record = appendSignal(signal, acceptedAt);
      
      expect(record.metadata).toEqual(signal.metadata);
    });

    it('should store signal without metadata', () => {
      const signal = createSignal({ signal_id: 'store-test-003' });
      delete signal.metadata;
      const acceptedAt = '2026-01-30T10:05:00Z';
      
      const record = appendSignal(signal, acceptedAt);
      
      expect(record.metadata).toBeUndefined();
    });

    it('should preserve complex payload structure', () => {
      const complexPayload = {
        nested: { deeply: { value: 42 } },
        array: [1, 2, 3],
        string: 'hello',
        number: 3.14,
        boolean: true,
        null_value: null,
      };
      const signal = createSignal({ signal_id: 'store-test-004', payload: complexPayload });
      const acceptedAt = '2026-01-30T10:05:00Z';
      
      const record = appendSignal(signal, acceptedAt);
      
      expect(record.payload).toEqual(complexPayload);
    });
  });

  describe('STORE-002: querySignals returns correct range', () => {
    it('should return signals within time range', () => {
      // Insert signals with different accepted_at times
      appendSignal(createSignal({ signal_id: 'range-1', learner_reference: 'learner-A' }), '2026-01-30T09:00:00Z');
      appendSignal(createSignal({ signal_id: 'range-2', learner_reference: 'learner-A' }), '2026-01-30T10:00:00Z');
      appendSignal(createSignal({ signal_id: 'range-3', learner_reference: 'learner-A' }), '2026-01-30T11:00:00Z');
      appendSignal(createSignal({ signal_id: 'range-4', learner_reference: 'learner-A' }), '2026-01-30T12:00:00Z');
      
      const request: SignalLogReadRequest = {
        org_id: 'test-org',
        learner_reference: 'learner-A',
        from_time: '2026-01-30T09:30:00Z',
        to_time: '2026-01-30T11:30:00Z',
      };
      
      const result = querySignals(request);
      
      // Should include range-2 and range-3 (10:00 and 11:00)
      expect(result.signals.length).toBe(2);
      expect(result.signals[0].signal_id).toBe('range-2');
      expect(result.signals[1].signal_id).toBe('range-3');
    });

    it('should include signals at exact boundary times', () => {
      appendSignal(createSignal({ signal_id: 'boundary-1', learner_reference: 'learner-B' }), '2026-01-30T10:00:00Z');
      appendSignal(createSignal({ signal_id: 'boundary-2', learner_reference: 'learner-B' }), '2026-01-30T12:00:00Z');
      
      const request: SignalLogReadRequest = {
        org_id: 'test-org',
        learner_reference: 'learner-B',
        from_time: '2026-01-30T10:00:00Z',
        to_time: '2026-01-30T12:00:00Z',
      };
      
      const result = querySignals(request);
      
      // Both signals should be included (boundary inclusive)
      expect(result.signals.length).toBe(2);
    });

    it('should return empty array when no signals match', () => {
      appendSignal(createSignal({ signal_id: 'other-1', learner_reference: 'learner-C' }), '2026-01-30T10:00:00Z');
      
      const request: SignalLogReadRequest = {
        org_id: 'test-org',
        learner_reference: 'learner-C',
        from_time: '2026-02-01T00:00:00Z',
        to_time: '2026-02-01T23:59:59Z',
      };
      
      const result = querySignals(request);
      
      expect(result.signals).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('STORE-003: Pagination token encoding', () => {
    it('should encode and decode page token correctly', () => {
      const cursorId = 42;
      const token = encodePageToken(cursorId);
      const decoded = decodePageToken(token);
      
      expect(decoded).toBe(cursorId);
    });

    it('should return 0 for invalid token', () => {
      expect(decodePageToken('invalid-token')).toBe(0);
      expect(decodePageToken('')).toBe(0);
    });

    it('should return 0 for wrong version token', () => {
      // Encode a token with wrong version
      const wrongVersion = Buffer.from('v2:42').toString('base64');
      expect(decodePageToken(wrongVersion)).toBe(0);
    });

    it('should handle pagination correctly', () => {
      // Insert 5 signals
      for (let i = 1; i <= 5; i++) {
        appendSignal(
          createSignal({ signal_id: `page-${i}`, learner_reference: 'learner-D' }),
          `2026-01-30T10:0${i}:00Z`
        );
      }
      
      // First page (2 items)
      const request: SignalLogReadRequest = {
        org_id: 'test-org',
        learner_reference: 'learner-D',
        from_time: '2026-01-30T00:00:00Z',
        to_time: '2026-01-31T00:00:00Z',
        page_size: 2,
      };
      
      const page1 = querySignals(request);
      expect(page1.signals.length).toBe(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeDefined();
      
      // Second page using token
      const page2 = querySignals({
        ...request,
        page_token: encodePageToken(page1.nextCursor!),
      });
      expect(page2.signals.length).toBe(2);
      expect(page2.hasMore).toBe(true);
      
      // Third page (last item)
      const page3 = querySignals({
        ...request,
        page_token: encodePageToken(page2.nextCursor!),
      });
      expect(page3.signals.length).toBe(1);
      expect(page3.hasMore).toBe(false);
    });
  });

  describe('STORE-004: Ordering by accepted_at', () => {
    it('should return signals ordered by accepted_at ascending', () => {
      // Insert in random order
      appendSignal(createSignal({ signal_id: 'order-3', learner_reference: 'learner-E' }), '2026-01-30T12:00:00Z');
      appendSignal(createSignal({ signal_id: 'order-1', learner_reference: 'learner-E' }), '2026-01-30T10:00:00Z');
      appendSignal(createSignal({ signal_id: 'order-2', learner_reference: 'learner-E' }), '2026-01-30T11:00:00Z');
      
      const request: SignalLogReadRequest = {
        org_id: 'test-org',
        learner_reference: 'learner-E',
        from_time: '2026-01-30T00:00:00Z',
        to_time: '2026-01-31T00:00:00Z',
      };
      
      const result = querySignals(request);
      
      expect(result.signals[0].signal_id).toBe('order-1');
      expect(result.signals[1].signal_id).toBe('order-2');
      expect(result.signals[2].signal_id).toBe('order-3');
    });
  });

  describe('Org isolation', () => {
    it('should not return signals from different org', () => {
      appendSignal(createSignal({ org_id: 'org-1', signal_id: 'iso-1', learner_reference: 'learner-shared' }), '2026-01-30T10:00:00Z');
      appendSignal(createSignal({ org_id: 'org-2', signal_id: 'iso-2', learner_reference: 'learner-shared' }), '2026-01-30T10:00:00Z');
      
      const request: SignalLogReadRequest = {
        org_id: 'org-1',
        learner_reference: 'learner-shared',
        from_time: '2026-01-30T00:00:00Z',
        to_time: '2026-01-31T00:00:00Z',
      };
      
      const result = querySignals(request);
      
      expect(result.signals.length).toBe(1);
      expect(result.signals[0].org_id).toBe('org-1');
      expect(result.signals[0].signal_id).toBe('iso-1');
    });
  });

  describe('Learner isolation', () => {
    it('should not return signals from different learner', () => {
      appendSignal(createSignal({ signal_id: 'learner-iso-1', learner_reference: 'learner-A' }), '2026-01-30T10:00:00Z');
      appendSignal(createSignal({ signal_id: 'learner-iso-2', learner_reference: 'learner-B' }), '2026-01-30T10:00:00Z');
      
      const request: SignalLogReadRequest = {
        org_id: 'test-org',
        learner_reference: 'learner-A',
        from_time: '2026-01-30T00:00:00Z',
        to_time: '2026-01-31T00:00:00Z',
      };
      
      const result = querySignals(request);
      
      expect(result.signals.length).toBe(1);
      expect(result.signals[0].learner_reference).toBe('learner-A');
    });
  });

  describe('Default page_size', () => {
    it('should default to 100 when page_size not provided', () => {
      // Insert 105 signals
      for (let i = 1; i <= 105; i++) {
        appendSignal(
          createSignal({ signal_id: `default-page-${i}`, learner_reference: 'learner-F' }),
          `2026-01-30T10:00:${i.toString().padStart(2, '0')}Z`
        );
      }
      
      const request: SignalLogReadRequest = {
        org_id: 'test-org',
        learner_reference: 'learner-F',
        from_time: '2026-01-30T00:00:00Z',
        to_time: '2026-01-31T00:00:00Z',
        // page_size not provided
      };
      
      const result = querySignals(request);
      
      expect(result.signals.length).toBe(100);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should throw if store not initialized', () => {
      closeSignalLogStore();
      
      expect(() => appendSignal(createSignal(), '2026-01-30T10:00:00Z')).toThrow(
        'Signal Log store not initialized'
      );
    });

    it('should throw on query if not initialized', () => {
      closeSignalLogStore();
      
      const request: SignalLogReadRequest = {
        org_id: 'test-org',
        learner_reference: 'learner-123',
        from_time: '2026-01-30T00:00:00Z',
        to_time: '2026-01-31T00:00:00Z',
      };
      
      expect(() => querySignals(request)).toThrow(
        'Signal Log store not initialized'
      );
    });

    it('should throw on clear if not initialized', () => {
      closeSignalLogStore();
      
      expect(() => clearSignalLogStore()).toThrow(
        'Signal Log store not initialized'
      );
    });
  });

  describe('clearSignalLogStore', () => {
    it('should clear all entries', () => {
      appendSignal(createSignal({ signal_id: 'clear-1', learner_reference: 'learner-G' }), '2026-01-30T10:00:00Z');
      appendSignal(createSignal({ signal_id: 'clear-2', learner_reference: 'learner-G' }), '2026-01-30T10:00:00Z');

      clearSignalLogStore();

      const request: SignalLogReadRequest = {
        org_id: 'test-org',
        learner_reference: 'learner-G',
        from_time: '2026-01-30T00:00:00Z',
        to_time: '2026-01-31T00:00:00Z',
      };

      const result = querySignals(request);
      expect(result.signals).toEqual([]);
    });
  });

  describe('getSignalsByIds', () => {
    it('should return signals in accepted_at order', () => {
      appendSignal(createSignal({ signal_id: 'ids-a', learner_reference: 'learner-H' }), '2026-01-30T12:00:00Z');
      appendSignal(createSignal({ signal_id: 'ids-b', learner_reference: 'learner-H' }), '2026-01-30T10:00:00Z');
      appendSignal(createSignal({ signal_id: 'ids-c', learner_reference: 'learner-H' }), '2026-01-30T11:00:00Z');

      const result = getSignalsByIds('test-org', ['ids-a', 'ids-b', 'ids-c']);

      expect(result.length).toBe(3);
      expect(result[0].signal_id).toBe('ids-b');
      expect(result[1].signal_id).toBe('ids-c');
      expect(result[2].signal_id).toBe('ids-a');
    });

    it('should return only requested signals in accepted_at order when request order differs', () => {
      appendSignal(createSignal({ signal_id: 'req-1', learner_reference: 'learner-I' }), '2026-01-30T10:00:00Z');
      appendSignal(createSignal({ signal_id: 'req-2', learner_reference: 'learner-I' }), '2026-01-30T11:00:00Z');

      const result = getSignalsByIds('test-org', ['req-2', 'req-1']);

      expect(result.length).toBe(2);
      expect(result[0].signal_id).toBe('req-1');
      expect(result[1].signal_id).toBe('req-2');
    });

    it('should return empty array for empty signal_ids', () => {
      const result = getSignalsByIds('test-org', []);
      expect(result).toEqual([]);
    });

    it('should throw unknown_signal_id when a signal ID is not found', () => {
      appendSignal(createSignal({ signal_id: 'known-1', learner_reference: 'learner-J' }), '2026-01-30T10:00:00Z');

      expect(() => getSignalsByIds('test-org', ['known-1', 'nonexistent-id'])).toThrow();
      try {
        getSignalsByIds('test-org', ['known-1', 'nonexistent-id']);
      } catch (err) {
        expect((err as Error & { code: string }).code).toBe('unknown_signal_id');
        expect((err as Error & { field_path?: string }).field_path).toBe('signal_ids');
      }
    });

    it('should throw unknown_signal_id when all signal IDs are unknown', () => {
      expect(() => getSignalsByIds('test-org', ['missing-1', 'missing-2'])).toThrow();
      try {
        getSignalsByIds('test-org', ['missing-1']);
      } catch (err) {
        expect((err as Error & { code: string }).code).toBe('unknown_signal_id');
      }
    });

    it('should return signals only for the requested org (org isolation)', () => {
      appendSignal(
        createSignal({ org_id: 'org-A', signal_id: 'iso-sig-1', learner_reference: 'learner-K' }),
        '2026-01-30T10:00:00Z'
      );
      const result = getSignalsByIds('org-A', ['iso-sig-1']);
      expect(result.length).toBe(1);
      expect(result[0].org_id).toBe('org-A');
      expect(result[0].signal_id).toBe('iso-sig-1');
      // Requesting same signal_id with different org yields signals_not_in_org_scope (no cross-org leak)
      expect(() => getSignalsByIds('org-B', ['iso-sig-1'])).toThrow();
      try {
        getSignalsByIds('org-B', ['iso-sig-1']);
      } catch (err) {
        expect((err as Error & { code: string }).code).toBe('signals_not_in_org_scope');
      }
    });

    it('should throw if store not initialized', () => {
      closeSignalLogStore();
      expect(() => getSignalsByIds('test-org', ['any-id'])).toThrow(
        'Signal Log store not initialized'
      );
    });

    it('should throw signals_not_in_org_scope for mixed batch with valid + cross-org signal', () => {
      // signal-A belongs to org-A, signal-B belongs to org-B
      appendSignal(
        createSignal({ org_id: 'org-A', signal_id: 'mix-a', learner_reference: 'learner-mix' }),
        '2026-01-30T10:00:00Z'
      );
      appendSignal(
        createSignal({ org_id: 'org-B', signal_id: 'mix-b', learner_reference: 'learner-mix' }),
        '2026-01-30T10:01:00Z'
      );

      // Request both as org-A — mix-b is cross-org
      expect(() => getSignalsByIds('org-A', ['mix-a', 'mix-b'])).toThrow();
      try {
        getSignalsByIds('org-A', ['mix-a', 'mix-b']);
      } catch (err) {
        expect((err as Error & { code: string }).code).toBe('signals_not_in_org_scope');
        expect((err as Error & { field_path?: string }).field_path).toBe('signal_ids');
      }
    });

    it('should throw unknown_signal_id when batch has both missing and cross-org signals (unknown takes precedence)', () => {
      // signal-A belongs to org-A, signal-B belongs to org-B
      appendSignal(
        createSignal({ org_id: 'org-A', signal_id: 'prio-a', learner_reference: 'learner-prio' }),
        '2026-01-30T10:00:00Z'
      );
      appendSignal(
        createSignal({ org_id: 'org-B', signal_id: 'prio-b', learner_reference: 'learner-prio' }),
        '2026-01-30T10:01:00Z'
      );

      // Request org-A with: valid (prio-a), cross-org (prio-b), truly missing (totally-missing)
      expect(() => getSignalsByIds('org-A', ['prio-a', 'prio-b', 'totally-missing'])).toThrow();
      try {
        getSignalsByIds('org-A', ['prio-a', 'prio-b', 'totally-missing']);
      } catch (err) {
        // unknown_signal_id takes precedence over signals_not_in_org_scope
        expect((err as Error & { code: string }).code).toBe('unknown_signal_id');
        expect((err as Error & { field_path?: string }).field_path).toBe('signal_ids');
      }
    });
  });
});
