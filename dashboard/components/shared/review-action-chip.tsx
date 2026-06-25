import { Badge } from '@/components/ui/badge';
import type { ReviewAction } from '@/lib/decision-review';
import { cn } from '@/lib/utils';

type ReviewActionChipProps = {
  action: ReviewAction;
  className?: string;
};

export function ReviewActionChip({ action, className }: ReviewActionChipProps) {
  const label = action === 'approve' ? 'Approved' : 'Rejected';
  return (
    <Badge
      variant={action === 'approve' ? 'secondary' : 'outline'}
      className={cn(
        action === 'reject' &&
          'border-destructive/30 text-destructive bg-destructive/5',
        className
      )}
    >
      {label}
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
