'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import { createRowActionsColumn } from '@/components/data-table/create-row-actions-column';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { DecisionBadge } from '@/components/shared/decision-badge';
import { UrgencyBadge } from '@/components/shared/urgency-badge';
import type { PendingAttentionItem } from '@/lib/attention-decisions';
import { formatProblemAreasSummary } from '@/lib/learner-problem-areas';

type AttentionQueueTableProps = {
  rows: PendingAttentionItem[];
  onRowClick: (item: PendingAttentionItem) => void;
  onApprove: (item: PendingAttentionItem) => void;
  onReject: (item: PendingAttentionItem) => void;
};

export function AttentionQueueTable({
  rows,
  onRowClick,
  onApprove,
  onReject,
}: AttentionQueueTableProps) {
  const columns = useMemo<ColumnDef<PendingAttentionItem>[]>(
    () => [
      {
        id: 'urgency',
        accessorFn: (row) => row.priority,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Urgency" />
        ),
        cell: ({ row }) => <UrgencyBadge priority={row.original.priority} />,
        size: 96,
        enableHiding: false,
      },
      {
        accessorKey: 'learner_reference',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Learner" />
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.learner_reference}</span>
        ),
        enableHiding: false,
      },
      {
        id: 'decision',
        accessorFn: (row) => row.decision.decision_type,
        header: 'Action',
        cell: ({ row }) => (
          <DecisionBadge type={row.original.decision.decision_type} />
        ),
        size: 112,
        enableHiding: false,
      },
      {
        id: 'struggling',
        accessorFn: (row) => formatProblemAreasSummary(row.problemAreas),
        header: 'Struggling with',
        cell: ({ row }) => (
          <span
            className="text-muted-foreground line-clamp-1 text-sm"
            title={formatProblemAreasSummary(row.original.problemAreas, 200)}
          >
            {formatProblemAreasSummary(row.original.problemAreas)}
          </span>
        ),
        enableHiding: false,
      },
      createRowActionsColumn<PendingAttentionItem>(
        [
          {
            id: 'approve',
            label: 'Approve',
            variant: 'default',
            onClick: onApprove,
            ariaLabel: (item) =>
              `Approve decision for ${item.learner_reference}`,
          },
          {
            id: 'reject',
            label: 'Reject',
            variant: 'outline',
            onClick: onReject,
            ariaLabel: (item) =>
              `Reject decision for ${item.learner_reference}`,
          },
        ],
        { size: 160 }
      ),
    ],
    [onApprove, onReject]
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      filterColumn="learner_reference"
      filterPlaceholder="Search learners…"
      pageSize={25}
      showPagination={rows.length > 25}
      getRowId={(row) => row.decision.decision_id}
      onRowClick={onRowClick}
      initialSorting={[{ id: 'urgency', desc: false }]}
      emptyMessage="No learners match the current filters."
    />
  );
}
