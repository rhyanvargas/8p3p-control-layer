import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

import { cn } from '@/lib/utils';

type EmptyStateProps = {
  /** One-line message describing the empty condition. */
  message: string;
  /** Optional icon; defaults to Inbox. */
  icon?: LucideIcon;
  /** Optional action (button, link, etc.). */
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  message,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-10 text-center',
        className,
      )}
      role="status"
    >
      <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <p className="text-muted-foreground max-w-sm text-sm">{message}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
