#!/usr/bin/env node
/**
 * Springs Charter Schools Demo Seed Script (v2)
 *
 * Full onboarding-to-intelligence pipeline demo:
 *   Phase 1 — Register field mappings for 4 LMS source systems via admin API
 *   Phase 2 — Send synthesized LMS-shaped signals across 6 personas (learning gaps, trajectories, gifted flag)
 *   Phase 3 — Verify decisions and output narrative summary
 *
 * Source systems: Canvas LMS, Blackboard LMS, i-Ready Diagnostic, Absorb LMS
 * Personas: Maya Kim, Alex Rivera, Jordan Mitchell, Sam Torres, Ms. Davis
 *
 * Plan: .cursor/plans/springs-realistic-seed.plan.md
 * Usage: npm run seed:springs-demo
 *    or: node scripts/seed-springs-demo.mjs [--host URL] [--api-key KEY] [--admin-key KEY] [--org ORG]
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

// ─── Field Mappings (TASK-002 design) ────────────────────────────────────────

const FIELD_MAPPINGS = {
  'canvas-lms': {
    aliases: {
      skill: ['group.courseNumber'],
      assessment_type: ['object.extensions.com_instructure_canvas.submission_type'],
    },
    transforms: [
      {
        target: 'masteryScore',
        sources: { earned: 'generated.scoreGiven', possible: 'generated.maxScore' },
        expression: 'Math.min(earned / possible, 1)',
      },
      {
        target: 'stabilityScore',
        sources: { earned: 'generated.scoreGiven', possible: 'generated.maxScore' },
        expression: 'Math.min(earned / possible, 1) * 0.9',
      },
      {
        target: 'timeSinceReinforcement',
        source: 'extensions.timeSinceLastActivity',
        expression: 'value',
      },
    ],
    types: {
      masteryScore: 'number',
      stabilityScore: 'number',
      skill: 'string',
    },
  },

  'blackboard-lms': {
    aliases: {
      skill: ['group.courseNumber'],
      assessment_type: ['extensions.bb_action_name'],
    },
    transforms: [
      {
        target: 'masteryScore',
        sources: { earned: 'generated.scoreGiven', possible: 'object.assignable.maxScore' },
        expression: 'Math.min(earned / possible, 1)',
      },
      {
        target: 'stabilityScore',
        sources: { earned: 'generated.scoreGiven', possible: 'object.assignable.maxScore' },
        expression: 'Math.min(earned / possible, 1) * 0.85',
      },
      {
        target: 'timeSinceReinforcement',
        source: 'extensions.timeSinceLastActivity',
        expression: 'value',
      },
    ],
    types: {
      masteryScore: 'number',
      stabilityScore: 'number',
      skill: 'string',
    },
  },

  'iready-diagnostic': {
    aliases: {
      skill: ['subject'],
      assessment_type: ['normingWindow'],
    },
    transforms: [
      {
        target: 'masteryScore',
        sources: { score: 'overallScaleScore', maxScore: 'maxScaleScore' },
        expression: 'Math.min(score / maxScore, 1)',
      },
      {
        target: 'stabilityScore',
        source: 'percentile',
        expression: 'value / 100',
      },
      {
        target: 'riskSignal',
        source: 'diagnosticGain',
        expression: 'Math.max(1 - (value + 50) / 100, 0)',
      },
    ],
    types: {
      masteryScore: 'number',
      stabilityScore: 'number',
      riskSignal: 'number',
      skill: 'string',
    },
  },

  'absorb-lms': {
    aliases: {
      skill: ['name'],
      assessment_type: ['enrollmentType'],
    },
    transforms: [
      {
        target: 'complianceScore',
        source: 'progress',
        expression: 'value',
      },
    ],
    types: {
      complianceScore: 'number',
      trainingScore: 'number',
      daysOverdue: 'number',
      certificationValid: 'boolean',
    },
  },
};

// ─── Personas ────────────────────────────────────────────────────────────────

const PERSONAS = {
  'stu-10042': { name: 'Maya Kim', summary: 'Cross-system gap — Math strong, Reading decaying vs ELA' },
  'stu-20891': { name: 'Alex Rivera', summary: 'Multi-skill English gap + Blackboard Science struggle' },
  'stu-30456': { name: 'Jordan Mitchell', summary: 'Canvas Math trajectory + Blackboard History' },
  'stu-40123': { name: 'Sam Torres', summary: 'Declining ELA trajectory (borderline → intervene)' },
  'stu-50199': { name: 'Priya Patel', summary: 'Cross-subject excellence — gifted-interest flag' },
  'staff-0201': { name: 'Ms. Davis', summary: 'Absorb Compliance' },
};

// ─── Signal definitions (TASK-003 design) ────────────────────────────────────

const BASE_TS = '2026-03-15T09:00:00Z';
function offsetTs(minutes) {
  const d = new Date(BASE_TS);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString().replace('.000Z', 'Z');
}

/** Three advance-only signals per skill — evidenceCount ≥ 3 for gifted-interest (URS G6). */
function buildGiftedSignals(learnerRef, personaName, startMinute) {
  const tracks = [
    { skill: 'MATH-301', courseNumber: 'MATH-301', scores: [96, 97, 98] },
    { skill: 'SCI-101', courseNumber: 'SCI-101', scores: [95, 96, 97] },
    { skill: 'ELA-101', courseNumber: 'ELA-101', scores: [97, 98, 99] },
  ];
  const signals = [];
  let minute = startMinute;

  for (const track of tracks) {
    track.scores.forEach((scoreGiven, idx) => {
      const masteryScore = scoreGiven / 100;
      const stabilityScore = Math.min(masteryScore * 0.9, 1);
      signals.push({
        signalId: `priya-${track.skill.toLowerCase()}-00${idx + 1}`,
        sourceSystem: 'canvas-lms',
        learnerRef,
        timestamp: offsetTs(minute),
        persona: personaName,
        skill: track.skill,
        expectDecision: 'advance',
        payload: {
          generated: { scoreGiven, maxScore: 100 },
          group: { courseNumber: track.courseNumber },
          object: { extensions: { com_instructure_canvas: { submission_type: 'online_quiz' } } },
          extensions: { timeSinceLastActivity: 30000 + idx * 5000 },
          skill: track.skill,
          skills: {
            [track.skill]: { masteryScore, stabilityScore },
          },
        },
      });
      minute += 1;
    });
  }

  return signals;
}

const SIGNALS = [
  // Signal 1: Maya Kim — Canvas Math (advance)
  {
    signalId: 'maya-canvas-math-001',
    sourceSystem: 'canvas-lms',
    learnerRef: 'stu-10042',
    timestamp: offsetTs(0),
    persona: 'Maya Kim',
    skill: 'MATH-301',
    expectDecision: 'advance',
    payload: {
      generated: { scoreGiven: 92, maxScore: 100 },
      group: { courseNumber: 'MATH-301' },
      object: { extensions: { com_instructure_canvas: { submission_type: 'online_quiz' } } },
      extensions: { timeSinceLastActivity: 30000 },
      skill: 'MATH-301',
      skills: { 'MATH-301': { masteryScore: 0.92, stabilityScore: 0.828 } },
    },
  },

  // Signal 2: Maya Kim — Canvas ELA (advance) — pairs with Reading for English learning gap
  {
    signalId: 'maya-canvas-ela-001',
    sourceSystem: 'canvas-lms',
    learnerRef: 'stu-10042',
    timestamp: offsetTs(1),
    persona: 'Maya Kim',
    skill: 'ELA-201',
    expectDecision: 'reinforce',
    payload: {
      generated: { scoreGiven: 88, maxScore: 100 },
      group: { courseNumber: 'ELA-201' },
      object: { extensions: { com_instructure_canvas: { submission_type: 'online_upload' } } },
      extensions: { timeSinceLastActivity: 45000 },
      skill: 'ELA-201',
      skills: { 'ELA-201': { masteryScore: 0.88, stabilityScore: 0.792 } },
    },
  },

  // Signal 3: Maya Kim — i-Ready Reading (intervene) — learning gap vs ELA in English
  {
    signalId: 'maya-iready-read-001',
    sourceSystem: 'iready-diagnostic',
    learnerRef: 'stu-10042',
    timestamp: offsetTs(2),
    persona: 'Maya Kim',
    skill: 'Reading',
    expectDecision: 'intervene',
    payload: {
      overallScaleScore: 380,
      maxScaleScore: 800,
      percentile: 22,
      diagnosticGain: -15,
      subject: 'Reading',
      normingWindow: 'MOY',
      timeSinceReinforcement: 200000,
      skill: 'Reading',
      skills: { Reading: { masteryScore: 0.475, stabilityScore: 0.22, riskSignal: 0.65 } },
    },
  },

  // Signal 4: Alex Rivera — Canvas ELA-101 (advance) — strong skill for within-subject gap
  {
    signalId: 'alex-canvas-ela-101-001',
    sourceSystem: 'canvas-lms',
    learnerRef: 'stu-20891',
    timestamp: offsetTs(4),
    persona: 'Alex Rivera',
    skill: 'ELA-101',
    expectDecision: 'reinforce',
    payload: {
      generated: { scoreGiven: 82, maxScore: 100 },
      group: { courseNumber: 'ELA-101' },
      object: { extensions: { com_instructure_canvas: { submission_type: 'online_quiz' } } },
      extensions: { timeSinceLastActivity: 50000 },
      skill: 'ELA-101',
      skills: { 'ELA-101': { masteryScore: 0.82, stabilityScore: 0.738 } },
    },
  },

  // Signal 5: Alex Rivera — Canvas ELA-201 (intervene) — learning gap vs ELA-101
  {
    signalId: 'alex-canvas-ela-001',
    sourceSystem: 'canvas-lms',
    learnerRef: 'stu-20891',
    timestamp: offsetTs(4),
    persona: 'Alex Rivera',
    skill: 'ELA-201',
    expectDecision: 'intervene',
    payload: {
      generated: { scoreGiven: 28, maxScore: 100 },
      group: { courseNumber: 'ELA-201' },
      object: { extensions: { com_instructure_canvas: { submission_type: 'online_upload' } } },
      extensions: { timeSinceLastActivity: 190000 },
      skill: 'ELA-201',
      skills: { 'ELA-201': { masteryScore: 0.28, stabilityScore: 0.252 } },
    },
  },

  // Signal 4: Alex Rivera — Blackboard Science (intervene)
  {
    signalId: 'alex-bb-sci-001',
    sourceSystem: 'blackboard-lms',
    learnerRef: 'stu-20891',
    timestamp: offsetTs(6),
    persona: 'Alex Rivera',
    skill: 'SCI-101',
    expectDecision: 'intervene',
    payload: {
      generated: { scoreGiven: 15 },
      object: { assignable: { maxScore: 60 } },
      group: { courseNumber: 'SCI-101' },
      extensions: { bb_action_name: 'GradeSubmission', timeSinceLastActivity: 180000 },
      skill: 'SCI-101',
      skills: { 'SCI-101': { masteryScore: 0.25, stabilityScore: 0.2125 } },
    },
  },

  // Signal 5: Jordan Mitchell — Canvas Math t1 (reinforce)
  {
    signalId: 'jordan-canvas-math-001',
    sourceSystem: 'canvas-lms',
    learnerRef: 'stu-30456',
    timestamp: offsetTs(8),
    persona: 'Jordan Mitchell',
    skill: 'MATH-301',
    expectDecision: 'reinforce',
    payload: {
      generated: { scoreGiven: 45, maxScore: 100 },
      group: { courseNumber: 'MATH-301' },
      object: { extensions: { com_instructure_canvas: { submission_type: 'online_quiz' } } },
      extensions: { timeSinceLastActivity: 95000 },
      skill: 'MATH-301',
      skills: { 'MATH-301': { masteryScore: 0.45, stabilityScore: 0.405 } },
    },
  },

  // Signal 6: Jordan Mitchell — Canvas Math t2 (reinforce, improving)
  {
    signalId: 'jordan-canvas-math-002',
    sourceSystem: 'canvas-lms',
    learnerRef: 'stu-30456',
    timestamp: offsetTs(10),
    persona: 'Jordan Mitchell',
    skill: 'MATH-301',
    expectDecision: 'reinforce',
    payload: {
      generated: { scoreGiven: 68, maxScore: 100 },
      group: { courseNumber: 'MATH-301' },
      object: { extensions: { com_instructure_canvas: { submission_type: 'online_quiz' } } },
      extensions: { timeSinceLastActivity: 90000 },
      skill: 'MATH-301',
      skills: { 'MATH-301': { masteryScore: 0.68, stabilityScore: 0.612 } },
    },
  },

  // Signal 7: Jordan Mitchell — Blackboard History (reinforce, default)
  // Sent BEFORE math-003 so Jordan's final signal is the MATH-301 advance,
  // preserving masteryScore_direction: 'improving' for Panel 4 display.
  {
    signalId: 'jordan-bb-hist-001',
    sourceSystem: 'blackboard-lms',
    learnerRef: 'stu-30456',
    timestamp: offsetTs(12),
    persona: 'Jordan Mitchell',
    skill: 'HIST-202',
    expectDecision: 'reinforce',
    payload: {
      generated: { scoreGiven: 48 },
      object: { assignable: { maxScore: 60 } },
      group: { courseNumber: 'HIST-202' },
      extensions: { bb_action_name: 'GradeSubmission', timeSinceLastActivity: 40000 },
      skill: 'HIST-202',
      skills: { 'HIST-202': { masteryScore: 0.80, stabilityScore: 0.68 } },
    },
  },

  // Signal 8: Jordan Mitchell — Canvas Math t3 (advance, level transition)
  {
    signalId: 'jordan-canvas-math-003',
    sourceSystem: 'canvas-lms',
    learnerRef: 'stu-30456',
    timestamp: offsetTs(14),
    persona: 'Jordan Mitchell',
    skill: 'MATH-301',
    expectDecision: 'advance',
    payload: {
      generated: { scoreGiven: 90, maxScore: 100 },
      group: { courseNumber: 'MATH-301' },
      object: { extensions: { com_instructure_canvas: { submission_type: 'online_quiz' } } },
      extensions: { timeSinceLastActivity: 30000 },
      skill: 'MATH-301',
      skills: { 'MATH-301': { masteryScore: 0.90, stabilityScore: 0.81 } },
    },
  },

  // Signal 9: Sam Torres — Canvas ELA t1 (reinforce)
  {
    signalId: 'sam-canvas-ela-001',
    sourceSystem: 'canvas-lms',
    learnerRef: 'stu-40123',
    timestamp: offsetTs(16),
    persona: 'Sam Torres',
    skill: 'ELA-201',
    expectDecision: 'reinforce',
    payload: {
      generated: { scoreGiven: 55, maxScore: 100 },
      group: { courseNumber: 'ELA-201' },
      object: { extensions: { com_instructure_canvas: { submission_type: 'online_upload' } } },
      extensions: { timeSinceLastActivity: 90000 },
      skill: 'ELA-201',
      skills: { 'ELA-201': { masteryScore: 0.55, stabilityScore: 0.495 } },
    },
  },

  // Signal 10: Sam Torres — Canvas ELA t2 (reinforce, declining)
  {
    signalId: 'sam-canvas-ela-002',
    sourceSystem: 'canvas-lms',
    learnerRef: 'stu-40123',
    timestamp: offsetTs(17),
    persona: 'Sam Torres',
    skill: 'ELA-201',
    expectDecision: 'reinforce',
    payload: {
      generated: { scoreGiven: 48, maxScore: 100 },
      group: { courseNumber: 'ELA-201' },
      object: { extensions: { com_instructure_canvas: { submission_type: 'online_upload' } } },
      extensions: { timeSinceLastActivity: 120000 },
      skill: 'ELA-201',
      skills: { 'ELA-201': { masteryScore: 0.48, stabilityScore: 0.432 } },
    },
  },

  // Signal 11: Sam Torres — Canvas ELA t3 (intervene, decay surfaced in trajectory)
  {
    signalId: 'sam-canvas-ela-003',
    sourceSystem: 'canvas-lms',
    learnerRef: 'stu-40123',
    timestamp: offsetTs(18),
    persona: 'Sam Torres',
    skill: 'ELA-201',
    expectDecision: 'intervene',
    payload: {
      generated: { scoreGiven: 32, maxScore: 100 },
      group: { courseNumber: 'ELA-201' },
      object: { extensions: { com_instructure_canvas: { submission_type: 'online_upload' } } },
      extensions: { timeSinceLastActivity: 200000 },
      skill: 'ELA-201',
      skills: { 'ELA-201': { masteryScore: 0.32, stabilityScore: 0.288 } },
    },
  },

  // Signals 12–20: Priya Patel — cross-subject advance-only (gifted-interest flag)
  ...buildGiftedSignals('stu-50199', 'Priya Patel', 22),

  // Signal 21: Ms. Davis — Absorb Compliance t1 (reinforce)
  {
    signalId: 'davis-absorb-001',
    sourceSystem: 'absorb-lms',
    learnerRef: 'staff-0201',
    timestamp: offsetTs(18),
    persona: 'Ms. Davis',
    skill: 'Annual Compliance 2026',
    expectDecision: 'reinforce',
    payload: {
      progress: 0.60,
      daysOverdue: 5,
      certificationValid: true,
      name: 'Annual Compliance 2026',
      enrollmentType: 'required',
      skill: 'Annual Compliance 2026',
      complianceScore: 0.60,
      trainingScore: 0.70,
      stabilityScore: 0.60,
      masteryScore: 0.70,
      skills: { 'Annual Compliance 2026': { complianceScore: 0.60, trainingScore: 0.70, daysOverdue: 5, stabilityScore: 0.60, masteryScore: 0.70 } },
    },
  },

  // Signal 22: Ms. Davis — Absorb Compliance t2 (intervene, declining)
  {
    signalId: 'davis-absorb-002',
    sourceSystem: 'absorb-lms',
    learnerRef: 'staff-0201',
    timestamp: offsetTs(20),
    persona: 'Ms. Davis',
    skill: 'Annual Compliance 2026',
    expectDecision: 'intervene',
    payload: {
      progress: 0.35,
      daysOverdue: 20,
      certificationValid: true,
      name: 'Annual Compliance 2026',
      enrollmentType: 'required',
      skill: 'Annual Compliance 2026',
      complianceScore: 0.35,
      trainingScore: 0.40,
      stabilityScore: 0.35,
      masteryScore: 0.40,
      skills: { 'Annual Compliance 2026': { complianceScore: 0.35, trainingScore: 0.40, daysOverdue: 20, stabilityScore: 0.35, masteryScore: 0.40 } },
    },
  },
];

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    host: DEFAULT_HOST,
    apiKey: process.env.API_KEY,
    adminKey: process.env.ADMIN_API_KEY,
    org: DEFAULT_ORG,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host' && args[i + 1]) opts.host = args[++i];
    else if (args[i] === '--api-key' && args[i + 1]) opts.apiKey = args[++i];
    else if (args[i] === '--admin-key' && args[i + 1]) opts.adminKey = args[++i];
    else if (args[i] === '--org' && args[i + 1]) opts.org = args[++i];
  }
  return opts;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Phase 1: Register field mappings ────────────────────────────────────────

async function registerMappings(base, adminKey, org) {
  console.log('Phase 1: Registering field mappings (onboarding)...');

  if (!adminKey) {
    console.log('  Phase 1: Skipping mapping registration (no --admin-key or ADMIN_API_KEY)');
    return false;
  }

  const headers = { 'x-admin-api-key': adminKey, 'content-type': 'application/json' };
  let allOk = true;

  for (const [sourceSystem, mapping] of Object.entries(FIELD_MAPPINGS)) {
    const url = `${base}/v1/admin/mappings/${encodeURIComponent(org)}/${encodeURIComponent(sourceSystem)}`;
    const transformCount = mapping.transforms?.length ?? 0;
    const aliasCount = mapping.aliases ? Object.keys(mapping.aliases).length : 0;

    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify(mapping),
      });

      if (res.ok) {
        const pad = sourceSystem.padEnd(18);
        console.log(`  \u2713 ${pad} \u2014 ${transformCount} transforms, ${aliasCount} aliases`);
      } else {
        const body = await res.json().catch(() => ({}));
        console.error(
          `  \u2717 ${sourceSystem} \u2014 HTTP ${res.status}: ${
            body?.error?.message ?? body?.message ?? body?.code ?? 'unknown error'
          }`,
        );
        allOk = false;
      }
    } catch (err) {
      if (err.cause?.code === 'ECONNREFUSED') {
        console.error('\nConnection refused \u2014 is the server running at', base, '?');
        process.exit(1);
      }
      throw err;
    }
  }

  console.log();
  return allOk;
}

// ─── Phase 2: Send signals + capture decisions inline ────────────────────────

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

async function sendSignals(base, apiKey, org) {
  console.log('Phase 2: Sending realistic LMS signals...');

  const signalsUrl = `${base}/v1/signals`;
  const headers = { 'x-api-key': apiKey, 'content-type': 'application/json' };
  const results = [];

  for (let i = 0; i < SIGNALS.length; i++) {
    const sig = SIGNALS[i];

    const envelope = {
      org_id: org,
      signal_id: sig.signalId,
      source_system: sig.sourceSystem,
      learner_reference: sig.learnerRef,
      timestamp: sig.timestamp,
      schema_version: 'v1',
      payload: sig.payload,
    };

    try {
      const res = await fetch(signalsUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(envelope),
      });

      if (res.status === 401) {
        console.error('\n401 Unauthorized \u2014 check API_KEY.');
        process.exit(1);
      }

      const body = await res.json().catch(() => ({}));
      const status = body.status ?? (res.ok ? 'accepted' : 'rejected');
      const outcome = status === 'accepted' ? 'accepted' : status === 'duplicate' ? 'duplicate' : 'rejected';

      let actualDecision = null;
      if (outcome === 'accepted') {
        await sleep(50);
        const latest = await getLatestDecisionForLearner(base, apiKey, org, sig.learnerRef);
        actualDecision = latest?.decision_type ?? null;
      }

      results.push({
        ...sig,
        httpStatus: res.status,
        outcome,
        actualDecision,
        rejectionCode: body.rejection_reason?.code,
      });

      const icon = outcome === 'rejected' ? '\u2717' : outcome === 'duplicate' ? '\u25CB' : '\u2713';
      const detail = outcome === 'rejected' && body.rejection_reason?.code ? ` (${body.rejection_reason.code})` : '';
      console.log(`  ${icon} ${sig.signalId}: ${sig.sourceSystem} \u2192 ${outcome}${detail}`);
    } catch (err) {
      if (err.cause?.code === 'ECONNREFUSED') {
        console.error('\nConnection refused \u2014 is the server running at', base, '?');
        process.exit(1);
      }
      throw err;
    }

    if (i < SIGNALS.length - 1) await sleep(DELAY_MS);
  }

  console.log();
  return results;
}

// ─── Phase 3: Narrative verification ─────────────────────────────────────────

async function getLearnerSummary(base, apiKey, org, learnerRef) {
  const url = `${base}/v1/learners/${encodeURIComponent(learnerRef)}/summary?org_id=${encodeURIComponent(org)}`;
  const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function verifyNarrative(base, apiKey, org, signalResults) {
  console.log('Phase 3: Verification\n');

  const byPersona = {};
  for (const sig of signalResults) {
    if (!byPersona[sig.learnerRef]) byPersona[sig.learnerRef] = [];
    byPersona[sig.learnerRef].push(sig);
  }

  let matchCount = 0;
  let mismatchCount = 0;
  const decisionCounts = { advance: 0, intervene: 0, reinforce: 0, pause: 0 };
  const sourceCounts = {};

  const personaOrder = ['stu-10042', 'stu-20891', 'stu-30456', 'stu-40123', 'stu-50199', 'staff-0201'];

  for (const learnerRef of personaOrder) {
    const persona = PERSONAS[learnerRef];
    const signals = byPersona[learnerRef] ?? [];

    console.log(`${persona.name} (${learnerRef}) \u2014 ${persona.summary}`);

    for (const sig of signals) {
      sourceCounts[sig.sourceSystem] = (sourceCounts[sig.sourceSystem] ?? 0) + 1;

      let displayDecision;
      if (sig.outcome === 'duplicate') {
        displayDecision = '(duplicate)';
      } else {
        displayDecision = sig.actualDecision ?? '?';
      }

      const isMatch = sig.outcome === 'duplicate' || displayDecision === sig.expectDecision;
      if (isMatch) matchCount++;
      else mismatchCount++;

      if (displayDecision !== '(duplicate)' && decisionCounts[displayDecision] !== undefined) {
        decisionCounts[displayDecision]++;
      }

      const icon = sig.outcome === 'duplicate' ? '\u25CB' : isMatch ? '\u2713' : '\u2717';
      let annotation = '';
      if (sig.signalId === 'jordan-canvas-math-002') annotation = ' [improving +0.23 mastery]';
      else if (sig.signalId === 'jordan-canvas-math-003') annotation = ' [level: proficient \u2192 mastery]';
      else if (sig.signalId === 'davis-absorb-002') annotation = ' [declining]';

      const decisionDisplay = sig.outcome === 'duplicate' ? 'duplicate' : displayDecision;
      console.log(`  ${icon} ${sig.signalId}: ${sig.sourceSystem} \u2192 ${decisionDisplay} (${sig.skill})${annotation}`);

      if (!isMatch && sig.outcome !== 'duplicate') {
        console.log(`    \u26A0 Expected ${sig.expectDecision}, got ${displayDecision}`);
      }
    }

    if (learnerRef === 'stu-10042') {
      console.log('  \uD83D\uDCCA Cross-system: Math advancing; ELA strong (88%) but Reading gap (48%) vs subject mean.');
      console.log('  \uD83D\uDCCA Learning gap: Reading below English subject average — visible in mastery_breakdown.');
    } else if (learnerRef === 'stu-20891') {
      console.log('  \uD83D\uDCCA Multi-platform struggle + learning gap: ELA-201 (28%) vs ELA-101 (82%) in English.');
    } else if (learnerRef === 'stu-30456') {
      console.log('  \uD83D\uDCCA Trajectory: intervention worked \u2014 MATH-301 masteryScore 0.45 \u2192 0.68 \u2192 0.90 over 3 signals.');
      console.log('  \uD83D\uDCCA Multi-subject: Math (MATH-301) + History (HIST-202) \u2014 subjects.json maps both; overall is equal-weight subject mean.');
    } else if (learnerRef === 'stu-40123') {
      console.log('  \uD83D\uDCCA Declining trajectory: ELA-201 55% \u2192 48% \u2192 32% \u2014 reinforce then intervene; decay visible in trajectory tab.');
    } else if (learnerRef === 'stu-50199') {
      console.log('  \uD83D\uDCCA Gifted-interest: 3 skills \u00d7 3 advance signals, all mastery \u2265 0.95, advance-only history.');
    } else if (learnerRef === 'staff-0201') {
      console.log('  \uD83D\uDCCA Staff alert: compliance dropped 0.60 \u2192 0.35, 20 days overdue. Panel 3 action pending.');
    }
    console.log();
  }

  const total = matchCount + mismatchCount;
  const sourceEntries = Object.entries(sourceCounts).map(([k, v]) => `${k} (${v})`).join(', ');

  console.log('--- Summary ---');
  console.log(`  Signals: ${total} sent | ${matchCount} matched expected outcomes`);
  console.log(`  Decisions: advance ${decisionCounts.advance}, intervene ${decisionCounts.intervene}, reinforce ${decisionCounts.reinforce}`);
  console.log(`  Sources: ${sourceEntries}`);
  console.log(`  Field mappings: ${Object.keys(FIELD_MAPPINGS).length} registered (Phase 1)`);
  console.log();

  const jordanSummary = await getLearnerSummary(base, apiKey, org, 'stu-30456');
  if (jordanSummary?.current_state?.mastery_breakdown) {
    const mb = jordanSummary.current_state.mastery_breakdown;
    const overall = mb.overall?.masteryScore;
    const dominant = jordanSummary.current_state.fields?.masteryScore;
    const subjects = Object.keys(mb.subjects ?? {}).join(', ');
    console.log('--- mastery_breakdown (Jordan Mitchell) ---');
    console.log(`  subjects: ${subjects}`);
    console.log(`  overall.masteryScore (multi-subject mean): ${overall}`);
    console.log(`  fields.masteryScore (dominant-skill mirror): ${dominant}`);
    if (typeof overall === 'number' && typeof dominant === 'number' && overall !== dominant) {
      console.log('  \u2713 overall reflects equal-weight subject mean, not dominant-skill mirror alone');
    }
    console.log();
  }

  console.log(`  Dashboard: ${base}/dashboard/`);
  console.log(`  Inspect:   ${base}/inspect/`);
  console.log();

  return mismatchCount === 0;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { host, apiKey, adminKey, org } = parseArgs();

  if (!apiKey) {
    console.error('Error: API_KEY env var or --api-key required. Set API_KEY in .env.local or pass --api-key.');
    process.exit(1);
  }

  const base = host.replace(/\/$/, '');

  console.log(`\nSprings Realistic Seed (v3) \u2014 ${base} (org: ${org})\n`);
  console.log('Personas: Maya Kim, Alex Rivera, Jordan Mitchell, Sam Torres, Priya Patel, Ms. Davis');
  console.log('Sources:  canvas-lms, blackboard-lms, iready-diagnostic, absorb-lms');
  console.log(`Signals:  ${SIGNALS.length} (learning gaps, trajectories, gifted-interest)\n`);

  // Phase 1
  await registerMappings(base, adminKey, org);

  // Phase 2
  const signalResults = await sendSignals(base, apiKey, org);

  // Phase 3
  const allMatch = await verifyNarrative(base, apiKey, org, signalResults);

  process.exit(allMatch ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
