'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { DecisionBadge } from '@/components/shared/decision-badge';
import { DetailSheet } from '@/components/shared/detail-sheet';
import { DrillDownLink } from '@/components/shared/drill-down-link';
import { SheetSection } from '@/components/shared/sheet-section';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDecisions } from '@/hooks/use-decisions';
import type { Decision } from '@/lib/api/types';
import {
  buildRationaleExcerpt,
  filterDecisionsByTimeRange,
  sortDecisionsNewestFirst,
  type DecisionTimeRangeDays,
} from '@/lib/decision-trace';
import { formatDecisionTime, truncateRule } from '@/lib/overview-metrics';

type DecisionsStreamProps = {
  orgId: string;
};

const TIME_RANGE_OPTIONS: { value: DecisionTimeRangeDays; label: string }[] = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 365, label: 'All (12 months)' },
];

export function DecisionsStream({ orgId }: DecisionsStreamProps) {
  const [selected, setSelected] = useState<Decision | null>(null);
  const [timeRange, setTimeRange] = useState<DecisionTimeRangeDays>(30);

  const { data, isLoading, isError, error, refetch } = useDecisions(orgId);

  const rows = useMemo(() => {
    const filtered = filterDecisionsByTimeRange(data ?? [], timeRange);
    return sortDecisionsNewestFirst(filtered);
  }, [data, timeRange]);

  const columns = useMemo<ColumnDef<Decision>[]>(
    () => [
      {
        accessorKey: 'decided_at',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Time" />
        ),
        cell: ({ row }) => formatDecisionTime(row.original.decided_at),
      },
      {
        accessorKey: 'decision_type',
        header: 'Type',
        cell: ({ row }) => <DecisionBadge type={row.original.decision_type} />,
      },
      {
        id: 'rule',
        header: 'Rule',
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs">
            {truncateRule(row.original.trace.matched_rule_id)}
          </span>
        ),
      },
      {
        accessorKey: 'learner_reference',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Learner" />
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.learner_reference}</span>
        ),
      },
    ],
    []
  );

  const rationaleExcerpt = selected
    ? buildRationaleExcerpt(selected.trace.rationale)
    : '';

  if (isLoading) {
    return <LoadingState variant="table" count={10} />;
  }

  if (isError) {
    return <ErrorState error={error} onRetry={() => void refetch()} />;
  }

  return (
    <>
      <section aria-label="Decision stream" className="flex flex-col gap-4">
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
            <Label htmlFor="time-range-filter" className="text-xs">
              Time range
            </Label>
            <Select
              value={String(timeRange)}
              onValueChange={(value) =>
                setTimeRange(Number(value) as DecisionTimeRangeDays)
              }
            >
              <SelectTrigger id="time-range-filter" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={rows}
          filterColumn="learner_reference"
          filterPlaceholder="Filter by learner…"
          pageSize={15}
          showPagination={rows.length > 15}
          getRowId={(row) => row.decision_id}
          onRowClick={setSelected}
          emptyMessage="No decisions match the current filters."
        />
      </section>

      <DetailSheet
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={
          selected ? (
            <span className="flex flex-wrap items-center gap-2">
              <DecisionBadge type={selected.decision_type} />
              <span className="font-mono text-sm">{selected.learner_reference}</span>
            </span>
          ) : undefined
        }
        description={
          selected ? formatDecisionTime(selected.decided_at) : undefined
        }
        footer={
          selected ? (
            <DrillDownLink
              href={`/decisions/${encodeURIComponent(selected.decision_id)}`}
              label="Open trace"
            />
          ) : undefined
        }
      >
        {selected ? (
          <>
            <SheetSection
              title="Summary"
              fields={[
                {
                  label: 'Educator summary',
                  value:
                    selected.trace.educator_summary ||
                    'No educator summary was provided.',
                },
                {
                  label: 'Rule',
                  value: truncateRule(selected.trace.matched_rule_id, 48),
                },
                {
                  label: 'Policy',
                  value: selected.trace.policy_version || '—',
                },
              ]}
            />
            <SheetSection title="Rationale excerpt">
              <p className="font-mono text-sm leading-relaxed">{rationaleExcerpt}</p>
            </SheetSection>
          </>
        ) : null}
      </DetailSheet>
    </>
  );
}
