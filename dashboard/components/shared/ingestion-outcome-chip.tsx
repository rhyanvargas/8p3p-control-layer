import { CheckCircle2, Copy, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { IngestionOutcome } from '@/lib/api/types';
import { cn } from '@/lib/utils';

const outcomeStyles: Record<
  IngestionOutcome,
  { label: string; className: string; icon: LucideIcon }
> = {
  accepted: {
    label: 'Accepted',
    className: 'bg-[var(--status-advance)]/10 text-[var(--status-advance)]',
    icon: CheckCircle2,
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-destructive/10 text-destructive',
    icon: XCircle,
  },
  duplicate: {
    label: 'Duplicate',
    className: 'bg-muted text-muted-foreground',
    icon: Copy,
  },
};

export function IngestionOutcomeChip({ outcome }: { outcome: IngestionOutcome }) {
  const config = outcomeStyles[outcome];
  const Icon = config.icon;
  return (
    <Badge className={cn('gap-1', config.className)} aria-label={`Outcome ${config.label}`}>
      <Icon aria-hidden="true" className="size-3" />
      {config.label}
    </Badge>
  );
}
