import { Minus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const progressConfig = {
  improving: {
    label: 'Improved',
    className: 'bg-[var(--progress-improved)]/10 text-[var(--progress-improved)]',
    icon: TrendingUp,
  },
  declining: {
    label: 'Declining',
    className: 'bg-[var(--progress-declining)]/10 text-[var(--progress-declining)]',
    icon: TrendingDown,
  },
  stable: {
    label: 'Stable',
    className: 'bg-muted text-muted-foreground',
    icon: Minus,
  },
} as const satisfies Record<
  string,
  { label: string; className: string; icon: LucideIcon }
>;

export type ProgressVariant = keyof typeof progressConfig;

export function ProgressBadge({ variant }: { variant: ProgressVariant }) {
  const config = progressConfig[variant] ?? progressConfig.stable;
  const Icon = config.icon;

  return (
    <Badge
      className={cn(config.className)}
      aria-label={`Progress ${config.label.toLowerCase()}`}
    >
      <Icon data-icon="inline-start" aria-hidden="true" />
      {config.label}
    </Badge>
  );
}
