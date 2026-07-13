import { CheckCircle2, CircleDot, XCircle, type LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { ReviewAction } from '@/lib/decision-review';
import { badge } from '@/lib/semantic-colors';
import { cn } from '@/lib/utils';

/** Display statuses for Your action — includes in-progress Reviewing (not a persisted action). */
export type ReviewActionChipStatus = ReviewAction | 'reviewing';

const reviewActionConfig: Record<
  ReviewActionChipStatus,
  { label: string; className: string; icon: LucideIcon }
> = {
  approve: {
    label: 'Approved',
    className: badge.success,
    icon: CheckCircle2,
  },
  reject: {
    label: 'Rejected',
    className: badge.danger,
    icon: XCircle,
  },
  reviewing: {
    label: 'Reviewing',
    className: badge.warning,
    icon: CircleDot,
  },
};

type ReviewActionChipProps = {
  action: ReviewActionChipStatus;
  className?: string;
};

export function ReviewActionChip({ action, className }: ReviewActionChipProps) {
  const config = reviewActionConfig[action];
  const Icon = config.icon;

  return (
    <Badge
      className={cn(config.className, className)}
      aria-label={config.label}
    >
      <Icon data-icon="inline-start" aria-hidden="true" />
      {config.label}
    </Badge>
  );
}

/** Maps API latest_action to educator-facing chip action. */
export function feedbackActionToReviewAction(
  latestAction: string | null | undefined
): ReviewAction | null {
  if (latestAction === 'approve' || latestAction === 'reject') {
    return latestAction;
  }
  return null;
}
