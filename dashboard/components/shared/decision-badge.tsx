import {
  ArrowUpRight,
  CirclePause,
  HandHelping,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { badge } from '@/lib/semantic-colors';
import { cn } from '@/lib/utils';

const decisionConfig: Record<
  string,
  { label: string; className: string; icon: LucideIcon }
> = {
  intervene: {
    label: 'Intervene',
    className: badge.warning,
    icon: HandHelping,
  },
  reinforce: {
    label: 'Reinforce',
    className: badge.success,
    icon: Sparkles,
  },
  advance: {
    label: 'Advance',
    className: badge.info,
    icon: ArrowUpRight,
  },
  pause: {
    label: 'Pause',
    className: badge.neutral,
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
      className={cn(config?.className ?? badge.neutral)}
      aria-label={`Decision type ${label}`}
    >
      <Icon data-icon="inline-start" aria-hidden="true" />
      {label}
    </Badge>
  );
}
