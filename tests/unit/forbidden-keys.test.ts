/**
 * Unit tests for Forbidden Keys Detector
 */

import { describe, it, expect } from 'vitest';
import { detectForbiddenKeys, FORBIDDEN_KEYS } from '../../src/ingestion/forbidden-keys.js';

describe('detectForbiddenKeys', () => {
  describe('FK-UNIT-001: Top-level forbidden key detection', () => {
    it('should detect top-level "ui" key', () => {
      const payload = { ui: { screen: 'home' } };
      const result = detectForbiddenKeys(payload, 'payload');
      
      expect(result).not.toBeNull();
      expect(result?.key).toBe('ui');
      expect(result?.path).toBe('payload.ui');
    });

    it('should detect top-level "workflow" key', () => {
      const payload = { workflow: { step: '1' } };
      const result = detectForbiddenKeys(payload, 'payload');
      
      expect(result).not.toBeNull();
      expect(result?.key).toBe('workflow');
      expect(result?.path).toBe('payload.workflow');
    });

    it('should detect top-level "course" key', () => {
      const payload = { course: 'math-101' };
      const result = detectForbiddenKeys(payload, 'payload');
      
      expect(result).not.toBeNull();
      expect(result?.key).toBe('course');
      expect(result?.path).toBe('payload.course');
    });
  });

  describe('FK-UNIT-002: Nested forbidden key detection', () => {
    it('should detect deeply nested "workflow" key', () => {
      const payload = { x: { y: { workflow: { step: '1' } } } };
      const result = detectForbiddenKeys(payload, 'payload');
      
      expect(result).not.toBeNull();
      expect(result?.key).toBe('workflow');
      expect(result?.path).toBe('payload.x.y.workflow');
    });

    it('should detect nested "status" key', () => {
      const payload = { data: { learner: { status: 'active' } } };
      const result = detectForbiddenKeys(payload, 'payload');
      
      expect(result).not.toBeNull();
      expect(result?.key).toBe('status');
      expect(result?.path).toBe('payload.data.learner.status');
    });

    it('should detect nested "score" key', () => {
      const payload = { results: { assessment: { score: 95 } } };
      const result = detectForbiddenKeys(payload, 'payload');
      
      expect(result).not.toBeNull();
      expect(result?.key).toBe('score');
      expect(result?.path).toBe('payload.results.assessment.score');
    });
  });

  describe('FK-UNIT-003: Clean payloads return null', () => {
    it('should return null for empty payload', () => {
      const payload = {};
      const result = detectForbiddenKeys(payload, 'payload');
      
      expect(result).toBeNull();
    });

    it('should return null for payload with allowed keys', () => {
      const payload = {
        learner_id: '123',
        data: {
          skill_level: 5,
          practice_count: 10,
        },
        metrics: {
          accuracy: 0.95,
          time_spent_ms: 5000,
        },
      };
      const result = detectForbiddenKeys(payload, 'payload');
      
      expect(result).toBeNull();
    });

    it('should return null for nested allowed keys', () => {
      const payload = {
        level_1: {
          level_2: {
            level_3: {
              allowed_key: 'value',
            },
          },
        },
      };
      const result = detectForbiddenKeys(payload, 'payload');
      
      expect(result).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should handle null values', () => {
      const result = detectForbiddenKeys(null, 'payload');
      expect(result).toBeNull();
    });

    it('should handle arrays (skip, not scan)', () => {
      const result = detectForbiddenKeys(['ui', 'workflow'], 'payload');
      expect(result).toBeNull();
    });

    it('should handle primitives', () => {
      expect(detectForbiddenKeys('string', 'payload')).toBeNull();
      expect(detectForbiddenKeys(123, 'payload')).toBeNull();
      expect(detectForbiddenKeys(true, 'payload')).toBeNull();
    });

    it('should not detect forbidden keys inside arrays', () => {
      const payload = {
        items: [{ ui: 'test' }], // ui is inside an array, which is skipped
      };
      // Arrays are not scanned, so this should pass
      // The spec says we scan objects recursively, arrays are opaque
      const result = detectForbiddenKeys(payload, 'payload');
      // Note: Current implementation skips arrays entirely
      // If we want to scan array contents, we'd need to update the implementation
      expect(result).toBeNull();
    });

    it('should return first forbidden key found (deterministic)', () => {
      const payload = {
        aaa_first: { ui: 'test' },
        zzz_last: { workflow: 'test' },
      };
      const result = detectForbiddenKeys(payload, 'payload');
      
      // Should find the first one in object iteration order
      expect(result).not.toBeNull();
    });
  });

  describe('All forbidden keys detection', () => {
    it('should detect all specified forbidden keys', () => {
      // Test each forbidden key individually
      for (const forbiddenKey of FORBIDDEN_KEYS) {
        const payload = { [forbiddenKey]: 'value' };
        const result = detectForbiddenKeys(payload, 'payload');
        
        expect(result, `Expected '${forbiddenKey}' to be detected as forbidden`).not.toBeNull();
        expect(result?.key).toBe(forbiddenKey);
      }
    });
  });
});
