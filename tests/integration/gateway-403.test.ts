/**
 * API Gateway 403 verification test (AWS-DEPLOY-CT-005)
 *
 * Verifies that /v1/* endpoints return 403 at the gateway level when
 * no x-api-key header is provided — rejection happens before Lambda.
 *
 * This test only runs when API_BASE_URL is set (real deployed gateway).
 * Locally it is skipped to keep `npm test` fast.
 *
 * Usage:
 *   API_BASE_URL=https://api.8p3p.dev npm run test:contracts
 *   (or any /v1/* endpoint that requires an API key)
 */

import { describe, it, expect } from 'vitest';

const API_BASE_URL = process.env.API_BASE_URL;

describe.skipIf(!API_BASE_URL)('API Gateway 403 enforcement (AWS-DEPLOY-CT-005)', () => {
  const endpoints = [
    { method: 'POST', path: '/v1/signals', body: JSON.stringify({ org_id: 'test' }) },
    { method: 'GET', path: '/v1/signals?org_id=test&learner_reference=l1&from_time=2026-01-01T00:00:00Z&to_time=2026-01-02T00:00:00Z' },
    { method: 'GET', path: '/v1/decisions?org_id=test&learner_reference=l1&from_time=2026-01-01T00:00:00Z&to_time=2026-01-02T00:00:00Z' },
    { method: 'GET', path: '/v1/receipts?org_id=test&learner_reference=l1&from_time=2026-01-01T00:00:00Z&to_time=2026-01-02T00:00:00Z' },
    { method: 'GET', path: '/v1/state?org_id=test&learner_reference=l1' },
    { method: 'GET', path: '/v1/state/list?org_id=test' },
    { method: 'GET', path: '/v1/ingestion?org_id=test' },
  ];

  for (const { method, path, body } of endpoints) {
    it(`${method} ${path} returns 403 from API Gateway without x-api-key`, async () => {
      const url = `${API_BASE_URL!.replace(/\/$/, '')}${path}`;
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body } : {}),
      });

      expect(response.status).toBe(403);

      const responseBody = await response.json() as { message?: string };
      expect(responseBody.message).toMatch(/forbidden|api key/i);
    });
  }

  it('GET /health returns 200 without x-api-key (public endpoint)', async () => {
    const url = `${API_BASE_URL!.replace(/\/$/, '')}/health`;
    const response = await fetch(url);
    expect(response.status).toBe(200);
  });
});
