'use client';

import { useCallback, useMemo, useState } from 'react';

import { StepDone } from '@/app/(dashboard)/signals/upload/_components/step-done';
import { StepMap } from '@/app/(dashboard)/signals/upload/_components/step-map';
import { StepReview } from '@/app/(dashboard)/signals/upload/_components/step-review';
import { StepUpload } from '@/app/(dashboard)/signals/upload/_components/step-upload';
import { StepValidate } from '@/app/(dashboard)/signals/upload/_components/step-validate';
import { Progress } from '@/components/ui/progress';
import { applyMapping, autoMap } from '@/lib/upload/mapping';
import type {
  CommitSummary,
  FieldMapping,
  ParsedTable,
  PreflightResult,
  RowValidationResult,
} from '@/lib/upload/types';
const STEPS = ['Upload', 'Map', 'Validate', 'Review', 'Done'] as const;

export function UploadWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const [parsed, setParsed] = useState<ParsedTable | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>(() => ({ payloadColumns: [] }));
  const [defaults, setDefaults] = useState({ source_system: '', schema_version: 'v1' });
  const [validationResults, setValidationResults] = useState<RowValidationResult[]>([]);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [commitSummary, setCommitSummary] = useState<CommitSummary | null>(null);
  const [committing, setCommitting] = useState(false);

  const currentStep = STEPS[stepIndex]!;
  const progressValue = ((stepIndex + 1) / STEPS.length) * 100;

  const mappedRows = useMemo(() => {
    if (!parsed) return [];
    return applyMapping(parsed, mapping, defaults);
  }, [parsed, mapping, defaults]);

  const validRows = useMemo(
    () => validationResults.filter((r) => r.valid && r.envelope),
    [validationResults]
  );

  const handleParsed = useCallback((table: ParsedTable, name: string) => {
    setParsed(table);
    setFileName(name);
    setMapping(autoMap(table.columns));
    setValidationResults([]);
    setPreflight(null);
    setCommitSummary(null);
    setStepIndex(1);
  }, []);

  function clearUpload() {
    setParsed(null);
    setFileName(null);
    setMapping({ payloadColumns: [] });
  }

  function goBack() {
    if (committing) return;
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function handleMapNext() {
    setValidationResults([]);
    setPreflight(null);
    setStepIndex(2);
  }

  function handleValidateNext(preflightResult: PreflightResult | null) {
    setPreflight(preflightResult);
    setStepIndex(3);
  }

  function handleCommitted(summary: CommitSummary) {
    setCommitSummary(summary);
    setCommitting(false);
    setStepIndex(4);
  }

  return (
    <div className="flex flex-col gap-6" aria-busy={committing}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            Step {stepIndex + 1} of {STEPS.length}: {currentStep}
          </span>
          <span className="text-muted-foreground">{Math.round(progressValue)}%</span>
        </div>
        <Progress value={progressValue} aria-label="Upload progress" />
        <ol className="text-muted-foreground flex flex-wrap gap-2 text-xs">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className={index <= stepIndex ? 'text-foreground font-medium' : undefined}
            >
              {step}
              {index < STEPS.length - 1 ? ' →' : ''}
            </li>
          ))}
        </ol>
      </div>

      {currentStep === 'Upload' ? (
        <StepUpload
          parsedTable={parsed}
          fileName={fileName}
          onParsed={handleParsed}
          onContinue={() => setStepIndex(1)}
          onClear={clearUpload}
        />
      ) : null}

      {currentStep === 'Map' && parsed ? (
        <StepMap
          table={parsed}
          mapping={mapping}
          defaults={defaults}
          onMappingChange={setMapping}
          onDefaultsChange={setDefaults}
          onBack={goBack}
          onNext={handleMapNext}
        />
      ) : null}

      {currentStep === 'Validate' ? (
        <StepValidate
          mappedRows={mappedRows}
          onResultsChange={setValidationResults}
          onBack={goBack}
          onNext={handleValidateNext}
        />
      ) : null}

      {currentStep === 'Review' ? (
        <StepReview
          validCount={validRows.length}
          invalidCount={validationResults.length - validRows.length}
          validRows={validRows}
          preflight={preflight}
          committing={committing}
          onBack={goBack}
          onCommitStart={() => setCommitting(true)}
          onCommitEnd={() => setCommitting(false)}
          onCommitted={handleCommitted}
        />
      ) : null}

      {currentStep === 'Done' && commitSummary ? (
        <StepDone summary={commitSummary} onRestart={() => {
          setStepIndex(0);
          clearUpload();
          setValidationResults([]);
          setPreflight(null);
          setCommitSummary(null);
        }} />
      ) : null}
    </div>
  );
}
