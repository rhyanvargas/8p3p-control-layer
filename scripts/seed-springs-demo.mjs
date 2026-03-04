#!/usr/bin/env node
/**
 * Springs Charter Schools Demo Seed Script
 *
 * Populates a running 8P3P server with Springs pilot data: 14 signals across
 * canvas-lms, blackboard-lms, and absorb-lms demonstrating dual user-type
 * routing (learner vs staff), cross-system identity resolution, and all 4
 * decision types. Includes multi-version staff traces (staff-0201, staff-0403,
 * teacher-7890) for longer state/receipt history in the panels.
 *
 * Plan: .cursor/plans/springs-demo-seed.plan.md
 * Usage: npm run seed:springs-demo   or   node scripts/seed-springs-demo.mjs [--host URL] [--api-key KEY] [--org ORG]
 */

import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

config();
if (existsSync(join(process.cwd(), '.env.local'))) {
  config({ path: join(process.cwd(), '.env.local') });
}

const DEFAULT_HOST = 'http://localhost:3000';
const DEFAULT_ORG = 'springs';
const DELAY_MS = 100;

const TS = {
  t0a: '2026-03-02T08:50:00Z',
  t0b: '2026-03-02T08:52:00Z',
  t0c: '2026-03-02T08:54:00Z',
  t0d: '2026-03-02T08:56:00Z',
  t0e: '2026-03-02T08:58:00Z',
  t1: '2026-03-02T09:00:00Z',
  t2: '2026-03-02T09:02:00Z',
  t3: '2026-03-02T09:04:00Z',
  t4: '2026-03-02T09:06:00Z',
  t5: '2026-03-02T09:08:00Z',
  t6: '2026-03-02T09:10:00Z',
  t7: '2026-03-02T09:12:00Z',
  t8: '2026-03-02T09:14:00Z',
  t9: '2026-03-02T09:16:00Z',
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

function buildEnvelope(signalId, sourceSystem, learnerRef, timestamp, payload) {
  return {
    org_id: null,
    signal_id: signalId,
    source_system: sourceSystem,
    learner_reference: learnerRef,
    timestamp,
    schema_version: 'v1',
    payload,
  };
}

// 14 signals: 5 "history" signals first (multi-version staff traces), then original 9. Chronological order.
// expectPolicyId: springs:learner for canvas-lms/blackboard-lms, springs:staff for absorb-lms (per policies/springs/routing.json)
const SIGNALS = [
  // --- Staff multi-version history (earlier timestamps for longer trace in Panel 2/3/4) ---
  // staff-0201: 3 signals = reinforce → intervene → intervene (compliance decline, days overdue growth)
  {
    ...buildEnvelope('staff-0201-absorb-002', 'absorb-lms', 'staff-0201', TS.t0a, {
      complianceScore: 0.6,
      daysOverdue: 5,
      certificationValid: true,
    }),
    signalId: 'staff-0201-absorb-002',
    expectStatus: 'accepted',
    expectDecision: 'reinforce',
    expectPolicyId: 'springs:staff',
  },
  {
    ...buildEnvelope('staff-0201-absorb-003', 'absorb-lms', 'staff-0201', TS.t0b, {
      complianceScore: 0.45,
      daysOverdue: 15,
      certificationValid: true,
    }),
    signalId: 'staff-0201-absorb-003',
    expectStatus: 'accepted',
    expectDecision: 'intervene',
    expectPolicyId: 'springs:staff',
  },
  // staff-0403: 3 signals = reinforce → reinforce → advance (training improvement to model compliance)
  {
    ...buildEnvelope('staff-0403-absorb-002', 'absorb-lms', 'staff-0403', TS.t0c, {
      complianceScore: 0.82,
      trainingScore: 0.65,
      daysOverdue: 0,
      certificationValid: true,
    }),
    signalId: 'staff-0403-absorb-002',
    expectStatus: 'accepted',
    expectDecision: 'reinforce',
    expectPolicyId: 'springs:staff',
  },
  {
    ...buildEnvelope('staff-0403-absorb-003', 'absorb-lms', 'staff-0403', TS.t0d, {
      complianceScore: 0.86,
      trainingScore: 0.72,
      daysOverdue: 2,
      certificationValid: true,
    }),
    signalId: 'staff-0403-absorb-003',
    expectStatus: 'accepted',
    expectDecision: 'reinforce',
    expectPolicyId: 'springs:staff',
  },
  // teacher-7890 (Absorb): 2 signals = reinforce → reinforce (longer staff trace for cross-system demo)
  {
    ...buildEnvelope('teacher-7890-absorb-002', 'absorb-lms', 'teacher-7890', TS.t0e, {
      complianceScore: 0.68,
      trainingScore: 0.62,
      daysOverdue: 5,
      certificationValid: true,
    }),
    signalId: 'teacher-7890-absorb-002',
    expectStatus: 'accepted',
    expectDecision: 'reinforce',
    expectPolicyId: 'springs:staff',
  },
  // --- Original 9 scenarios ---
  {
    ...buildEnvelope('stu-10042-canvas-001', 'canvas-lms', 'stu-10042', TS.t1, {
      stabilityScore: 0.87,
      masteryScore: 0.89,
      timeSinceReinforcement: 30000,
    }),
    signalId: 'stu-10042-canvas-001',
    expectStatus: 'accepted',
    expectDecision: 'advance',
    expectPolicyId: 'springs:learner',
  },
  {
    ...buildEnvelope('stu-10042-bb-001', 'blackboard-lms', 'stu-10042', TS.t2, {
      stabilityScore: 0.91,
      masteryScore: 0.93,
      timeSinceReinforcement: 28000,
    }),
    signalId: 'stu-10042-bb-001',
    expectStatus: 'accepted',
    expectDecision: 'advance',
    expectPolicyId: 'springs:learner',
  },
  {
    ...buildEnvelope('stu-20891-canvas-001', 'canvas-lms', 'stu-20891', TS.t3, {
      stabilityScore: 0.22,
      timeSinceReinforcement: 200000,
      riskSignal: 0.45,
    }),
    signalId: 'stu-20891-canvas-001',
    expectStatus: 'accepted',
    expectDecision: 'intervene',
    expectPolicyId: 'springs:learner',
  },
  {
    ...buildEnvelope('stu-30456-bb-001', 'blackboard-lms', 'stu-30456', TS.t4, {
      stabilityScore: 0.58,
      timeSinceReinforcement: 100000,
    }),
    signalId: 'stu-30456-bb-001',
    expectStatus: 'accepted',
    expectDecision: 'reinforce',
    expectPolicyId: 'springs:learner',
  },
  {
    ...buildEnvelope('staff-0201-absorb-001', 'absorb-lms', 'staff-0201', TS.t5, {
      complianceScore: 0.35,
      daysOverdue: 20,
      certificationValid: true,
    }),
    signalId: 'staff-0201-absorb-001',
    expectStatus: 'accepted',
    expectDecision: 'intervene',
    expectPolicyId: 'springs:staff',
  },
  {
    ...buildEnvelope('staff-0302-absorb-001', 'absorb-lms', 'staff-0302', TS.t6, {
      complianceScore: 0.7,
      daysOverdue: 0,
      certificationValid: false,
    }),
    signalId: 'staff-0302-absorb-001',
    expectStatus: 'accepted',
    expectDecision: 'pause',
    expectPolicyId: 'springs:staff',
  },
  {
    ...buildEnvelope('staff-0403-absorb-001', 'absorb-lms', 'staff-0403', TS.t7, {
      complianceScore: 0.92,
      trainingScore: 0.88,
      daysOverdue: 0,
      certificationValid: true,
    }),
    signalId: 'staff-0403-absorb-001',
    expectStatus: 'accepted',
    expectDecision: 'advance',
    expectPolicyId: 'springs:staff',
  },
  {
    ...buildEnvelope('teacher-7890-canvas-001', 'canvas-lms', 'teacher-7890', TS.t8, {
      stabilityScore: 0.48,
      timeSinceReinforcement: 95000,
    }),
    signalId: 'teacher-7890-canvas-001',
    expectStatus: 'accepted',
    expectDecision: 'reinforce',
    expectPolicyId: 'springs:learner',
  },
  {
    ...buildEnvelope('teacher-7890-absorb-001', 'absorb-lms', 'teacher-7890', TS.t9, {
      complianceScore: 0.72,
      trainingScore: 0.6,
      daysOverdue: 3,
      certificationValid: true,
    }),
    signalId: 'teacher-7890-absorb-001',
    expectStatus: 'accepted',
    expectDecision: 'reinforce',
    expectPolicyId: 'springs:staff',
  },
];

function toPayload(sig, org) {
  const { signalId, expectStatus, expectDecision, expectPolicyId, ...rest } = sig;
  return { ...rest, org_id: org };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getLatestDecisionForLearner(base, apiKey, org, learnerRef) {
  const url = `${base}/v1/decisions?org_id=${encodeURIComponent(org)}&learner_reference=${encodeURIComponent(learnerRef)}&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`;
  const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
  if (!res.ok) return null;
  const body = await res.json().catch(() => ({}));
  const decisions = body.decisions ?? [];
  if (decisions.length === 0) return null;
  decisions.sort((a, b) => new Date(b.decided_at).getTime() - new Date(a.decided_at).getTime());
  return decisions[0];
}

async function main() {
  const { host, apiKey, org } = parseArgs();

  if (!apiKey) {
    console.error('Error: API_KEY env var or --api-key required. Set API_KEY in .env.local or pass --api-key.');
    process.exit(1);
  }

  const base = host.replace(/\/$/, '');
  const signalsUrl = `${base}/v1/signals`;
  const headers = { 'x-api-key': apiKey, 'content-type': 'application/json' };

  console.log(`Seeding Springs demo data to ${signalsUrl} (org: ${org})...\n`);

  const results = [];

  for (let i = 0; i < SIGNALS.length; i++) {
    const sig = SIGNALS[i];
    const payload = toPayload(sig, org);

    try {
      const res = await fetch(signalsUrl, {
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

      let actualDecision = null;
      let actualPolicyId = null;
      let decisionMatch = true;
      let policyMatch = true;
      if (outcome === 'accepted' && (sig.expectDecision || sig.expectPolicyId)) {
        await sleep(50);
        const latest = await getLatestDecisionForLearner(base, apiKey, org, sig.learner_reference);
        actualDecision = latest?.decision_type ?? null;
        actualPolicyId = latest?.trace?.policy_id ?? null;
        decisionMatch = sig.expectDecision ? actualDecision === sig.expectDecision : true;
        policyMatch = sig.expectPolicyId ? actualPolicyId === sig.expectPolicyId : true;
      } else if (outcome === 'duplicate') {
        actualDecision = '(duplicate)';
        decisionMatch = true;
        policyMatch = true;
      }

      results.push({
        signalId: sig.signalId,
        status: res.status,
        outcome,
        actualDecision,
        actualPolicyId,
        expectedDecision: sig.expectDecision,
        expectPolicyId: sig.expectPolicyId,
        expectStatus: sig.expectStatus,
        statusMatch: outcome === sig.expectStatus || (outcome === 'duplicate' && sig.expectStatus === 'accepted'),
        decisionMatch,
        policyMatch,
      });

      const icon = outcome === 'rejected' ? '✗' : outcome === 'duplicate' ? '○' : decisionMatch && policyMatch ? '✓' : '✗';
      const detail =
        outcome === 'accepted'
          ? ` → ${actualDecision ?? '?'}${actualPolicyId ? ` [${actualPolicyId}]` : ''}`
          : outcome === 'rejected' && body.rejection_reason?.code
            ? ` (${body.rejection_reason.code})`
            : '';
      const expectNote =
        outcome === 'accepted' && !decisionMatch ? ` expected ${sig.expectDecision}` : '';
      const policyNote =
        outcome === 'accepted' && !policyMatch && sig.expectPolicyId ? ` expected policy ${sig.expectPolicyId}` : '';
      console.log(`  ${icon} ${sig.signalId}: ${outcome}${detail}${expectNote}${policyNote}`);
    } catch (err) {
      if (err.cause?.code === 'ECONNREFUSED') {
        console.error('\nConnection refused — is the server running at', base, '?');
        process.exit(1);
      }
      throw err;
    }

    if (i < SIGNALS.length - 1) await sleep(DELAY_MS);
  }

  const allMatch = results.every((r) => r.statusMatch && r.decisionMatch && r.policyMatch);
  const passed = results.filter((r) => r.statusMatch && r.decisionMatch && r.policyMatch).length;

  console.log('\n--- Summary ---');
  console.log(`  Sent: ${results.length} | Expected outcomes matched: ${passed}/${results.length}`);
  results.filter((r) => !r.statusMatch || !r.decisionMatch || !r.policyMatch).forEach((r) => {
    const parts = [];
    if (!r.statusMatch) parts.push(`status ${r.outcome} (expected ${r.expectStatus})`);
    if (!r.decisionMatch) parts.push(`decision ${r.actualDecision ?? '?'} (expected ${r.expectedDecision})`);
    if (!r.policyMatch) parts.push(`policy_id ${r.actualPolicyId ?? '?'} (expected ${r.expectPolicyId})`);
    console.log(`  Mismatch: ${r.signalId} — ${parts.join('; ')}`);
  });

  const byType = { advance: 0, intervene: 0, pause: 0, reinforce: 0 };
  for (const r of results) {
    if (r.actualDecision && r.actualDecision !== '(duplicate)') byType[r.actualDecision] = (byType[r.actualDecision] ?? 0) + 1;
  }
  console.log('  Decisions by type: advance %d, intervene %d, pause %d, reinforce %d', byType.advance, byType.intervene, byType.pause, byType.reinforce);
  console.log('  Policy IDs: springs:learner (canvas/blackboard), springs:staff (absorb). All decisions include trace.policy_id.');
  console.log('  Cross-system identity: teacher-7890 appears in Canvas + Absorb → 2 decisions, 1 learner.');
  console.log('  Multi-version staff (longer trace): staff-0201 and staff-0403 have 3 signals each; teacher-7890 has 3 (2 Absorb + 1 Canvas).');
  console.log(`\nInspection panels: ${base}/inspect/`);
  console.log('  Enter org_id:', org, 'and click Refresh to view seeded data.\n');

  process.exit(allMatch ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
