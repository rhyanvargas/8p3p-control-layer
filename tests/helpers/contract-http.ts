/**
 * Dual-mode HTTP for contract tests (AWS-DEPLOY-CT-001–003).
 * - Local: Fastify `app.inject`
 * - Remote: `fetch(API_BASE_URL + path)` with optional auto `x-api-key`
 *
 * Remote: set API_BASE_URL and CONTRACT_TEST_API_KEY (or API_KEY).
 * Admin routes: pass `x-admin-api-key` in headers (or env CONTRACT_TEST_ADMIN_API_KEY — not auto-injected).
 */

import type { FastifyInstance } from 'fastify';
import type { InjectOptions } from 'fastify';

function remoteBase(): string | null {
  const b = process.env.API_BASE_URL?.trim();
  return b ? b.replace(/\/$/, '') : null;
}

export function isRemoteContractMode(): boolean {
  return remoteBase() !== null;
}

export function defaultContractApiKey(): string | undefined {
  const k = process.env.CONTRACT_TEST_API_KEY ?? process.env.API_KEY;
  return k?.trim() || undefined;
}

export type ContractHttpOpts = InjectOptions & {
  /**
   * When false, do not auto-add x-api-key in remote mode (for auth-negative tests;
   * API Gateway typically returns 403 without key).
   */
  auth?: boolean;
};

export async function contractHttp(
  app: FastifyInstance,
  opts: ContractHttpOpts
): Promise<{
  statusCode: number;
  body: string;
  json(): unknown;
  headers: Record<string, string | string[] | undefined>;
}> {
  const base = remoteBase();
  const method = (opts.method ?? 'GET') as string;
  const urlPath = typeof opts.url === 'string' ? opts.url : String(opts.url);

  if (base) {
    const fullUrl = `${base}${urlPath.startsWith('/') ? urlPath : `/${urlPath}`}`;
    const h: Record<string, string> = {};
    const optH = opts.headers as Record<string, string | string[] | undefined> | undefined;
    if (optH) {
      for (const [k, v] of Object.entries(optH)) {
        if (typeof v === 'string') h[k] = v;
        else if (Array.isArray(v) && v[0]) h[k] = v[0]!;
      }
    }
    const auth = opts.auth !== false;
    if (auth && !h['x-api-key'] && !h['X-Api-Key']) {
      const k = defaultContractApiKey();
      if (k) h['x-api-key'] = k;
    }
    let bodyStr: string | undefined;
    if (opts.payload !== undefined) {
      h['Content-Type'] = 'application/json';
      bodyStr = typeof opts.payload === 'string' ? opts.payload : JSON.stringify(opts.payload);
    }
    const res = await fetch(fullUrl, { method, headers: h, body: bodyStr });
    const text = await res.text();
    const headersOut: Record<string, string | string[] | undefined> = {};
    res.headers.forEach((v, key) => {
      headersOut[key] = v;
    });
    return {
      statusCode: res.status,
      body: text,
      headers: headersOut,
      json() {
        return text ? JSON.parse(text) : {};
      },
    };
  }

  const res = await app.inject(opts as InjectOptions);
  return {
    statusCode: res.statusCode,
    body: res.body,
    headers: { ...res.headers },
    json() {
      return JSON.parse(res.body || '{}');
    },
  };
}
