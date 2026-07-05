/** Versioned localStorage keys for CSAT prompt eligibility — see docs/specs/customer-feedback-loop.md */

export const CSAT_FREQUENCY_STORAGE_KEY = 'feedback:csat:v1';
export const CSAT_UPLOAD_TASK_STORAGE_KEY = 'feedback:csat:upload:v1';

export type CsatFrequencyRecord = {
  lastShownAt: string;
};

export type CsatUploadTaskRecord = {
  completedAt: string;
};

export function readCsatFrequencyRecord(): CsatFrequencyRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CSAT_FREQUENCY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const lastShownAt = (parsed as { lastShownAt?: unknown }).lastShownAt;
    if (typeof lastShownAt !== 'string' || lastShownAt.length === 0) return null;
    return { lastShownAt };
  } catch {
    return null;
  }
}

export function writeCsatFrequencyRecord(record: CsatFrequencyRecord): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CSAT_FREQUENCY_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Private browsing, quota exceeded, or disabled storage — skip silently.
  }
}

export function readCsatUploadTaskRecord(): CsatUploadTaskRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CSAT_UPLOAD_TASK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const completedAt = (parsed as { completedAt?: unknown }).completedAt;
    if (typeof completedAt !== 'string' || completedAt.length === 0) return null;
    return { completedAt };
  } catch {
    return null;
  }
}

export function markUploadTaskComplete(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      CSAT_UPLOAD_TASK_STORAGE_KEY,
      JSON.stringify({ completedAt: new Date().toISOString() } satisfies CsatUploadTaskRecord)
    );
  } catch {
    // Ignore storage failures.
  }
}

export function clearCsatUploadTaskRecord(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CSAT_UPLOAD_TASK_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
