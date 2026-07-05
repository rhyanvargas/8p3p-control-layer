import { getSessionReviewedIds } from '@/lib/decision-review';
import {
  readCsatFrequencyRecord,
  readCsatUploadTaskRecord,
  writeCsatFrequencyRecord,
  clearCsatUploadTaskRecord,
} from '@/lib/csat-storage';

const DEFAULT_CSAT_MIN_INTERVAL_DAYS = 7;
const DEFAULT_FEEDBACK_TASK_DECISION_THRESHOLD = 5;

export function isCsatPromptFeatureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEEDBACK_CSAT === 'true';
}

export function getCsatMinIntervalDays(): number {
  const raw = process.env.NEXT_PUBLIC_CSAT_MIN_INTERVAL_DAYS?.trim();
  if (!raw) return DEFAULT_CSAT_MIN_INTERVAL_DAYS;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CSAT_MIN_INTERVAL_DAYS;
}

export function getFeedbackTaskDecisionThreshold(): number {
  const raw = process.env.NEXT_PUBLIC_FEEDBACK_TASK_DECISION_THRESHOLD?.trim();
  if (!raw) return DEFAULT_FEEDBACK_TASK_DECISION_THRESHOLD;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FEEDBACK_TASK_DECISION_THRESHOLD;
}

function daysBetween(isoStart: string, isoEnd: string): number {
  const startMs = Date.parse(isoStart);
  const endMs = Date.parse(isoEnd);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return Number.POSITIVE_INFINITY;
  return (endMs - startMs) / (1000 * 60 * 60 * 24);
}

export function isCsatFrequencyCapActive(now = new Date()): boolean {
  const record = readCsatFrequencyRecord();
  if (!record) return false;
  const elapsedDays = daysBetween(record.lastShownAt, now.toISOString());
  return elapsedDays < getCsatMinIntervalDays();
}

export function isCsatTaskComplete(): boolean {
  const reviewCount = getSessionReviewedIds().length;
  if (reviewCount >= getFeedbackTaskDecisionThreshold()) return true;
  return readCsatUploadTaskRecord() !== null;
}

export function isCsatPromptEligible(now = new Date()): boolean {
  if (!isCsatPromptFeatureEnabled()) return false;
  if (isCsatFrequencyCapActive(now)) return false;
  return isCsatTaskComplete();
}

/** Dismissal or successful submit counts as "asked" for the frequency cap. */
export function markCsatPromptShown(now = new Date()): void {
  writeCsatFrequencyRecord({ lastShownAt: now.toISOString() });
  clearCsatUploadTaskRecord();
}
