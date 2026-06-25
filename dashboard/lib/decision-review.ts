import { toast } from 'sonner';

const LEGACY_KEY = '8p3p-reviewed-decisions';
const V1_KEY = '8p3p-review-log:v1';

export type ReviewAction = 'approve' | 'reject';

export type DecisionReviewDecisionType = 'intervene' | 'pause';

export interface DecisionReviewRecord {
  decisionId: string;
  action: ReviewAction;
  learnerReference: string;
  decisionType: DecisionReviewDecisionType;
  educatorSummary?: string;
  reviewedAt: string;
  feedbackId?: string;
  source: 'local' | 'api' | 'legacy';
}

/** Session-only fallback when localStorage is unavailable or quota is exceeded. */
const sessionReviewedIds = new Set<string>();
let storagePersistEnabled = true;
let legacyMigrationDone = false;

const reviewLogListeners = new Set<() => void>();

function notifyReviewLogListeners(): void {
  for (const listener of reviewLogListeners) {
    listener();
  }
}

/** Subscribe to client review log writes (Phase 3 KPI + cross-route sync). */
export function subscribeReviewLog(onStoreChange: () => void): () => void {
  reviewLogListeners.add(onStoreChange);
  return () => {
    reviewLogListeners.delete(onStoreChange);
  };
}

function localDateString(date: Date): string {
  return date.toLocaleDateString('en-CA');
}

function syncSessionIds(records: DecisionReviewRecord[]): void {
  sessionReviewedIds.clear();
  for (const record of records) {
    sessionReviewedIds.add(record.decisionId);
  }
}

function migrateLegacyIfNeeded(): void {
  if (legacyMigrationDone || typeof window === 'undefined') return;
  legacyMigrationDone = true;

  try {
    if (localStorage.getItem(V1_KEY)) return;

    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return;

    const ids = JSON.parse(legacyRaw) as unknown;
    if (!Array.isArray(ids)) {
      localStorage.removeItem(LEGACY_KEY);
      return;
    }

    const migrationTimestamp = new Date().toISOString();
    const records: DecisionReviewRecord[] = ids
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .map((decisionId) => ({
        decisionId,
        action: 'approve' as const,
        learnerReference: '',
        decisionType: 'intervene' as const,
        reviewedAt: migrationTimestamp,
        source: 'legacy' as const,
      }));

    writeRecords(records, { suppressQuotaToast: true });
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Ignore corrupt legacy payloads.
  }
}

function readRecords(): DecisionReviewRecord[] {
  migrateLegacyIfNeeded();

  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(V1_KEY);
    if (!raw) {
      syncSessionIds([]);
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      syncSessionIds([]);
      return [];
    }
    const records = parsed as DecisionReviewRecord[];
    syncSessionIds(records);
    return records;
  } catch {
    syncSessionIds([]);
    return [];
  }
}

function writeRecords(
  records: DecisionReviewRecord[],
  options?: { suppressQuotaToast?: boolean }
): void {
  syncSessionIds(records);
  notifyReviewLogListeners();

  if (typeof window === 'undefined' || !storagePersistEnabled) {
    return;
  }

  try {
    localStorage.setItem(V1_KEY, JSON.stringify(records));
  } catch {
    storagePersistEnabled = false;
    if (!options?.suppressQuotaToast) {
      toast.warning(
        'Review history could not be saved locally. Queue updates will apply for this session only.'
      );
    }
  }
}

export function recordReview(record: DecisionReviewRecord): void {
  const records = readRecords().filter((existing) => existing.decisionId !== record.decisionId);
  records.push(record);
  writeRecords(records);
  sessionReviewedIds.add(record.decisionId);
}

/** Merge API persistence fields onto an existing optimistic review record. */
export function updateReviewFromApi(
  decisionId: string,
  apiFields: { feedbackId: string; reviewedAt: string }
): void {
  const existing = readRecords().find((record) => record.decisionId === decisionId);
  if (!existing) return;

  recordReview({
    ...existing,
    feedbackId: apiFields.feedbackId,
    reviewedAt: apiFields.reviewedAt,
    source: 'api',
  });
}

export function undoReview(decisionId: string): void {
  const records = readRecords().filter((record) => record.decisionId !== decisionId);
  writeRecords(records);
  sessionReviewedIds.delete(decisionId);
}

export function listRecentReviews(limit = 10): DecisionReviewRecord[] {
  return readRecords()
    .toSorted((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
    .slice(0, limit);
}

export function countReviewedToday(): number {
  const today = localDateString(new Date());
  return readRecords().filter(
    (record) => localDateString(new Date(record.reviewedAt)) === today
  ).length;
}

export function isReviewedLocally(decisionId: string): boolean {
  if (sessionReviewedIds.has(decisionId)) {
    return true;
  }
  return readRecords().some((record) => record.decisionId === decisionId);
}

export function getSessionReviewedIds(): string[] {
  return readRecords().map((record) => record.decisionId);
}

/** Stable empty set for SSR snapshots and useSyncExternalStore server fallbacks. */
export const EMPTY_SESSION_REVIEWED_IDS = new Set<string>();

/**
 * Stable snapshot of session-reviewed decision IDs for useSyncExternalStore.
 * Must return the same Set reference until the review log changes.
 */
export function getSessionReviewedIdSet(): Set<string> {
  if (typeof window === 'undefined') {
    return EMPTY_SESSION_REVIEWED_IDS;
  }
  readRecords();
  return sessionReviewedIds;
}

export function getReviewRecord(decisionId: string): DecisionReviewRecord | undefined {
  return readRecords().find((record) => record.decisionId === decisionId);
}

/** @deprecated Use recordReview via executeReviewAction */
export function markReviewed(decisionId: string): void {
  recordReview({
    decisionId,
    action: 'approve',
    learnerReference: '',
    decisionType: 'intervene',
    reviewedAt: new Date().toISOString(),
    source: 'local',
  });
}

/** @deprecated Use isReviewedLocally */
export function isReviewed(decisionId: string): boolean {
  return isReviewedLocally(decisionId);
}
