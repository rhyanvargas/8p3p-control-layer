/**
 * NXMIG-011 — CORS preflight from dashboard origin
 * @see docs/specs/nextjs-amplify-dashboard-migration.md § Contract Tests
 */

import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerDashboardCors } from '../../src/config/dashboard-cors.js';

const DASHBOARD_ORIGIN = 'http://localhost:3001';

let savedOrigins: string | undefined;

describe('dashboard CORS (NXMIG-011)', () => {
  beforeEach(() => {
    savedOrigins = process.env.DASHBOARD_ALLOWED_ORIGINS;
    process.env.DASHBOARD_ALLOWED_ORIGINS = DASHBOARD_ORIGIN;
  });

  afterEach(() => {
    if (savedOrigins === undefined) {
      delete process.env.DASHBOARD_ALLOWED_ORIGINS;
    } else {
      process.env.DASHBOARD_ALLOWED_ORIGINS = savedOrigins;
    }
  });

  it('NXMIG-011: OPTIONS /v1/health from dashboard origin returns CORS headers', async () => {
    const app = Fastify({ logger: false });
    await registerDashboardCors(app);
    app.get('/v1/health', async () => ({ status: 'ok' }));
    await app.ready();

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/health',
      headers: {
        origin: DASHBOARD_ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'content-type,x-api-key',
      },
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(DASHBOARD_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');

    await app.close();
  });

  it('NXMIG-011: disallowed origin receives no Access-Control-Allow-Origin', async () => {
    const app = Fastify({ logger: false });
    await registerDashboardCors(app);
    app.get('/v1/health', async () => ({ status: 'ok' }));
    await app.ready();

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/health',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'GET',
      },
    });

    expect(res.headers['access-control-allow-origin']).toBeUndefined();

    await app.close();
  });
});
