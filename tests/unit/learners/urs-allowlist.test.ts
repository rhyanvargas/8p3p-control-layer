import { describe, it, expect } from 'vitest';
import {
  URS_ALLOWED_BASE_KEYS,
  URS_ALLOWED_NUMERIC_BASE_KEYS,
  URS_COMPANION_SUFFIXES,
  isAllowedURSKey,
} from '../../../src/learners/urs-allowlist.js';

const FORBIDDEN_KEYS = [
  'generated',
  'group',
  'object',
  'extensions',
  'skills',
  'bb_action_name',
  'com_instructure_canvas',
  'email',
  'student_name',
  'address',
  'scoreGiven_delta_delta_delta',
  'masteryScore_delta_delta_delta_delta',
] as const;

describe('urs-allowlist', () => {
  describe('allowed base keys and companions', () => {
    for (const base of URS_ALLOWED_BASE_KEYS) {
      it(`allows base key "${base}"`, () => {
        expect(isAllowedURSKey(base)).toBe(true);
      });
    }

    for (const base of URS_ALLOWED_NUMERIC_BASE_KEYS) {
      for (const suffix of URS_COMPANION_SUFFIXES) {
        it(`allows numeric companion "${base}${suffix}"`, () => {
          expect(isAllowedURSKey(`${base}${suffix}`)).toBe(true);
        });
      }
    }

    it('rejects companion suffixes for non-numeric base keys', () => {
      for (const suffix of URS_COMPANION_SUFFIXES) {
        expect(isAllowedURSKey(`skill${suffix}`)).toBe(false);
      }
    });
  });

  describe('forbidden keys', () => {
    for (const key of FORBIDDEN_KEYS) {
      it(`rejects "${key}"`, () => {
        expect(isAllowedURSKey(key)).toBe(false);
      });
    }
  });
});
