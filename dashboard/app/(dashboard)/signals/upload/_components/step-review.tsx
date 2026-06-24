'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { commitSignals } from '@/lib/upload/commit';
import type { CommitSummary, PreflightResult, RowValidationResult } from '@/lib/upload/types';

function formatCommitToast(summary: CommitSummary): string {
  const parts = [
    summary.accepted > 0 ? `${summary.accepted} accepted` : null,
    summary.duplicate > 0 ? `${summary.duplicate} duplicate` : null,
    summary.rejected > 0 ? `${summary.rejected} rejected` : null,
  ].filter(Boolean);
  return parts.length > 0 ? `Commit complete: ${parts.join(', ')}` : 'Commit complete';
}

type StepReviewProps = {
  validCount: number;
  invalidCount: number;
  validRows: RowValidationResult[];
  preflight: PreflightResult | null;
  committing: boolean;
  onBack: () => void;
  onCommitStart: () => void;
  onCommitEnd: () => void;
  onCommitted: (summary: CommitSummary) => void;
};

export function StepReview({
  validCount,
  invalidCount,
  validRows,
  preflight,
  committing,
  onBack,
  onCommitStart,
  onCommitEnd,
  onCommitted,
}: StepReviewProps) {
  const [progress, setProgress] = useState(0);

  async function handleCommit() {
    onCommitStart();
    setProgress(0);

    const rows = validRows
      .filter((r) => r.envelope)
      .map((r) => ({ rowIndex: r.rowIndex, envelope: r.envelope! }));

    try {
      const summary = await commitSignals(rows, {
        onProgress: (completed, total) => setProgress(Math.round((completed / total) * 100)),
      });
      toast.success(formatCommitToast(summary));
      onCommitted(summary);
    } catch {
      toast.error('Commit failed. Try again.');
      onCommitEnd();
    }
  }

  return (
    <fieldset disabled={committing} className="flex flex-col gap-4 border-0 p-0 m-0 min-w-0">
      <Alert>
        <AlertTitle>Confirm upload</AlertTitle>
        <AlertDescription>
          Review the summary below, then commit to write signals to the ingestion pipeline. This
          action cannot be undone from the wizard — verify outcomes on the ingestion log after
          upload.
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border p-4 text-sm">
        <p>
          <strong>{validCount}</strong> valid row{validCount === 1 ? '' : 's'} will be sent.
        </p>
        {invalidCount > 0 ? (
          <p className="text-muted-foreground mt-1">
            {invalidCount} invalid row{invalidCount === 1 ? '' : 's'} excluded from this commit.
          </p>
        ) : null}
        {preflight?.verdict ? (
          <p className="text-muted-foreground mt-1">
            Preflight verdict: {preflight.verdict.replace(/_/g, ' ')}
          </p>
        ) : null}
      </div>

      {committing ? (
        <div className="flex flex-col gap-2" role="status" aria-live="polite">
          <Progress value={progress} aria-label="Commit progress" />
          <p className="text-muted-foreground text-sm">Committing signals… {progress}%</p>
        </div>
      ) : null}

      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={() => void handleCommit()} disabled={validCount === 0}>
          Commit {validCount} signal{validCount === 1 ? '' : 's'}
        </Button>
      </div>
    </fieldset>
  );
}
