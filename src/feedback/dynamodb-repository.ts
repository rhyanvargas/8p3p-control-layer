/**
 * DynamoDB FeedbackRepository — FeedbackTable (PK=org_id, SK=feedback#… | view#…).
 * @see docs/specs/educator-feedback-api.md § Storage
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  type QueryCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import { ErrorCodes } from '../shared/error-codes.js';
import type { DecisionViewRecord, FeedbackRecord } from '../shared/types.js';
import type { FeedbackRepository, PendingCountResult } from './repository.js';

export class FeedbackPendingNotImplementedError extends Error {
  readonly code = ErrorCodes.NOT_IMPLEMENTED_ON_CLOUD;
  constructor() {
    super('GET /v1/decisions/feedback/pending is not implemented on the DynamoDB path in Phase 1');
    this.name = 'FeedbackPendingNotImplementedError';
  }
}

export class DynamoDbFeedbackRepository implements FeedbackRepository {
  private readonly doc: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(tableName: string, client?: DynamoDBClient) {
    const dynamo = client ?? new DynamoDBClient({});
    this.doc = DynamoDBDocumentClient.from(dynamo);
    this.tableName = tableName;
  }

  async saveFeedback(record: FeedbackRecord): Promise<void> {
    const sk = `feedback#${record.created_at}#${record.feedback_id}`;
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          org_id: record.org_id,
          sk,
          record_kind: 'feedback',
          feedback_id: record.feedback_id,
          decision_id: record.decision_id,
          learner_reference: record.learner_reference,
          session_id: record.session_id,
          action: record.action,
          reason_category: record.reason_category,
          reason_text: record.reason_text,
          suggested_decision_type: record.suggested_decision_type,
          created_at: record.created_at,
        },
      })
    );
  }

  async listFeedbackForDecision(orgId: string, decisionId: string): Promise<FeedbackRecord[]> {
    const items: Record<string, unknown>[] = [];
    let startKey: QueryCommandOutput['LastEvaluatedKey'] | undefined;

    do {
      const out = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'org_id = :o AND begins_with(sk, :p)',
          ExpressionAttributeValues: {
            ':o': orgId,
            ':p': 'feedback#',
            ':d': decisionId,
          },
          FilterExpression: 'decision_id = :d',
          ExclusiveStartKey: startKey,
        })
      );
      for (const it of out.Items ?? []) {
        items.push(it as Record<string, unknown>);
      }
      startKey = out.LastEvaluatedKey;
    } while (startKey);

    items.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

    return items.map((it) => ({
      feedback_id: String(it.feedback_id),
      decision_id: String(it.decision_id),
      org_id: String(it.org_id),
      learner_reference: String(it.learner_reference),
      session_id: String(it.session_id),
      action: it.action as FeedbackRecord['action'],
      reason_category: (it.reason_category as string | null) ?? null,
      reason_text: (it.reason_text as string | null) ?? null,
      suggested_decision_type: (it.suggested_decision_type as string | null) ?? null,
      created_at: String(it.created_at),
    }));
  }

  async recordView(record: DecisionViewRecord, dedupWindowSeconds: number): Promise<{ recorded: boolean; existing_viewed_at?: string }> {
    const nowMs = Date.parse(record.viewed_at);
    const viewItems: Array<{ viewed_at: string; sk: string }> = [];
    let startKey: QueryCommandOutput['LastEvaluatedKey'] | undefined;

    do {
      const out = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'org_id = :o AND begins_with(sk, :p)',
          ExpressionAttributeValues: {
            ':o': record.org_id,
            ':p': 'view#',
            ':d': record.decision_id,
            ':s': record.session_id,
          },
          FilterExpression: 'decision_id = :d AND session_id = :s',
          ExclusiveStartKey: startKey,
        })
      );
      for (const it of out.Items ?? []) {
        const viewedAt = String((it as { viewed_at?: string }).viewed_at ?? '');
        const sk = String((it as { sk?: string }).sk ?? '');
        if (viewedAt) viewItems.push({ viewed_at: viewedAt, sk });
      }
      startKey = out.LastEvaluatedKey;
    } while (startKey);

    viewItems.sort((a, b) => b.viewed_at.localeCompare(a.viewed_at));
    const latest = viewItems[0];
    if (latest) {
      const prevMs = Date.parse(latest.viewed_at);
      if (!Number.isNaN(prevMs) && !Number.isNaN(nowMs) && nowMs - prevMs < dedupWindowSeconds * 1000) {
        return { recorded: false, existing_viewed_at: latest.viewed_at };
      }
    }

    const sk = `view#${record.viewed_at}#${record.view_id}`;
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          org_id: record.org_id,
          sk,
          record_kind: 'view',
          view_id: record.view_id,
          decision_id: record.decision_id,
          session_id: record.session_id,
          viewed_at: record.viewed_at,
        },
      })
    );
    return { recorded: true };
  }

  async countPendingByType(_orgId: string, _olderThanDays: number, _nowIso: string): Promise<PendingCountResult> {
    void _orgId;
    void _olderThanDays;
    void _nowIso;
    throw new FeedbackPendingNotImplementedError();
  }

  close(): void {
    // Document client shares underlying client; no per-instance close required.
  }
}
