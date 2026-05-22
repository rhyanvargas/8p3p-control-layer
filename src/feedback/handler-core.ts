import { randomUUID } from 'node:crypto';
import { ErrorCodes } from '../shared/error-codes.js';
import {
  DECISION_TYPES,
  FEEDBACK_REASON_CATEGORIES,
  type Decision,
  type DecisionType,
  type FeedbackAction,
  type FeedbackListItem,
  type FeedbackRecord,
  type GetFeedbackResponse,
  type PendingFeedbackResponse,
  type RecordViewResponse,
  type SubmitFeedbackResponse,
} from '../shared/types.js';
import type { FeedbackRepository } from './repository.js';

function emptyPendingByType(): Record<DecisionType, number> {
  return Object.fromEntries(DECISION_TYPES.map((t) => [t, 0])) as Record<DecisionType, number>;
}

export type DecisionLookup = (
  orgId: string,
  decisionId: string
) => Promise<Decision | null> | Decision | null;

function isPendingNotImplemented(e: unknown): boolean {
  return (
    e !== null &&
    typeof e === 'object' &&
    'code' in e &&
    (e as { code?: string }).code === ErrorCodes.NOT_IMPLEMENTED_ON_CLOUD
  );
}

async function resolveDecision(
  lookup: DecisionLookup,
  orgId: string,
  decisionId: string
): Promise<Decision | null> {
  const d = lookup(orgId, decisionId);
  return await Promise.resolve(d);
}

function toListItem(r: FeedbackRecord): FeedbackListItem {
  return {
    feedback_id: r.feedback_id,
    action: r.action,
    reason_category: r.reason_category,
    reason_text: r.reason_text,
    suggested_decision_type: r.suggested_decision_type,
    created_at: r.created_at,
  };
}

export async function handleSubmitFeedbackCore(input: {
  orgId: string;
  decisionId: string;
  sessionId: string;
  body: unknown;
  now: string;
  repo: FeedbackRepository;
  getDecisionById: DecisionLookup;
}): Promise<{
  statusCode: number;
  body: Record<string, unknown>;
}> {
  const { orgId, decisionId, sessionId, body, now, repo, getDecisionById } = input;

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      statusCode: 400,
      body: { code: ErrorCodes.INVALID_ACTION, message: 'Request body must be a JSON object.' },
    };
  }
  const b = body as Record<string, unknown>;
  const actionRaw = b.action;
  if (typeof actionRaw !== 'string' || !['approve', 'reject', 'ignore'].includes(actionRaw)) {
    return {
      statusCode: 400,
      body: { code: ErrorCodes.INVALID_ACTION, message: 'action must be approve, reject, or ignore.' },
    };
  }
  const action = actionRaw as FeedbackAction;

  const reasonCategoryRaw =
    b.reason_category === undefined || b.reason_category === null
      ? null
      : typeof b.reason_category === 'string'
        ? b.reason_category
        : String(b.reason_category);
  const reasonCategory =
    reasonCategoryRaw === null || reasonCategoryRaw.length === 0 ? null : reasonCategoryRaw;

  if (reasonCategory !== null) {
    const allowed = FEEDBACK_REASON_CATEGORIES[action];
    if (!allowed.includes(reasonCategory)) {
      return {
        statusCode: 400,
        body: { code: ErrorCodes.INVALID_REASON_CATEGORY, message: 'reason_category is not valid for this action.' },
      };
    }
  }

  const reasonTextRaw =
    b.reason_text === undefined || b.reason_text === null
      ? null
      : typeof b.reason_text === 'string'
        ? b.reason_text
        : String(b.reason_text);
  const reasonText = reasonTextRaw === null || reasonTextRaw.length === 0 ? null : reasonTextRaw;
  if (reasonText !== null && reasonText.length > 2000) {
    return {
      statusCode: 400,
      body: { code: ErrorCodes.REASON_TEXT_TOO_LONG, message: 'reason_text exceeds 2000 characters.' },
    };
  }

  const suggestedRaw = b.suggested_decision_type;
  const suggestedDecType =
    suggestedRaw === undefined || suggestedRaw === null
      ? null
      : typeof suggestedRaw === 'string' && suggestedRaw.trim() === ''
        ? null
        : typeof suggestedRaw === 'string'
          ? suggestedRaw
          : String(suggestedRaw);

  if (action === 'reject' && reasonCategory === 'wrong_decision_type') {
    if (suggestedDecType === null) {
      return {
        statusCode: 400,
        body: {
          code: ErrorCodes.SUGGESTED_DECISION_TYPE_REQUIRED,
          message: 'suggested_decision_type is required when reason_category is wrong_decision_type.',
        },
      };
    }
    if (!DECISION_TYPES.includes(suggestedDecType as (typeof DECISION_TYPES)[number])) {
      return {
        statusCode: 400,
        body: { code: ErrorCodes.INVALID_REASON_CATEGORY, message: 'suggested_decision_type must be a valid decision type.' },
      };
    }
  } else if (suggestedDecType !== null) {
    return {
      statusCode: 400,
      body: {
        code: ErrorCodes.SUGGESTED_DECISION_TYPE_FORBIDDEN,
        message: 'suggested_decision_type must be omitted unless reason_category is wrong_decision_type.',
      },
    };
  }

  const decision = await resolveDecision(getDecisionById, orgId, decisionId);
  if (!decision) {
    return {
      statusCode: 404,
      body: { code: ErrorCodes.DECISION_NOT_FOUND, message: 'Decision not found for this organization.' },
    };
  }

  const record: FeedbackRecord = {
    feedback_id: randomUUID(),
    decision_id: decisionId,
    org_id: orgId,
    learner_reference: decision.learner_reference,
    session_id: sessionId,
    action,
    reason_category: reasonCategory,
    reason_text: reasonText,
    suggested_decision_type: suggestedDecType,
    created_at: now,
  };

  await repo.saveFeedback(record);

  const resBody: SubmitFeedbackResponse = {
    feedback_id: record.feedback_id,
    decision_id: decisionId,
    action,
    reason_category: reasonCategory,
    created_at: now,
  };
  return { statusCode: 201, body: resBody as unknown as Record<string, unknown> };
}

export async function handleGetFeedbackCore(input: {
  orgId: string;
  decisionId: string;
  repo: FeedbackRepository;
  getDecisionById: DecisionLookup;
}): Promise<{ statusCode: number; body: GetFeedbackResponse | Record<string, unknown> }> {
  const { orgId, decisionId, repo, getDecisionById } = input;
  const decision = await resolveDecision(getDecisionById, orgId, decisionId);
  if (!decision) {
    return {
      statusCode: 404,
      body: { code: ErrorCodes.DECISION_NOT_FOUND, message: 'Decision not found for this organization.' },
    };
  }
  const rows = await repo.listFeedbackForDecision(orgId, decisionId);
  const feedback = rows.map(toListItem);
  const latest_action: GetFeedbackResponse['latest_action'] =
    rows.length === 0 ? null : rows[rows.length - 1]!.action;
  return {
    statusCode: 200,
    body: { decision_id: decisionId, feedback, latest_action },
  };
}

export async function handleRecordViewCore(input: {
  orgId: string;
  decisionId: string;
  sessionId: string;
  now: string;
  repo: FeedbackRepository;
  getDecisionById: DecisionLookup;
}): Promise<{ statusCode: number; body: RecordViewResponse | Record<string, unknown> }> {
  const { orgId, decisionId, sessionId, now, repo, getDecisionById } = input;
  const decision = await resolveDecision(getDecisionById, orgId, decisionId);
  if (!decision) {
    return {
      statusCode: 404,
      body: { code: ErrorCodes.DECISION_NOT_FOUND, message: 'Decision not found for this organization.' },
    };
  }
  const record = {
    view_id: randomUUID(),
    decision_id: decisionId,
    org_id: orgId,
    session_id: sessionId,
    viewed_at: now,
  };
  const { recorded, existing_viewed_at } = await repo.recordView(record, 60);
  if (recorded) {
    return { statusCode: 200, body: { recorded: true, viewed_at: now } };
  }
  void existing_viewed_at;
  return { statusCode: 200, body: { recorded: false, reason: 'dedup_window' as const } };
}

export async function handleGetPendingCore(input: {
  orgId: string;
  olderThanDays: number;
  now: string;
  repo: FeedbackRepository;
}): Promise<{
  statusCode: number;
  body: PendingFeedbackResponse | Record<string, unknown>;
}> {
  const { orgId, olderThanDays, now, repo } = input;
  try {
    const { total, byType, oldestDecidedAt } = await repo.countPendingByType(orgId, olderThanDays, now);
    const body: PendingFeedbackResponse = {
      org_id: orgId,
      pending_count: total,
      pending_by_type: byType,
      oldest_decided_at: oldestDecidedAt,
      threshold_days: olderThanDays,
    };
    return { statusCode: 200, body };
  } catch (e) {
    if (isPendingNotImplemented(e)) {
      return {
        statusCode: 501,
        body: {
          code: ErrorCodes.NOT_IMPLEMENTED_ON_CLOUD,
          message: 'Pending feedback counts are not available on this deployment path.',
          org_id: orgId,
          pending_count: 0,
          pending_by_type: emptyPendingByType(),
          oldest_decided_at: null,
          threshold_days: olderThanDays,
        },
      };
    }
    throw e;
  }
}
