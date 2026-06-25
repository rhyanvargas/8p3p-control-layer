import type { IngestionLogEntry } from '@/lib/api/types';

/**
 * Stable list key for a single ingestion log entry.
 * Duplicate outcomes reuse the original signal's received_at, so timestamp (attempt time)
 * and rejection details are required for uniqueness.
 */
export function ingestionLogEntryKey(entry: IngestionLogEntry): string {
  const rejectionCode = entry.rejection_reason?.code ?? '';
  const fieldPath = entry.rejection_reason?.field_path ?? '';
  return `${entry.signal_id}-${entry.timestamp}-${entry.outcome}-${rejectionCode}-${fieldPath}`;
}

/** Row keys for a page of entries; suffixes collisions from replayed identical payloads. */
export function ingestionLogRowIds(entries: IngestionLogEntry[]): string[] {
  const seen = new Map<string, number>();

  return entries.map((entry) => {
    const base = ingestionLogEntryKey(entry);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return occurrence === 0 ? base : `${base}~${occurrence}`;
  });
}
