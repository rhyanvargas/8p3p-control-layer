'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';

import { IngestionOutcomeChip } from '@/components/shared/ingestion-outcome-chip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { runPreflightSample } from '@/lib/upload/preflight';
import type { PreflightResult, RowValidationResult } from '@/lib/upload/types';
import { validateRow } from '@/lib/upload/validate';

type RowDisplayState = {
  status: 'pending' | 'validating' | 'accepted' | 'rejected';
  result?: RowValidationResult;
};

type StepValidateProps = {
  mappedRows: Record<string, unknown>[];
  onResultsChange: (results: RowValidationResult[]) => void;
  onBack: () => void;
  onNext: (preflight: PreflightResult | null) => void;
};

function formatVerdict(verdict: string): string {
  return verdict.replace(/_/g, ' ');
}

export function StepValidate({ mappedRows, onResultsChange, onBack, onNext }: StepValidateProps) {
  const [rowStates, setRowStates] = useState<RowDisplayState[]>([]);
  const [validating, setValidating] = useState(true);
  const [validationProgress, setValidationProgress] = useState(0);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [loadingPreflight, setLoadingPreflight] = useState(false);

  const results = useMemo(
    () => rowStates.map((s) => s.result).filter((r): r is RowValidationResult => r != null),
    [rowStates]
  );

  const valid = useMemo(() => results.filter((r) => r.valid), [results]);
  const invalid = useMemo(() => results.filter((r) => !r.valid), [results]);

  useEffect(() => {
    let cancelled = false;

    async function validateAll() {
      setValidating(true);
      setValidationProgress(0);
      setPreflight(null);
      setLoadingPreflight(false);
      setRowStates(mappedRows.map(() => ({ status: 'pending' as const })));

      if (mappedRows.length === 0) {
        onResultsChange([]);
        setValidating(false);
        setPreflight({ disabled: true });
        return;
      }

      const collected: RowValidationResult[] = new Array(mappedRows.length);

      for (let i = 0; i < mappedRows.length; i++) {
        if (cancelled) return;

        setRowStates((prev) => {
          const next = [...prev];
          next[i] = { status: 'validating' };
          return next;
        });

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });

        const result = validateRow(mappedRows[i]!, i);
        collected[i] = result;

        setRowStates((prev) => {
          const next = [...prev];
          next[i] = {
            status: result.valid ? 'accepted' : 'rejected',
            result,
          };
          return next;
        });
        setValidationProgress(Math.round(((i + 1) / mappedRows.length) * 100));
      }

      if (cancelled) return;

      onResultsChange(collected);
      setValidating(false);

      const samples = collected
        .filter((r) => r.valid && r.envelope)
        .slice(0, 3)
        .map((r) => ({
          source_system: String(r.envelope!.source_system),
          payload: r.envelope!.payload,
        }))
        .filter((s) => s.source_system);

      if (samples.length === 0) {
        setPreflight({ disabled: true });
        return;
      }

      setLoadingPreflight(true);
      try {
        const result = await runPreflightSample(samples);
        if (!cancelled) setPreflight(result);
      } catch {
        if (!cancelled) setPreflight(null);
      } finally {
        if (!cancelled) setLoadingPreflight(false);
      }
    }

    void validateAll();

    return () => {
      cancelled = true;
    };
  }, [mappedRows, onResultsChange]);

  const piiBlocking = preflight?.verdict === 'pii_blocking';
  const canProceed = !validating && !loadingPreflight && !piiBlocking && valid.length > 0;

  function downloadRejections() {
    const rows = invalid.flatMap((r) =>
      r.errors.map((e) => ({
        row: r.rowIndex + 1,
        field_path: e.field_path,
        code: e.code,
        message: e.message,
      }))
    );
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'validation-rejections.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderRowStatus(state: RowDisplayState) {
    if (state.status === 'pending' || state.status === 'validating') {
      return (
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Validating…
        </span>
      );
    }

    if (state.status === 'accepted') {
      return <IngestionOutcomeChip outcome="accepted" />;
    }

    return <IngestionOutcomeChip outcome="rejected" />;
  }

  return (
    <div className="flex flex-col gap-4">
      {validating ? (
        <div className="flex flex-col gap-2">
          <Progress value={validationProgress} aria-label="Row validation progress" />
          <p className="text-muted-foreground text-sm">
            Validating rows… {validationProgress}%
          </p>
        </div>
      ) : null}

      {loadingPreflight ? (
        <div className="flex items-center gap-2 text-sm">
          <Progress value={66} className="flex-1" aria-label="Running preflight dry-run" />
          <span className="text-muted-foreground">Running dry-run…</span>
        </div>
      ) : null}

      {preflight?.disabled ? (
        <Alert>
          <AlertDescription>
            Server preflight is disabled (no admin key). Client-side validation only.
          </AlertDescription>
        </Alert>
      ) : null}

      {preflight?.verdict && preflight.verdict !== 'clean' ? (
        <Alert variant={piiBlocking ? 'destructive' : 'default'}>
          <AlertTitle>Preflight: {formatVerdict(preflight.verdict)}</AlertTitle>
          <AlertDescription>
            {preflight.note ??
              `${preflight.forbidden_pii?.length ?? 0} PII hit(s), ${preflight.forbidden_semantic_raw?.length ?? 0} semantic hit(s).`}
            {piiBlocking ? ' Commit is blocked until PII is removed from the payload.' : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {preflight?.mapping_suggestions && preflight.mapping_suggestions.length > 0 ? (
        <Alert>
          <AlertTitle>Mapping suggestions</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
              {preflight.mapping_suggestions.map((suggestion) => (
                <li key={`${suggestion.raw_path}-${suggestion.suggested_canonical ?? 'none'}`}>
                  <span className="font-mono">{suggestion.raw_path}</span>
                  {suggestion.suggested_canonical ? (
                    <>
                      {' → '}
                      <span className="font-mono">{suggestion.suggested_canonical}</span>
                    </>
                  ) : null}
                  {suggestion.rationale ? `: ${suggestion.rationale}` : null}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {!validating ? (
        <div className="text-muted-foreground text-sm">
          {valid.length} valid · {invalid.length} invalid (of {mappedRows.length} rows)
        </div>
      ) : null}

      <div className="max-h-80 overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80">
            <tr className="border-b">
              <th className="px-3 py-2 text-left">Row</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Details</th>
            </tr>
          </thead>
          <tbody>
            {rowStates.map((state, index) => {
              const row = state.result;
              const isInvalid = state.status === 'rejected';

              return (
                <tr
                  key={index}
                  className="border-b last:border-0"
                  data-invalid={isInvalid ? 'true' : undefined}
                >
                  <td className="px-3 py-2 tabular-nums">{index + 1}</td>
                  <td className="px-3 py-2">{renderRowStatus(state)}</td>
                  <td className="px-3 py-2">
                    {row && row.errors.length > 0 ? (
                      <ul className="space-y-1">
                        {row.errors.map((err) => (
                          <li key={`${err.field_path}-${err.code}`}>
                            <Alert
                              variant="destructive"
                              className="py-2"
                              aria-invalid="true"
                              data-invalid="true"
                            >
                              <AlertDescription className="text-xs">
                                <span className="font-mono">{err.field_path}</span>: {err.message}
                              </AlertDescription>
                            </Alert>
                          </li>
                        ))}
                      </ul>
                    ) : state.status === 'accepted' ? (
                      <span className="text-muted-foreground text-xs">Ready to commit</span>
                    ) : state.status === 'pending' || state.status === 'validating' ? (
                      <span className="text-muted-foreground text-xs">Checking fields…</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!validating && invalid.length > 0 ? (
        <Button type="button" variant="outline" size="sm" onClick={downloadRejections}>
          Download rejections
        </Button>
      ) : null}

      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={validating}>
          Back
        </Button>
        <Button
          type="button"
          onClick={() => onNext(preflight)}
          disabled={!canProceed}
        >
          Next: Review
        </Button>
      </div>
    </div>
  );
}
