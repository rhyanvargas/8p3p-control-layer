/**
 * Lambda: InspectFunction — GET /v1/state, /v1/state/list, /v1/ingestion
 *
 * Handler: dist/lambda/inspect.handler
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDbStateRepository } from '../state/dynamodb-repository.js';
import { DynamoDbIngestionLogRepository } from '../ingestion/dynamodb-ingestion-log-repository.js';
import { ErrorCodes } from '../shared/error-codes.js';
import type { IngestionLogResponse } from '../shared/types.js';

let initialized = false;
let stateRepo: DynamoDbStateRepository;
let ingestionLogRepo: DynamoDbIngestionLogRepository;

function init(): void {
  if (initialized) return;
  stateRepo = new DynamoDbStateRepository(process.env.STATE_TABLE!, process.env.APPLIED_SIGNALS_TABLE!);
  ingestionLogRepo = new DynamoDbIngestionLogRepository(process.env.INGESTION_LOG_TABLE!);
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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  init();

  const params = (event.queryStringParameters ?? {}) as Record<string, string | undefined>;
  const path = event.path ?? '';

  // Public /docs (API Gateway proxy) — no Swagger UI bundle in Lambda; point integrators to repo OpenAPI.
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

  if (path.endsWith('/state/list')) return handleGetStateList(params);
  if (path.endsWith('/state')) return handleGetState(params);
  if (path.endsWith('/ingestion')) return handleGetIngestionLog(params);

  return jsonResponse(404, { error: 'Not Found' });
};
