/**
 * Integration tests — Educator Feedback API (FEEDBACK-001, 002, 008, 009, 010)
 * @see docs/specs/educator-feedback-api.md
 */

import { mkdtempSync, rmSync } from 'fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { apiKeyPreHandler } from '../../src/auth/api-key-middleware.js';
import {
  FEEDBACK_SESSION_COOKIE_NAME,
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
import {
  initSignalLogStore,
  closeSignalLogStore,
  clearSignalLogStore,
} from '../../src/signalLog/store.js';
import type { Decision } from '../../src/shared/types.js';

const ORG = 'org_springs';
const COOKIE_SECRET = '01234567890123456789012345678901';
const API_KEY = 'int-feedback-key';
const ACCESS = 'pilot-code';

let tmpDir: string;
let decPath: string;
let fbPath: string;
let app: FastifyInstance;
let savedEnv: Record<string, string | undefined> = {};

function saveEnv(): void {
  savedEnv = {
    DASHBOARD_ACCESS_CODE: process.env.DASHBOARD_ACCESS_CODE,
    COOKIE_SECRET: process.env.COOKIE_SECRET,
    API_KEY: process.env.API_KEY,
    NODE_ENV: process.env.NODE_ENV,
  };
}

function restoreEnv(): void {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    org_id: ORG,
    decision_id: randomUUID(),
    learner_reference: 'L1',
    decision_type: 'reinforce',
    decided_at: '2026-01-10T12:00:00.000Z',
    decision_context: {},
    trace: {
      state_id: `${ORG}:L1:v1`,
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

describe('educator-feedback integration', () => {
  beforeAll(async () => {
    saveEnv();
    tmpDir = mkdtempSync(join(tmpdir(), 'fb-int-'));
    decPath = join(tmpDir, 'd.db');
    fbPath = join(tmpDir, 'f.db');
    process.env.DASHBOARD_ACCESS_CODE = ACCESS;
    process.env.COOKIE_SECRET = COOKIE_SECRET;
    process.env.API_KEY = API_KEY;
    process.env.NODE_ENV = 'test';

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
    restoreEnv();
  });

  beforeEach(() => {
    clearDecisionStore();
    clearFeedbackStore();
    clearSignalLogStore();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function feedbackSessionCookie(): string {
    const signed = signSession(COOKIE_SECRET, 3600);
    return `${FEEDBACK_SESSION_COOKIE_NAME}=${signed}`;
  }

  it('FEEDBACK-001: login mints cookies; POST approve + GET feedback', async () => {
    const d = makeDecision();
    saveDecision(d);
    const jar = feedbackSessionCookie();
    const post = await app.inject({
      method: 'POST',
      url: `/v1/decisions/${d.decision_id}/feedback`,
      headers: {
        'x-api-key': API_KEY,
        cookie: jar,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ org_id: ORG, action: 'approve' }),
    });
    expect(post.statusCode).toBe(201);
    const get = await app.inject({
      method: 'GET',
      url: `/v1/decisions/${d.decision_id}/feedback?org_id=${ORG}`,
      headers: { 'x-api-key': API_KEY },
    });
    expect(get.statusCode).toBe(200);
    const body = JSON.parse(get.body) as { latest_action: string; feedback: unknown[] };
    expect(body.latest_action).toBe('approve');
    expect(body.feedback.length).toBe(1);
  });

  it('FEEDBACK-002: reject with reason round-trips', async () => {
    const d = makeDecision();
    saveDecision(d);
    const jar = feedbackSessionCookie();
    await app.inject({
      method: 'POST',
      url: `/v1/decisions/${d.decision_id}/feedback`,
      headers: {
        'x-api-key': API_KEY,
        cookie: jar,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        org_id: ORG,
        action: 'reject',
        reason_category: 'not_at_risk',
        reason_text: 'teacher note',
      }),
    });
    const get = await app.inject({
      method: 'GET',
      url: `/v1/decisions/${d.decision_id}/feedback?org_id=${ORG}`,
      headers: { 'x-api-key': API_KEY },
    });
    const body = JSON.parse(get.body) as { feedback: Array<{ reason_category: string; reason_text: string }> };
    expect(body.feedback[0]!.reason_category).toBe('not_at_risk');
    expect(body.feedback[0]!.reason_text).toBe('teacher note');
  });

  it('FEEDBACK-008: view dedup within window', async () => {
    const d = makeDecision();
    saveDecision(d);
    const jar = feedbackSessionCookie();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
    const r1 = await app.inject({
      method: 'POST',
      url: `/v1/decisions/${d.decision_id}/view?org_id=${ORG}`,
      headers: { 'x-api-key': API_KEY, cookie: jar },
    });
    expect(r1.statusCode).toBe(200);
    expect(JSON.parse(r1.body).recorded).toBe(true);
    vi.setSystemTime(new Date('2026-01-01T12:00:10.000Z'));
    const r2 = await app.inject({
      method: 'POST',
      url: `/v1/decisions/${d.decision_id}/view?org_id=${ORG}`,
      headers: { 'x-api-key': API_KEY, cookie: jar },
    });
    expect(r2.statusCode).toBe(200);
    const b2 = JSON.parse(r2.body) as { recorded: boolean; reason?: string };
    expect(b2.recorded).toBe(false);
    expect(b2.reason).toBe('dedup_window');
  });

  it('FEEDBACK-009: pending_count excludes decisions with feedback', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const id = randomUUID();
      ids.push(id);
      saveDecision(
        makeDecision({
          decision_id: id,
          decided_at: `2026-01-${10 + i}T12:00:00.000Z`,
        })
      );
    }
    const jar = feedbackSessionCookie();
    await app.inject({
      method: 'POST',
      url: `/v1/decisions/${ids[0]}/feedback`,
      headers: {
        'x-api-key': API_KEY,
        cookie: jar,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ org_id: ORG, action: 'approve' }),
    });
    await app.inject({
      method: 'POST',
      url: `/v1/decisions/${ids[1]}/feedback`,
      headers: {
        'x-api-key': API_KEY,
        cookie: jar,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ org_id: ORG, action: 'approve' }),
    });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/decisions/feedback/pending?org_id=${ORG}&older_than_days=0`,
      headers: { 'x-api-key': API_KEY, cookie: jar },
    });
    expect(res.statusCode).toBe(200);
    expect((JSON.parse(res.body) as { pending_count: number }).pending_count).toBe(3);
  });

  it('FEEDBACK-010: latest_action follows last feedback row', async () => {
    const d = makeDecision();
    saveDecision(d);
    const jar = feedbackSessionCookie();
    for (const action of ['reject', 'reject', 'approve'] as const) {
      await app.inject({
        method: 'POST',
        url: `/v1/decisions/${d.decision_id}/feedback`,
        headers: {
          'x-api-key': API_KEY,
          cookie: jar,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          org_id: ORG,
          action,
          reason_category: action === 'approve' ? 'agree_primary' : 'other',
        }),
      });
    }
    const get = await app.inject({
      method: 'GET',
      url: `/v1/decisions/${d.decision_id}/feedback?org_id=${ORG}`,
      headers: { 'x-api-key': API_KEY },
    });
    const body = JSON.parse(get.body) as { latest_action: string; feedback: unknown[] };
    expect(body.feedback.length).toBe(3);
    expect(body.latest_action).toBe('approve');
  });
});
