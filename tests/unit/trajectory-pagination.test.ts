/**
 * Unit tests for trajectory page_token encode/decode helpers.
 * Covers round-trip and malformed input cases (UNIT-PAGE-01, UNIT-PAGE-02).
 */

import { describe, it, expect } from 'vitest';
import {
  encodeTrajectoryPageToken,
  decodeTrajectoryPageToken,
} from '../../src/state/trajectory-pagination.js';

describe('trajectory-pagination', () => {
  describe('encodeTrajectoryPageToken / decodeTrajectoryPageToken round-trip', () => {
    it('round-trips version 0', () => {
      const token = encodeTrajectoryPageToken(0);
      expect(decodeTrajectoryPageToken(token)).toBe(0);
    });

    it('round-trips a typical cursor version', () => {
      const token = encodeTrajectoryPageToken(42);
      expect(decodeTrajectoryPageToken(token)).toBe(42);
    });

    it('round-trips a large version number', () => {
      const token = encodeTrajectoryPageToken(999999);
      expect(decodeTrajectoryPageToken(token)).toBe(999999);
    });

    it('produces a base64url string without padding characters', () => {
      const token = encodeTrajectoryPageToken(5);
      expect(token).not.toContain('+');
      expect(token).not.toContain('/');
    });
  });

  describe('decodeTrajectoryPageToken returns null on malformed input', () => {
    it('returns null for empty string', () => {
      expect(decodeTrajectoryPageToken('')).toBeNull();
    });

    it('returns null for random non-base64 garbage', () => {
      expect(decodeTrajectoryPageToken('!!!not-valid!!!')).toBeNull();
    });

    it('returns null for base64 content missing v1: prefix', () => {
      const noPrefix = Buffer.from('42').toString('base64url');
      expect(decodeTrajectoryPageToken(noPrefix)).toBeNull();
    });

    it('returns null for v1: prefix with non-numeric suffix', () => {
      const badSuffix = Buffer.from('v1:abc').toString('base64url');
      expect(decodeTrajectoryPageToken(badSuffix)).toBeNull();
    });

    it('returns null for v1: prefix with negative number', () => {
      const negative = Buffer.from('v1:-5').toString('base64url');
      expect(decodeTrajectoryPageToken(negative)).toBeNull();
    });

    it('returns null for v1: prefix with NaN', () => {
      const nan = Buffer.from('v1:NaN').toString('base64url');
      expect(decodeTrajectoryPageToken(nan)).toBeNull();
    });

    it('returns null for base64 of an empty v1: value', () => {
      const empty = Buffer.from('v1:').toString('base64url');
      expect(decodeTrajectoryPageToken(empty)).toBeNull();
    });
  });
});
