import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { CommitRowResult, CommitSummary, SignalEnvelopeFields } from '@/lib/upload/types';

type SignalIngestResponse = {
  signal_id: string;
  status: 'accepted' | 'rejected' | 'duplicate';
  rejection_reason?: { code: string; field_path?: string; message?: string };
};

function parseIngestError(
  err: unknown,
  fallbackSignalId: string
): CommitRowResult {
  let code = 'commit_failed';
  let fieldPath: string | undefined;
  let signalId = fallbackSignalId;

  if (err instanceof ApiError) {
    const body = err.body;
    if (typeof body === 'object' && body !== null) {
      const ingest = body as Partial<SignalIngestResponse>;
      if (typeof ingest.signal_id === 'string') {
        signalId = ingest.signal_id;
      }
      if (ingest.status === 'rejected' && ingest.rejection_reason) {
        code = ingest.rejection_reason.code ?? code;
        fieldPath = ingest.rejection_reason.field_path;
      } else if (
        'error' in body &&
        typeof (body as { error: unknown }).error === 'object' &&
        (body as { error: { code?: string; field_path?: string } }).error
      ) {
        const errorObj = (body as { error: { code?: string; field_path?: string } }).error;
        code = errorObj.code ?? code;
        fieldPath = errorObj.field_path;
      } else if ('code' in body && typeof (body as { code: unknown }).code === 'string') {
        code = (body as { code: string }).code;
        const rawFieldPath = (body as { field_path?: unknown }).field_path;
        fieldPath = typeof rawFieldPath === 'string' ? rawFieldPath : undefined;
      }
    }
  }

  return {
    rowIndex: -1,
    signal_id: signalId,
    outcome: 'rejected',
    rejection_reason: { code, field_path: fieldPath },
  };
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]!, index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function commitSignals(
  rows: Array<{ rowIndex: number; envelope: SignalEnvelopeFields }>,
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<CommitSummary> {
  const { concurrency = 5, onProgress } = options;
  let completed = 0;

  const results = await runWithConcurrency(rows, concurrency, async ({ rowIndex, envelope }) => {
    let outcome: CommitRowResult;
    try {
      const response = await apiFetch<SignalIngestResponse>('/v1/signals', {
        method: 'POST',
        body: JSON.stringify(envelope),
      });
      outcome = {
        rowIndex,
        signal_id: response.signal_id,
        outcome: response.status,
        rejection_reason: response.rejection_reason
          ? {
              code: response.rejection_reason.code,
              field_path: response.rejection_reason.field_path,
            }
          : undefined,
      };
    } catch (err) {
      const parsed = parseIngestError(err, envelope.signal_id);
      outcome = { ...parsed, rowIndex };
    }

    completed += 1;
    onProgress?.(completed, rows.length);
    return outcome;
  });

  const summary: CommitSummary = {
    accepted: 0,
    rejected: 0,
    duplicate: 0,
    results,
    rejections: [],
  };

  for (const result of results) {
    summary[result.outcome] += 1;
    if (result.outcome === 'rejected') {
      summary.rejections.push(result);
    }
  }

  return summary;
}
