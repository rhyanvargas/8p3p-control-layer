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
import {
  PRODUCT_FEEDBACK_LIST_DEFAULT_LIMIT,
  PRODUCT_FEEDBACK_LIST_MAX_LIMIT,
  type DecisionViewRecord,
  type FeedbackRecord,
  type ProductFeedbackRecord,
} from '../shared/types.js';
import type { FeedbackRepository, PendingCountResult, ProductFeedbackListFilters } from './repository.js';

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

  private normalizeProductFeedbackLimit(raw?: number): number {
    if (raw === undefined) return PRODUCT_FEEDBACK_LIST_DEFAULT_LIMIT;
    if (!Number.isFinite(raw) || raw < 1) return PRODUCT_FEEDBACK_LIST_DEFAULT_LIMIT;
    return Math.min(Math.floor(raw), PRODUCT_FEEDBACK_LIST_MAX_LIMIT);
  }

  private mapProductFeedbackItem(it: Record<string, unknown>): ProductFeedbackRecord {
    return {
      feedback_id: String(it.feedback_id),
      org_id: String(it.org_id),
      session_id: String(it.session_id),
      kind: it.kind as ProductFeedbackRecord['kind'],
      feedback_type: (it.feedback_type as ProductFeedbackRecord['feedback_type']) ?? null,
      category: (it.category as ProductFeedbackRecord['category']) ?? null,
      csat_score: it.csat_score == null ? null : Number(it.csat_score),
      message: (it.message as string | null) ?? null,
      page_context: (it.page_context as string | null) ?? null,
      app_version: (it.app_version as string | null) ?? null,
      created_at: String(it.created_at),
    };
  }

  private productFeedbackMatchesFilters(
    item: Record<string, unknown>,
    filters?: ProductFeedbackListFilters
  ): boolean {
    if (!filters) return true;
    if (filters.kind !== undefined && item.kind !== filters.kind) return false;
    if (filters.feedback_type !== undefined && item.feedback_type !== filters.feedback_type) return false;
    if (filters.category !== undefined && item.category !== filters.category) return false;
    if (filters.since !== undefined && String(item.created_at) < filters.since) return false;
    return true;
  }

  async insertProductFeedback(record: ProductFeedbackRecord): Promise<void> {
    const sk = `product#${record.created_at}#${record.feedback_id}`;
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          org_id: record.org_id,
          sk,
          record_kind: 'product_feedback',
          feedback_id: record.feedback_id,
          session_id: record.session_id,
          kind: record.kind,
          feedback_type: record.feedback_type,
          category: record.category,
          csat_score: record.csat_score,
          message: record.message,
          page_context: record.page_context,
          app_version: record.app_version,
          created_at: record.created_at,
        },
      })
    );
  }

  async listProductFeedback(orgId: string, filters?: ProductFeedbackListFilters): Promise<ProductFeedbackRecord[]> {
    const items: Record<string, unknown>[] = [];
    let startKey: QueryCommandOutput['LastEvaluatedKey'] | undefined;

    do {
      const out = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'org_id = :o AND begins_with(sk, :p)',
          ExpressionAttributeValues: {
            ':o': orgId,
            ':p': 'product#',
          },
          ScanIndexForward: false,
          ExclusiveStartKey: startKey,
        })
      );
      for (const it of out.Items ?? []) {
        const row = it as Record<string, unknown>;
        if (this.productFeedbackMatchesFilters(row, filters)) {
          items.push(row);
        }
      }
      startKey = out.LastEvaluatedKey;
    } while (startKey);

    items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const limit = this.normalizeProductFeedbackLimit(filters?.limit);
    return items.slice(0, limit).map((it) => this.mapProductFeedbackItem(it));
  }

  close(): void {
    // Document client shares underlying client; no per-instance close required.
  }
}
