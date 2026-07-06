import { describe, it, expect } from 'vitest';
import { resolveIngestionEventTime } from '../../src/ingestion/event-time.js';

describe('resolveIngestionEventTime', () => {
  const receivedAt = '2026-07-06T12:00:00Z';

  it('uses a valid RFC3339 signal timestamp', () => {
    expect(resolveIngestionEventTime('2026-03-15T09:00:00Z', receivedAt)).toBe('2026-03-15T09:00:00Z');
  });

  it('falls back to receivedAt when timestamp is invalid', () => {
    expect(resolveIngestionEventTime('not-a-date', receivedAt)).toBe(receivedAt);
    expect(resolveIngestionEventTime('', receivedAt)).toBe(receivedAt);
  });
});
