import { describe, expect, it } from 'vitest';

import type { IngestionLogEntry } from '@/lib/api/types';
import { ingestionLogEntryKey, ingestionLogRowIds } from '@/lib/ingestion-log';

function entry(overrides: Partial<IngestionLogEntry> = {}): IngestionLogEntry {
  return {
    signal_id: 'sam-canvas-ela-001',
    source_system: 'canvas-lms',
    learner_reference: 'stu-40123',
    timestamp: '2026-06-12T18:48:12.216Z',
    schema_version: 'v1',
    outcome: 'duplicate',
    received_at: '2026-06-12T18:48:12.216Z',
    rejection_reason: null,
    ...overrides,
  };
}

describe('ingestionLogEntryKey', () => {
  it('distinguishes duplicate attempts that share received_at', () => {
    const first = entry({ timestamp: '2026-06-12T18:48:12.216Z' });
    const second = entry({ timestamp: '2026-06-12T19:10:00.000Z' });

    expect(ingestionLogEntryKey(first)).not.toBe(ingestionLogEntryKey(second));
  });

  it('distinguishes rejected retries by field path', () => {
    const first = entry({
      outcome: 'rejected',
      rejection_reason: { code: 'INVALID_FIELD', field_path: 'payload.score' },
    });
    const second = entry({
      outcome: 'rejected',
      rejection_reason: { code: 'INVALID_FIELD', field_path: 'payload.skill' },
    });

    expect(ingestionLogEntryKey(first)).not.toBe(ingestionLogEntryKey(second));
  });
});

describe('ingestionLogRowIds', () => {
  it('suffixes identical entries from replayed payloads', () => {
    const duplicate = entry();
    const rowIds = ingestionLogRowIds([duplicate, duplicate]);

    expect(rowIds).toEqual([
      ingestionLogEntryKey(duplicate),
      `${ingestionLogEntryKey(duplicate)}~1`,
    ]);
  });
});
