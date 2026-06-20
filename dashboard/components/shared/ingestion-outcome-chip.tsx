import { Badge } from '@/components/ui/badge';
import type { IngestionOutcome } from '@/lib/api/types';
import { cn } from '@/lib/utils';

const outcomeStyles: Record<
  IngestionOutcome,
  { label: string; className: string }
> = {
  accepted: {
    label: 'Accepted',
    className: 'bg-[var(--status-advance)]/10 text-[var(--status-advance)]',
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-destructive/10 text-destructive',
  },
  duplicate: {
    label: 'Duplicate',
    className: 'bg-muted text-muted-foreground',
  },
};

export function IngestionOutcomeChip({ outcome }: { outcome: IngestionOutcome }) {
  const config = outcomeStyles[outcome];
  return (
    <Badge className={cn(config.className)} aria-label={`Outcome ${config.label}`}>
      {config.label}
    </Badge>
  );
}
