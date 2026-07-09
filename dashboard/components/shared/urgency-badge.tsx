import { AlertCircle, AlertTriangle, Minus, type LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { badge } from '@/lib/semantic-colors';
import { cn } from '@/lib/utils';

function priorityToConfig(priority: number): {
  label: string;
  className: string;
  icon: LucideIcon;
} {
  if (priority === 1) {
    return {
      label: 'High',
      className: badge.danger,
      icon: AlertTriangle,
    };
  }
  if (priority <= 3) {
    return {
      label: 'Medium',
      className: badge.warning,
      icon: AlertCircle,
    };
  }
  return {
    label: 'Low',
    className: badge.neutral,
    icon: Minus,
  };
}

export function UrgencyBadge({
  priority,
}: {
  priority: number | null | undefined;
}) {
  const p = priority ?? 99;
  const { label, className, icon: Icon } = priorityToConfig(p);

  return (
    <Badge className={cn(className)} aria-label={`Urgency ${label.toLowerCase()}`}>
      <Icon data-icon="inline-start" aria-hidden="true" />
      {label}
    </Badge>
  );
}
