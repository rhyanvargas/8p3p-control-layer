'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { FileCheck, Upload } from 'lucide-react';

import { EmptyState } from '@/components/states/empty-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { parseFile } from '@/lib/upload/parse';
import type { ParsedTable } from '@/lib/upload/types';
import { UploadParseError } from '@/lib/upload/types';
import { cn } from '@/lib/utils';

type StepUploadProps = {
  parsedTable?: ParsedTable | null;
  fileName?: string | null;
  onParsed: (table: ParsedTable, fileName: string) => void;
  onContinue?: () => void;
  onClear?: () => void;
};

export function StepUpload({
  parsedTable,
  fileName: persistedFileName,
  onParsed,
  onContinue,
  onClear,
}: StepUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setParsing(true);
      setActiveFileName(file.name);
      try {
        const table = await parseFile(file);
        onParsed(table, file.name);
      } catch (err) {
        setError(err instanceof UploadParseError ? err.message : 'Failed to parse file.');
        setActiveFileName(null);
      } finally {
        setParsing(false);
      }
    },
    [onParsed]
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (parsing) return;
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function handleClear() {
    setError(null);
    setActiveFileName(null);
    onClear?.();
    inputRef.current?.focus();
  }

  const displayFileName = persistedFileName ?? activeFileName;

  if (parsedTable && !parsing) {
    return (
      <div className="flex flex-col gap-4">
        <div
          className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-[var(--status-advance)]/30 bg-[var(--status-advance)]/5 p-8"
          role="status"
          aria-label="File parsed successfully"
        >
          <div className="bg-[var(--status-advance)]/10 text-[var(--status-advance)] flex size-10 items-center justify-center rounded-full">
            <FileCheck className="size-5" aria-hidden="true" />
          </div>
          <div className="text-center">
            <p className="font-medium">File ready</p>
            <p className="text-muted-foreground text-sm">
              {parsedTable.rows.length} row{parsedTable.rows.length === 1 ? '' : 's'} ·{' '}
              {parsedTable.columns.length} column{parsedTable.columns.length === 1 ? '' : 's'} ·{' '}
              {parsedTable.sourceFormat.toUpperCase()}
              {displayFileName ? ` · ${displayFileName}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={onContinue}>
              Continue to Map
            </Button>
            <Button type="button" variant="outline" onClick={handleClear}>
              Upload different file
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor={inputId}
        className={cn(
          'flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors outline-none focus-within:ring-2 focus-within:ring-ring',
          parsing && 'pointer-events-none opacity-70',
          dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'
        )}
        aria-busy={parsing}
        onDragOver={(e) => {
          e.preventDefault();
          if (!parsing) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept=".json,.csv,.xlsx,.xls"
          className="sr-only"
          disabled={parsing}
          aria-label="Choose a JSON, CSV, or Excel file to upload"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
        {parsing ? (
          <>
            <Progress value={50} className="w-48" aria-label="Parsing file" />
            <p className="text-muted-foreground text-sm">
              Parsing {activeFileName ?? 'file'}…
            </p>
          </>
        ) : (
          <EmptyState
            icon={Upload}
            message="Drop a .json, .csv, or .xlsx file here, or click to browse."
          />
        )}
      </label>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not parse file</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
