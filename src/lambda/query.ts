/**
 * Lambda: QueryFunction — GET /v1/signals, /v1/decisions, /v1/receipts
 *
 * Routes by path; calls async DynamoDB adapters then delegates validation+formatting
 * to handler-core functions (reusing the framework-agnostic business logic).
 *
 * Handler: dist/lambda/query.handler
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDbSignalLogRepository } from '../signalLog/dynamodb-repository.js';
import { DynamoDbDecisionRepository } from '../decision/dynamodb-repository.js';
import { validateSignalLogQuery } from '../signalLog/validator.js';
import { validateGetDecisionsRequest } from '../decision/validator.js';
import type { SignalLogReadResponse, GetDecisionsResponse, GetReceiptsResponse, Receipt } from '../shared/types.js';

let initialized = false;
let signalLogRepo: DynamoDbSignalLogRepository;
let decisionRepo: DynamoDbDecisionRepository;

function init(): void {
  if (initialized) return;
  signalLogRepo = new DynamoDbSignalLogRepository(process.env.SIGNALS_TABLE!);
  decisionRepo = new DynamoDbDecisionRepository(process.env.DECISIONS_TABLE!);
  initialized = true;
}

function errorResponse(statusCode: number, error: string, code: string, field_path?: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error, code, field_path }),
  };
}

async function handleGetSignals(params: Record<string, string | undefined>): Promise<APIGatewayProxyResult> {
  const validation = validateSignalLogQuery(params);
  if (!validation.valid || validation.errors.length > 0) {
    const e = validation.errors[0]!;
    return errorResponse(400, e.message, e.code, e.field_path);
  }

  const result = await signalLogRepo.querySignals(validation.parsed!);
  const response: SignalLogReadResponse = {
    org_id: validation.parsed!.org_id,
    learner_reference: validation.parsed!.learner_reference,
    signals: result.signals,
    next_page_token: result.nextPageToken ?? null,
  };

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(response) };
}

async function handleGetDecisions(params: Record<string, string | undefined>): Promise<APIGatewayProxyResult> {
  const validation = validateGetDecisionsRequest(params);
  if (!validation.valid || validation.errors.length > 0) {
    const e = validation.errors[0]!;
    return errorResponse(400, e.message, e.code, e.field_path);
  }

  const result = await decisionRepo.getDecisions(validation.parsed!);
  const response: GetDecisionsResponse = {
    org_id: validation.parsed!.org_id,
    learner_reference: validation.parsed!.learner_reference,
    decisions: result.decisions,
    next_page_token: result.nextPageToken ?? null,
  };

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(response) };
}

async function handleGetReceipts(params: Record<string, string | undefined>): Promise<APIGatewayProxyResult> {
  const validation = validateGetDecisionsRequest(params);
  if (!validation.valid || validation.errors.length > 0) {
    const e = validation.errors[0]!;
    return errorResponse(400, e.message, e.code, e.field_path);
  }

  const result = await decisionRepo.getDecisions(validation.parsed!);
  const receipts: Receipt[] = result.decisions.map((d) => ({
    decision_id: d.decision_id,
    decision_type: d.decision_type,
    decided_at: d.decided_at,
    trace: d.trace,
  }));

  const response: GetReceiptsResponse = {
    org_id: validation.parsed!.org_id,
    learner_reference: validation.parsed!.learner_reference,
    receipts,
    next_page_token: result.nextPageToken ?? null,
  };

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(response) };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  init();

  const params = (event.queryStringParameters ?? {}) as Record<string, string | undefined>;
  const path = event.path;

  if (path.endsWith('/signals')) return handleGetSignals(params);
  if (path.endsWith('/decisions')) return handleGetDecisions(params);
  if (path.endsWith('/receipts')) return handleGetReceipts(params);

  return {
    statusCode: 404,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Not Found' }),
  };
};
