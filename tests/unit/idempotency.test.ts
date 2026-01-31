/**
 * Unit tests for Idempotency Store
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initIdempotencyStore,
  closeIdempotencyStore,
  checkAndStore,
  clearIdempotencyStore,
} from '../../src/ingestion/idempotency.js';

describe('Idempotency Store', () => {
  beforeEach(() => {
    // Use in-memory SQLite for test isolation
    initIdempotencyStore(':memory:');
  });

  afterEach(() => {
    closeIdempotencyStore();
  });

  describe('ID-UNIT-001: First submission not duplicate', () => {
    it('should return isDuplicate=false for first submission', () => {
      const result = checkAndStore('org-1', 'signal-abc');
      
      expect(result.isDuplicate).toBe(false);
      expect(result.receivedAt).toBeDefined();
    });

    it('should store receivedAt timestamp for new signal', () => {
      const result = checkAndStore('org-1', 'signal-xyz');
      
      expect(result.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('ID-UNIT-002: Second submission is duplicate', () => {
    it('should return isDuplicate=true for duplicate submission', () => {
      // First submission
      const first = checkAndStore('org-1', 'signal-duplicate');
      expect(first.isDuplicate).toBe(false);
      
      // Second submission (same org_id + signal_id)
      const second = checkAndStore('org-1', 'signal-duplicate');
      expect(second.isDuplicate).toBe(true);
    });

    it('should return original receivedAt for duplicate', () => {
      const first = checkAndStore('org-1', 'signal-time-test');
      
      // Small delay to ensure different timestamp if not using original
      const second = checkAndStore('org-1', 'signal-time-test');
      
      expect(second.isDuplicate).toBe(true);
      expect(second.receivedAt).toBe(first.receivedAt);
    });

    it('should remain duplicate on third submission', () => {
      checkAndStore('org-1', 'signal-triple');
      checkAndStore('org-1', 'signal-triple');
      const third = checkAndStore('org-1', 'signal-triple');
      
      expect(third.isDuplicate).toBe(true);
    });
  });

  describe('ID-UNIT-003: Different org allows same signal_id', () => {
    it('should accept same signal_id from different orgs', () => {
      const org1Result = checkAndStore('org-1', 'shared-signal');
      const org2Result = checkAndStore('org-2', 'shared-signal');
      
      expect(org1Result.isDuplicate).toBe(false);
      expect(org2Result.isDuplicate).toBe(false);
    });

    it('should track duplicates per org', () => {
      // Org 1 sends signal twice
      checkAndStore('org-1', 'multi-org-signal');
      const org1Dup = checkAndStore('org-1', 'multi-org-signal');
      
      // Org 2 sends same signal (should be new for org-2)
      const org2First = checkAndStore('org-2', 'multi-org-signal');
      const org2Dup = checkAndStore('org-2', 'multi-org-signal');
      
      expect(org1Dup.isDuplicate).toBe(true);
      expect(org2First.isDuplicate).toBe(false);
      expect(org2Dup.isDuplicate).toBe(true);
    });
  });

  describe('Different signal_id in same org', () => {
    it('should accept different signal_ids from same org', () => {
      const result1 = checkAndStore('org-1', 'signal-a');
      const result2 = checkAndStore('org-1', 'signal-b');
      const result3 = checkAndStore('org-1', 'signal-c');
      
      expect(result1.isDuplicate).toBe(false);
      expect(result2.isDuplicate).toBe(false);
      expect(result3.isDuplicate).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should throw if store not initialized', () => {
      closeIdempotencyStore();
      
      expect(() => checkAndStore('org-1', 'signal-1')).toThrow(
        'Idempotency store not initialized'
      );
    });

    it('should throw on clear if not initialized', () => {
      closeIdempotencyStore();
      
      expect(() => clearIdempotencyStore()).toThrow(
        'Idempotency store not initialized'
      );
    });
  });

  describe('clearIdempotencyStore', () => {
    it('should clear all entries', () => {
      checkAndStore('org-1', 'signal-1');
      checkAndStore('org-1', 'signal-2');
      
      clearIdempotencyStore();
      
      // Should be able to insert same signals again
      const result1 = checkAndStore('org-1', 'signal-1');
      const result2 = checkAndStore('org-1', 'signal-2');
      
      expect(result1.isDuplicate).toBe(false);
      expect(result2.isDuplicate).toBe(false);
    });
  });
});
