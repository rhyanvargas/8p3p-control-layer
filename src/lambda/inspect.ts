/**
 * Lambda: InspectFunction — GET /v1/state, /v1/state/list, /v1/state/trajectory, /v1/ingestion,
 *   /v1/learners/{learner_reference}/summary
 *
 * Handler: dist/lambda/inspect.handler
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDbStateRepository } from '../state/dynamodb-repository.js';
import { DynamoDbIngestionLogRepository } from '../ingestion/dynamodb-ingestion-log-repository.js';
import { DynamoDbDecisionRepository } from '../decision/dynamodb-repository.js';
import { DynamoDbSignalLogRepository } from '../signalLog/dynamodb-repository.js';
import { loadRoutingConfigForOrg, loadPolicyForContext } from '../decision/policy-loader.js';
import { listActivePoliciesForOrg, loadPolicyByKeyForOrg } from '../policies/active-policies-source.js';
import {
  learnerSummaryRequestLog,
  resolveSummaryPolicyKey,
  type ActivePolicyResponse,
  type RecentDecisionItem,
} from '../learners/summary-handler-core.js';
import {
  completeMasteryBreakdown,
  projectLearnerState,
  roundNumeric,
} from '../learners/state-projection.js';
import { ErrorCodes } from '../shared/error-codes.js';
import { encodeTrajectoryPageToken, decodeTrajectoryPageToken } from '../state/trajectory-pagination.js';
import { buildSummary, buildVersions, type FieldSummary } from '../state/trajectory-handler-core.js';
import type { LearnerState, IngestionLogResponse } from '../shared/types.js';

const TRAJECTORY_PAGE_SIZE = 100;
const TRAJECTORY_SAFETY_CAP_PAGES = 10;

let initialized = false;
let stateRepo: DynamoDbStateRepository;
let ingestionLogRepo: DynamoDbIngestionLogRepository;
let decisionRepo: DynamoDbDecisionRepository;
let signalLogRepo: DynamoDbSignalLogRepository;

function init(): void {
  if (initialized) return;
  stateRepo = new DynamoDbStateRepository(process.env.STATE_TABLE!, process.env.APPLIED_SIGNALS_TABLE!);
  ingestionLogRepo = new DynamoDbIngestionLogRepository(process.env.INGESTION_LOG_TABLE!);
  decisionRepo = new DynamoDbDecisionRepository(process.env.DECISIONS_TABLE!);
  signalLogRepo = new DynamoDbSignalLogRepository(process.env.SIGNALS_TABLE!);
  initialized = true;
}

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function handleGetState(params: Record<string, string | undefined>): Promise<APIGatewayProxyResult> {
  const orgId = params.org_id;
  const learnerRef = params.learner_reference;

  if (!orgId || orgId.trim() === '') return jsonResponse(400, { code: ErrorCodes.ORG_SCOPE_REQUIRED, message: 'org_id is required' });
  if (!learnerRef || learnerRef.trim() === '') return jsonResponse(400, { code: ErrorCodes.MISSING_REQUIRED_FIELD, message: 'learner_reference is required' });

  let version: number | undefined;
  if (params.version) {
    const v = parseInt(params.version, 10);
    if (isNaN(v) || v < 1) return jsonResponse(400, { code: ErrorCodes.INVALID_TYPE, message: 'version must be a positive integer' });
    version = v;
  }

  const state = version != null
    ? await stateRepo.getStateByVersion(orgId, learnerRef, version)
    : await stateRepo.getState(orgId, learnerRef);

  if (!state) {
    return jsonResponse(404, {
      code: version != null ? ErrorCodes.STATE_VERSION_NOT_FOUND : ErrorCodes.STATE_NOT_FOUND,
      message: version != null ? `State version ${version} not found` : `No state found for learner ${learnerRef}`,
    });
  }

  return jsonResponse(200, state);
}

const VALID_DIRECTIONS = new Set(['improving', 'declining', 'stable']);

async function handleGetStateTrajectory(params: Record<string, string | undefined>): Promise<APIGatewayProxyResult> {
  const orgId = params.org_id;
  if (!orgId || orgId.trim() === '') return jsonResponse(400, { code: ErrorCodes.ORG_SCOPE_REQUIRED, message: 'org_id is required and must be non-empty', field_path: 'org_id' });
  if (orgId.length > 128) return jsonResponse(400, { code: ErrorCodes.INVALID_LENGTH, message: 'org_id must be 1-128 characters', field_path: 'org_id' });

  const learnerRef = params.learner_reference;
  if (!learnerRef || learnerRef.trim() === '') return jsonResponse(400, { code: ErrorCodes.MISSING_REQUIRED_FIELD, message: "'learner_reference' is required", field_path: 'learner_reference' });
  if (learnerRef.length > 256) return jsonResponse(400, { code: ErrorCodes.INVALID_LENGTH, message: 'learner_reference must be 1-256 characters', field_path: 'learner_reference' });

  if (!params.fields || params.fields.trim() === '') return jsonResponse(400, { code: ErrorCodes.MISSING_REQUIRED_FIELD, message: "'fields' is required", field_path: 'fields' });
  const rawFields = params.fields.split(',').map(f => f.trim());
  const fields = [...new Set(rawFields)];

  for (const field of fields) {
    if (field === '') return jsonResponse(400, { code: ErrorCodes.INVALID_FORMAT, message: 'Field name must not be empty', field_path: 'fields' });
    if (field.length > 128) return jsonResponse(400, { code: ErrorCodes.INVALID_FORMAT, message: `Field name exceeds 128 characters: '${field}'`, field_path: 'fields' });
    if (field.includes('.')) return jsonResponse(400, { code: ErrorCodes.INVALID_FORMAT, message: 'Dot-path fields are not supported in v1.1. Use top-level canonical field names.', field_path: 'fields' });
  }
  if (fields.length > 10) return jsonResponse(400, { code: ErrorCodes.INVALID_FORMAT, message: `Maximum 10 fields per trajectory request. Got ${fields.length}.`, field_path: 'fields' });

  let fromVersion = 1;
  if (params.from_version !== undefined && params.from_version !== '') {
    const v = parseInt(params.from_version, 10);
    if (isNaN(v) || v < 1) return jsonResponse(400, { code: ErrorCodes.INVALID_TYPE, message: 'from_version must be a positive integer', field_path: 'from_version' });
    fromVersion = v;
  }

  let toVersion: number | undefined;
  if (params.to_version !== undefined && params.to_version !== '') {
    const v = parseInt(params.to_version, 10);
    if (isNaN(v) || v < 1) return jsonResponse(400, { code: ErrorCodes.INVALID_TYPE, message: 'to_version must be a positive integer', field_path: 'to_version' });
    toVersion = v;
  }

  let pageSize = 50;
  if (params.page_size !== undefined && params.page_size !== '') {
    const v = parseInt(params.page_size, 10);
    if (isNaN(v) || v < 1 || v > 100) return jsonResponse(400, { code: ErrorCodes.PAGE_SIZE_OUT_OF_RANGE, message: 'page_size must be between 1 and 100', field_path: 'page_size' });
    pageSize = v;
  }

  let cursor: number | undefined;
  if (params.page_token !== undefined && params.page_token !== '') {
    const decoded = decodeTrajectoryPageToken(params.page_token);
    if (decoded === null) return jsonResponse(400, { code: ErrorCodes.INVALID_PAGE_TOKEN, message: 'page_token is malformed or invalid', field_path: 'page_token' });
    cursor = decoded;
  }

  if (toVersion === undefined) {
    const currentState = await stateRepo.getState(orgId, learnerRef);
    if (!currentState) {
      return jsonResponse(404, { code: ErrorCodes.STATE_NOT_FOUND, message: `No state found for learner '${learnerRef}' in org '${orgId}'` });
    }
    toVersion = currentState.state_version;
  }

  if (fromVersion > toVersion) {
    return jsonResponse(400, { code: ErrorCodes.INVALID_FORMAT, message: 'from_version must not exceed to_version', field_path: 'from_version' });
  }

  const { states, nextCursor } = await stateRepo.getStateVersionRange(orgId, learnerRef, fromVersion, toVersion, pageSize, cursor);

  if (states.length === 0 && cursor === undefined) {
    const currentState = await stateRepo.getState(orgId, learnerRef);
    if (!currentState) {
      return jsonResponse(404, { code: ErrorCodes.STATE_NOT_FOUND, message: `No state found for learner '${learnerRef}' in org '${orgId}'` });
    }
  }

  const versions = states.map((s: LearnerState) => {
    const values: Record<string, unknown> = {};
    const directions: Record<string, string | null> = {};
    for (const field of fields) {
      values[field] = (field in s.state) ? s.state[field] : null;
      const dirVal = s.state[`${field}_direction`];
      directions[field] = (typeof dirVal === 'string' && VALID_DIRECTIONS.has(dirVal)) ? dirVal : null;
    }
    return { state_version: s.state_version, updated_at: s.updated_at, values, directions };
  });

  const summary: Record<string, { first_value: number | null; latest_value: number | null; overall_direction: string | null; version_count: number }> = {};
  for (const field of fields) {
    let firstValue: number | undefined;
    let latestValue: number | undefined;
    let versionCount = 0;
    for (const v of versions) {
      const val = v.values[field];
      if (val !== null && typeof val === 'number') {
        versionCount++;
        if (firstValue === undefined) firstValue = val;
        latestValue = val;
      }
    }
    if (versionCount === 0) {
      summary[field] = { first_value: null, latest_value: null, overall_direction: null, version_count: 0 };
      continue;
    }
    let overallDirection: string | null = null;
    if (versionCount >= 2) {
      if (latestValue! > firstValue!) overallDirection = 'improving';
      else if (latestValue! < firstValue!) overallDirection = 'declining';
      else overallDirection = 'stable';
    }
    summary[field] = { first_value: firstValue!, latest_value: latestValue!, overall_direction: overallDirection, version_count: versionCount };
  }

  return jsonResponse(200, {
    org_id: orgId,
    learner_reference: learnerRef,
    fields,
    versions,
    summary,
    next_page_token: nextCursor !== null ? encodeTrajectoryPageToken(nextCursor) : null,
  });
}

async function handleGetStateList(params: Record<string, string | undefined>): Promise<APIGatewayProxyResult> {
  const orgId = params.org_id;
  if (!orgId || orgId.trim() === '') return jsonResponse(400, { code: ErrorCodes.ORG_SCOPE_REQUIRED, message: 'org_id is required' });

  let limit = 50;
  if (params.limit) {
    const l = parseInt(params.limit, 10);
    if (isNaN(l) || l < 1 || l > 500) return jsonResponse(400, { code: ErrorCodes.LIMIT_OUT_OF_RANGE, message: 'limit must be between 1 and 500' });
    limit = l;
  }

  const { learners, nextCursor } = await stateRepo.listLearners(orgId, limit, params.cursor);
  return jsonResponse(200, { org_id: orgId, learners, next_cursor: nextCursor });
}

async function handleGetIngestionLog(params: Record<string, string | undefined>): Promise<APIGatewayProxyResult> {
  const orgId = params.org_id;
  if (!orgId || orgId.trim() === '') return jsonResponse(400, { code: ErrorCodes.ORG_SCOPE_REQUIRED, message: 'org_id is required' });

  let limit = 50;
  if (params.limit) {
    const l = parseInt(params.limit, 10);
    if (isNaN(l) || l < 1 || l > 500) return jsonResponse(400, { code: ErrorCodes.LIMIT_OUT_OF_RANGE, message: 'limit must be between 1 and 500' });
    limit = l;
  }

  const outcome = params.outcome as 'accepted' | 'rejected' | 'duplicate' | undefined;
  if (outcome && !['accepted', 'rejected', 'duplicate'].includes(outcome)) {
    return jsonResponse(400, { code: ErrorCodes.INVALID_OUTCOME_FILTER, message: 'outcome must be accepted, rejected, or duplicate' });
  }

  const { entries, nextCursor } = await ingestionLogRepo.getIngestionOutcomes({ org_id: orgId, limit, outcome, cursor: params.cursor });
  const response: IngestionLogResponse = { org_id: orgId, entries, next_cursor: nextCursor };
  return jsonResponse(200, response);
}

async function handleGetPolicies(params: Record<string, string | undefined>): Promise<APIGatewayProxyResult> {
  const orgId = params.org_id;
  if (!orgId || orgId.trim() === '') {
    return jsonResponse(400, { code: ErrorCodes.MISSING_REQUIRED_FIELD, message: 'org_id is required', field_path: 'org_id' });
  }

  const [policies, routing] = await Promise.all([
    listActivePoliciesForOrg(orgId),
    Promise.resolve(loadRoutingConfigForOrg(orgId)),
  ]);

  return jsonResponse(200, { org_id: orgId, policies, routing: routing ?? null });
}

async function handleGetPolicyDetail(
  params: Record<string, string | undefined>,
  policyKey: string
): Promise<APIGatewayProxyResult> {
  const orgId = params.org_id;
  if (!orgId || orgId.trim() === '') {
    return jsonResponse(400, { code: ErrorCodes.MISSING_REQUIRED_FIELD, message: 'org_id is required', field_path: 'org_id' });
  }

  const policy = await loadPolicyByKeyForOrg(orgId, policyKey);
  if (!policy) {
    return jsonResponse(404, {
      error: {
        code: ErrorCodes.POLICY_NOT_FOUND,
        message: `No policy '${policyKey}' found for org '${orgId}'`,
      },
    });
  }

  return jsonResponse(200, {
    org_id: orgId,
    policy_key: policyKey,
    policy: {
      policy_id: policy.policy_id,
      policy_version: policy.policy_version,
      description: policy.description,
      rules: policy.rules,
      default_decision_type: policy.default_decision_type,
    },
  });
}

function parseSummaryStrictInt(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const num = Number(trimmed);
  return Number.isInteger(num) ? num : null;
}

function validateSummaryTrajectoryFields(
  rawFields: string[]
): APIGatewayProxyResult | string[] {
  const fields = [...new Set(rawFields)];

  for (const field of fields) {
    if (field === '') {
      return jsonResponse(400, {
        code: ErrorCodes.INVALID_FORMAT,
        message: 'Field name must not be empty',
        field_path: 'trajectory_fields',
      });
    }
    if (field.length > 128) {
      return jsonResponse(400, {
        code: ErrorCodes.INVALID_FORMAT,
        message: `Field name exceeds 128 characters: '${field}'`,
        field_path: 'trajectory_fields',
      });
    }
    if (field.includes('.')) {
      return jsonResponse(400, {
        code: ErrorCodes.INVALID_FORMAT,
        message:
          'Dot-path fields are not supported in v1.1. Use top-level canonical field names.',
        field_path: 'trajectory_fields',
      });
    }
  }

  if (fields.length > 10) {
    return jsonResponse(400, {
      code: ErrorCodes.INVALID_FORMAT,
      message: `Maximum 10 fields per trajectory request. Got ${fields.length}.`,
      field_path: 'trajectory_fields',
    });
  }

  return fields;
}

function resolveSummaryTrajectoryFields(
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

async function handleGetLearnerSummary(
  params: Record<string, string | undefined>,
  learnerRef: string
): Promise<APIGatewayProxyResult> {
  if (!learnerRef || learnerRef.trim() === '') {
    return jsonResponse(400, {
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: "'learner_reference' is required",
      field_path: 'learner_reference',
    });
  }
  if (learnerRef.length > 256) {
    return jsonResponse(400, {
      code: ErrorCodes.INVALID_LENGTH,
      message: 'learner_reference must be 1-256 characters',
      field_path: 'learner_reference',
    });
  }

  const orgId = params.org_id;
  if (!orgId || orgId.trim() === '') {
    return jsonResponse(400, {
      code: ErrorCodes.ORG_SCOPE_REQUIRED,
      message: 'org_id is required and must be non-empty',
      field_path: 'org_id',
    });
  }
  if (orgId.length > 128) {
    return jsonResponse(400, {
      code: ErrorCodes.INVALID_LENGTH,
      message: 'org_id must be 1-128 characters',
      field_path: 'org_id',
    });
  }

  let recentDecisionsLimit = 10;
  if (params.recent_decisions_limit !== undefined && params.recent_decisions_limit !== '') {
    const parsed = parseSummaryStrictInt(params.recent_decisions_limit);
    if (parsed === null) {
      return jsonResponse(400, {
        code: ErrorCodes.INVALID_TYPE,
        message: 'recent_decisions_limit must be a positive integer',
        field_path: 'recent_decisions_limit',
      });
    }
    if (parsed < 1 || parsed > 50) {
      return jsonResponse(400, {
        code: ErrorCodes.INVALID_FORMAT,
        message: 'recent_decisions_limit must be between 1 and 50',
        field_path: 'recent_decisions_limit',
      });
    }
    recentDecisionsLimit = parsed;
  }

  let explicitTrajectoryFields: string[] | undefined;
  if (params.trajectory_fields !== undefined && params.trajectory_fields !== '') {
    const rawFields = params.trajectory_fields.split(',').map((f) => f.trim());
    const fieldValidation = validateSummaryTrajectoryFields(rawFields);
    if (!Array.isArray(fieldValidation)) {
      return fieldValidation;
    }
    explicitTrajectoryFields = fieldValidation;
  }

  const currentState = await stateRepo.getState(orgId, learnerRef);
  if (!currentState) {
    return jsonResponse(404, {
      code: ErrorCodes.STATE_NOT_FOUND,
      message: `No state found for learner '${learnerRef}' in org '${orgId}'`,
    });
  }

  const fieldsToTrack = resolveSummaryTrajectoryFields(explicitTrajectoryFields, currentState);

  const collectTrajectoryStates = async (): Promise<LearnerState[]> => {
    const all: LearnerState[] = [];
    let cursor: number | undefined = undefined;
    for (let i = 0; i < TRAJECTORY_SAFETY_CAP_PAGES; i++) {
      const { states, nextCursor } = await stateRepo.getStateVersionRange(
        orgId,
        learnerRef,
        1,
        currentState.state_version,
        TRAJECTORY_PAGE_SIZE,
        cursor
      );
      all.push(...states);
      if (nextCursor === null) break;
      cursor = nextCursor;
    }
    return all;
  };

  const [decisions, decisionTypeSummary, signalsSummary, trajectoryStates] = await Promise.all([
    decisionRepo.getRecentDecisionsByLearner(orgId, learnerRef, recentDecisionsLimit),
    decisionRepo.getDecisionTypeSummaryForLearner(orgId, learnerRef),
    signalLogRepo.getSignalSummary(orgId, learnerRef),
    fieldsToTrack.length > 0 ? collectTrajectoryStates() : Promise.resolve([] as LearnerState[]),
  ]);

  let fieldTrajectories: Record<string, FieldSummary> = {};
  if (fieldsToTrack.length > 0) {
    const trajectoryVersions = buildVersions(trajectoryStates, fieldsToTrack);
    fieldTrajectories = Object.fromEntries(
      Object.entries(buildSummary(trajectoryVersions, fieldsToTrack)).map(([k, v]) => [
        k,
        {
          ...v,
          first_value: roundNumeric(v.first_value) as number,
          latest_value: roundNumeric(v.latest_value) as number,
        },
      ])
    );
  }

  const projectedDecisions: RecentDecisionItem[] = decisions.map((d) => ({
    decision_id: d.decision_id,
    decision_type: d.decision_type,
    decided_at: d.decided_at,
    matched_rule_id: d.trace.matched_rule_id,
    educator_summary: d.trace.educator_summary,
    rationale: d.trace.rationale,
    policy_version: d.trace.policy_version,
  }));

  const rawUserType = loadRoutingConfigForOrg(orgId)?.default_policy_key ?? 'learner';
  const userType = resolveSummaryPolicyKey(orgId, rawUserType, console.warn);
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
    if ((err as Error & { code?: string }).code !== ErrorCodes.POLICY_NOT_FOUND) throw err;
  }

  return jsonResponse(200, {
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
    field_trajectories: fieldTrajectories,
    active_policy: activePolicy,
    signals_summary: signalsSummary,
  });
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  init();

  const params = (event.queryStringParameters ?? {}) as Record<string, string | undefined>;
  const path = event.path ?? '';

  // Public /docs — no Swagger UI bundle in Lambda.
  // TASK-015: serve a static redirect to a hosted Redoc/Swagger page or bundle the YAML for CDN rendering.
  if (path === '/docs' || path.endsWith('/docs') || path.includes('/docs/')) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: '8p3p-control-layer',
        openapi: 'docs/api/openapi.yaml',
        hint: 'Run `npm run dev` locally for interactive Swagger UI at /docs',
      }),
    };
  }

  if (path.endsWith('/state/trajectory')) return handleGetStateTrajectory(params);
  if (path.endsWith('/state/list')) return handleGetStateList(params);
  if (path.endsWith('/state')) return handleGetState(params);
  if (path.endsWith('/ingestion')) return handleGetIngestionLog(params);

  // Policy inspection — static /v1/policies checked before parametric /v1/policies/{key}
  if (/\/v1\/policies$/.test(path)) return handleGetPolicies(params);
  const policyDetailMatch = path.match(/\/v1\/policies\/([^/]+)$/);
  if (policyDetailMatch) return handleGetPolicyDetail(params, policyDetailMatch[1]!);

  const learnerSummaryMatch = path.match(/\/v1\/learners\/([^/]+)\/summary$/);
  if (learnerSummaryMatch) {
    const learnerRef = learnerSummaryMatch[1]!;
    const startedAt = Date.now();
    const result = await handleGetLearnerSummary(params, learnerRef);
    console.log(
      JSON.stringify(
        learnerSummaryRequestLog({
          org_id: params.org_id ?? '',
          learner_reference: learnerRef,
          duration_ms: Date.now() - startedAt,
          statusCode: result.statusCode,
        })
      )
    );
    return result;
  }

  return jsonResponse(404, { error: 'Not Found' });
};
