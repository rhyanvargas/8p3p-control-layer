import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type LoadingVariant = 'table' | 'cards' | 'list' | 'chart';

type LoadingStateProps = {
  /** Layout preset sized to match the final content shape. */
  variant?: LoadingVariant;
  /** Row or card count (default varies by variant). */
  count?: number;
  className?: string;
};

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading table">
      <div className="flex gap-3">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function CardsSkeleton({ count }: { count: number }) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      aria-busy="true"
      aria-label="Loading cards"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-3 w-full max-w-md" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading chart">
      <div className="flex items-end justify-between gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-28" />
      </div>
      <Skeleton className="h-[240px] w-full rounded-lg" />
      <Skeleton className="h-3 w-64" />
    </div>
  );
}

const DEFAULT_COUNTS: Record<LoadingVariant, number> = {
  table: 5,
  cards: 4,
  list: 4,
  chart: 1,
};

export function LoadingState({
  variant = 'list',
  count,
  className,
}: LoadingStateProps) {
  const itemCount = count ?? DEFAULT_COUNTS[variant];

  return (
    <div className={cn('w-full', className)}>
      {variant === 'table' ? <TableSkeleton rows={itemCount} /> : null}
      {variant === 'cards' ? <CardsSkeleton count={itemCount} /> : null}
      {variant === 'list' ? <ListSkeleton count={itemCount} /> : null}
      {variant === 'chart' ? <ChartSkeleton /> : null}
    </div>
  );
}
