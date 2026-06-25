'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Columns3 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { DecisionBadge } from '@/components/shared/decision-badge';
import { DetailSheet } from '@/components/shared/detail-sheet';
import { DrillDownLink } from '@/components/shared/drill-down-link';
import {
  ReviewActionChip,
  feedbackActionToReviewAction,
} from '@/components/shared/review-action-chip';
import { SheetSection } from '@/components/shared/sheet-section';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDecisions } from '@/hooks/use-decisions';
import { useFeedbackStatusForDecisionIds } from '@/hooks/use-decision-feedback-status';
import type { Decision } from '@/lib/api/types';
import {
  buildRationaleExcerpt,
  filterDecisionsByTimeRange,
  sortDecisionsNewestFirst,
  type DecisionTimeRangeDays,
} from '@/lib/decision-trace';
import {
  EMPTY_SESSION_REVIEWED_IDS,
  getReviewRecord,
  getSessionReviewedIdSet,
  subscribeReviewLog,
} from '@/lib/decision-review';
import {
  DECISIONS_REVIEW_FILTER_OPTIONS,
  decisionsReviewFilterToParam,
  filterDecisionsByReviewStatus,
  parseDecisionsReviewFilter,
  type DecisionsReviewFilter,
} from '@/lib/decisions-review-filter';
import { getDecisionFeedback } from '@/lib/decision-feedback';
import { DECISIONS_REVIEWED_PARAM } from '@/lib/page-url-state';
import { formatDecisionTime, truncateRule } from '@/lib/overview-metrics';
import { queryKeys } from '@/lib/query-client';

type DecisionsStreamProps = {
  orgId: string;
};

const TIME_RANGE_OPTIONS: { value: DecisionTimeRangeDays; label: string }[] = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 365, label: 'All (12 months)' },
];

function isUrgentDecisionType(decisionType: string): boolean {
  return decisionType === 'intervene' || decisionType === 'pause';
}

function resolveYourAction(
  decisionId: string,
  latestActionByDecisionId: ReadonlyMap<string, string | null>
) {
  const sessionRecord = getReviewRecord(decisionId);
  if (sessionRecord) {
    return sessionRecord.action;
  }
  return feedbackActionToReviewAction(latestActionByDecisionId.get(decisionId));
}

export function DecisionsStream({ orgId }: DecisionsStreamProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Decision | null>(null);
  const [timeRange, setTimeRange] = useState<DecisionTimeRangeDays>(30);
  const [showYourActionColumn, setShowYourActionColumn] = useState(false);

  const reviewFilter = parseDecisionsReviewFilter(
    searchParams.get(DECISIONS_REVIEWED_PARAM)
  );

  const sessionReviewedIds = useSyncExternalStore(
    subscribeReviewLog,
    getSessionReviewedIdSet,
    () => EMPTY_SESSION_REVIEWED_IDS
  );

  const replaceReviewFilter = useCallback(
    (next: DecisionsReviewFilter) => {
      const params = new URLSearchParams(searchParams.toString());
      const paramValue = decisionsReviewFilterToParam(next);
      if (paramValue) {
        params.set(DECISIONS_REVIEWED_PARAM, paramValue);
      } else {
        params.delete(DECISIONS_REVIEWED_PARAM);
      }
      const query = params.toString();
      router.replace(query ? `/decisions?${query}` : '/decisions');
    },
    [router, searchParams]
  );

  const { data, isLoading, isError, error, refetch } = useDecisions(orgId);

  const timeFilteredRows = useMemo(() => {
    const filtered = filterDecisionsByTimeRange(data ?? [], timeRange);
    return sortDecisionsNewestFirst(filtered);
  }, [data, timeRange]);

  const urgentDecisionIds = useMemo(
    () =>
      timeFilteredRows
        .filter((decision) => isUrgentDecisionType(decision.decision_type))
        .map((decision) => decision.decision_id),
    [timeFilteredRows]
  );

  const { serverReviewedIds, latestActionByDecisionId } =
    useFeedbackStatusForDecisionIds(
      reviewFilter === 'pending' || showYourActionColumn ? urgentDecisionIds : []
    );

  const rows = useMemo(
    () =>
      filterDecisionsByReviewStatus(timeFilteredRows, {
        filter: reviewFilter,
        sessionReviewedIds,
        serverReviewedIds,
      }),
    [timeFilteredRows, reviewFilter, sessionReviewedIds, serverReviewedIds]
  );

  const selectedFeedbackQuery = useQuery({
    queryKey: selected
      ? queryKeys.decisionFeedback(selected.decision_id)
      : ['decision-feedback', 'none'],
    queryFn: () => getDecisionFeedback(selected!.decision_id),
    enabled: selected != null,
    staleTime: 30_000,
  });

  const columns = useMemo<ColumnDef<Decision>[]>(() => {
    const base: ColumnDef<Decision>[] = [
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
    ];

    if (!showYourActionColumn) {
      return base;
    }

    return [
      ...base,
      {
        id: 'yourAction',
        header: 'Your action',
        cell: ({ row }) => {
          const action = resolveYourAction(
            row.original.decision_id,
            latestActionByDecisionId
          );
          return action ? <ReviewActionChip action={action} /> : '—';
        },
      },
    ];
  }, [showYourActionColumn, latestActionByDecisionId]);

  const selectedYourAction = selected
    ? resolveYourAction(
        selected.decision_id,
        selectedFeedbackQuery.data
          ? new Map([[selected.decision_id, selectedFeedbackQuery.data.latest_action]])
          : latestActionByDecisionId
      )
    : null;

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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="review-status-filter" className="text-xs">
              Review status
            </Label>
            <Select
              value={reviewFilter}
              onValueChange={(value) =>
                replaceReviewFilter(value as DecisionsReviewFilter)
              }
            >
              <SelectTrigger
                id="review-status-filter"
                className="w-52"
                aria-label="Review status filter"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DECISIONS_REVIEW_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" className="gap-1.5" />}
            >
              <Columns3 className="size-4" aria-hidden="true" />
              Columns
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={showYourActionColumn}
                onCheckedChange={(checked) =>
                  setShowYourActionColumn(checked === true)
                }
              >
                Your action
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
              {selectedYourAction ? (
                <ReviewActionChip action={selectedYourAction} />
              ) : null}
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
