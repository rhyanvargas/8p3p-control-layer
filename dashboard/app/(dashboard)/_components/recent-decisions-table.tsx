'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import { useOptionalOverviewFilter } from '@/app/(dashboard)/_components/overview-sync-provider';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { DecisionBadge } from '@/components/shared/decision-badge';
import { DetailSheet } from '@/components/shared/detail-sheet';
import { DrillDownLink } from '@/components/shared/drill-down-link';
import { SheetSection } from '@/components/shared/sheet-section';
import type { Decision, DecisionType } from '@/lib/api/types';
import { formatDecisionTime, truncateRule } from '@/lib/overview-metrics';

const DECISION_TYPE_LABELS: Record<DecisionType, string> = {
  reinforce: 'Reinforce',
  advance: 'Advance',
  intervene: 'Intervene',
  pause: 'Pause',
};

function humanizeDecisionType(type: DecisionType): string {
  return DECISION_TYPE_LABELS[type] ?? type;
}

function truncateSummary(text: string, max = 64): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function educatorNarrative(
  trace: Decision['trace'],
  decisionType: DecisionType
): string {
  const explanation = trace.educator_explanation?.trim();
  if (explanation) return explanation;
  const summary = trace.educator_summary?.trim();
  if (summary) return summary;
  return humanizeDecisionType(decisionType);
}

function hasActiveDecisionFilters(
  decisionType: DecisionType | null,
  learner: string | null
): boolean {
  return decisionType !== null || (learner !== null && learner.trim() !== '');
}

type RecentDecisionsTableProps = {
  decisions: Decision[];
};

export function RecentDecisionsTable({ decisions }: RecentDecisionsTableProps) {
  const sync = useOptionalOverviewFilter();
  const syncEnabled = sync?.syncEnabled ?? false;
  const [selected, setSelected] = useState<Decision | null>(null);

  const tableData = syncEnabled ? sync!.derived.filteredRecentDecisions : decisions;
  const learnerFilterValue = syncEnabled ? (sync!.filter.learner ?? '') : undefined;

  const subtitle =
    syncEnabled && hasActiveDecisionFilters(sync!.filter.decisionType, sync!.filter.learner)
      ? 'Matching decisions — click a row for a quick peek.'
      : 'Last 20 decisions — click a row for a quick peek.';

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
        accessorKey: 'learner_reference',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Learner" />
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.learner_reference}</span>
        ),
      },
      {
        id: 'summary',
        header: 'Summary',
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {truncateSummary(
              educatorNarrative(row.original.trace, row.original.decision_type)
            )}
          </span>
        ),
      },
    ],
    []
  );

  const rationaleExcerpt = selected?.trace.rationale
    ? selected.trace.rationale.length > 280
      ? `${selected.trace.rationale.slice(0, 279)}…`
      : selected.trace.rationale
    : 'No rationale text was provided for this decision.';

  function handleLearnerFilterChange(value: string) {
    sync!.setFilter((prev) => ({
      ...prev,
      learner: value.trim() === '' ? null : value,
    }));
  }

  return (
    <>
      <section aria-label="Recent decisions" className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium">Recent decisions</h2>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        </div>
        <DataTable
          columns={columns}
          data={tableData}
          filterColumn={syncEnabled ? undefined : 'learner_reference'}
          filterPlaceholder="Filter by learner…"
          filterValue={syncEnabled ? learnerFilterValue : undefined}
          onFilterChange={syncEnabled ? handleLearnerFilterChange : undefined}
          pageSize={10}
          showPagination={tableData.length > 10}
          getRowId={(row) => row.decision_id}
          onRowClick={setSelected}
          emptyMessage="No decisions recorded yet."
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
                  value: educatorNarrative(selected.trace, selected.decision_type),
                },
              ]}
            />
            <SheetSection
              title="Technical detail"
              fields={[
                {
                  label: 'Matched rule',
                  value: (
                    <span className="font-mono text-xs">
                      {truncateRule(selected.trace.matched_rule_id, 48)}
                    </span>
                  ),
                },
                {
                  label: 'Rationale excerpt',
                  value: (
                    <p className="font-mono text-sm leading-relaxed">
                      {rationaleExcerpt}
                    </p>
                  ),
                },
              ]}
            />
          </>
        ) : null}
      </DetailSheet>
    </>
  );
}
