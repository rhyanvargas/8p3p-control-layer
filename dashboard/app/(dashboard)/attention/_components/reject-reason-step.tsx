'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  REJECT_REASON_CATEGORIES,
  SUGGESTED_DECISION_TYPES,
  rejectFeedbackBodySchema,
  type RejectFeedbackBody,
  type RejectReasonCategory,
  type SuggestedDecisionType,
} from '@/lib/decision-feedback';
import { cn } from '@/lib/utils';

export const REJECT_REASON_LABELS: Record<RejectReasonCategory, string> = {
  not_at_risk: 'Not at risk',
  wrong_skill: 'Wrong skill',
  wrong_timing: 'Wrong timing',
  wrong_decision_type: 'Wrong action type',
  data_stale: 'Data is stale',
  other: 'Other',
};

const SUGGESTED_DECISION_TYPE_LABELS: Record<SuggestedDecisionType, string> = {
  reinforce: 'Reinforce',
  advance: 'Advance',
  intervene: 'Intervene',
  pause: 'Pause',
};

export const REJECT_REASON_TEXT_MAX = 2000;

type RejectReasonStepProps = {
  reasonCategory: RejectReasonCategory | null;
  reasonText: string;
  suggestedDecisionType: SuggestedDecisionType | null;
  onReasonCategoryChange: (category: RejectReasonCategory) => void;
  onReasonTextChange: (text: string) => void;
  onSuggestedDecisionTypeChange: (type: SuggestedDecisionType) => void;
  className?: string;
};

export function buildRejectFeedbackPayload(input: {
  reasonCategory: RejectReasonCategory | null;
  reasonText: string;
  suggestedDecisionType: SuggestedDecisionType | null;
}): RejectFeedbackBody | null {
  if (!input.reasonCategory) return null;

  const trimmedText = input.reasonText.trim();
  const base = {
    action: 'reject' as const,
    reason_category: input.reasonCategory,
    ...(trimmedText ? { reason_text: trimmedText } : {}),
  };

  if (input.reasonCategory === 'wrong_decision_type') {
    if (!input.suggestedDecisionType) return null;
    return rejectFeedbackBodySchema.parse({
      ...base,
      suggested_decision_type: input.suggestedDecisionType,
    });
  }

  return rejectFeedbackBodySchema.parse(base);
}

export function RejectReasonStep({
  reasonCategory,
  reasonText,
  suggestedDecisionType,
  onReasonCategoryChange,
  onReasonTextChange,
  onSuggestedDecisionTypeChange,
  className,
}: RejectReasonStepProps) {
  return (
    <section
      className={cn('border-border flex flex-col gap-4 border-t pt-5', className)}
      aria-label="Reject reason"
    >
      <div className="flex flex-col gap-2">
        <Label className="text-sm font-medium">Why are you rejecting?</Label>
        <p className="text-muted-foreground text-xs">
          Choose the reason that best matches your judgment.
        </p>
        <div className="flex flex-wrap gap-2">
          {REJECT_REASON_CATEGORIES.map((category) => {
            const selected = reasonCategory === category;
            return (
              <Button
                key={category}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={selected}
                className={cn(
                  selected &&
                    'border-primary bg-primary/10 text-primary hover:bg-primary/10'
                )}
                onClick={() => onReasonCategoryChange(category)}
              >
                {REJECT_REASON_LABELS[category]}
              </Button>
            );
          })}
        </div>
      </div>

      {reasonCategory === 'wrong_decision_type' ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reject-suggested-decision-type" className="text-sm font-medium">
            Expected action type
          </Label>
          <Select
            value={suggestedDecisionType ?? undefined}
            onValueChange={(value) =>
              onSuggestedDecisionTypeChange(value as SuggestedDecisionType)
            }
          >
            <SelectTrigger id="reject-suggested-decision-type" className="w-full">
              <SelectValue placeholder="Select the action you expected" />
            </SelectTrigger>
            <SelectContent>
              {SUGGESTED_DECISION_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {SUGGESTED_DECISION_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reject-reason-text" className="text-sm font-medium">
          Additional notes <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <textarea
          id="reject-reason-text"
          value={reasonText}
          maxLength={REJECT_REASON_TEXT_MAX}
          rows={3}
          placeholder="Add context for your team (optional)"
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex min-h-20 w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
          onChange={(event) => onReasonTextChange(event.target.value)}
        />
        <p className="text-muted-foreground text-right text-xs">
          {reasonText.length}/{REJECT_REASON_TEXT_MAX}
        </p>
      </div>
    </section>
  );
}
