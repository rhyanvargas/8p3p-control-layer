'use client';

import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

import { IngestionOutcomeChip } from '@/components/shared/ingestion-outcome-chip';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useIngestionLog } from '@/hooks/use-ingestion-log';
import type { IngestionLogEntry, IngestionOutcome } from '@/lib/api/types';
import { ingestionLogEntryKey } from '@/lib/ingestion-log';
import { formatDecisionTime } from '@/lib/overview-metrics';
import { cn } from '@/lib/utils';

type IngestionLogProps = {
  orgId: string;
};

type OutcomeFilter = 'all' | IngestionOutcome;

const OUTCOME_FILTER_OPTIONS: { value: OutcomeFilter; label: string }[] = [
  { value: 'all', label: 'All outcomes' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'rejected', label: 'Rejected' },
];

export function IngestionLog({ orgId }: IngestionLogProps) {
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const outcome = outcomeFilter === 'all' ? undefined : outcomeFilter;

  const { data, isLoading, isError, error, refetch } = useIngestionLog(orgId, {
    outcome,
    cursor,
  });

  function handleOutcomeFilterChange(value: OutcomeFilter) {
    setOutcomeFilter(value);
    setCursor(null);
    setCursorStack([]);
    setExpandedIds(new Set());
  }

  function toggleExpanded(rowId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }

  function handleNextPage() {
    if (!data?.next_cursor) return;
    setCursorStack((stack) => [...stack, cursor]);
    setCursor(data.next_cursor);
    setExpandedIds(new Set());
  }

  function handlePrevPage() {
    if (cursorStack.length === 0) return;
    const previousCursor = cursorStack[cursorStack.length - 1] ?? null;
    setCursorStack((stack) => stack.slice(0, -1));
    setCursor(previousCursor);
    setExpandedIds(new Set());
  }

  if (isLoading) {
    return <LoadingState variant="table" count={10} />;
  }

  if (isError) {
    return <ErrorState error={error} onRetry={() => void refetch()} />;
  }

  const entries = data?.entries ?? [];
  const pageNumber = cursorStack.length + 1;
  const hasPreviousPage = cursorStack.length > 0;
  const hasNextPage = Boolean(data?.next_cursor);

  return (
    <section aria-label="Ingestion log" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="org-context" className="text-xs">
            Organization
          </Label>
          <p
            id="org-context"
            className="bg-muted text-muted-foreground rounded-md px-3 py-2 font-mono text-xs"
          >
            {orgId}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="outcome-filter" className="text-xs">
            Outcome
          </Label>
          <Select
            value={outcomeFilter}
            onValueChange={(value) => handleOutcomeFilterChange(value as OutcomeFilter)}
          >
            <SelectTrigger id="outcome-filter" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTCOME_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border-border rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" aria-hidden="true" />
              <TableHead>Time</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Schema</TableHead>
              <TableHead>Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length > 0 ? (
              entries.map((entry) => {
                const rowId = ingestionLogEntryKey(entry);
                const isRejected = entry.outcome === 'rejected';
                const isExpanded = expandedIds.has(rowId);

                return (
                  <IngestionLogRow
                    key={rowId}
                    entry={entry}
                    isRejected={isRejected}
                    isExpanded={isExpanded}
                    onToggle={() => toggleExpanded(rowId)}
                  />
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState message="No ingestion events match the current filter." />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {entries.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            Page {pageNumber} · {entries.length} entr
            {entries.length === 1 ? 'y' : 'ies'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={!hasPreviousPage}
              aria-label="Previous page"
            >
              <ChevronLeft aria-hidden="true" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={!hasNextPage}
              aria-label="Next page"
            >
              Next
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type IngestionLogRowProps = {
  entry: IngestionLogEntry;
  isRejected: boolean;
  isExpanded: boolean;
  onToggle: () => void;
};

function IngestionLogRow({
  entry,
  isRejected,
  isExpanded,
  onToggle,
}: IngestionLogRowProps) {
  const rowId = ingestionLogEntryKey(entry);

  return (
    <>
      <TableRow
        className={cn(isRejected && 'cursor-pointer')}
        tabIndex={isRejected ? 0 : undefined}
        aria-expanded={isRejected ? isExpanded : undefined}
        onClick={isRejected ? onToggle : undefined}
        onKeyDown={
          isRejected
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onToggle();
                }
              }
            : undefined
        }
        role={isRejected ? 'button' : undefined}
      >
        <TableCell className="w-10 p-2">
          {isRejected ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7"
              aria-label={isExpanded ? 'Collapse rejection details' : 'Expand rejection details'}
              aria-expanded={isExpanded}
              aria-controls={`${rowId}-details`}
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
            >
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  'size-4 transition-transform',
                  isExpanded ? 'rotate-180' : 'rotate-0'
                )}
              />
            </Button>
          ) : null}
        </TableCell>
        <TableCell>{formatDecisionTime(entry.received_at)}</TableCell>
        <TableCell className="font-medium">{entry.source_system}</TableCell>
        <TableCell>
          <span className="text-muted-foreground font-mono text-xs">
            {entry.schema_version}
          </span>
        </TableCell>
        <TableCell>
          <IngestionOutcomeChip outcome={entry.outcome} />
        </TableCell>
      </TableRow>

      {isRejected && isExpanded ? (
        <TableRow id={`${rowId}-details`} className="bg-muted/40 hover:bg-muted/40">
          <TableCell colSpan={5} className="p-0">
            <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:gap-8">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Reason code
                </span>
                <span className="font-mono text-sm">
                  {entry.rejection_reason?.code ?? '—'}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Field path
                </span>
                <span className="font-mono text-sm">
                  {entry.rejection_reason?.field_path ?? '—'}
                </span>
              </div>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
