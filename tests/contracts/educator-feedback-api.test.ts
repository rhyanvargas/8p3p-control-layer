/**
 * Contract tests — Educator Feedback API (FEEDBACK-003..007, 011..014, 012)
 * @see docs/specs/educator-feedback-api.md
 */

import { mkdtempSync, rmSync } from 'fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { apiKeyPreHandler } from '../../src/auth/api-key-middleware.js';
import {
  FEEDBACK_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  signSession,
} from '../../src/auth/session-cookie.js';
import {
  initDecisionStore,
  closeDecisionStore,
  saveDecision,
  clearDecisionStore,
} from '../../src/decision/store.js';
import { loadPolicy } from '../../src/decision/policy-loader.js';
import {
  initFeedbackStore,
  closeFeedbackStore,
  clearFeedbackStore,
} from '../../src/feedback/sqlite-repository.js';
import { registerFeedbackRoutes } from '../../src/feedback/routes.js';
import { registerDecisionRoutes } from '../../src/decision/routes.js';
import { registerSignalLogRoutes } from '../../src/signalLog/routes.js';
import {
  initSignalLogStore,
  closeSignalLogStore,
  clearSignalLogStore,
} from '../../src/signalLog/store.js';
import type { Decision } from '../../src/shared/types.js';
import { contractHttp } from '../helpers/contract-http.js';

const COOKIE_SECRET = '01234567890123456789012345678901';
const API_KEY = 'test-feedback-key';

let tmpDir: string;
let decPath: string;
let fbPath: string;
let app: FastifyInstance;

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    org_id: 'org_A',
    decision_id: randomUUID(),
    learner_reference: 'L1',
    decision_type: 'intervene',
    decided_at: '2026-01-05T12:00:00.000Z',
    decision_context: {},
    trace: {
      state_id: 'org_A:L1:v1',
      state_version: 1,
      policy_id: 'default',
      policy_version: '1.0.0',
      matched_rule_id: null,
      state_snapshot: {},
      matched_rule: null,
      rationale: 't',
      educator_summary: 's',
    },
    ...overrides,
  };
}

describe('educator-feedback-api contract', () => {
  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'fb-contract-'));
    decPath = join(tmpDir, 'd.db');
    fbPath = join(tmpDir, 'f.db');
    process.env.API_KEY = API_KEY;
    process.env.COOKIE_SECRET = COOKIE_SECRET;
    delete process.env.API_KEY_ORG_ID;

    initSignalLogStore(':memory:');
    initDecisionStore(decPath);
    initFeedbackStore({ feedbackDbPath: fbPath, decisionsDbPath: decPath });
    loadPolicy();

    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(
      async (v1) => {
        v1.addHook('preHandler', apiKeyPreHandler);
        registerDecisionRoutes(v1);
        registerSignalLogRoutes(v1);
        registerFeedbackRoutes(v1);
      },
      { prefix: '/v1' }
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeFeedbackStore();
    closeDecisionStore();
    closeSignalLogStore();
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.API_KEY;
    delete process.env.COOKIE_SECRET;
  });

  beforeEach(() => {
    clearDecisionStore();
    clearFeedbackStore();
    clearSignalLogStore();
  });

  function signedPair(): { fb: string; dp: string } {
    const signed = signSession(COOKIE_SECRET, 3600);
    return { fb: `${FEEDBACK_SESSION_COOKIE_NAME}=${signed}`, dp: `${SESSION_COOKIE_NAME}=${signed}` };
  }

  it('FEEDBACK-003: missing fb_session or dp_session alone returns 401 session_required', async () => {
    const d = makeDecision();
    saveDecision(d);
    const noSession = await contractHttp(app, {
      method: 'POST',
      url: `/v1/decisions/${d.decision_id}/feedback`,
      headers: { 'x-api-key': API_KEY },
      payload: { org_id: 'org_A', action: 'approve' },
    });
    expect(noSession.statusCode).toBe(401);
    expect((noSession.json() as { code: string }).code).toBe('session_required');

    const { dp } = signedPair();
    const dpOnly = await contractHttp(app, {
      method: 'POST',
      url: `/v1/decisions/${d.decision_id}/feedback`,
      headers: { 'x-api-key': API_KEY, cookie: dp },
      payload: { org_id: 'org_A', action: 'approve' },
    });
    expect(dpOnly.statusCode).toBe(401);
    expect((dpOnly.json() as { code: string }).code).toBe('session_required');
  });

  it('FEEDBACK-004: wrong-org decision_id returns 404 decision_not_found', async () => {
    process.env.API_KEY_ORG_ID = 'org_A';
    const d = makeDecision({ org_id: 'org_B' });
    saveDecision(d);
    const { fb } = signedPair();
    const res = await contractHttp(app, {
      method: 'POST',
      url: `/v1/decisions/${d.decision_id}/feedback`,
      headers: { 'x-api-key': API_KEY, cookie: fb },
      payload: { org_id: 'org_A', action: 'approve' },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe('decision_not_found');
    delete process.env.API_KEY_ORG_ID;
  });

  it('FEEDBACK-005: invalid action returns 400 invalid_action', async () => {
    const d = makeDecision();
    saveDecision(d);
    const { fb } = signedPair();
    const res = await contractHttp(app, {
      method: 'POST',
      url: `/v1/decisions/${d.decision_id}/feedback`,
      headers: { 'x-api-key': API_KEY, cookie: fb },
      payload: { org_id: 'org_A', action: 'maybe' },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code: string }).code).toBe('invalid_action');
  });

  it('FEEDBACK-006: mismatched reason_category returns 400 invalid_reason_category', async () => {
    const d = makeDecision();
    saveDecision(d);
    const { fb } = signedPair();
    const res = await contractHttp(app, {
      method: 'POST',
      url: `/v1/decisions/${d.decision_id}/feedback`,
      headers: { 'x-api-key': API_KEY, cookie: fb },
      payload: { org_id: 'org_A', action: 'approve', reason_category: 'not_at_risk' },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code: string }).code).toBe('invalid_reason_category');
  });

  it('FEEDBACK-007: reason_text too long returns 400 reason_text_too_long', async () => {
    const d = makeDecision();
    saveDecision(d);
    const { fb } = signedPair();
    const res = await contractHttp(app, {
      method: 'POST',
      url: `/v1/decisions/${d.decision_id}/feedback`,
      headers: { 'x-api-key': API_KEY, cookie: fb },
      payload: { org_id: 'org_A', action: 'reject', reason_category: 'other', reason_text: 'x'.repeat(2001) },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code: string }).code).toBe('reason_text_too_long');
  });

  it('FEEDBACK-013: reject wrong_decision_type without suggested returns 400', async () => {
    const d = makeDecision();
    saveDecision(d);
    const { fb } = signedPair();
    const res = await contractHttp(app, {
      method: 'POST',
      url: `/v1/decisions/${d.decision_id}/feedback`,
      headers: { 'x-api-key': API_KEY, cookie: fb },
      payload: { org_id: 'org_A', action: 'reject', reason_category: 'wrong_decision_type' },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code: string }).code).toBe('suggested_decision_type_required');
  });

  it('FEEDBACK-014: suggested_decision_type with wrong reason returns 400', async () => {
    const d = makeDecision();
    saveDecision(d);
    const { fb } = signedPair();
    const res = await contractHttp(app, {
      method: 'POST',
      url: `/v1/decisions/${d.decision_id}/feedback`,
      headers: { 'x-api-key': API_KEY, cookie: fb },
      payload: {
        org_id: 'org_A',
        action: 'reject',
        reason_category: 'not_at_risk',
        suggested_decision_type: 'advance',
      },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code: string }).code).toBe('suggested_decision_type_forbidden');
  });

  it('FEEDBACK-011: GET pending scoped to org_id query param', async () => {
    saveDecision(makeDecision({ org_id: 'org_A', decision_id: 'a1', decided_at: '2026-01-01T00:00:00Z' }));
    saveDecision(makeDecision({ org_id: 'org_B', decision_id: 'b1', decided_at: '2026-01-02T00:00:00Z' }));
    const { fb } = signedPair();
    const res = await contractHttp(app, {
      method: 'GET',
      url: '/v1/decisions/feedback/pending?org_id=org_B&older_than_days=0',
      headers: { 'x-api-key': API_KEY, cookie: fb },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { org_id: string; pending_count: number };
    expect(body.org_id).toBe('org_B');
    expect(body.pending_count).toBe(1);
  });

  it('FEEDBACK-012: PUT and DELETE feedback paths are not registered', async () => {
    const routes = app.printRoutes();
    expect(routes).not.toMatch(/PUT.*\/v1\/decisions\/:decision_id\/feedback/);
    expect(routes).not.toMatch(/DELETE.*\/v1\/decisions\/:decision_id\/feedback/);
    const d = makeDecision();
    saveDecision(d);
    const { fb } = signedPair();
    const put = await contractHttp(app, {
      method: 'PUT',
      url: `/v1/decisions/${d.decision_id}/feedback`,
      headers: { 'x-api-key': API_KEY, cookie: fb },
      payload: { org_id: 'org_A' },
    });
    expect(put.statusCode).toBe(404);
  });
});
