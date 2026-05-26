/**
 * Unit tests for mapping suggestions catalog (ingestion preflight).
 */

import { describe, it, expect } from 'vitest';
import {
  MAPPING_SUGGESTIONS_CATALOG,
  findMappingSuggestions,
} from '../../src/ingestion/mapping-suggestions-catalog.js';

describe('MAPPING_SUGGESTIONS_CATALOG', () => {
  it('contains exactly five v1 seed entries', () => {
    expect(MAPPING_SUGGESTIONS_CATALOG).toHaveLength(5);
    expect(MAPPING_SUGGESTIONS_CATALOG.map((s) => s.raw_key).sort()).toEqual([
      'completion',
      'grade',
      'progress_percent',
      'score',
      'status',
    ]);
  });

  it('status entry has null suggested_canonical and universal scope', () => {
    const status = MAPPING_SUGGESTIONS_CATALOG.find((s) => s.raw_key === 'status');
    expect(status).toMatchObject({
      suggested_canonical: null,
      applies_to_source_systems: '*',
      rationale: 'No suggestion — operator must decide semantic meaning',
    });
  });
});

describe('findMappingSuggestions', () => {
  it('returns canvas-lms score suggestion when source_system is set', () => {
    const hits = findMappingSuggestions('score', 'canvas-lms');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      raw_key: 'score',
      suggested_canonical: 'masteryScore',
      applies_to_source_systems: ['canvas-lms'],
    });
  });

  it('returns no suggestion for score when source_system is null', () => {
    expect(findMappingSuggestions('score', null)).toEqual([]);
  });

  it('returns no suggestion for score on non-matching source_system', () => {
    expect(findMappingSuggestions('score', 'i-ready')).toEqual([]);
  });

  it('returns progress_percent for i-ready and branching-minds', () => {
    expect(findMappingSuggestions('progress_percent', 'i-ready')).toHaveLength(1);
    expect(findMappingSuggestions('progress_percent', 'branching-minds')).toHaveLength(
      1
    );
    expect(findMappingSuggestions('progress_percent', 'canvas-lms')).toEqual([]);
  });

  it('returns status entry for any source_system including null', () => {
    expect(findMappingSuggestions('status', null)).toHaveLength(1);
    expect(findMappingSuggestions('status', 'canvas-lms')[0]?.suggested_canonical).toBe(
      null
    );
  });

  it('returns empty array for keys with no catalog entry', () => {
    expect(findMappingSuggestions('workflow', 'canvas-lms')).toEqual([]);
    expect(findMappingSuggestions('unknown_key', null)).toEqual([]);
  });
});
