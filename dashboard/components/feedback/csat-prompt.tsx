'use client';

import { startTransition, useCallback, useEffect, useRef, useSyncExternalStore, useState } from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api/client';
import { ApiError, logApiError } from '@/lib/api/errors';
import {
  isCsatPromptEligible,
  isCsatPromptFeatureEnabled,
  markCsatPromptShown,
} from '@/lib/csat-eligibility';
import { subscribeReviewLog } from '@/lib/decision-review';

const CSAT_SCORES = [1, 2, 3, 4, 5] as const;

type SubmitCsatResponse = {
  feedback_id: string;
  kind: 'csat';
  csat_score: number;
  created_at: string;
};

function stripQueryFromPath(pathname: string): string {
  const q = pathname.indexOf('?');
  return q === -1 ? pathname : pathname.slice(0, q);
}

function resolveAppVersion(): string | undefined {
  const fromEnv = process.env.NEXT_PUBLIC_APP_VERSION?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : undefined;
}

/**
 * Flag-gated CSAT microsurvey. Renders nothing when NEXT_PUBLIC_FEEDBACK_CSAT is not "true".
 * SSR-safe: returns null until mounted, then reconciles eligibility client-side.
 */
export function CsatPrompt() {
  if (!isCsatPromptFeatureEnabled()) {
    return null;
  }

  return <CsatPromptMounted />;
}

function useIsClientMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

function CsatPromptMounted() {
  const pathname = usePathname();
  const mounted = useIsClientMounted();
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const promptedThisSessionRef = useRef(false);

  const pageContext = stripQueryFromPath(pathname ?? '/');

  const evaluateEligibility = useCallback(() => {
    if (promptedThisSessionRef.current || open || submitting) return;
    if (!isCsatPromptEligible()) return;
    promptedThisSessionRef.current = true;
    startTransition(() => {
      setOpen(true);
    });
  }, [open, submitting]);

  useEffect(() => {
    if (!mounted) return;
    evaluateEligibility();
    return subscribeReviewLog(() => {
      evaluateEligibility();
    });
  }, [mounted, evaluateEligibility, pageContext]);

  const handleDismiss = useCallback(() => {
    markCsatPromptShown();
    setOpen(false);
    setScore(null);
    setMessage('');
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        handleDismiss();
        return;
      }
      setOpen(true);
    },
    [handleDismiss]
  );

  const handleSubmit = async () => {
    if (score === null) {
      toast.error('Select a satisfaction score before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch<SubmitCsatResponse>('/v1/feedback/csat', {
        method: 'POST',
        body: JSON.stringify({
          csat_score: score,
          ...(message.trim() ? { message: message.trim() } : {}),
          page_context: pageContext,
          ...(resolveAppVersion() ? { app_version: resolveAppVersion() } : {}),
        }),
      });
      markCsatPromptShown();
      toast.success('Thanks for your feedback.');
      setOpen(false);
      setScore(null);
      setMessage('');
    } catch (error) {
      logApiError('submitCsatFeedback', error);
      const description =
        error instanceof ApiError && error.status === 401
          ? "Couldn't send — sign in and try again."
          : "Couldn't send — try again.";
      toast.error(description);
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>How satisfied are you with this experience?</DialogTitle>
          <DialogDescription>
            One quick question — optional comment below. This helps us improve the pilot dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-1">
          <div className="flex flex-col gap-2">
            <Label id="csat-score-label">Satisfaction (1 = low, 5 = high)</Label>
            <div
              role="radiogroup"
              aria-labelledby="csat-score-label"
              className="grid grid-cols-5 gap-1.5 sm:gap-2"
            >
              {CSAT_SCORES.map((value) => {
                const selected = score === value;
                return (
                  <Button
                    key={value}
                    type="button"
                    variant={selected ? 'default' : 'outline'}
                    size="sm"
                    role="radio"
                    aria-checked={selected}
                    className="min-w-0 px-0 text-sm tabular-nums motion-reduce:transition-none"
                    onClick={() => setScore(value)}
                  >
                    {value}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="csat-comment">Comment (optional)</Label>
            <textarea
              id="csat-comment"
              value={message}
              rows={3}
              maxLength={4000}
              placeholder="What worked well or felt confusing?"
              className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-16 w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" disabled={submitting} onClick={handleDismiss}>
            Not now
          </Button>
          <Button
            type="button"
            disabled={submitting || score === null}
            onClick={() => void handleSubmit()}
          >
            {submitting ? 'Sending…' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
