'use client';

import Link from 'next/link';
import Papa from 'papaparse';
import { CheckCircle2 } from 'lucide-react';

import { IngestionOutcomeChip } from '@/components/shared/ingestion-outcome-chip';
import { Button } from '@/components/ui/button';
import type { CommitSummary } from '@/lib/upload/types';

type StepDoneProps = {
  summary: CommitSummary;
  onRestart: () => void;
};

export function StepDone({ summary, onRestart }: StepDoneProps) {
  function downloadRejections() {
    if (summary.rejections.length === 0) return;
    const csv = Papa.unparse(
      summary.rejections.map((r) => ({
        signal_id: r.signal_id,
        code: r.rejection_reason?.code ?? '',
        field_path: r.rejection_reason?.field_path ?? '',
      }))
    );
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'commit-rejections.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="bg-[var(--status-advance)]/10 text-[var(--status-advance)] flex size-12 items-center justify-center rounded-full">
        <CheckCircle2 className="size-6" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold">Upload complete</h2>
      <p className="text-muted-foreground max-w-md text-sm">
        {summary.results.length} signal{summary.results.length === 1 ? '' : 's'} processed. Verify
        outcomes on the ingestion log.
      </p>
      <dl className="grid w-full max-w-md grid-cols-3 gap-3">
        {(['accepted', 'duplicate', 'rejected'] as const).map((outcome) => (
          <div
            key={outcome}
            className="flex flex-col items-center gap-2 rounded-lg border px-3 py-4"
          >
            <dt>
              <IngestionOutcomeChip outcome={outcome} />
            </dt>
            <dd className="text-2xl font-semibold tabular-nums">{summary[outcome]}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap justify-center gap-2">
        {summary.rejected > 0 ? (
          <Button type="button" variant="outline" size="sm" onClick={downloadRejections}>
            Download rejections
          </Button>
        ) : null}
        <Button render={<Link href="/signals" />} variant="outline" size="sm">
          View ingestion log
        </Button>
        <Button type="button" size="sm" onClick={onRestart}>
          Upload another file
        </Button>
      </div>
    </div>
  );
}
