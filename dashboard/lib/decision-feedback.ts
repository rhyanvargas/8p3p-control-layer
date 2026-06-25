import { z } from 'zod';

import { apiFetch } from '@/lib/api/client';
import type { DecisionType } from '@/lib/api/types';

/** Closed reject reason_category values per educator-feedback-api.md */
export const REJECT_REASON_CATEGORIES = [
  'not_at_risk',
  'wrong_skill',
  'wrong_timing',
  'wrong_decision_type',
  'data_stale',
  'other',
] as const;

export type RejectReasonCategory = (typeof REJECT_REASON_CATEGORIES)[number];

export const SUGGESTED_DECISION_TYPES = [
  'reinforce',
  'advance',
  'intervene',
  'pause',
] as const satisfies readonly DecisionType[];

export type SuggestedDecisionType = (typeof SUGGESTED_DECISION_TYPES)[number];

const feedbackActionSchema = z.enum(['approve', 'reject', 'ignore']);

const suggestedDecisionTypeSchema = z.enum(SUGGESTED_DECISION_TYPES);

const optionalReasonTextSchema = z.string().max(2000).optional();

export const approveFeedbackBodySchema = z.object({
  action: z.literal('approve'),
});

const rejectWrongDecisionTypeBodySchema = z.object({
  action: z.literal('reject'),
  reason_category: z.literal('wrong_decision_type'),
  reason_text: optionalReasonTextSchema,
  suggested_decision_type: suggestedDecisionTypeSchema,
});

const rejectOtherReasonBodySchema = z
  .object({
    action: z.literal('reject'),
    reason_category: z.enum([
      'not_at_risk',
      'wrong_skill',
      'wrong_timing',
      'data_stale',
      'other',
    ]),
    reason_text: optionalReasonTextSchema,
  })
  .strict();

export const rejectFeedbackBodySchema = z.discriminatedUnion('reason_category', [
  rejectWrongDecisionTypeBodySchema,
  rejectOtherReasonBodySchema,
]);

/** POST /v1/decisions/:id/feedback request body (approve or reject with client guards). */
export const submitFeedbackBodySchema = z.union([
  approveFeedbackBodySchema,
  rejectFeedbackBodySchema,
]);

export const submitFeedbackResponseSchema = z.object({
  feedback_id: z.string(),
  decision_id: z.string(),
  action: feedbackActionSchema,
  reason_category: z.string().nullable().optional(),
  created_at: z.string(),
});

export const feedbackListItemSchema = z.object({
  feedback_id: z.string(),
  action: feedbackActionSchema,
  reason_category: z.string().nullable(),
  reason_text: z.string().nullable(),
  suggested_decision_type: z.string().nullable().optional(),
  created_at: z.string(),
});

export const getFeedbackResponseSchema = z.object({
  decision_id: z.string(),
  feedback: z.array(feedbackListItemSchema),
  latest_action: feedbackActionSchema.nullable(),
});

export const recordViewResponseSchema = z.union([
  z.object({
    recorded: z.literal(true),
    viewed_at: z.string(),
  }),
  z.object({
    recorded: z.literal(false),
    reason: z.literal('dedup_window'),
  }),
]);

export type ApproveFeedbackBody = z.infer<typeof approveFeedbackBodySchema>;
export type RejectFeedbackBody = z.infer<typeof rejectFeedbackBodySchema>;
export type SubmitFeedbackBody = z.infer<typeof submitFeedbackBodySchema>;
export type SubmitFeedbackResponse = z.infer<typeof submitFeedbackResponseSchema>;
export type FeedbackListItem = z.infer<typeof feedbackListItemSchema>;
export type GetFeedbackResponse = z.infer<typeof getFeedbackResponseSchema>;
export type RecordViewResponse = z.infer<typeof recordViewResponseSchema>;

function decisionFeedbackPath(decisionId: string): string {
  return `/v1/decisions/${encodeURIComponent(decisionId)}/feedback`;
}

function decisionViewPath(decisionId: string): string {
  return `/v1/decisions/${encodeURIComponent(decisionId)}/view`;
}

/** Validates client payload, then POSTs feedback via the dashboard proxy. */
export async function submitDecisionFeedback(
  decisionId: string,
  body: SubmitFeedbackBody
): Promise<SubmitFeedbackResponse> {
  const payload = submitFeedbackBodySchema.parse(body);
  const raw = await apiFetch<unknown>(decisionFeedbackPath(decisionId), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return submitFeedbackResponseSchema.parse(raw);
}

/** Fire-and-forget view log for an opened decision review sheet. */
export async function recordDecisionView(decisionId: string): Promise<RecordViewResponse> {
  const raw = await apiFetch<unknown>(decisionViewPath(decisionId), {
    method: 'POST',
  });
  return recordViewResponseSchema.parse(raw);
}

/** Read persisted feedback rows and latest_action for queue filtering. */
export async function getDecisionFeedback(decisionId: string): Promise<GetFeedbackResponse> {
  const raw = await apiFetch<unknown>(decisionFeedbackPath(decisionId));
  return getFeedbackResponseSchema.parse(raw);
}
