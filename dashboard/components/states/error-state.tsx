'use client';

import { AlertCircle } from 'lucide-react';

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getErrorStatus, getSafeErrorMessage } from '@/lib/api/errors';
import { cn } from '@/lib/utils';

type ErrorStateProps = {
  error: unknown;
  onRetry: () => void;
  /** Override the auto-derived friendly message. */
  message?: string;
  className?: string;
};

export function ErrorState({ error, onRetry, message, className }: ErrorStateProps) {
  const displayMessage = message ?? getSafeErrorMessage(error);
  const status = getErrorStatus(error);

  return (
    <Alert variant="destructive" className={cn('relative', className)}>
      <AlertCircle aria-hidden="true" />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>
        {displayMessage}
        {status != null ? (
          <span className="text-muted-foreground mt-1 block text-xs">HTTP {status}</span>
        ) : null}
      </AlertDescription>
      <AlertAction>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </AlertAction>
    </Alert>
  );
}
