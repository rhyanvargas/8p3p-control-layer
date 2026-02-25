#!/usr/bin/env node
/**
 * Demo Seed Script — Pilot Readiness Artifact #7
 *
 * Populates a running 8P3P server with pre-loaded learners demonstrating
 * REINFORCE and INTERVENE anchors, plus ADVANCE and edge cases (rejected, duplicate).
 *
 * Plan: .cursor/plans/demo-seed-script.plan.md
 * Usage: npm run seed:demo   or   node scripts/seed-demo.mjs [--host URL] [--api-key KEY] [--org ORG]
 */

import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// Load .env and .env.local (matches server behavior)
config();
if (existsSync(join(process.cwd(), '.env.local'))) {
  config({ path: join(process.cwd(), '.env.local') });
}

const DEFAULT_HOST = 'http://localhost:3000';
const DEFAULT_ORG = 'org_demo';
const SOURCE_SYSTEM = 'demo-seed';
const DELAY_MS = 100;

// Fixed timestamps for predictable demo data
const TS = {
  t1: '2026-03-01T10:00:00Z',
  t2: '2026-03-01T10:01:00Z',
  t3: '2026-03-01T10:02:00Z',
  t4: '2026-03-01T10:03:00Z',
  t5: '2026-03-01T10:04:00Z',
  t6: '2026-03-01T10:05:00Z',
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { host: DEFAULT_HOST, apiKey: process.env.API_KEY, org: DEFAULT_ORG };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host' && args[i + 1]) opts.host = args[++i];
    else if (args[i] === '--api-key' && args[i + 1]) opts.apiKey = args[++i];
    else if (args[i] === '--org' && args[i + 1]) opts.org = args[++i];
  }
  return opts;
}

function buildEnvelope(signalId, learnerRef, timestamp, payload) {
  return {
    org_id: null, // set per-request from opts.org
    signal_id: signalId,
    source_system: SOURCE_SYSTEM,
    learner_reference: learnerRef,
    timestamp,
    schema_version: 'v1',
    payload,
  };
}

/**
 * Signal definitions from plan (TASK-001).
 * Each entry: { signalId, learnerRef, timestamp, payload, expectReject, expectDuplicate }
 */
const SIGNALS = [
  // Learner 1: maya-k — REINFORCE anchor
  {
    ...buildEnvelope('maya-k-001', 'maya-k', TS.t1, {
      stabilityScore: 0.62,
      masteryScore: 0.75,
      timeSinceReinforcement: 90000,
      confidenceInterval: 0.8,
      riskSignal: 0.2,
    }),
    signalId: 'maya-k-001',
    expect: 'accepted',
  },
  {
    ...buildEnvelope('maya-k-002', 'maya-k', TS.t2, {
      stabilityScore: 0.55,
      masteryScore: 0.72,
      timeSinceReinforcement: 100000,
      confidenceInterval: 0.78,
      riskSignal: 0.25,
    }),
    signalId: 'maya-k-002',
    expect: 'accepted',
  },
  // Learner 2: alex-r — INTERVENE anchor
  {
    ...buildEnvelope('alex-r-001', 'alex-r', TS.t2, {
      stabilityScore: 0.35,
      masteryScore: 0.4,
      timeSinceReinforcement: 50000,
      confidenceInterval: 0.55,
      riskSignal: 0.6,
    }),
    signalId: 'alex-r-001',
    expect: 'accepted',
  },
  {
    ...buildEnvelope('alex-r-002', 'alex-r', TS.t3, {
      stabilityScore: 0.28,
      masteryScore: 0.35,
      timeSinceReinforcement: 60000,
      confidenceInterval: 0.5,
      riskSignal: 0.65,
    }),
    signalId: 'alex-r-002',
    expect: 'accepted',
  },
  // Learner 3: jordan-m — ADVANCE
  {
    ...buildEnvelope('jordan-m-001', 'jordan-m', TS.t4, {
      stabilityScore: 0.88,
      masteryScore: 0.9,
      timeSinceReinforcement: 40000,
      confidenceInterval: 0.85,
      riskSignal: 0.1,
    }),
    signalId: 'jordan-m-001',
    expect: 'accepted',
  },
  // Learner 4: sam-t — edge cases
  {
    ...buildEnvelope('sam-t-bad', 'sam-t', TS.t5, { bogus: true }),
    signalId: 'sam-t-bad',
    expect: 'accepted',
  },
  // sam-t-reject: omit learner_reference to trigger rejection
  {
    org_id: null,
    signal_id: 'sam-t-reject',
    source_system: SOURCE_SYSTEM,
    timestamp: TS.t5,
    schema_version: 'v1',
    payload: { stabilityScore: 0.5 },
    signalId: 'sam-t-reject',
    expect: 'rejected',
    omitLearnerRef: true,
  },
  {
    ...buildEnvelope('sam-t-001', 'sam-t', TS.t6, {
      stabilityScore: 0.5,
      masteryScore: 0.6,
      timeSinceReinforcement: 90000,
      confidenceInterval: 0.8,
      riskSignal: 0.15,
    }),
    signalId: 'sam-t-001',
    expect: 'accepted',
  },
  // sam-t-001 retry — duplicate
  {
    ...buildEnvelope('sam-t-001', 'sam-t', TS.t6, {
      stabilityScore: 0.5,
      masteryScore: 0.6,
      timeSinceReinforcement: 90000,
      confidenceInterval: 0.8,
      riskSignal: 0.15,
    }),
    signalId: 'sam-t-001',
    expect: 'duplicate',
  },
];

function toPayload(sig, org) {
  const { signalId, expect: _e, omitLearnerRef, ...rest } = sig;
  const payload = { ...rest, org_id: org };
  if (omitLearnerRef) delete payload.learner_reference;
  return payload;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { host, apiKey, org } = parseArgs();

  if (!apiKey) {
    console.error('Error: API_KEY env var or --api-key required. Set API_KEY in .env.local or pass --api-key.');
    process.exit(1);
  }

  const base = host.replace(/\/$/, '');
  const url = `${base}/v1/signals`;

  const results = [];
  const headers = {
    'x-api-key': apiKey,
    'content-type': 'application/json',
  };

  console.log(`Seeding demo data to ${url} (org: ${org})...\n`);

  for (let i = 0; i < SIGNALS.length; i++) {
    const sig = SIGNALS[i];
    const payload = toPayload(sig, org);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        console.error('\n401 Unauthorized — check API_KEY.');
        process.exit(1);
      }

      const body = await res.json().catch(() => ({}));
      const status = body.status ?? (res.ok ? 'accepted' : 'rejected');
      const outcome = status === 'accepted' ? 'accepted' : status === 'duplicate' ? 'duplicate' : 'rejected';

      results.push({
        signalId: sig.signalId,
        status: res.status,
        outcome,
        expected: sig.expect,
        match: outcome === sig.expect,
      });

      const icon = outcome === 'accepted' ? '✓' : outcome === 'duplicate' ? '○' : '✗';
      const detail = outcome === 'rejected' && body.rejection_reason?.code
        ? ` (${body.rejection_reason.code})`
        : '';
      console.log(`  ${icon} ${sig.signalId}: ${outcome}${detail}`);
    } catch (err) {
      if (err.cause?.code === 'ECONNREFUSED') {
        console.error('\nConnection refused — is the server running at', base, '?');
        process.exit(1);
      }
      throw err;
    }

    if (i < SIGNALS.length - 1) await sleep(DELAY_MS);
  }

  const passed = results.filter((r) => r.match).length;
  const failed = results.filter((r) => !r.match);

  console.log('\n--- Summary ---');
  console.log(`  Sent: ${results.length} | Expected outcomes matched: ${passed}/${results.length}`);
  if (failed.length > 0) {
    failed.forEach((r) => console.log(`  Mismatch: ${r.signalId} got ${r.outcome}, expected ${r.expected}`));
  }
  console.log(`\nInspection panels: ${base}/inspect/`);
  console.log('  Enter org_id:', org, 'and click Refresh to view seeded data.\n');

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
