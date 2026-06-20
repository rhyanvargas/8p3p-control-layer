'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { DetailSheet } from '@/components/shared/detail-sheet';
import { DecisionBadge } from '@/components/shared/decision-badge';
import { DrillDownLink } from '@/components/shared/drill-down-link';
import { JsonViewer } from '@/components/shared/json-viewer';
import { SheetSection } from '@/components/shared/sheet-section';

type StubDecision = {
  id: string;
  time: string;
  type: string;
  learner: string;
  rule: string;
  rationale: string;
};

const STUB_DECISIONS: StubDecision[] = [
  {
    id: 'dec-001',
    time: '2026-06-18T10:00:00Z',
    type: 'intervene',
    learner: 'learner-alpha',
    rule: 'mastery.below_threshold',
    rationale: 'Mastery score dropped below intervention threshold for text_evidence.',
  },
  {
    id: 'dec-002',
    time: '2026-06-18T09:30:00Z',
    type: 'reinforce',
    learner: 'learner-beta',
    rule: 'stability.improving',
    rationale: 'Learner showed consistent improvement over the last three sessions.',
  },
  {
    id: 'dec-003',
    time: '2026-06-18T08:15:00Z',
    type: 'advance',
    learner: 'learner-gamma',
    rule: 'mastery.ready_to_advance',
    rationale: 'All advance criteria met for central_idea skill.',
  },
  {
    id: 'dec-004',
    time: '2026-06-17T16:45:00Z',
    type: 'pause',
    learner: 'learner-delta',
    rule: 'engagement.inactive',
    rationale: 'No activity detected for 14 days; pausing automated decisions.',
  },
  {
    id: 'dec-005',
    time: '2026-06-17T14:20:00Z',
    type: 'intervene',
    learner: 'learner-epsilon',
    rule: 'struggle.persistent',
    rationale: 'Struggle indicator active for inference skill across two weeks.',
  },
  {
    id: 'dec-006',
    time: '2026-06-17T11:00:00Z',
    type: 'reinforce',
    learner: 'learner-zeta',
    rule: 'progress.sustained',
    rationale: 'Sustained progress on vocabulary_in_context.',
  },
  {
    id: 'dec-007',
    time: '2026-06-16T09:10:00Z',
    type: 'advance',
    learner: 'learner-eta',
    rule: 'mastery.ready_to_advance',
    rationale: 'Advance criteria met for authors_purpose.',
  },
  {
    id: 'dec-008',
    time: '2026-06-16T07:55:00Z',
    type: 'intervene',
    learner: 'learner-theta',
    rule: 'mastery.below_threshold',
    rationale: 'Below threshold on text_structure for three consecutive evaluations.',
  },
  {
    id: 'dec-009',
    time: '2026-06-15T18:30:00Z',
    type: 'pause',
    learner: 'learner-iota',
    rule: 'policy.manual_hold',
    rationale: 'Manual hold requested by program administrator.',
  },
  {
    id: 'dec-010',
    time: '2026-06-15T12:00:00Z',
    type: 'reinforce',
    learner: 'learner-kappa',
    rule: 'stability.improving',
    rationale: 'Positive trend on main_idea skill.',
  },
  {
    id: 'dec-011',
    time: '2026-06-14T15:40:00Z',
    type: 'intervene',
    learner: 'learner-lambda',
    rule: 'struggle.persistent',
    rationale: 'Persistent struggle on compare_contrast.',
  },
  {
    id: 'dec-012',
    time: '2026-06-14T08:00:00Z',
    type: 'advance',
    learner: 'learner-mu',
    rule: 'mastery.ready_to_advance',
    rationale: 'Ready to advance on word_meaning.',
  },
];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function truncateRule(rule: string, max = 28): string {
  return rule.length > max ? `${rule.slice(0, max)}…` : rule;
}

/**
 * Internal verification harness for TASK-007 — sort/filter/paginate + L1 Sheet drill-down.
 * Consumed by feature pages in Phase B; safe to remove once e2e covers the flows.
 */
export function DataTableDemo() {
  const [selected, setSelected] = useState<StubDecision | null>(null);

  const columns = useMemo<ColumnDef<StubDecision>[]>(
    () => [
      {
        accessorKey: 'time',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Time" />
        ),
        cell: ({ row }) => formatTime(row.original.time),
        sortingFn: 'datetime',
      },
      {
        accessorKey: 'type',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Type" />
        ),
        cell: ({ row }) => <DecisionBadge type={row.original.type} />,
      },
      {
        accessorKey: 'learner',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Learner" />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.learner}</span>
        ),
      },
      {
        accessorKey: 'rule',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Rule" />
        ),
        cell: ({ row }) => truncateRule(row.original.rule),
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={STUB_DECISIONS}
        filterColumn="learner"
        filterPlaceholder="Filter by learner…"
        pageSize={5}
        getRowId={(row) => row.id}
        onRowClick={setSelected}
        emptyMessage="No decisions match your filter."
      />

      <DetailSheet
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected ? `Decision ${selected.id}` : undefined}
        description={
          selected ? formatTime(selected.time) : undefined
        }
        footer={
          selected ? (
            <DrillDownLink
              href={`/decisions/${selected.id}`}
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
                { label: 'Learner', value: selected.learner },
                { label: 'Type', value: <DecisionBadge type={selected.type} /> },
                { label: 'Rule', value: selected.rule },
              ]}
            />
            <SheetSection title="Rationale excerpt">
              <p className="text-sm leading-relaxed">{selected.rationale}</p>
            </SheetSection>
            <JsonViewer data={selected} title="Full payload (L3)" />
          </>
        ) : null}
      </DetailSheet>
    </>
  );
}
