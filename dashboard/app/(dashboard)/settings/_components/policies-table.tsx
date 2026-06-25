'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import { PolicyDetailSheet } from '@/app/(dashboard)/settings/_components/policy-detail-sheet';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { Separator } from '@/components/ui/separator';
import { usePolicies } from '@/hooks/use-policies';
import type { PolicySummary } from '@/lib/api/types';

type PoliciesTableProps = {
  orgId: string;
};

export function PoliciesTable({ orgId }: PoliciesTableProps) {
  const [selected, setSelected] = useState<PolicySummary | null>(null);
  const policiesQuery = usePolicies(orgId);

  const columns = useMemo<ColumnDef<PolicySummary>[]>(
    () => [
      {
        accessorKey: 'policy_key',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Access role" />
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.policy_key}</span>
        ),
      },
      {
        accessorKey: 'policy_id',
        header: 'Policy ID',
        cell: ({ row }) => (
          <span className="text-muted-foreground block max-w-[10rem] truncate font-mono text-xs sm:max-w-none">
            {row.original.policy_id}
          </span>
        ),
      },
      {
        accessorKey: 'policy_version',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Version" />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs">v{row.original.policy_version}</span>
        ),
      },
      {
        accessorKey: 'rule_count',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Rules" />
        ),
        cell: ({ row }) => row.original.rule_count,
      },
    ],
    []
  );

  if (policiesQuery.isLoading) {
    return <LoadingState variant="table" count={2} />;
  }

  if (policiesQuery.isError) {
    return (
      <ErrorState
        error={policiesQuery.error}
        onRetry={() => void policiesQuery.refetch()}
      />
    );
  }

  const policies = policiesQuery.data?.policies ?? [];

  if (policies.length === 0) {
    return <EmptyState message="No active policies found for this organization." />;
  }

  return (
    <>
      <section aria-label="Active policies" className="flex flex-col gap-3">
        <DataTable
          columns={columns}
          data={policies}
          filterColumn="policy_key"
          filterPlaceholder="Filter by access role…"
          pageSize={10}
          showPagination={policies.length > 10}
          getRowId={(row) => row.policy_id}
          onRowClick={setSelected}
          emptyMessage="No policies match your filter."
        />
      </section>

      {policiesQuery.data?.routing ? (
        <>
          <Separator className="my-4" />
          <div>
            <p className="text-sm font-medium">Routing</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Default policy:{' '}
              <span className="font-mono">
                {policiesQuery.data.routing.default_policy_key ?? '—'}
              </span>
            </p>
            {policiesQuery.data.routing.source_system_map ? (
              <ul className="text-muted-foreground mt-2 space-y-1 font-mono text-xs">
                {Object.entries(policiesQuery.data.routing.source_system_map).map(
                  ([source, key]) => (
                    <li key={source}>
                      {source} → {key}
                    </li>
                  )
                )}
              </ul>
            ) : null}
          </div>
        </>
      ) : null}

      <PolicyDetailSheet
        policy={selected}
        orgId={orgId}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
