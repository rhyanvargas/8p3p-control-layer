'use client';

import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

import { ProgressBadge } from '@/components/shared/progress-badge';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLearnerSummary } from '@/hooks/use-learner-summary';
import type { TrajectoryFieldSummary } from '@/lib/api/types';

const FIELD_LABELS: Record<string, string> = {
  masteryScore: 'Mastery',
  stabilityScore: 'Stability',
  timeSinceReinforcement: 'Time since reinforcement',
  riskSignal: 'Risk signal',
};

function formatTrajectoryValue(value: number | null): string {
  if (value == null) return '—';
  return String(Math.round(value * 100) / 100);
}

function DirectionIcon({
  direction,
}: {
  direction: TrajectoryFieldSummary['overall_direction'];
}) {
  if (direction === 'improving') {
    return <TrendingUp className="text-[var(--progress-improved)] size-4" aria-hidden="true" />;
  }
  if (direction === 'declining') {
    return <TrendingDown className="text-[var(--progress-declining)] size-4" aria-hidden="true" />;
  }
  return <Minus className="text-muted-foreground size-4" aria-hidden="true" />;
}

type LearnerTrajectoryTabProps = {
  orgId: string;
  learnerRef: string;
};

export function LearnerTrajectoryTab({ orgId, learnerRef }: LearnerTrajectoryTabProps) {
  const summaryQuery = useLearnerSummary(orgId, learnerRef);

  if (summaryQuery.isLoading) {
    return <LoadingState variant="table" count={4} />;
  }

  if (summaryQuery.isError) {
    return (
      <ErrorState error={summaryQuery.error} onRetry={() => summaryQuery.refetch()} />
    );
  }

  const trajectories = summaryQuery.data?.field_trajectories ?? {};
  const entries = Object.entries(trajectories);

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No trajectory data available for this learner yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Per-field trend across stored state versions from the summary projection.
      </p>
      <div className="border-border rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead>First</TableHead>
              <TableHead>Latest</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Versions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(([field, summary]) => (
              <TableRow key={field}>
                <TableCell className="font-medium">
                  {FIELD_LABELS[field] ?? field}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {formatTrajectoryValue(summary.first_value)}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {formatTrajectoryValue(summary.latest_value)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <DirectionIcon direction={summary.overall_direction} />
                    {summary.overall_direction === 'improving' ? (
                      <ProgressBadge variant="improving" />
                    ) : summary.overall_direction === 'declining' ? (
                      <ProgressBadge variant="declining" />
                    ) : (
                      <ProgressBadge variant="stable" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {summary.version_count}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
