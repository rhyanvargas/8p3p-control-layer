/**
 * NXMIG-003/004/005/009/012 — Next.js dashboard migration contract tests
 * @see docs/specs/nextjs-amplify-dashboard-migration.md § Contract Tests
 */
/* global Headers, Request, RequestInit */

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (callback: () => void) => {
      callback();
    },
  };
});

import { resetServerEnvForTest } from '@/lib/env';
import {
  signSession as signDashboardSession,
  verifySession as verifyDashboardSession,
} from '@/lib/session-cookie';
import {
  signSession as signFastifySession,
  verifySession as verifyFastifySession,
} from '../../src/auth/session-cookie.js';

const SECRET = '01234567890123456789012345678901';
const TEST_API_KEY = 'test-server-api-key-nxmig';
const UPSTREAM_BASE = 'http://mock-control-layer.test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dashboardRoot = path.join(repoRoot, 'dashboard');

function walkFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walkFiles(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

function dashboardSourceHasForbiddenPatterns(): string[] {
  const hits: string[] = [];
  const files = walkFiles(dashboardRoot).filter((f) =>
    /\.(ts|tsx|js|jsx|mjs|cjs|json|css|md)$/.test(f),
  );

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (/\bVITE_/.test(text)) {
      hits.push(`${path.relative(repoRoot, file)}: VITE_ reference`);
    }
    if (/import\.meta\.env/.test(text)) {
      hits.push(`${path.relative(repoRoot, file)}: import.meta.env reference`);
    }
  }
  return hits;
}

async function loadProxyGet() {
  vi.resetModules();
  process.env.CONTROL_LAYER_API_BASE_URL = UPSTREAM_BASE;
  process.env.CONTROL_LAYER_API_KEY = TEST_API_KEY;
  resetServerEnvForTest();

  const mod = await import('../../dashboard/app/api/control/[...path]/route.ts');
  return mod.GET;
}

describe('nextjs dashboard migration contracts', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = { ...process.env };
    resetServerEnvForTest();
  });

  afterEach(() => {
    process.env = savedEnv;
    resetServerEnvForTest();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('NXMIG-003: route handler forwards with server key', () => {
    it('calls upstream with x-api-key and mirrors status/body', async () => {
      const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
        expect(init?.headers).toBeInstanceOf(Headers);
        const headers = init?.headers as Headers;
        expect(headers.get('x-api-key')).toBe(TEST_API_KEY);

        return new Response(JSON.stringify({ org_id: 'e2e-org', ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const GET = await loadProxyGet();
      const request = new Request('http://dashboard.test/api/control/v1/state/list?org_id=e2e-org');
      const response = await GET(request, { params: Promise.resolve({ path: ['v1', 'state', 'list'] }) });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ org_id: 'e2e-org', ok: true });
      expect(fetchMock).toHaveBeenCalledOnce();

      const upstreamUrl = String(fetchMock.mock.calls[0]?.[0]);
      expect(upstreamUrl).toBe(`${UPSTREAM_BASE}/v1/state/list?org_id=e2e-org`);
    });
  });

  describe('NXMIG-004: upstream 401 proxied without key material', () => {
    it('returns 401 and body contains no API key', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'content-type': 'application/json' } }),
        ),
      );

      const GET = await loadProxyGet();
      const response = await GET(new Request('http://dashboard.test/api/control/v1/state/list'), {
        params: Promise.resolve({ path: ['v1', 'state', 'list'] }),
      });

      expect(response.status).toBe(401);
      const body = await response.text();
      expect(body).not.toContain(TEST_API_KEY);
      expect(body).not.toContain(UPSTREAM_BASE);
    });
  });

  describe('NXMIG-005: upstream unreachable', () => {
    it('returns 502 dashboard_upstream_unavailable', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new TypeError('fetch failed');
        }),
      );

      const GET = await loadProxyGet();
      const response = await GET(new Request('http://dashboard.test/api/control/v1/state/list'), {
        params: Promise.resolve({ path: ['v1', 'state', 'list'] }),
      });

      expect(response.status).toBe(502);
      const body = (await response.json()) as { error: string; request_id: string };
      expect(body.error).toBe('dashboard_upstream_unavailable');
      expect(body.request_id).toBeTruthy();
    });
  });

  describe('NXMIG-009: cookie verify parity with Fastify implementation', () => {
    it('signSession produces identical wire values', () => {
      const fixedNow = 1_700_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

      const dashboardSigned = signDashboardSession(SECRET, 3600);
      const fastifySigned = signFastifySession(SECRET, 3600);
      expect(dashboardSigned).toBe(fastifySigned);
    });

    it('verifySession accepts cookies minted by either implementation', () => {
      const signed = signFastifySession(SECRET, 3600);
      const fromFastify = verifyFastifySession(SECRET, signed);
      const fromDashboard = verifyDashboardSession(SECRET, signed);

      expect(fromFastify.valid).toBe(true);
      expect(fromDashboard.valid).toBe(true);
      expect(fromDashboard.exp).toBe(fromFastify.exp);
    });

    it('rejects expired and tampered cookies identically', () => {
      const expired = signFastifySession(SECRET, -60);
      expect(verifyFastifySession(SECRET, expired).valid).toBe(false);
      expect(verifyDashboardSession(SECRET, expired).valid).toBe(false);

      const valid = signFastifySession(SECRET, 3600);
      const parts = valid.split('.');
      const tampered = `${parts[0]}.X${parts[1]?.slice(1)}`;
      expect(verifyFastifySession(SECRET, tampered).valid).toBe(false);
      expect(verifyDashboardSession(SECRET, tampered).valid).toBe(false);
    });
  });

  describe('NXMIG-012: build parity — no VITE_* or import.meta.env in dashboard/', () => {
    it('dashboard source tree has no VITE_* or import.meta.env references', () => {
      const hits = dashboardSourceHasForbiddenPatterns();
      expect(hits).toEqual([]);
    });

    it('next build succeeds with Node 22 toolchain', () => {
      execSync('npm run build', {
        cwd: dashboardRoot,
        stdio: 'pipe',
        env: {
          ...process.env,
          CONTROL_LAYER_API_BASE_URL: UPSTREAM_BASE,
          CONTROL_LAYER_API_KEY: TEST_API_KEY,
          CONTROL_LAYER_ORG_ID: 'e2e-org',
        },
      });
    }, 120_000);
  });
});
