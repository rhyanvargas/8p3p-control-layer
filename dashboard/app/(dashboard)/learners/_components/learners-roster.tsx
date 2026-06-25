'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';

import { LearnerDetailSheet } from '@/app/(dashboard)/learners/_components/learner-detail-sheet';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { ProgressBadge } from '@/components/shared/progress-badge';
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
import { useLearnerList } from '@/hooks/use-learner-list';
import { useOrgLearnerSummaries } from '@/hooks/use-learner-summary';
import {
  buildLearnerRosterRows,
  collectRosterSkills,
  filterRosterRows,
  formatLevel,
  formatRelativeActivity,
  parseRosterTrendFilter,
  trendRank,
  type LearnerRosterRow,
  type RosterTrendFilter,
} from '@/lib/learners';
import { levelRank } from '@/lib/score-levels';

type LearnersRosterProps = {
  orgId: string;
};

export function LearnersRoster({ orgId }: LearnersRosterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<LearnerRosterRow | null>(null);

  const trendFilter = parseRosterTrendFilter(searchParams.get('trend'));
  const skillParam = searchParams.get('skill');
  const skillFilter = skillParam?.trim() ? skillParam : null;

  const replaceLearnersQuery = useCallback(
    (next: { trend?: RosterTrendFilter; skill?: string | null }) => {
      const params = new URLSearchParams(searchParams.toString());

      if (next.trend !== undefined) {
        if (next.trend) params.set('trend', next.trend);
        else params.delete('trend');
      }

      if (next.skill !== undefined) {
        if (next.skill) params.set('skill', next.skill);
        else params.delete('skill');
      }

      const query = params.toString();
      router.replace(query ? `/learners?${query}` : '/learners');
    },
    [router, searchParams]
  );

  const listQuery = useLearnerList(orgId);
  const summariesQuery = useOrgLearnerSummaries(orgId, { recentDecisionsLimit: 3 });

  const isLoading = listQuery.isLoading || summariesQuery.isLoading;
  const isError = listQuery.isError || summariesQuery.isError;
  const error = listQuery.error ?? summariesQuery.error;

  const refetch = () => {
    void listQuery.refetch();
    summariesQuery.refetch();
  };

  const allRows = useMemo(
    () =>
      buildLearnerRosterRows(
        listQuery.data?.learners ?? [],
        summariesQuery.summaries
      ),
    [listQuery.data?.learners, summariesQuery.summaries]
  );

  const skillOptions = useMemo(() => collectRosterSkills(allRows), [allRows]);

  const rows = useMemo(
    () =>
      filterRosterRows(allRows, {
        trend: trendFilter,
        skill: skillFilter,
      }),
    [allRows, trendFilter, skillFilter]
  );

  const columns = useMemo<ColumnDef<LearnerRosterRow>[]>(
    () => [
      {
        accessorKey: 'learner_reference',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Reference" />
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.learner_reference}</span>
        ),
      },
      {
        id: 'level',
        accessorFn: (row) => levelRank(row.level),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Level" />
        ),
        cell: ({ row }) => (
          <span className="text-sm">{formatLevel(row.original.level)}</span>
        ),
      },
      {
        id: 'trend',
        accessorFn: (row) => trendRank(row.trend),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Trend" />
        ),
        cell: ({ row }) => <ProgressBadge variant={row.original.trend} />,
      },
      {
        accessorKey: 'updated_at',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Last activity" />
        ),
        cell: ({ row }) => formatRelativeActivity(row.original.updated_at),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.status}
          </span>
        ),
      },
    ],
    []
  );

  if (isLoading) {
    return <LoadingState variant="table" count={8} />;
  }

  if (isError) {
    return <ErrorState error={error} onRetry={refetch} />;
  }

  return (
    <>
      <section aria-label="Learner roster" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trend-filter" className="text-xs">
              Trend filter
            </Label>
            <Select
              value={trendFilter ?? 'all'}
              onValueChange={(value) =>
                replaceLearnersQuery({
                  trend: parseRosterTrendFilter(value),
                })
              }
            >
              <SelectTrigger id="trend-filter" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All learners</SelectItem>
                <SelectItem value="improving">Improving only</SelectItem>
                <SelectItem value="declining">Declining only</SelectItem>
                <SelectItem value="stable">Stable only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {skillOptions.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-filter" className="text-xs">
                Skill
              </Label>
              <Select
                value={skillFilter ?? 'all'}
                onValueChange={(value) =>
                  replaceLearnersQuery({
                    skill: value === 'all' ? null : value,
                  })
                }
              >
                <SelectTrigger id="skill-filter" className="w-52">
                  <SelectValue placeholder="All skills" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All skills</SelectItem>
                  {skillOptions.map((skill) => (
                    <SelectItem key={skill} value={skill}>
                      {skill}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <DataTable
          columns={columns}
          data={rows}
          filterColumn="learner_reference"
          filterPlaceholder="Search learners…"
          pageSize={15}
          showPagination={rows.length > 15}
          getRowId={(row) => row.learner_reference}
          onRowClick={setSelected}
          emptyMessage="No learners match the current filters."
        />
      </section>

      <LearnerDetailSheet
        learner={selected}
        orgId={orgId}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
