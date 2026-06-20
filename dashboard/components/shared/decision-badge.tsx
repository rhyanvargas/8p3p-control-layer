import {
  ArrowUpRight,
  CirclePause,
  HandHelping,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const decisionConfig: Record<
  string,
  { label: string; className: string; icon: LucideIcon }
> = {
  intervene: {
    label: 'Intervene',
    className: 'bg-[var(--status-intervene)] text-white',
    icon: HandHelping,
  },
  reinforce: {
    label: 'Reinforce',
    className: 'bg-[var(--status-reinforce)] text-white',
    icon: Sparkles,
  },
  advance: {
    label: 'Advance',
    className: 'bg-[var(--status-advance)] text-white',
    icon: ArrowUpRight,
  },
  pause: {
    label: 'Pause',
    className: 'bg-[var(--status-pause)] text-white',
    icon: CirclePause,
  },
};

function normalizeType(type: string): string {
  return type.trim().toLowerCase();
}

export function DecisionBadge({ type }: { type: string }) {
  const key = normalizeType(type);
  const config = decisionConfig[key];
  const Icon = config?.icon ?? HandHelping;
  const label = config?.label ?? type;

  return (
    <Badge
      className={cn(config?.className ?? 'bg-muted text-muted-foreground')}
      aria-label={`Decision type ${label}`}
    >
      <Icon data-icon="inline-start" aria-hidden="true" />
      {label}
    </Badge>
  );
}
