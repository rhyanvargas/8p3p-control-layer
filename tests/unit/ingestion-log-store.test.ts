/**
 * Unit tests for Ingestion Log Store
 * Append-only storage for ingestion outcomes (accepted, rejected, duplicate)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initIngestionLogStore,
  closeIngestionLogStore,
  appendIngestionOutcome,
  getIngestionOutcomes,
  clearIngestionLogStore,
} from '../../src/ingestion/ingestion-log-store.js';
import type { IngestionOutcomeEntry } from '../../src/shared/types.js';

function createEntry(overrides: Partial<IngestionOutcomeEntry> = {}): IngestionOutcomeEntry {
  return {
    org_id: 'test-org',
    signal_id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source_system: 'test-system',
    learner_reference: 'learner-1',
    timestamp: '2026-02-01T10:00:00Z',
    schema_version: 'v1',
    outcome: 'accepted',
    received_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Ingestion Log Store', () => {
  beforeEach(() => {
    initIngestionLogStore(':memory:');
  });

  afterEach(() => {
    closeIngestionLogStore();
  });

  describe('appendIngestionOutcome and getIngestionOutcomes', () => {
    it('should append and retrieve accepted outcome', () => {
      const entry = createEntry({ outcome: 'accepted' });
      appendIngestionOutcome(entry);

      const { entries } = getIngestionOutcomes({ org_id: 'test-org' });
      expect(entries).toHaveLength(1);
      expect(entries[0].outcome).toBe('accepted');
      expect(entries[0].signal_id).toBe(entry.signal_id);
      expect(entries[0].rejection_reason).toBeNull();
    });

    it('should append and retrieve rejected outcome with rejection_reason', () => {
      const entry = createEntry({
        outcome: 'rejected',
        rejection_reason: {
          code: 'missing_required_field',
          message: 'org_id is required',
          field_path: 'org_id',
        },
      });
      appendIngestionOutcome(entry);

      const { entries } = getIngestionOutcomes({ org_id: 'test-org' });
      expect(entries).toHaveLength(1);
      expect(entries[0].outcome).toBe('rejected');
      expect(entries[0].rejection_reason).not.toBeNull();
      expect(entries[0].rejection_reason!.code).toBe('missing_required_field');
    });

    it('should append and retrieve duplicate outcome', () => {
      const entry = createEntry({ outcome: 'duplicate' });
      appendIngestionOutcome(entry);

      const { entries } = getIngestionOutcomes({ org_id: 'test-org' });
      expect(entries).toHaveLength(1);
      expect(entries[0].outcome).toBe('duplicate');
    });

    it('should return entries in descending order (most recent first)', async () => {
      const t1 = createEntry({ signal_id: 'sig-1', received_at: '2026-02-01T10:00:00Z' });
      const t2 = createEntry({ signal_id: 'sig-2', received_at: '2026-02-01T10:01:00Z' });
      const t3 = createEntry({ signal_id: 'sig-3', received_at: '2026-02-01T10:02:00Z' });

      appendIngestionOutcome(t1);
      appendIngestionOutcome(t2);
      appendIngestionOutcome(t3);

      const { entries } = getIngestionOutcomes({ org_id: 'test-org' });
      expect(entries).toHaveLength(3);
      expect(entries[0].signal_id).toBe('sig-3');
      expect(entries[1].signal_id).toBe('sig-2');
      expect(entries[2].signal_id).toBe('sig-1');
    });

    it('should filter by outcome when outcome param provided', () => {
      appendIngestionOutcome(createEntry({ outcome: 'accepted', signal_id: 'a1' }));
      appendIngestionOutcome(createEntry({ outcome: 'rejected', signal_id: 'r1' }));
      appendIngestionOutcome(createEntry({ outcome: 'accepted', signal_id: 'a2' }));

      const { entries } = getIngestionOutcomes({ org_id: 'test-org', outcome: 'accepted' });
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.outcome === 'accepted')).toBe(true);
    });

    it('should respect limit', () => {
      for (let i = 0; i < 10; i++) {
        appendIngestionOutcome(createEntry({ signal_id: `sig-${i}` }));
      }

      const { entries } = getIngestionOutcomes({ org_id: 'test-org', limit: 3 });
      expect(entries).toHaveLength(3);
    });

    it('should return next_cursor when more results exist', () => {
      for (let i = 0; i < 5; i++) {
        appendIngestionOutcome(createEntry({ signal_id: `sig-${i}` }));
      }

      const { entries, nextCursor } = getIngestionOutcomes({ org_id: 'test-org', limit: 2 });
      expect(entries).toHaveLength(2);
      expect(nextCursor).not.toBeNull();

      const page2 = getIngestionOutcomes({ org_id: 'test-org', limit: 2, cursor: nextCursor! });
      expect(page2.entries).toHaveLength(2);
      expect(page2.entries[0].signal_id).not.toBe(entries[0].signal_id);
    });

    it('should enforce org isolation', () => {
      appendIngestionOutcome(createEntry({ org_id: 'org-a', signal_id: 'sig-a' }));
      appendIngestionOutcome(createEntry({ org_id: 'org-b', signal_id: 'sig-b' }));

      const { entries } = getIngestionOutcomes({ org_id: 'org-a' });
      expect(entries).toHaveLength(1);
      expect(entries[0].signal_id).toBe('sig-a');
    });
  });

  describe('clearIngestionLogStore', () => {
    it('should clear all entries', () => {
      appendIngestionOutcome(createEntry());
      clearIngestionLogStore();

      const { entries } = getIngestionOutcomes({ org_id: 'test-org' });
      expect(entries).toHaveLength(0);
    });
  });
});
