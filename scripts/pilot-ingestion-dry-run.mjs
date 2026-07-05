#!/usr/bin/env node
/**
 * End-to-end ingestion dry-run for hosted pilot (TASK-018).
 *
 * Exercises: health → preflight → signal ingest → decisions list →
 * educator feedback (approve) → product feedback → admin product feedback list.
 *
 * Usage:
 *   API_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com/pilot \
 *   PILOT_KEY=<api-gateway-key> \
 *   ADMIN_API_KEY=<admin-key> \
 *   COOKIE_SECRET=<same-as-dashboard> \
 *   ORG_ID=southwest-charter \
 *   npm run pilot:dry-run
 *
 * Optional: run seed first if the environment is empty:
 *   node examples/springs/seed-springs-demo.mjs --host "$API_URL" --api-key "$PILOT_KEY" \
 *     --admin-key "$ADMIN_API_KEY" --org "$ORG_ID"
 *
 * @see docs/guides/operators/aws-pilot-runbook.md § 4
 * @see docs/guides/pilot-data-requirements.md
 */
import { createHmac } from 'node:crypto';
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

config();
if (existsSync(join(process.cwd(), '.env.local'))) {
  config({ path: join(process.cwd(), '.env.local') });
}

const apiUrl = process.env.API_URL?.trim().replace(/\/$/, '');
const pilotKey = process.env.PILOT_KEY?.trim();
const adminKey = process.env.ADMIN_API_KEY?.trim();
const cookieSecret = process.env.COOKIE_SECRET?.trim();
const orgId = process.env.ORG_ID?.trim() ?? 'southwest-charter';
const learnerRef = process.env.DRY_RUN_LEARNER_REF?.trim() ?? 'stu-dry-run-001';
const signalId = process.env.DRY_RUN_SIGNAL_ID?.trim() ?? `pilot-dry-run-${Date.now()}`;

function fail(message) {
  console.error(`pilot-ingestion-dry-run: FAIL — ${message}`);
  process.exit(1);
}

function pass(step, message) {
  console.log(`pilot-ingestion-dry-run: PASS [${step}] — ${message}`);
}

function signSession(secret, ttlSeconds = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payloadJson = JSON.stringify({ exp });
  const sigHex = createHmac('sha256', secret).update(payloadJson, 'utf8').digest('hex');
  const payloadB64 = Buffer.from(payloadJson, 'utf8').toString('base64url');
  return `${sigHex}.${payloadB64}`;
}

async function request(path, options = {}) {
  const url = `${apiUrl}${path}`;
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body, text };
}

async function main() {
  if (!apiUrl) fail('Set API_URL (control-layer base URL, no trailing slash).');
  if (!pilotKey) fail('Set PILOT_KEY (API Gateway x-api-key value).');
  if (!adminKey) fail('Set ADMIN_API_KEY for preflight and admin feedback GET.');
  if (!cookieSecret || cookieSecret.length < 32) {
    fail('Set COOKIE_SECRET (≥32 chars, same value as dashboard/API).');
  }

  const apiHeaders = {
    'content-type': 'application/json',
    'x-api-key': pilotKey,
  };
  const adminHeaders = {
    'content-type': 'application/json',
    'x-admin-api-key': adminKey,
  };
  const pfSession = signSession(cookieSecret);
  const fbSession = pfSession;
  const sessionHeaders = {
    ...apiHeaders,
    cookie: `pf_session=${pfSession}; fb_session=${fbSession}`,
  };

  // 1. Health
  {
    const { response, body } = await request('/health');
    if (response.status !== 200 || body?.status !== 'ok') {
      fail(`GET /health expected 200 ok, got ${response.status} ${JSON.stringify(body)}`);
    }
    pass('health', 'GET /health → ok');
  }

  // 2. Preflight clean sample (no PII, canonical scores)
  const preflightPayload = {
    learner_reference: learnerRef,
    masteryScore: 0.72,
    stabilityScore: 0.65,
    source_system: 'pilot-dry-run',
  };
  {
    const { response, body } = await request('/v1/admin/ingestion/preflight', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        org_id: orgId,
        source_system: 'pilot-dry-run',
        payload: preflightPayload,
      }),
    });
    if (response.status !== 200) {
      fail(`Preflight expected 200, got ${response.status} ${JSON.stringify(body)}`);
    }
    if ((body.forbidden_pii ?? []).length > 0) {
      fail(`Preflight PII blocking: ${JSON.stringify(body.forbidden_pii)}`);
    }
    const verdict = body.verdict;
    if (!['clean', 'semantic_resolvable_by_mapping'].includes(verdict)) {
      fail(`Preflight verdict not clean: ${verdict} — ${JSON.stringify(body)}`);
    }
    pass('preflight', `verdict=${verdict}`);
  }

  // 3. POST signal
  {
    const { response, body } = await request('/v1/signals', {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({
        signal_id: signalId,
        org_id: orgId,
        learner_reference: learnerRef,
        source_system: 'pilot-dry-run',
        timestamp: new Date().toISOString(),
        schema_version: 'v1',
        payload: {
          masteryScore: 0.72,
          stabilityScore: 0.65,
        },
      }),
    });
    if (response.status < 200 || response.status >= 300) {
      fail(`POST /v1/signals expected 2xx, got ${response.status} ${JSON.stringify(body)}`);
    }
    pass('ingest', `signal_id=${signalId} status=${body?.status ?? 'accepted'}`);
  }

  // 4. GET decisions for learner (Attention queue source)
  let decisionId = null;
  {
    const now = new Date();
    const fromTime = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const toTime = now.toISOString();
    const { response, body } = await request(
      `/v1/decisions?learner_reference=${encodeURIComponent(learnerRef)}&from_time=${encodeURIComponent(fromTime)}&to_time=${encodeURIComponent(toTime)}`,
      { headers: apiHeaders }
    );
    if (response.status !== 200) {
      fail(`GET /v1/decisions expected 200, got ${response.status}`);
    }
    const decisions = body?.decisions ?? [];
    if (decisions.length === 0) {
      fail(
        'No decisions returned for learner — check policy rules match ingested scores. ' +
          'Run seed:springs-demo or tune policies/<org_id>/learner.json.'
      );
    }
    decisionId = decisions[0].decision_id;
    pass('decisions', `found ${decisions.length} decision(s); using ${decisionId}`);
  }

  // 5. Approve/Reject persists (educator feedback)
  {
    const { response, body } = await request(`/v1/decisions/${decisionId}/feedback`, {
      method: 'POST',
      headers: sessionHeaders,
      body: JSON.stringify({
        action: 'approve',
        reason_category: 'aligned',
        reason_text: 'Dry-run approval — pilot ingestion verification.',
      }),
    });
    if (response.status !== 201) {
      fail(`POST decision feedback expected 201, got ${response.status} ${JSON.stringify(body)}`);
    }
    pass('educator-feedback', `approved decision ${decisionId}`);
  }

  // 6. Send product feedback (201)
  {
    const { response, body } = await request('/v1/feedback', {
      method: 'POST',
      headers: sessionHeaders,
      body: JSON.stringify({
        feedback_type: 'idea',
        category: 'data_ingestion',
        message: 'Pilot dry-run product feedback — ingestion path verified.',
        page_context: '/attention',
        app_version: 'dry-run',
      }),
    });
    if (response.status !== 201) {
      fail(`POST /v1/feedback expected 201, got ${response.status} ${JSON.stringify(body)}`);
    }
    pass('product-feedback', `feedback_id=${body?.feedback_id}`);
  }

  // 7. Admin GET lists product feedback row
  {
    const { response, body } = await request('/v1/admin/feedback', {
      headers: adminHeaders,
    });
    if (response.status !== 200) {
      fail(`GET /v1/admin/feedback expected 200, got ${response.status}`);
    }
    const items = body?.items ?? [];
    const match = items.find(
      (row) =>
        row.kind === 'general' &&
        typeof row.message === 'string' &&
        row.message.includes('Pilot dry-run product feedback')
    );
    if (!match) {
      fail(`Admin GET missing dry-run product feedback row (items=${items.length})`);
    }
    pass('admin-feedback', `listed ${items.length} row(s); dry-run row present`);
  }

  console.log('');
  console.log('All pilot ingestion dry-run checks passed.');
  console.log('Record this output in the vault onboarding ticket (evidence for TASK-018).');
  console.log('Manual follow-up: confirm Attention queue + Send feedback in hosted dashboard UI.');
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
