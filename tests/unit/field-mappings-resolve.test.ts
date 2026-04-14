/**
 * Unit tests for tenant field mapping file resolution (v1 + v2) and transform pipeline.
 * @see src/config/tenant-field-mappings.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  setTenantFieldMappings,
  getTenantPayloadMapping,
  normalizeAndValidateTenantPayload,
  type TenantFieldMappingsConfigV1,
  type TenantFieldMappingsConfigV2,
} from '../../src/config/tenant-field-mappings.js';

beforeEach(() => {
  setTenantFieldMappings(null);
});

// ---------------------------------------------------------------------------
// File config resolution — v1 shape
// ---------------------------------------------------------------------------

describe('getTenantPayloadMapping — v1 file shape', () => {
  it('returns null when no config is loaded', () => {
    expect(getTenantPayloadMapping('org-A')).toBeNull();
  });

  it('returns mapping for known org', () => {
    const config: TenantFieldMappingsConfigV1 = {
      version: 1,
      tenants: { 'org-A': { payload: { required: ['stabilityScore'] } } },
    };
    setTenantFieldMappings(config);
    const m = getTenantPayloadMapping('org-A');
    expect(m?.required).toEqual(['stabilityScore']);
  });

  it('returns null for unknown org', () => {
    const config: TenantFieldMappingsConfigV1 = {
      version: 1,
      tenants: { 'org-A': { payload: { required: ['stabilityScore'] } } },
    };
    setTenantFieldMappings(config);
    expect(getTenantPayloadMapping('unknown-org')).toBeNull();
  });

  it('v1 mapping applies regardless of source_system argument', () => {
    const config: TenantFieldMappingsConfigV1 = {
      version: 1,
      tenants: { 'org-A': { payload: { required: ['stabilityScore'] } } },
    };
    setTenantFieldMappings(config);
    expect(getTenantPayloadMapping('org-A', 'canvas-lms')).not.toBeNull();
    expect(getTenantPayloadMapping('org-A', 'other-system')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// File config resolution — v2 shape
// ---------------------------------------------------------------------------

describe('getTenantPayloadMapping — v2 file shape', () => {
  const config: TenantFieldMappingsConfigV2 = {
    version: 2,
    tenants: {
      'org-A': {
        'canvas-lms': { payload: { required: ['stabilityScore'] } },
        'blackboard': { payload: { required: ['masteryScore'] } },
      },
    },
  };

  beforeEach(() => setTenantFieldMappings(config));

  it('returns mapping for matching source_system', () => {
    const m = getTenantPayloadMapping('org-A', 'canvas-lms');
    expect(m?.required).toEqual(['stabilityScore']);
  });

  it('returns different mapping for a different source_system', () => {
    const m = getTenantPayloadMapping('org-A', 'blackboard');
    expect(m?.required).toEqual(['masteryScore']);
  });

  it('returns null for an unknown source_system in v2', () => {
    expect(getTenantPayloadMapping('org-A', 'unknown-system')).toBeNull();
  });

  it('returns null when no source_system arg provided in v2', () => {
    expect(getTenantPayloadMapping('org-A')).toBeNull();
  });

  it('returns null for unknown org', () => {
    expect(getTenantPayloadMapping('unknown-org', 'canvas-lms')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Transforms in normalizeAndValidateTenantPayload
// ---------------------------------------------------------------------------

describe('normalizeAndValidateTenantPayload — transforms', () => {
  it('evaluates transform and writes to target (value/100)', () => {
    const result = normalizeAndValidateTenantPayload({
      orgId: 'org-A',
      payload: { raw_score: 65 },
      mappingOverride: {
        transforms: [{ target: 'stabilityScore', source: 'raw_score', expression: 'value / 100' }],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.stabilityScore).toBeCloseTo(0.65);
    }
  });

  it('applies transform after alias (alias provides source field)', () => {
    const result = normalizeAndValidateTenantPayload({
      orgId: 'org-A',
      payload: { grade: 80 },
      mappingOverride: {
        aliases: { raw_score: ['grade'] },
        transforms: [{ target: 'stabilityScore', source: 'raw_score', expression: 'value / 100' }],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.raw_score).toBe(80);
      expect(result.payload.stabilityScore).toBeCloseTo(0.8);
    }
  });

  it('skips transform when source is missing (strict_transforms=false)', () => {
    const result = normalizeAndValidateTenantPayload({
      orgId: 'org-A',
      payload: { other_field: 1 },
      mappingOverride: {
        strict_transforms: false,
        transforms: [{ target: 'stabilityScore', source: 'raw_score', expression: 'value / 100' }],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.stabilityScore).toBeUndefined();
    }
  });

  it('rejects when source is missing and strict_transforms=true', () => {
    const result = normalizeAndValidateTenantPayload({
      orgId: 'org-A',
      payload: { other_field: 1 },
      mappingOverride: {
        strict_transforms: true,
        transforms: [{ target: 'stabilityScore', source: 'raw_score', expression: 'value / 100' }],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.code).toBe('missing_required_field');
    }
  });

  it('runs transforms before required check — transform-produced field satisfies required', () => {
    const result = normalizeAndValidateTenantPayload({
      orgId: 'org-A',
      payload: { raw_score: 65 },
      mappingOverride: {
        required: ['stabilityScore'],
        transforms: [{ target: 'stabilityScore', source: 'raw_score', expression: 'value / 100' }],
      },
    });
    expect(result.ok).toBe(true);
  });

  it('reads dot-path source', () => {
    const result = normalizeAndValidateTenantPayload({
      orgId: 'org-A',
      payload: { submission: { score: 70 } },
      mappingOverride: {
        transforms: [{ target: 'stabilityScore', source: 'submission.score', expression: 'value / 100' }],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.stabilityScore).toBeCloseTo(0.7);
    }
  });

  it('Math.min clamp in transform', () => {
    const result = normalizeAndValidateTenantPayload({
      orgId: 'org-A',
      payload: { raw_score: 150 },
      mappingOverride: {
        transforms: [{
          target: 'stabilityScore',
          source: 'raw_score',
          expression: 'Math.min(Math.max(value / 100, 0), 1)',
        }],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.stabilityScore).toBe(1);
    }
  });
});
