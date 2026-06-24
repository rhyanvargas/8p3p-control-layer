import { describe, expect, it, vi } from 'vitest';

import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { commitSignals } from '@/lib/upload/commit';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

const envelope = {
  signal_id: 'sig-1',
  source_system: 'lms',
  learner_reference: 'learner-1',
  timestamp: '2026-06-01T12:00:00Z',
  schema_version: 'v1',
  payload: { score: 1 },
};

describe('UPL-COMMIT-001: per-row outcomes', () => {
  it('returns accepted and rejected rows with rejections list', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ signal_id: 'sig-1', status: 'accepted' })
      .mockResolvedValueOnce({ signal_id: 'sig-2', status: 'rejected', rejection_reason: { code: 'INVALID_FIELD' } });

    const summary = await commitSignals([
      { rowIndex: 0, envelope },
      { rowIndex: 1, envelope: { ...envelope, signal_id: 'sig-2' } },
    ]);

    expect(summary.accepted).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.results).toHaveLength(2);
    expect(summary.rejections).toHaveLength(1);
    expect(summary.rejections[0]?.signal_id).toBe('sig-2');
    expect(summary.rejections[0]?.rejection_reason?.code).toBe('INVALID_FIELD');
  });

  it('maps upstream 400 rejection body to rejected outcome', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiError('API error 400', 400, {
        signal_id: 'sig-bad',
        status: 'rejected',
        rejection_reason: { code: 'missing_required_field', field_path: 'timestamp' },
      })
    );

    const summary = await commitSignals([{ rowIndex: 0, envelope: { ...envelope, signal_id: 'sig-bad' } }]);

    expect(summary.rejected).toBe(1);
    expect(summary.rejections[0]?.rejection_reason).toEqual({
      code: 'missing_required_field',
      field_path: 'timestamp',
    });
  });

  it('reports progress as rows complete', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ signal_id: 'sig-1', status: 'accepted' });
    const progress: Array<[number, number]> = [];

    await commitSignals(
      [
        { rowIndex: 0, envelope },
        { rowIndex: 1, envelope: { ...envelope, signal_id: 'sig-2' } },
      ],
      { onProgress: (completed, total) => progress.push([completed, total]) }
    );

    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});

describe('UPL-COMMIT-002: duplicate on re-run', () => {
  it('maps duplicate status from upstream', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ signal_id: 'sig-1', status: 'duplicate' });
    const summary = await commitSignals([{ rowIndex: 0, envelope }]);
    expect(summary.duplicate).toBe(1);
    expect(summary.rejections).toHaveLength(0);
  });
});
