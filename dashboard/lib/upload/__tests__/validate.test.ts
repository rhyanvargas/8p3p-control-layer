import { describe, expect, it } from 'vitest';

import { validateRow } from '@/lib/upload/validate';

const validRow = {
  signal_id: 'signal-001',
  source_system: 'lms-demo',
  learner_reference: 'learner-1',
  timestamp: '2026-06-01T12:00:00Z',
  schema_version: 'v1',
  payload: { score: 0.8 },
};

describe('UPL-VAL-001: valid row passes', () => {
  it('accepts a well-formed envelope row', () => {
    const result = validateRow(validRow);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('UPL-VAL-002: bad signal_id charset', () => {
  it('rejects invalid signal_id with field_path', () => {
    const result = validateRow({ ...validRow, signal_id: 'bad id!' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field_path === 'signal_id')).toBe(true);
  });
});

describe('UPL-VAL-003: non-RFC3339 timestamp', () => {
  it('rejects timestamp without timezone', () => {
    const result = validateRow({ ...validRow, timestamp: '2026-06-01 12:00:00' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field_path === 'timestamp')).toBe(true);
  });
});

describe('UPL-VAL-004: schema_version pattern', () => {
  it('rejects schema_version not matching ^v[0-9]+$', () => {
    const result = validateRow({ ...validRow, schema_version: '1' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field_path === 'schema_version')).toBe(true);
  });
});
