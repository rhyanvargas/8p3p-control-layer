'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { IngestionOutcomeChip } from '@/components/shared/ingestion-outcome-chip';
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
import { useIngestionLog } from '@/hooks/use-ingestion-log';
import type { IngestionLogEntry, IngestionOutcome } from '@/lib/api/types';
import { ingestionLogRowIds } from '@/lib/ingestion-log';
import { formatDecisionTime } from '@/lib/overview-metrics';
import { cn } from '@/lib/utils';

type IngestionLogProps = {
  orgId: string;
};

type OutcomeFilter = 'all' | IngestionOutcome;

type IngestionLogRow = IngestionLogEntry & { rowId: string };

const OUTCOME_FILTER_OPTIONS: { value: OutcomeFilter; label: string }[] = [
  { value: 'all', label: 'All outcomes' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'rejected', label: 'Rejected' },
];

const INGESTION_INITIAL_SORTING = [{ id: 'received_at', desc: true }] as const;

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

  const entries = data?.entries ?? [];
  const rows = useMemo<IngestionLogRow[]>(() => {
    const rowIds = ingestionLogRowIds(entries);
    return entries.map((entry, index) => ({
      ...entry,
      rowId: rowIds[index]!,
    }));
  }, [entries]);

  const columns = useMemo<ColumnDef<IngestionLogRow>[]>(
    () => [
      {
        id: 'expand',
        header: () => <span className="sr-only">Expand</span>,
        enableSorting: false,
        enableHiding: false,
        size: 40,
        cell: ({ row }) => {
          const entry = row.original;
          if (entry.outcome !== 'rejected') {
            return null;
          }
          const isExpanded = expandedIds.has(entry.rowId);
          return (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7"
              aria-label={
                isExpanded ? 'Collapse rejection details' : 'Expand rejection details'
              }
              aria-expanded={isExpanded}
              aria-controls={`${entry.rowId}-details`}
              onClick={(event) => {
                event.stopPropagation();
                toggleExpanded(entry.rowId);
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
          );
        },
      },
      {
        accessorKey: 'received_at',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Time" />
        ),
        cell: ({ row }) => formatDecisionTime(row.original.received_at),
        enableHiding: false,
      },
      {
        accessorKey: 'source_system',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Source" />
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.source_system}</span>
        ),
        enableHiding: false,
      },
      {
        accessorKey: 'schema_version',
        header: 'Schema',
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs">
            {row.original.schema_version}
          </span>
        ),
        enableHiding: false,
      },
      {
        accessorKey: 'outcome',
        header: 'Outcome',
        cell: ({ row }) => (
          <IngestionOutcomeChip outcome={row.original.outcome} />
        ),
        enableHiding: false,
      },
    ],
    [expandedIds]
  );

  if (isLoading) {
    return <LoadingState variant="table" count={10} />;
  }

  if (isError) {
    return <ErrorState error={error} onRetry={() => void refetch()} />;
  }

  const pageNumber = cursorStack.length + 1;
  const hasPreviousPage = cursorStack.length > 0;
  const hasNextPage = Boolean(data?.next_cursor);

  const facetToolbar = (
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
          onValueChange={(value) =>
            handleOutcomeFilterChange(value as OutcomeFilter)
          }
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
  );

  return (
    <section aria-label="Ingestion log" className="flex flex-col gap-4">
      <DataTable
        columns={columns}
        data={rows}
        filterColumn="source_system"
        filterPlaceholder="Filter by source…"
        pageSize={10}
        showPagination={rows.length > 10}
        getRowId={(row) => row.rowId}
        initialSorting={[...INGESTION_INITIAL_SORTING]}
        toolbar={facetToolbar}
        emptyMessage="No ingestion events match the current filter."
        onRowClick={(row) => {
          if (row.outcome === 'rejected') {
            toggleExpanded(row.rowId);
          }
        }}
        renderSubRow={(row) => {
          if (row.outcome !== 'rejected' || !expandedIds.has(row.rowId)) {
            return null;
          }
          return (
            <div
              id={`${row.rowId}-details`}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:gap-8"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Reason code
                </span>
                <span className="font-mono text-sm">
                  {row.rejection_reason?.code ?? '—'}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Field path
                </span>
                <span className="font-mono text-sm">
                  {row.rejection_reason?.field_path ?? '—'}
                </span>
              </div>
            </div>
          );
        }}
      />

      {rows.length > 0 && (hasPreviousPage || hasNextPage) ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            Server page {pageNumber} · {rows.length} entr
            {rows.length === 1 ? 'y' : 'ies'}
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
