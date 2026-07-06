/**
 * Resolve the event time for ingestion from a signal envelope timestamp.
 * Falls back to server receive time when the signal timestamp is missing or invalid.
 */
export function resolveIngestionEventTime(signalTimestamp: string, receivedAt: string): string {
  const RFC3339_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!RFC3339_REGEX.test(signalTimestamp)) {
    return receivedAt;
  }
  const date = new Date(signalTimestamp);
  if (Number.isNaN(date.getTime())) {
    return receivedAt;
  }
  return signalTimestamp;
}
