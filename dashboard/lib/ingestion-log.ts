import type { IngestionLogEntry } from '@/lib/api/types';

/** Stable list key — duplicate outcomes reuse the original signal's received_at. */
export function ingestionLogEntryKey(entry: IngestionLogEntry): string {
  const rejectionCode = entry.rejection_reason?.code ?? '';
  return `${entry.signal_id}-${entry.received_at}-${entry.outcome}-${rejectionCode}`;
}
