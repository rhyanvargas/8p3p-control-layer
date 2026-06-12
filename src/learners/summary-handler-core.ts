/**
 * Learner Summary Handler Core — framework-agnostic
 * Covers GET /v1/learners/:learner_reference/summary
 */

import type { LearnerState, HandlerResult, MasteryBreakdown } from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import { getState, getStateVersionRange } from '../state/store.js';
import {
  buildSummary,
  buildVersions,
  type FieldSummary,
} from '../state/trajectory-handler-core.js';
import {
  getDecisionTypeSummaryForLearner,
  getRecentDecisionsByLearner,
} from '../decision/store.js';
import { getSignalSummary } from '../signalLog/store.js';
import { loadPolicyForContext, loadRoutingConfigForOrg } from '../decision/policy-loader.js';
import { completeMasteryBreakdown, projectLearnerState, roundNumeric } from './state-projection.js';
import type { LearnerStateProjection } from './state-projection.js';

interface StateErrorResponse {
  code: string;
  message: string;
  field_path?: string;
}

export const LEARNER_SUMMARY_LOG_EVENT = 'learner_summary' as const;

export interface LearnerSummaryRequestLog {
  event: typeof LEARNER_SUMMARY_LOG_EVENT;
  org_id: string;
  learner_reference: string;
  duration_ms: number;
  statusCode: number;
}

export function learnerSummaryRequestLog(
  fields: Omit<LearnerSummaryRequestLog, 'event'>
): LearnerSummaryRequestLog {
  return { event: LEARNER_SUMMARY_LOG_EVENT, ...fields };
}

export type PolicyKey = 'learner' | 'staff';

export interface ActivePolicyResponse {
  policy_id: string;
  policy_key: PolicyKey;
  policy_version: string;
  description?: string;
  rule_count: number;
}

export function resolveSummaryPolicyKey(
  orgId: string,
  rawUserType: string,
  warn: (message: string) => void = console.warn
): PolicyKey {
  if (rawUserType === 'learner' || rawUserType === 'staff') {
    return rawUserType;
  }
  warn(
    `Unrecognized routing default_policy_key '${rawUserType}' for org '${orgId}'; coercing to 'learner'`
  );
  return 'learner';
}

export interface SignalsSummary {
  total_count: number;
  first_signal_at: string | null;
  last_signal_at: string | null;
}

export interface RecentDecisionItem {
  decision_id: string;
  decision_type: string;
  decided_at: string;
  matched_rule_id: string | null;
  educator_summary: string;
  rationale: string;
  policy_version: string;
}

export interface LearnerSummaryResponse {
  org_id: string;
  learner_reference: string;
  generated_at: string;
  current_state: {
    state_id: string;
    state_version: number;
    updated_at: string;
    fields: LearnerStateProjection;
    mastery_breakdown: MasteryBreakdown | null;
  };
  recent_decisions: RecentDecisionItem[];
  field_trajectories: Record<string, FieldSummary>;
  active_policy: ActivePolicyResponse | null;
  signals_summary: SignalsSummary;
}

const PAGE_SIZE = 100;
const SAFETY_CAP_PAGES = 10;

function parseStrictInt(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const num = Number(trimmed);
    return Number.isInteger(num) ? num : null;
  }
  return null;
}

function validateTrajectoryFieldTokens(
  rawFields: string[]
): HandlerResult<StateErrorResponse> | string[] {
  const fields = [...new Set(rawFields)];

  for (const field of fields) {
    if (field === '') {
      return {
        statusCode: 400,
        body: {
          code: ErrorCodes.INVALID_FORMAT,
          message: 'Field name must not be empty',
          field_path: 'trajectory_fields',
        },
      };
    }
    if (field.length > 128) {
      return {
        statusCode: 400,
        body: {
          code: ErrorCodes.INVALID_FORMAT,
          message: `Field name exceeds 128 characters: '${field}'`,
          field_path: 'trajectory_fields',
        },
      };
    }
    if (field.includes('.')) {
      return {
        statusCode: 400,
        body: {
          code: ErrorCodes.INVALID_FORMAT,
          message:
            'Dot-path fields are not supported in v1.1. Use top-level canonical field names.',
          field_path: 'trajectory_fields',
        },
      };
    }
  }

  if (fields.length > 10) {
    return {
      statusCode: 400,
      body: {
        code: ErrorCodes.INVALID_FORMAT,
        message: `Maximum 10 fields per trajectory request. Got ${fields.length}.`,
        field_path: 'trajectory_fields',
      },
    };
  }

  return fields;
}

function validateSummaryParams(
  params: Record<string, unknown>
): HandlerResult<StateErrorResponse> | {
  org_id: string;
  learner_reference: string;
  recent_decisions_limit: number;
  trajectory_fields: string[] | undefined;
} {
  if (
    !params.learner_reference ||
    typeof params.learner_reference !== 'string' ||
    params.learner_reference.trim() === ''
  ) {
    return {
      statusCode: 400,
      body: {
        code: ErrorCodes.MISSING_REQUIRED_FIELD,
        message: "'learner_reference' is required",
        field_path: 'learner_reference',
      },
    };
  }
  if (params.learner_reference.length > 256) {
    return {
      statusCode: 400,
      body: {
        code: ErrorCodes.INVALID_LENGTH,
        message: 'learner_reference must be 1-256 characters',
        field_path: 'learner_reference',
      },
    };
  }
  const learnerRef = params.learner_reference as string;

  if (!params.org_id || typeof params.org_id !== 'string' || params.org_id.trim() === '') {
    return {
      statusCode: 400,
      body: {
        code: ErrorCodes.ORG_SCOPE_REQUIRED,
        message: 'org_id is required and must be non-empty',
        field_path: 'org_id',
      },
    };
  }
  if (params.org_id.length > 128) {
    return {
      statusCode: 400,
      body: {
        code: ErrorCodes.INVALID_LENGTH,
        message: 'org_id must be 1-128 characters',
        field_path: 'org_id',
      },
    };
  }
  const orgId = params.org_id as string;

  let recentDecisionsLimit = 10;
  if (params.recent_decisions_limit !== undefined && params.recent_decisions_limit !== '') {
    const parsed = parseStrictInt(params.recent_decisions_limit);
    if (parsed === null) {
      return {
        statusCode: 400,
        body: {
          code: ErrorCodes.INVALID_TYPE,
          message: 'recent_decisions_limit must be a positive integer',
          field_path: 'recent_decisions_limit',
        },
      };
    }
    if (parsed < 1 || parsed > 50) {
      return {
        statusCode: 400,
        body: {
          code: ErrorCodes.INVALID_FORMAT,
          message: 'recent_decisions_limit must be between 1 and 50',
          field_path: 'recent_decisions_limit',
        },
      };
    }
    recentDecisionsLimit = parsed;
  }

  let trajectoryFields: string[] | undefined;
  if (params.trajectory_fields !== undefined && params.trajectory_fields !== '') {
    if (typeof params.trajectory_fields !== 'string') {
      return {
        statusCode: 400,
        body: {
          code: ErrorCodes.INVALID_TYPE,
          message: 'trajectory_fields must be a comma-separated string',
          field_path: 'trajectory_fields',
        },
      };
    }
    const rawFields = (params.trajectory_fields as string).split(',').map((f) => f.trim());
    const fieldValidation = validateTrajectoryFieldTokens(rawFields);
    if ('statusCode' in fieldValidation) {
      return fieldValidation;
    }
    trajectoryFields = fieldValidation;
  }

  return {
    org_id: orgId,
    learner_reference: learnerRef,
    recent_decisions_limit: recentDecisionsLimit,
    trajectory_fields: trajectoryFields,
  };
}

function resolveTrajectoryFields(
  explicitFields: string[] | undefined,
  currentState: LearnerState
): string[] {
  if (explicitFields !== undefined) {
    return explicitFields;
  }
  const projectedFields = projectLearnerState(currentState.state);
  return Object.entries(projectedFields)
    .filter(([k, v]) => typeof v === 'number' && !k.endsWith('_delta'))
    .map(([k]) => k)
    .slice(0, 10);
}

function collectAllStateVersions(
  orgId: string,
  learnerRef: string,
  toVersion: number
): LearnerState[] {
  const allStates: LearnerState[] = [];
  let cursor: number | undefined = undefined;

  for (let page = 0; page < SAFETY_CAP_PAGES; page++) {
    const { states, nextCursor } = getStateVersionRange(
      orgId,
      learnerRef,
      1,
      toVersion,
      PAGE_SIZE,
      cursor
    );
    allStates.push(...states);
    if (nextCursor === null) break;
    cursor = nextCursor;
  }

  return allStates;
}

export async function handleLearnerSummaryCore(
  params: { learner_reference: string } & Record<string, unknown>
): Promise<HandlerResult<LearnerSummaryResponse | StateErrorResponse>> {
  const validation = validateSummaryParams(params);

  if ('statusCode' in validation) {
    return validation;
  }

  const {
    org_id: orgId,
    learner_reference: learnerRef,
    recent_decisions_limit: recentDecisionsLimit,
    trajectory_fields: explicitTrajectoryFields,
  } = validation;

  const currentState = getState(orgId, learnerRef);
  if (!currentState) {
    return {
      statusCode: 404,
      body: {
        code: ErrorCodes.STATE_NOT_FOUND,
        message: `No state found for learner '${learnerRef}' in org '${orgId}'`,
      },
    };
  }

  const fieldsToTrack = resolveTrajectoryFields(explicitTrajectoryFields, currentState);

  let fieldTrajectories: Record<string, FieldSummary> = {};
  if (fieldsToTrack.length > 0) {
    const allStates = collectAllStateVersions(orgId, learnerRef, currentState.state_version);
    const fieldTrajectoryVersions = buildVersions(allStates, fieldsToTrack);
    fieldTrajectories = buildSummary(fieldTrajectoryVersions, fieldsToTrack);
  }

  const decisions = getRecentDecisionsByLearner(orgId, learnerRef, recentDecisionsLimit);
  const decisionTypeSummary = getDecisionTypeSummaryForLearner(orgId, learnerRef);
  const projectedDecisions: RecentDecisionItem[] = decisions.map((d) => ({
    decision_id: d.decision_id,
    decision_type: d.decision_type,
    decided_at: d.decided_at,
    matched_rule_id: d.trace.matched_rule_id,
    educator_summary: d.trace.educator_summary,
    rationale: d.trace.rationale,
    policy_version: d.trace.policy_version,
  }));

  const signalsSummary = getSignalSummary(orgId, learnerRef);

  const rawUserType = loadRoutingConfigForOrg(orgId)?.default_policy_key ?? 'learner';
  const logWarn =
    typeof params.logWarn === 'function'
      ? (params.logWarn as (message: string) => void)
      : console.warn;
  const userType = resolveSummaryPolicyKey(orgId, rawUserType, logWarn);
  let activePolicy: ActivePolicyResponse | null = null;
  try {
    const policy = loadPolicyForContext(orgId, userType);
    activePolicy = {
      policy_id: policy.policy_id,
      policy_key: userType,
      policy_version: policy.policy_version,
      description: policy.description,
      rule_count: policy.rules.length,
    };
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    if (code !== ErrorCodes.POLICY_NOT_FOUND) throw err;
  }

  return {
    statusCode: 200,
    body: {
      org_id: orgId,
      learner_reference: learnerRef,
      generated_at: new Date().toISOString(),
      current_state: {
        state_id: currentState.state_id,
        state_version: currentState.state_version,
        updated_at: currentState.updated_at,
        fields: projectLearnerState(currentState.state),
        mastery_breakdown: completeMasteryBreakdown(currentState.state, decisionTypeSummary),
      },
      recent_decisions: projectedDecisions,
      field_trajectories: Object.fromEntries(
        Object.entries(fieldTrajectories).map(([k, v]) => [
          k,
          {
            ...v,
            first_value: roundNumeric(v.first_value) as number,
            latest_value: roundNumeric(v.latest_value) as number,
          },
        ])
      ),
      active_policy: activePolicy,
      signals_summary: signalsSummary,
    },
  };
}
