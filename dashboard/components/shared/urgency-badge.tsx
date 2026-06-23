import { AlertCircle, AlertTriangle, Minus, type LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function priorityToConfig(priority: number): {
  label: string;
  className: string;
  icon: LucideIcon;
} {
  if (priority === 1) {
    return {
      label: 'High',
      className: 'bg-[var(--urgency-high)]/10 text-[var(--urgency-high)]',
      icon: AlertTriangle,
    };
  }
  if (priority <= 3) {
    return {
      label: 'Medium',
      className: 'bg-[var(--urgency-medium)]/10 text-[var(--urgency-medium)]',
      icon: AlertCircle,
    };
  }
  return {
    label: 'Low',
    className: 'bg-muted text-muted-foreground',
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
