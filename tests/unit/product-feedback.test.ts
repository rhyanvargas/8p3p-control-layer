/**
 * Unit tests — product feedback SQLite storage and handler-core validation.
 */

import { mkdtempSync, rmSync } from 'fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDecisionStore, initDecisionStore } from '../../src/decision/store.js';
import {
  closeFeedbackStore,
  getFeedbackRepository,
  initFeedbackStore,
} from '../../src/feedback/sqlite-repository.js';
import {
  computeCsatSummary,
  handleListAdminProductFeedbackCore,
  handleSubmitCsatFeedbackCore,
  handleSubmitGeneralFeedbackCore,
} from '../../src/feedback/product-handler-core.js';
import { ErrorCodes } from '../../src/shared/error-codes.js';
import type { ProductFeedbackRecord } from '../../src/shared/types.js';

let tmpDir: string;
let decPath: string;
let fbPath: string;

describe('SqliteFeedbackRepository product feedback', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pf-unit-'));
    decPath = join(tmpDir, 'decisions.db');
    fbPath = join(tmpDir, 'feedback.db');
    closeDecisionStore();
    closeFeedbackStore();
    initDecisionStore(decPath);
    initFeedbackStore({ feedbackDbPath: fbPath, decisionsDbPath: decPath });
  });

  afterEach(() => {
    closeFeedbackStore();
    closeDecisionStore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips insertProductFeedback + listProductFeedback', async () => {
    const repo = getFeedbackRepository()!;
    const record: ProductFeedbackRecord = {
      feedback_id: randomUUID(),
      org_id: 'org_A',
      session_id: 'sess-abc',
      kind: 'general',
      feedback_type: 'idea',
      category: 'dashboard_ux',
      csat_score: null,
      message: 'Filter by skill please',
      page_context: '/decisions',
      app_version: '2026.06.23',
      created_at: '2026-06-23T21:12:04.000Z',
    };
    await repo.insertProductFeedback(record);
    const rows = await repo.listProductFeedback('org_A');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      feedback_id: record.feedback_id,
      kind: 'general',
      feedback_type: 'idea',
      message: record.message,
    });
  });

  it('lists newest-first and applies kind filter', async () => {
    const repo = getFeedbackRepository()!;
    await repo.insertProductFeedback({
      feedback_id: randomUUID(),
      org_id: 'org_A',
      session_id: 's',
      kind: 'general',
      feedback_type: 'idea',
      category: 'other',
      csat_score: null,
      message: 'older',
      page_context: null,
      app_version: null,
      created_at: '2026-06-01T00:00:00.000Z',
    });
    await repo.insertProductFeedback({
      feedback_id: randomUUID(),
      org_id: 'org_A',
      session_id: 's',
      kind: 'csat',
      feedback_type: null,
      category: null,
      csat_score: 5,
      message: null,
      page_context: null,
      app_version: null,
      created_at: '2026-06-02T00:00:00.000Z',
    });
    const csatOnly = await repo.listProductFeedback('org_A', { kind: 'csat' });
    expect(csatOnly).toHaveLength(1);
    expect(csatOnly[0]!.kind).toBe('csat');
    const all = await repo.listProductFeedback('org_A');
    expect(all.map((r) => r.created_at)).toEqual([
      '2026-06-02T00:00:00.000Z',
      '2026-06-01T00:00:00.000Z',
    ]);
  });

  it('scopes listProductFeedback to org_id', async () => {
    const repo = getFeedbackRepository()!;
    await repo.insertProductFeedback({
      feedback_id: randomUUID(),
      org_id: 'org_A',
      session_id: 's',
      kind: 'general',
      feedback_type: 'praise',
      category: 'other',
      csat_score: null,
      message: 'A',
      page_context: null,
      app_version: null,
      created_at: '2026-06-01T00:00:00.000Z',
    });
    await repo.insertProductFeedback({
      feedback_id: randomUUID(),
      org_id: 'org_B',
      session_id: 's',
      kind: 'general',
      feedback_type: 'problem',
      category: 'other',
      csat_score: null,
      message: 'B',
      page_context: null,
      app_version: null,
      created_at: '2026-06-01T00:00:00.000Z',
    });
    const rows = await repo.listProductFeedback('org_A');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.org_id).toBe('org_A');
  });
});

describe('product-handler-core', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pf-core-'));
    decPath = join(tmpDir, 'decisions.db');
    fbPath = join(tmpDir, 'feedback.db');
    closeDecisionStore();
    closeFeedbackStore();
    initDecisionStore(decPath);
    initFeedbackStore({ feedbackDbPath: fbPath, decisionsDbPath: decPath });
  });

  afterEach(() => {
    closeFeedbackStore();
    closeDecisionStore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handleSubmitGeneralFeedbackCore persists valid general feedback', async () => {
    const repo = getFeedbackRepository()!;
    const result = await handleSubmitGeneralFeedbackCore({
      orgId: 'org_A',
      sessionId: 'sess1',
      body: {
        feedback_type: 'idea',
        category: 'dashboard_ux',
        message: 'Need filters',
        page_context: '/decisions',
      },
      now: '2026-06-23T21:12:04.000Z',
      repo,
    });
    expect(result.statusCode).toBe(201);
    expect(result.body).toMatchObject({
      kind: 'general',
      feedback_type: 'idea',
      category: 'dashboard_ux',
    });
    const rows = await repo.listProductFeedback('org_A');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.message).toBe('Need filters');
  });

  it('rejects missing feedback_type', async () => {
    const repo = getFeedbackRepository()!;
    const result = await handleSubmitGeneralFeedbackCore({
      orgId: 'org_A',
      sessionId: 'sess1',
      body: { message: 'hello' },
      now: '2026-06-23T21:12:04.000Z',
      repo,
    });
    expect(result.statusCode).toBe(400);
    expect(result.body.code).toBe(ErrorCodes.FEEDBACK_TYPE_REQUIRED);
  });

  it('rejects empty message', async () => {
    const repo = getFeedbackRepository()!;
    const result = await handleSubmitGeneralFeedbackCore({
      orgId: 'org_A',
      sessionId: 'sess1',
      body: { feedback_type: 'idea', message: '   ' },
      now: '2026-06-23T21:12:04.000Z',
      repo,
    });
    expect(result.statusCode).toBe(400);
    expect(result.body.code).toBe(ErrorCodes.MESSAGE_REQUIRED);
  });

  it('rejects message over 4000 chars', async () => {
    const repo = getFeedbackRepository()!;
    const result = await handleSubmitGeneralFeedbackCore({
      orgId: 'org_A',
      sessionId: 'sess1',
      body: { feedback_type: 'idea', message: 'x'.repeat(4001) },
      now: '2026-06-23T21:12:04.000Z',
      repo,
    });
    expect(result.statusCode).toBe(400);
    expect(result.body.code).toBe(ErrorCodes.MESSAGE_TOO_LONG);
  });

  it('rejects csat_score on general route', async () => {
    const repo = getFeedbackRepository()!;
    const result = await handleSubmitGeneralFeedbackCore({
      orgId: 'org_A',
      sessionId: 'sess1',
      body: { feedback_type: 'idea', message: 'hi', csat_score: 4 },
      now: '2026-06-23T21:12:04.000Z',
      repo,
    });
    expect(result.statusCode).toBe(400);
    expect(result.body.code).toBe(ErrorCodes.CSAT_SCORE_FORBIDDEN);
  });

  it('defaults category to other', async () => {
    const repo = getFeedbackRepository()!;
    const result = await handleSubmitGeneralFeedbackCore({
      orgId: 'org_A',
      sessionId: 'sess1',
      body: { feedback_type: 'question', message: 'How?' },
      now: '2026-06-23T21:12:04.000Z',
      repo,
    });
    expect(result.statusCode).toBe(201);
    expect(result.body.category).toBe('other');
  });

  it('handleSubmitCsatFeedbackCore persists valid csat', async () => {
    const repo = getFeedbackRepository()!;
    const result = await handleSubmitCsatFeedbackCore({
      orgId: 'org_A',
      sessionId: 'sess1',
      body: { csat_score: 4, message: 'Clear decisions' },
      now: '2026-06-23T21:12:04.000Z',
      repo,
    });
    expect(result.statusCode).toBe(201);
    expect(result.body).toMatchObject({ kind: 'csat', csat_score: 4 });
  });

  it('rejects invalid csat_score', async () => {
    const repo = getFeedbackRepository()!;
    const result = await handleSubmitCsatFeedbackCore({
      orgId: 'org_A',
      sessionId: 'sess1',
      body: { csat_score: 6 },
      now: '2026-06-23T21:12:04.000Z',
      repo,
    });
    expect(result.statusCode).toBe(400);
    expect(result.body.code).toBe(ErrorCodes.INVALID_CSAT_SCORE);
  });

  it('rejects feedback_type on csat route', async () => {
    const repo = getFeedbackRepository()!;
    const result = await handleSubmitCsatFeedbackCore({
      orgId: 'org_A',
      sessionId: 'sess1',
      body: { csat_score: 4, feedback_type: 'idea' },
      now: '2026-06-23T21:12:04.000Z',
      repo,
    });
    expect(result.statusCode).toBe(400);
    expect(result.body.code).toBe(ErrorCodes.INVALID_REQUEST_BODY);
  });

  it('computeCsatSummary mean and distribution', () => {
    const summary = computeCsatSummary([
      {
        feedback_id: '1',
        org_id: 'org_A',
        session_id: 's',
        kind: 'csat',
        feedback_type: null,
        category: null,
        csat_score: 5,
        message: null,
        page_context: null,
        app_version: null,
        created_at: '2026-06-01T00:00:00.000Z',
      },
      {
        feedback_id: '2',
        org_id: 'org_A',
        session_id: 's',
        kind: 'csat',
        feedback_type: null,
        category: null,
        csat_score: 3,
        message: null,
        page_context: null,
        app_version: null,
        created_at: '2026-06-02T00:00:00.000Z',
      },
      {
        feedback_id: '3',
        org_id: 'org_A',
        session_id: 's',
        kind: 'general',
        feedback_type: 'idea',
        category: 'other',
        csat_score: null,
        message: 'ignored',
        page_context: null,
        app_version: null,
        created_at: '2026-06-03T00:00:00.000Z',
      },
    ]);
    expect(summary.count).toBe(2);
    expect(summary.mean).toBe(4);
    expect(summary.distribution).toEqual({ '1': 0, '2': 0, '3': 1, '4': 0, '5': 1 });
  });

  it('handleListAdminProductFeedbackCore returns items and csat_summary', async () => {
    const repo = getFeedbackRepository()!;
    await repo.insertProductFeedback({
      feedback_id: randomUUID(),
      org_id: 'org_A',
      session_id: 's',
      kind: 'csat',
      feedback_type: null,
      category: null,
      csat_score: 5,
      message: null,
      page_context: null,
      app_version: null,
      created_at: '2026-06-01T00:00:00.000Z',
    });
    await repo.insertProductFeedback({
      feedback_id: randomUUID(),
      org_id: 'org_A',
      session_id: 's',
      kind: 'general',
      feedback_type: 'idea',
      category: 'dashboard_ux',
      csat_score: null,
      message: 'idea',
      page_context: '/decisions',
      app_version: null,
      created_at: '2026-06-02T00:00:00.000Z',
    });
    const result = await handleListAdminProductFeedbackCore({
      orgId: 'org_A',
      query: {},
      repo,
    });
    expect(result.statusCode).toBe(200);
    const body = result.body as { org_id: string; items: unknown[]; csat_summary: { count: number; mean: number } };
    expect(body.org_id).toBe('org_A');
    expect(body.items).toHaveLength(2);
    expect(body.csat_summary.count).toBe(1);
    expect(body.csat_summary.mean).toBe(5);
  });
});
