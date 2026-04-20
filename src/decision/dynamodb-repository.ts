/**
 * DynamoDB Decision Repository (async)
 *
 * Table design (DecisionsTable):
 *   PK: org_id (S)
 *   SK: decision_id (S)
 *   GSI1 (gsi1-learner-time): PK = org_id (S), SK = learner_decided_at (S = learner_reference#decided_at)
 *
 * Pagination: page_token = base64url-encoded ExclusiveStartKey from GSI1.
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { Decision, GetDecisionsRequest } from '../shared/types.js';
import { DECISION_TYPE_TO_EDUCATOR_SUMMARY } from './educator-summaries.js';

export class DynamoDbDecisionRepository {
  private readonly client: DynamoDBClient;
  private readonly tableName: string;

  constructor(tableName: string, client?: DynamoDBClient) {
    this.tableName = tableName;
    this.client = client ?? new DynamoDBClient({});
  }

  async saveDecision(decision: Decision): Promise<void> {
    await this.client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(
          {
            org_id: decision.org_id,
            decision_id: decision.decision_id,
            learner_reference: decision.learner_reference,
            decision_type: decision.decision_type,
            decided_at: decision.decided_at,
            decision_context: decision.decision_context,
            trace: decision.trace,
            ...(decision.output_metadata ? { output_metadata: decision.output_metadata } : {}),
            learner_decided_at: `${decision.learner_reference}#${decision.decided_at}`,
          },
          { removeUndefinedValues: true }
        ),
      })
    );
  }

  async getDecisions(request: GetDecisionsRequest): Promise<{
    decisions: Decision[];
    hasMore: boolean;
    nextPageToken: string | null;
  }> {
    const pageSize = Math.min(Math.max(1, request.page_size ?? 100), 1000);
    const learnerFrom = `${request.learner_reference}#${request.from_time}`;
    const learnerTo = `${request.learner_reference}#${request.to_time}`;

    const exclusiveStartKey = request.page_token
      ? decodePageToken(request.page_token)
      : undefined;

    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'gsi1-learner-time',
        KeyConditionExpression: 'org_id = :org AND learner_decided_at BETWEEN :from AND :to',
        ExpressionAttributeValues: marshall({
          ':org': request.org_id,
          ':from': learnerFrom,
          ':to': learnerTo,
        }),
        Limit: pageSize + 1,
        ScanIndexForward: false,
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    const items = result.Items ?? [];
    const hasMore = items.length > pageSize;
    const pageItems = hasMore ? items.slice(0, pageSize) : items;
    const decisions = pageItems.map((item) => unmarshallDecision(unmarshall(item)));

    const nextPageToken =
      hasMore && result.LastEvaluatedKey
        ? encodePageToken(result.LastEvaluatedKey)
        : null;

    return { decisions, hasMore, nextPageToken };
  }

  async getDecisionById(orgId: string, decisionId: string): Promise<Decision | null> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({ org_id: orgId, decision_id: decisionId }),
      })
    );

    return result.Item ? unmarshallDecision(unmarshall(result.Item)) : null;
  }
}

function unmarshallDecision(item: Record<string, unknown>): Decision {
  const decisionType = item.decision_type as Decision['decision_type'];
  const trace = item.trace as Decision['trace'] | undefined;
  if (!trace) {
    throw new Error(
      `DynamoDB decision row missing required 'trace' object (decision_id=${String(item.decision_id)})`
    );
  }
  return {
    org_id: item.org_id as string,
    decision_id: item.decision_id as string,
    learner_reference: item.learner_reference as string,
    decision_type: decisionType,
    decided_at: item.decided_at as string,
    decision_context: item.decision_context as Record<string, unknown>,
    trace: {
      ...trace,
      educator_summary:
        trace.educator_summary && trace.educator_summary.length > 0
          ? trace.educator_summary
          : DECISION_TYPE_TO_EDUCATOR_SUMMARY[decisionType],
    },
    output_metadata: item.output_metadata as Decision['output_metadata'],
  };
}

function encodePageToken(lastKey: Record<string, AttributeValue>): string {
  return Buffer.from(JSON.stringify(lastKey), 'utf-8').toString('base64url');
}

function decodePageToken(token: string): Record<string, AttributeValue> | undefined {
  try {
    return JSON.parse(Buffer.from(token, 'base64url').toString('utf-8')) as Record<string, AttributeValue>;
  } catch {
    return undefined;
  }
}

export { encodePageToken as encodeDecisionPageToken };
