import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading panel content">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function PanelError({
  status,
  onRetry,
}: {
  status: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-[var(--urgency-high)]/40 bg-muted/30 p-6 text-center"
      role="alert"
      aria-live="polite"
    >
      <p className="text-sm font-medium text-foreground">{status}</p>
      <Button type="button" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export function PanelEmpty({ message }: { message: string }) {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground" role="status">
      {message}
    </p>
  );
}
