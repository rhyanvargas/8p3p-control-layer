/**
 * Lambda: IngestFunction — POST /v1/signals
 *
 * Handler: dist/lambda/ingest.handler
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handleSignalIngestionAsync, type DynamoIngestionPorts } from '../ingestion/handler-core-async.js';
import { DynamoDbIdempotencyRepository } from '../ingestion/dynamodb-idempotency-repository.js';
import { DynamoDbSignalLogRepository } from '../signalLog/dynamodb-repository.js';
import { DynamoDbStateRepository } from '../state/dynamodb-repository.js';
import { DynamoDbDecisionRepository } from '../decision/dynamodb-repository.js';
import { DynamoDbIngestionLogRepository } from '../ingestion/dynamodb-ingestion-log-repository.js';
import { loadPolicy } from '../decision/policy-loader.js';

const REQUIRED_ENV_VARS = [
  'IDEMPOTENCY_TABLE',
  'SIGNALS_TABLE',
  'STATE_TABLE',
  'APPLIED_SIGNALS_TABLE',
  'DECISIONS_TABLE',
  'INGESTION_LOG_TABLE',
] as const;

let initialized = false;
let ports: DynamoIngestionPorts;

function init(): void {
  if (initialized) return;

  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  ports = {
    idempotency: new DynamoDbIdempotencyRepository(process.env.IDEMPOTENCY_TABLE!),
    signalLog: new DynamoDbSignalLogRepository(process.env.SIGNALS_TABLE!),
    state: new DynamoDbStateRepository(process.env.STATE_TABLE!, process.env.APPLIED_SIGNALS_TABLE!),
    decision: new DynamoDbDecisionRepository(process.env.DECISIONS_TABLE!),
    ingestionLog: new DynamoDbIngestionLogRepository(process.env.INGESTION_LOG_TABLE!),
  };

  try {
    loadPolicy();
  } catch {
    // Policy file may not be bundled; DynamoDB resolution handles this at request time
  }

  initialized = true;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  init();

  const log = { warn: (obj: unknown, msg: string) => console.warn(JSON.stringify({ ...(obj as object), msg })) };

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(event.body ?? '{}');
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const result = await handleSignalIngestionAsync(rawBody, ports, log);

  return {
    statusCode: result.statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result.body),
  };
};
