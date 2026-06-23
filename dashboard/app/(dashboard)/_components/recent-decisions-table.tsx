'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { DecisionBadge } from '@/components/shared/decision-badge';
import { DetailSheet } from '@/components/shared/detail-sheet';
import { DrillDownLink } from '@/components/shared/drill-down-link';
import { SheetSection } from '@/components/shared/sheet-section';
import type { Decision } from '@/lib/api/types';
import { formatDecisionTime, truncateRule } from '@/lib/overview-metrics';

type RecentDecisionsTableProps = {
  decisions: Decision[];
};

export function RecentDecisionsTable({ decisions }: RecentDecisionsTableProps) {
  const [selected, setSelected] = useState<Decision | null>(null);

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
        id: 'rule',
        header: 'Rule',
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs">
            {truncateRule(row.original.trace.matched_rule_id)}
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

  return (
    <>
      <section aria-label="Recent decisions" className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium">Recent decisions</h2>
          <p className="text-muted-foreground text-sm">
            Last 20 decisions — click a row for a quick peek.
          </p>
        </div>
        <DataTable
          columns={columns}
          data={decisions}
          filterColumn="learner_reference"
          filterPlaceholder="Filter by learner…"
          pageSize={10}
          showPagination={decisions.length > 10}
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
                  value:
                    selected.trace.educator_summary ||
                    'No educator summary was provided.',
                },
                {
                  label: 'Rule',
                  value: truncateRule(selected.trace.matched_rule_id, 48),
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
