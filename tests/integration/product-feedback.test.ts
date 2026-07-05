/**
 * Integration + contract tests — Product Feedback API (PFEED-001 through PFEED-011)
 * @see docs/specs/customer-feedback-loop.md § Contract Tests
 */

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { apiKeyPreHandler } from '../../src/auth/api-key-middleware.js';
import { adminApiKeyPreHandler } from '../../src/auth/admin-api-key-middleware.js';
import {
  PRODUCT_FEEDBACK_SESSION_COOKIE_NAME,
  signSession,
} from '../../src/auth/session-cookie.js';
import { loadPolicy } from '../../src/decision/policy-loader.js';
import {
  initFeedbackStore,
  closeFeedbackStore,
  clearFeedbackStore,
} from '../../src/feedback/sqlite-repository.js';
import {
  registerFeedbackRoutes,
  registerAdminProductFeedbackRoutes,
} from '../../src/feedback/routes.js';
import { ErrorCodes } from '../../src/shared/error-codes.js';

const ORG_A = 'org_springs';
const ORG_B = 'org_other';
const COOKIE_SECRET = '01234567890123456789012345678901';
const API_KEY = 'int-product-feedback-key';
const ADMIN_KEY = 'int-product-feedback-admin';

let tmpDir: string;
let decPath: string;
let fbPath: string;
let app: FastifyInstance;
let savedEnv: Record<string, string | undefined> = {};

function saveEnv(): void {
  savedEnv = {
    COOKIE_SECRET: process.env.COOKIE_SECRET,
    API_KEY: process.env.API_KEY,
    ADMIN_API_KEY: process.env.ADMIN_API_KEY,
    API_KEY_ORG_ID: process.env.API_KEY_ORG_ID,
    NODE_ENV: process.env.NODE_ENV,
  };
}

function restoreEnv(): void {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function productFeedbackSessionCookie(): string {
  const signed = signSession(COOKIE_SECRET, 3600);
  return `${PRODUCT_FEEDBACK_SESSION_COOKIE_NAME}=${signed}`;
}

function authHeaders(includeSession = true): Record<string, string> {
  const headers: Record<string, string> = {
    'x-api-key': API_KEY,
    'content-type': 'application/json',
  };
  if (includeSession) {
    headers.cookie = productFeedbackSessionCookie();
  }
  return headers;
}

describe('product-feedback integration', () => {
  beforeAll(async () => {
    saveEnv();
    tmpDir = mkdtempSync(join(tmpdir(), 'pf-int-'));
    decPath = join(tmpDir, 'd.db');
    fbPath = join(tmpDir, 'f.db');
    process.env.COOKIE_SECRET = COOKIE_SECRET;
    process.env.API_KEY = API_KEY;
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    process.env.NODE_ENV = 'test';
    delete process.env.API_KEY_ORG_ID;

    initFeedbackStore({ feedbackDbPath: fbPath, decisionsDbPath: decPath });
    loadPolicy();

    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(
      async (v1) => {
        v1.addHook('preHandler', apiKeyPreHandler);
        registerFeedbackRoutes(v1);
      },
      { prefix: '/v1' }
    );
    await app.register(
      async (admin) => {
        admin.addHook('preHandler', adminApiKeyPreHandler);
        registerAdminProductFeedbackRoutes(admin);
      },
      { prefix: '/v1/admin' }
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeFeedbackStore();
    rmSync(tmpDir, { recursive: true, force: true });
    restoreEnv();
  });

  beforeEach(() => {
    clearFeedbackStore();
  });

  afterEach(() => {
    delete process.env.API_KEY_ORG_ID;
  });

  it('PFEED-001: happy path general submit with session + key; admin GET shows row', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: authHeaders(),
      payload: JSON.stringify({
        org_id: ORG_A,
        feedback_type: 'idea',
        category: 'dashboard_ux',
        message: 'Filter decisions by skill on the overview.',
        page_context: '/decisions',
      }),
    });
    expect(post.statusCode).toBe(201);
    const created = JSON.parse(post.body) as {
      feedback_id: string;
      kind: string;
      feedback_type: string;
      category: string;
    };
    expect(created.kind).toBe('general');
    expect(created.feedback_type).toBe('idea');
    expect(created.category).toBe('dashboard_ux');
    expect(created.feedback_id).toBeTruthy();

    const adminGet = await app.inject({
      method: 'GET',
      url: `/v1/admin/feedback?org_id=${ORG_A}`,
      headers: { 'x-admin-api-key': ADMIN_KEY },
    });
    expect(adminGet.statusCode).toBe(200);
    const adminBody = JSON.parse(adminGet.body) as {
      org_id: string;
      items: Array<{ feedback_id: string; message: string; page_context: string | null }>;
    };
    expect(adminBody.org_id).toBe(ORG_A);
    expect(adminBody.items).toHaveLength(1);
    expect(adminBody.items[0]!.feedback_id).toBe(created.feedback_id);
    expect(adminBody.items[0]!.message).toBe('Filter decisions by skill on the overview.');
    expect(adminBody.items[0]!.page_context).toBe('/decisions');
  });

  it('PFEED-002: CSAT submit updates csat_summary.mean', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/feedback/csat',
      headers: authHeaders(),
      payload: JSON.stringify({
        org_id: ORG_A,
        csat_score: 4,
        message: 'Decisions are clear.',
      }),
    });

    const adminGet = await app.inject({
      method: 'GET',
      url: `/v1/admin/feedback?org_id=${ORG_A}`,
      headers: { 'x-admin-api-key': ADMIN_KEY },
    });
    expect(adminGet.statusCode).toBe(200);
    const adminBody = JSON.parse(adminGet.body) as {
      csat_summary: { count: number; mean: number };
    };
    expect(adminBody.csat_summary.count).toBe(1);
    expect(adminBody.csat_summary.mean).toBe(4);
  });

  it('PFEED-003: no pf_session cookie returns 401 session_required', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: authHeaders(false),
      payload: JSON.stringify({
        org_id: ORG_A,
        feedback_type: 'idea',
        message: 'Missing session',
      }),
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe(ErrorCodes.SESSION_REQUIRED);
  });

  it('PFEED-004: general without feedback_type returns 400 feedback_type_required', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: authHeaders(),
      payload: JSON.stringify({
        org_id: ORG_A,
        message: 'No type',
      }),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe(ErrorCodes.FEEDBACK_TYPE_REQUIRED);
  });

  it('PFEED-005: general with empty message returns 400 message_required', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: authHeaders(),
      payload: JSON.stringify({
        org_id: ORG_A,
        feedback_type: 'problem',
        message: '   ',
      }),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe(ErrorCodes.MESSAGE_REQUIRED);
  });

  it('PFEED-006: message over 4000 chars returns 400 message_too_long', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: authHeaders(),
      payload: JSON.stringify({
        org_id: ORG_A,
        feedback_type: 'problem',
        message: 'x'.repeat(4001),
      }),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe(ErrorCodes.MESSAGE_TOO_LONG);
  });

  it('PFEED-007: CSAT csat_score=6 returns 400 invalid_csat_score', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/feedback/csat',
      headers: authHeaders(),
      payload: JSON.stringify({
        org_id: ORG_A,
        csat_score: 6,
      }),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe(ErrorCodes.INVALID_CSAT_SCORE);
  });

  it('PFEED-008: CSAT with feedback_type returns 400 invalid_request_body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/feedback/csat',
      headers: authHeaders(),
      payload: JSON.stringify({
        org_id: ORG_A,
        csat_score: 4,
        feedback_type: 'idea',
      }),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe(ErrorCodes.INVALID_REQUEST_BODY);
  });

  it('PFEED-009: general with csat_score returns 400 csat_score_forbidden', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: authHeaders(),
      payload: JSON.stringify({
        org_id: ORG_A,
        feedback_type: 'idea',
        message: 'Has csat field',
        csat_score: 3,
      }),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe(ErrorCodes.CSAT_SCORE_FORBIDDEN);
  });

  it('PFEED-010: cross-org isolation on GET /v1/admin/feedback', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: authHeaders(),
      payload: JSON.stringify({
        org_id: ORG_A,
        feedback_type: 'idea',
        message: 'Org A only',
      }),
    });
    await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: authHeaders(),
      payload: JSON.stringify({
        org_id: ORG_A,
        feedback_type: 'praise',
        message: 'Org A second',
      }),
    });
    await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: authHeaders(),
      payload: JSON.stringify({
        org_id: ORG_A,
        feedback_type: 'problem',
        message: 'Org A third',
      }),
    });

    await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: authHeaders(),
      payload: JSON.stringify({
        org_id: ORG_B,
        feedback_type: 'question',
        message: 'Org B one',
      }),
    });
    await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: authHeaders(),
      payload: JSON.stringify({
        org_id: ORG_B,
        feedback_type: 'idea',
        message: 'Org B two',
      }),
    });

    const adminGet = await app.inject({
      method: 'GET',
      url: `/v1/admin/feedback?org_id=${ORG_A}`,
      headers: { 'x-admin-api-key': ADMIN_KEY },
    });
    expect(adminGet.statusCode).toBe(200);
    const body = JSON.parse(adminGet.body) as { items: Array<{ org_id: string }> };
    expect(body.items).toHaveLength(3);
    expect(body.items.every((row) => row.org_id === ORG_A)).toBe(true);
  });

  it('PFEED-011: append-only — no update/delete routes on product feedback paths', async () => {
    const paths = ['/v1/feedback', '/v1/feedback/csat', '/v1/admin/feedback'];
    const mutatingMethods = ['PUT', 'PATCH', 'DELETE'] as const;

    for (const path of paths) {
      for (const method of mutatingMethods) {
        const res = await app.inject({
          method,
          url: path,
          headers:
            path === '/v1/admin/feedback'
              ? { 'x-admin-api-key': ADMIN_KEY }
              : authHeaders(),
          payload: JSON.stringify({ org_id: ORG_A }),
        });
        expect([404, 405]).toContain(res.statusCode);
      }
    }
  });
});
