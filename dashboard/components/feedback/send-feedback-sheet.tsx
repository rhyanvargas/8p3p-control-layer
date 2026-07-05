'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquarePlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiFetch } from '@/lib/api/client';
import { ApiError, logApiError } from '@/lib/api/errors';

const FEEDBACK_TYPES = ['idea', 'problem', 'praise', 'question'] as const;
type FeedbackType = (typeof FEEDBACK_TYPES)[number];

const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  idea: 'Idea',
  problem: 'Problem',
  praise: 'Praise',
  question: 'Question',
};

const MESSAGE_MAX_LENGTH = 4000;

type SubmitProductFeedbackResponse = {
  feedback_id: string;
  kind: 'general';
  feedback_type: FeedbackType;
  category: string;
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

export function SendFeedbackSheet() {
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('idea');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pageContext = useMemo(() => stripQueryFromPath(pathname ?? '/'), [pathname]);

  const resetForm = useCallback(() => {
    setFeedbackType('idea');
    setMessage('');
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen && !submitting) {
        resetForm();
      }
    },
    [resetForm, submitting]
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error('Enter a message before sending.');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch<SubmitProductFeedbackResponse>('/v1/feedback', {
        method: 'POST',
        body: JSON.stringify({
          feedback_type: feedbackType,
          category: 'other',
          message: trimmed,
          page_context: pageContext,
          ...(resolveAppVersion() ? { app_version: resolveAppVersion() } : {}),
        }),
      });
      toast.success('Feedback sent — thank you.');
      resetForm();
      setOpen(false);
      triggerRef.current?.focus();
    } catch (error) {
      logApiError('sendProductFeedback', error);
      const description =
        error instanceof ApiError && error.status === 401
          ? "Couldn't send — sign in and try again."
          : "Couldn't send — try again.";
      toast.error(description);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          <Button
            ref={triggerRef}
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-8 gap-1.5 px-2 text-xs font-normal"
          />
        }
      >
        <MessageSquarePlusIcon className="size-3.5" aria-hidden />
        Send feedback
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Send feedback</SheetTitle>
          <SheetDescription>
            Share product feedback with the 8P3P team. This does not replace Approve/Reject on
            individual decisions.
          </SheetDescription>
        </SheetHeader>

        <form
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="flex flex-col gap-2">
            <Label id="feedback-type-label">Type</Label>
            <Tabs
              value={feedbackType}
              onValueChange={(value) => {
                if (FEEDBACK_TYPES.includes(value as FeedbackType)) {
                  setFeedbackType(value as FeedbackType);
                }
              }}
            >
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4">
                {FEEDBACK_TYPES.map((type) => (
                  <TabsTrigger key={type} value={type} className="text-xs sm:text-sm">
                    {FEEDBACK_TYPE_LABELS[type]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-feedback-message">Message</Label>
            <textarea
              id="product-feedback-message"
              value={message}
              maxLength={MESSAGE_MAX_LENGTH}
              rows={5}
              required
              placeholder="What would help? What is confusing or broken?"
              className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex min-h-24 w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
              onChange={(event) => setMessage(event.target.value)}
            />
            <p className="text-muted-foreground text-right text-xs">
              {message.length}/{MESSAGE_MAX_LENGTH}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-feedback-page-context">Page</Label>
            <Input
              id="product-feedback-page-context"
              readOnly
              value={pageContext}
              className="bg-muted/50 font-mono text-xs"
              aria-readonly="true"
            />
          </div>

          <SheetFooter className="px-0 pb-4">
            <Button type="submit" disabled={submitting || message.trim().length === 0}>
              {submitting ? 'Sending…' : 'Send feedback'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
