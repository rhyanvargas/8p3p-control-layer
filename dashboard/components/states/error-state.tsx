'use client';

import { AlertCircle, Copy } from 'lucide-react';
import { toast } from 'sonner';

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getErrorRequestId, getErrorStatus, getSafeErrorMessage } from '@/lib/api/errors';
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
  const requestId = getErrorRequestId(error);

  async function copyReferenceId() {
    if (!requestId) return;
    try {
      await navigator.clipboard.writeText(requestId);
      toast.success('Reference ID copied');
    } catch {
      toast.error('Could not copy reference ID');
    }
  }

  return (
    <Alert variant="destructive" className={cn('relative', className)}>
      <AlertCircle aria-hidden="true" />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>
        {displayMessage}
        {status != null ? (
          <span className="text-muted-foreground mt-1 block text-xs">HTTP {status}</span>
        ) : null}
        {requestId ? (
          <span className="mt-2 flex items-center gap-2 text-xs">
            <span className="font-mono">Reference: {requestId}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Copy reference ID"
              onClick={() => void copyReferenceId()}
            >
              <Copy className="size-3.5" aria-hidden="true" />
            </Button>
          </span>
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
