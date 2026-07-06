#!/usr/bin/env node
/**
 * Springs Charter Schools Demo Seed Script (v4)
 *
 * Full onboarding-to-intelligence pipeline demo:
 *   Phase 1 — Register field mappings for 4 LMS source systems via admin API
 *   Phase 2 — Send synthesized LMS-shaped signals across 6 personas, spread over ~90 days
 *   Phase 3 — Verify decisions and output narrative summary
 *
 * Source systems: Canvas LMS, Blackboard LMS, i-Ready Diagnostic, Absorb LMS
 * Personas: Maya Kim, Alex Rivera, Jordan Mitchell, Sam Torres, Priya Patel, Ms. Davis
 *
 * Plan: .cursor/plans/springs-realistic-seed.plan.md
 * Usage: npm run seed:springs-demo
 *    or: node examples/springs/seed-springs-demo.mjs [--host URL] [--api-key KEY] [--admin-key KEY] [--org ORG] [--span-days 90]
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
const DEFAULT_SPAN_DAYS = 90;
const DELAY_MS = 100;
const MS_PER_DAY = 86_400_000;

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

// ─── Timeline helpers ────────────────────────────────────────────────────────

/** ISO timestamp for N calendar days before today (local midnight anchor + hour offset). */
function atDaysAgo(daysAgoFromToday, hour = 10, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setTime(d.getTime() - daysAgoFromToday * MS_PER_DAY);
  return d.toISOString().replace('.000Z', 'Z');
}

function canvasSignal({
  signalId,
  learnerRef,
  persona,
  skill,
  courseNumber,
  scoreGiven,
  daysAgo,
  expectDecision,
  verify = true,
  submissionType = 'online_quiz',
  timeSinceLastActivity = 50_000,
}) {
  const masteryScore = scoreGiven / 100;
  const stabilityScore = Math.min(masteryScore * 0.9, 1);
  return {
    signalId,
    sourceSystem: 'canvas-lms',
    learnerRef,
    timestamp: atDaysAgo(daysAgo, 10 + (daysAgo % 5)),
    persona,
    skill,
    expectDecision,
    verify,
    payload: {
      generated: { scoreGiven, maxScore: 100 },
      group: { courseNumber: courseNumber ?? skill },
      object: { extensions: { com_instructure_canvas: { submission_type: submissionType } } },
      extensions: { timeSinceLastActivity },
      skill,
      skills: { [skill]: { masteryScore, stabilityScore } },
    },
  };
}

function blackboardSignal({
  signalId,
  learnerRef,
  persona,
  skill,
  courseNumber,
  scoreGiven,
  maxScore,
  daysAgo,
  expectDecision,
  verify = true,
  timeSinceLastActivity = 60_000,
}) {
  const masteryScore = scoreGiven / maxScore;
  const stabilityScore = masteryScore * 0.85;
  return {
    signalId,
    sourceSystem: 'blackboard-lms',
    learnerRef,
    timestamp: atDaysAgo(daysAgo, 11 + (daysAgo % 4)),
    persona,
    skill,
    expectDecision,
    verify,
    payload: {
      generated: { scoreGiven },
      object: { assignable: { maxScore } },
      group: { courseNumber: courseNumber ?? skill },
      extensions: { bb_action_name: 'GradeSubmission', timeSinceLastActivity },
      skill,
      skills: { [skill]: { masteryScore, stabilityScore } },
    },
  };
}

function ireadySignal({
  signalId,
  learnerRef,
  persona,
  skill,
  daysAgo,
  overallScaleScore,
  maxScaleScore,
  percentile,
  diagnosticGain,
  expectDecision,
  verify = true,
}) {
  const masteryScore = overallScaleScore / maxScaleScore;
  const stabilityScore = percentile / 100;
  const riskSignal = Math.max(1 - (diagnosticGain + 50) / 100, 0);
  return {
    signalId,
    sourceSystem: 'iready-diagnostic',
    learnerRef,
    timestamp: atDaysAgo(daysAgo, 9),
    persona,
    skill,
    expectDecision,
    verify,
    payload: {
      overallScaleScore,
      maxScaleScore,
      percentile,
      diagnosticGain,
      subject: skill,
      normingWindow: 'MOY',
      timeSinceReinforcement: 200_000,
      skill,
      skills: { [skill]: { masteryScore, stabilityScore, riskSignal } },
    },
  };
}

function absorbSignal({
  signalId,
  learnerRef,
  persona,
  skill,
  daysAgo,
  progress,
  daysOverdue,
  expectDecision,
  verify = true,
}) {
  const complianceScore = progress;
  const trainingScore = Math.min(progress + 0.1, 1);
  const stabilityScore = progress;
  const masteryScore = trainingScore;
  return {
    signalId,
    sourceSystem: 'absorb-lms',
    learnerRef,
    timestamp: atDaysAgo(daysAgo, 14),
    persona,
    skill,
    expectDecision,
    verify,
    payload: {
      progress,
      daysOverdue,
      certificationValid: true,
      name: skill,
      enrollmentType: 'required',
      skill,
      complianceScore,
      trainingScore,
      stabilityScore,
      masteryScore,
      skills: {
        [skill]: { complianceScore, trainingScore, daysOverdue, stabilityScore, masteryScore },
      },
    },
  };
}

/** Three advance-only signals per skill — evidenceCount ≥ 3 for gifted-interest (URS G6). */
function buildGiftedSignals(learnerRef, personaName, dayOffsets) {
  const tracks = [
    { skill: 'MATH-301', courseNumber: 'MATH-301', scores: [96, 97, 98] },
    { skill: 'SCI-101', courseNumber: 'SCI-101', scores: [95, 96, 97] },
    { skill: 'ELA-101', courseNumber: 'ELA-101', scores: [97, 98, 99] },
  ];
  const signals = [];
  let dayIdx = 0;

  for (const track of tracks) {
    track.scores.forEach((scoreGiven, idx) => {
      signals.push(
        canvasSignal({
          signalId: `priya-${track.skill.toLowerCase()}-00${idx + 1}`,
          learnerRef,
          persona: personaName,
          skill: track.skill,
          courseNumber: track.courseNumber,
          scoreGiven,
          daysAgo: dayOffsets[dayIdx] ?? 15,
          expectDecision: 'advance',
        })
      );
      dayIdx += 1;
    });
  }

  return signals;
}

/**
 * Build all demo signals spread across spanDays ending today.
 * Signals are returned in chronological order (oldest first) for ingestion.
 */
function buildSignals(spanDays) {
  const clamp = (d) => Math.min(Math.max(d, 1), spanDays - 1);

  const signals = [
    // ── Maya Kim — Math strong, Reading gap vs ELA ──
    canvasSignal({
      signalId: 'maya-canvas-math-001',
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'MATH-301',
      scoreGiven: 92,
      daysAgo: clamp(84),
      expectDecision: 'advance',
    }),
    canvasSignal({
      signalId: 'maya-canvas-math-hist-001',
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'MATH-301',
      scoreGiven: 94,
      daysAgo: clamp(62),
      expectDecision: 'advance',
      verify: false,
    }),
    canvasSignal({
      signalId: 'maya-canvas-ela-001',
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'ELA-201',
      scoreGiven: 88,
      daysAgo: clamp(58),
      expectDecision: 'reinforce',
      submissionType: 'online_upload',
      timeSinceLastActivity: 45_000,
    }),
    canvasSignal({
      signalId: 'maya-canvas-math-hist-002',
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'MATH-301',
      scoreGiven: 91,
      daysAgo: clamp(40),
      expectDecision: 'advance',
      verify: false,
    }),
    ireadySignal({
      signalId: 'maya-iready-read-001',
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'Reading',
      daysAgo: clamp(35),
      overallScaleScore: 380,
      maxScaleScore: 800,
      percentile: 22,
      diagnosticGain: -15,
      expectDecision: 'intervene',
    }),
    canvasSignal({
      signalId: 'maya-canvas-ela-hist-001',
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'ELA-201',
      scoreGiven: 86,
      daysAgo: clamp(22),
      expectDecision: 'reinforce',
      verify: false,
      submissionType: 'online_upload',
    }),
    ireadySignal({
      signalId: 'maya-iready-read-002',
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'Reading',
      daysAgo: clamp(12),
      overallScaleScore: 360,
      maxScaleScore: 800,
      percentile: 18,
      diagnosticGain: -18,
      expectDecision: 'intervene',
      verify: false,
    }),
    canvasSignal({
      signalId: 'maya-canvas-math-recent',
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'MATH-301',
      scoreGiven: 93,
      daysAgo: clamp(3),
      expectDecision: 'advance',
      verify: false,
    }),

    // ── Alex Rivera — within-subject ELA gap + Science struggle ──
    canvasSignal({
      signalId: 'alex-canvas-ela-101-001',
      learnerRef: 'stu-20891',
      persona: 'Alex Rivera',
      skill: 'ELA-101',
      scoreGiven: 82,
      daysAgo: clamp(80),
      expectDecision: 'reinforce',
    }),
    blackboardSignal({
      signalId: 'alex-bb-sci-hist-001',
      learnerRef: 'stu-20891',
      persona: 'Alex Rivera',
      skill: 'SCI-101',
      scoreGiven: 22,
      maxScore: 60,
      daysAgo: clamp(68),
      expectDecision: 'intervene',
      verify: false,
    }),
    canvasSignal({
      signalId: 'alex-canvas-ela-001',
      learnerRef: 'stu-20891',
      persona: 'Alex Rivera',
      skill: 'ELA-201',
      scoreGiven: 28,
      daysAgo: clamp(52),
      expectDecision: 'intervene',
      submissionType: 'online_upload',
      timeSinceLastActivity: 190_000,
    }),
    canvasSignal({
      signalId: 'alex-canvas-ela-101-hist-001',
      learnerRef: 'stu-20891',
      persona: 'Alex Rivera',
      skill: 'ELA-101',
      scoreGiven: 80,
      daysAgo: clamp(38),
      expectDecision: 'reinforce',
      verify: false,
    }),
    blackboardSignal({
      signalId: 'alex-bb-sci-001',
      learnerRef: 'stu-20891',
      persona: 'Alex Rivera',
      skill: 'SCI-101',
      scoreGiven: 15,
      maxScore: 60,
      daysAgo: clamp(28),
      expectDecision: 'intervene',
      timeSinceLastActivity: 180_000,
    }),
    canvasSignal({
      signalId: 'alex-canvas-ela-hist-002',
      learnerRef: 'stu-20891',
      persona: 'Alex Rivera',
      skill: 'ELA-201',
      scoreGiven: 30,
      daysAgo: clamp(16),
      expectDecision: 'intervene',
      verify: false,
      submissionType: 'online_upload',
    }),
    canvasSignal({
      signalId: 'alex-canvas-ela-101-recent',
      learnerRef: 'stu-20891',
      persona: 'Alex Rivera',
      skill: 'ELA-101',
      scoreGiven: 84,
      daysAgo: clamp(4),
      expectDecision: 'reinforce',
      verify: false,
    }),

    // ── Jordan Mitchell — Math recovery trajectory + History ──
    canvasSignal({
      signalId: 'jordan-canvas-math-001',
      learnerRef: 'stu-30456',
      persona: 'Jordan Mitchell',
      skill: 'MATH-301',
      scoreGiven: 45,
      daysAgo: clamp(82),
      expectDecision: 'reinforce',
      timeSinceLastActivity: 95_000,
    }),
    canvasSignal({
      signalId: 'jordan-canvas-math-002',
      learnerRef: 'stu-30456',
      persona: 'Jordan Mitchell',
      skill: 'MATH-301',
      scoreGiven: 68,
      daysAgo: clamp(64),
      expectDecision: 'reinforce',
      timeSinceLastActivity: 90_000,
    }),
    blackboardSignal({
      signalId: 'jordan-bb-hist-001',
      learnerRef: 'stu-30456',
      persona: 'Jordan Mitchell',
      skill: 'HIST-202',
      scoreGiven: 48,
      maxScore: 60,
      daysAgo: clamp(48),
      expectDecision: 'reinforce',
      timeSinceLastActivity: 40_000,
    }),
    canvasSignal({
      signalId: 'jordan-canvas-math-003',
      learnerRef: 'stu-30456',
      persona: 'Jordan Mitchell',
      skill: 'MATH-301',
      scoreGiven: 90,
      daysAgo: clamp(32),
      expectDecision: 'advance',
      timeSinceLastActivity: 30_000,
    }),
    canvasSignal({
      signalId: 'jordan-canvas-math-hist-004',
      learnerRef: 'stu-30456',
      persona: 'Jordan Mitchell',
      skill: 'MATH-301',
      scoreGiven: 88,
      daysAgo: clamp(18),
      expectDecision: 'advance',
      verify: false,
    }),
    canvasSignal({
      signalId: 'jordan-canvas-math-recent',
      learnerRef: 'stu-30456',
      persona: 'Jordan Mitchell',
      skill: 'MATH-301',
      scoreGiven: 91,
      daysAgo: clamp(6),
      expectDecision: 'advance',
      verify: false,
    }),

    // ── Sam Torres — declining ELA trajectory ──
    canvasSignal({
      signalId: 'sam-canvas-ela-001',
      learnerRef: 'stu-40123',
      persona: 'Sam Torres',
      skill: 'ELA-201',
      scoreGiven: 55,
      daysAgo: clamp(78),
      expectDecision: 'reinforce',
      submissionType: 'online_upload',
      timeSinceLastActivity: 90_000,
    }),
    canvasSignal({
      signalId: 'sam-canvas-ela-002',
      learnerRef: 'stu-40123',
      persona: 'Sam Torres',
      skill: 'ELA-201',
      scoreGiven: 48,
      daysAgo: clamp(56),
      expectDecision: 'reinforce',
      submissionType: 'online_upload',
      timeSinceLastActivity: 120_000,
    }),
    canvasSignal({
      signalId: 'sam-canvas-ela-003',
      learnerRef: 'stu-40123',
      persona: 'Sam Torres',
      skill: 'ELA-201',
      scoreGiven: 32,
      daysAgo: clamp(34),
      expectDecision: 'intervene',
      submissionType: 'online_upload',
      timeSinceLastActivity: 200_000,
    }),
    canvasSignal({
      signalId: 'sam-canvas-ela-hist-004',
      learnerRef: 'stu-40123',
      persona: 'Sam Torres',
      skill: 'ELA-201',
      scoreGiven: 38,
      daysAgo: clamp(20),
      expectDecision: 'reinforce',
      verify: false,
      submissionType: 'online_upload',
    }),
    canvasSignal({
      signalId: 'sam-canvas-ela-recent',
      learnerRef: 'stu-40123',
      persona: 'Sam Torres',
      skill: 'ELA-201',
      scoreGiven: 28,
      daysAgo: clamp(7),
      expectDecision: 'intervene',
      verify: false,
      submissionType: 'online_upload',
      timeSinceLastActivity: 210_000,
    }),

    // ── Priya Patel — gifted-interest (advance-only, spread across quarter) ──
    ...buildGiftedSignals('stu-50199', 'Priya Patel', [
      clamp(86),
      clamp(78),
      clamp(70),
      clamp(62),
      clamp(54),
      clamp(46),
      clamp(38),
      clamp(28),
      clamp(14),
    ]),

    // ── Ms. Davis — compliance decay arc ──
    absorbSignal({
      signalId: 'davis-absorb-hist-001',
      learnerRef: 'staff-0201',
      persona: 'Ms. Davis',
      skill: 'Annual Compliance 2026',
      daysAgo: clamp(76),
      progress: 0.75,
      daysOverdue: 0,
      expectDecision: 'reinforce',
      verify: false,
    }),
    absorbSignal({
      signalId: 'davis-absorb-001',
      learnerRef: 'staff-0201',
      persona: 'Ms. Davis',
      skill: 'Annual Compliance 2026',
      daysAgo: clamp(58),
      progress: 0.6,
      daysOverdue: 5,
      expectDecision: 'reinforce',
    }),
    absorbSignal({
      signalId: 'davis-absorb-hist-002',
      learnerRef: 'staff-0201',
      persona: 'Ms. Davis',
      skill: 'Annual Compliance 2026',
      daysAgo: clamp(42),
      progress: 0.5,
      daysOverdue: 10,
      expectDecision: 'reinforce',
      verify: false,
    }),
    absorbSignal({
      signalId: 'davis-absorb-002',
      learnerRef: 'staff-0201',
      persona: 'Ms. Davis',
      skill: 'Annual Compliance 2026',
      daysAgo: clamp(24),
      progress: 0.35,
      daysOverdue: 20,
      expectDecision: 'intervene',
    }),
    absorbSignal({
      signalId: 'davis-absorb-recent',
      learnerRef: 'staff-0201',
      persona: 'Ms. Davis',
      skill: 'Annual Compliance 2026',
      daysAgo: clamp(5),
      progress: 0.32,
      daysOverdue: 25,
      expectDecision: 'intervene',
      verify: false,
    }),
  ];

  // Ambient weekly activity — fills cumulative chart gaps across the span
  const ambientRotations = [
    { learnerRef: 'stu-10042', persona: 'Maya Kim', skill: 'MATH-301', scoreGiven: 89, expectDecision: 'advance' },
    { learnerRef: 'stu-20891', persona: 'Alex Rivera', skill: 'ELA-101', scoreGiven: 78, expectDecision: 'reinforce' },
    { learnerRef: 'stu-30456', persona: 'Jordan Mitchell', skill: 'MATH-301', scoreGiven: 72, expectDecision: 'reinforce' },
    { learnerRef: 'stu-40123', persona: 'Sam Torres', skill: 'ELA-201', scoreGiven: 42, expectDecision: 'reinforce' },
    { learnerRef: 'stu-50199', persona: 'Priya Patel', skill: 'MATH-301', scoreGiven: 97, expectDecision: 'advance' },
    { learnerRef: 'staff-0201', persona: 'Ms. Davis', skill: 'Annual Compliance 2026', type: 'absorb', progress: 0.55, expectDecision: 'reinforce' },
  ];

  for (let day = spanDays - 2; day >= 2; day -= 7) {
    const rot = ambientRotations[(Math.floor((spanDays - day) / 7)) % ambientRotations.length];
    const ambientId = `ambient-d${String(day).padStart(3, '0')}-${rot.learnerRef}`;

    if (rot.type === 'absorb') {
      signals.push(
        absorbSignal({
          signalId: ambientId,
          learnerRef: rot.learnerRef,
          persona: rot.persona,
          skill: rot.skill,
          daysAgo: day,
          progress: rot.progress,
          daysOverdue: Math.max(0, Math.floor((spanDays - day) / 14)),
          expectDecision: rot.expectDecision,
          verify: false,
        })
      );
    } else {
      signals.push(
        canvasSignal({
          signalId: ambientId,
          learnerRef: rot.learnerRef,
          persona: rot.persona,
          skill: rot.skill,
          scoreGiven: rot.scoreGiven,
          daysAgo: day,
          expectDecision: rot.expectDecision,
          verify: false,
        })
      );
    }
  }

  return signals.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    host: DEFAULT_HOST,
    apiKey: process.env.API_KEY,
    adminKey: process.env.ADMIN_API_KEY,
    org: DEFAULT_ORG,
    spanDays: DEFAULT_SPAN_DAYS,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host' && args[i + 1]) opts.host = args[++i];
    else if (args[i] === '--api-key' && args[i + 1]) opts.apiKey = args[++i];
    else if (args[i] === '--admin-key' && args[i + 1]) opts.adminKey = args[++i];
    else if (args[i] === '--org' && args[i + 1]) opts.org = args[++i];
    else if (args[i] === '--span-days' && args[i + 1]) opts.spanDays = Number.parseInt(args[++i], 10);
  }
  return opts;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function dateRangeLabel(signals) {
  if (signals.length === 0) return '—';
  const first = signals[0].timestamp.slice(0, 10);
  const last = signals[signals.length - 1].timestamp.slice(0, 10);
  return `${first} → ${last}`;
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

async function sendSignals(base, apiKey, org, signals) {
  console.log('Phase 2: Sending realistic LMS signals (chronological)...');

  const signalsUrl = `${base}/v1/signals`;
  const headers = { 'x-api-key': apiKey, 'content-type': 'application/json' };
  const results = [];

  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i];

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
      const dayTag = sig.timestamp.slice(0, 10);
      console.log(`  ${icon} ${sig.signalId}: ${dayTag} ${sig.sourceSystem} \u2192 ${outcome}${detail}`);
    } catch (err) {
      if (err.cause?.code === 'ECONNREFUSED') {
        console.error('\nConnection refused \u2014 is the server running at', base, '?');
        process.exit(1);
      }
      throw err;
    }

    if (i < signals.length - 1) await sleep(DELAY_MS);
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
  let skippedCount = 0;
  const decisionCounts = { advance: 0, intervene: 0, reinforce: 0, pause: 0 };
  const sourceCounts = {};

  const personaOrder = ['stu-10042', 'stu-20891', 'stu-30456', 'stu-40123', 'stu-50199', 'staff-0201'];

  for (const learnerRef of personaOrder) {
    const persona = PERSONAS[learnerRef];
    const signals = byPersona[learnerRef] ?? [];

    console.log(`${persona.name} (${learnerRef}) \u2014 ${persona.summary}`);

    for (const sig of signals) {
      sourceCounts[sig.sourceSystem] = (sourceCounts[sig.sourceSystem] ?? 0) + 1;

      if (sig.verify === false) {
        skippedCount++;
        continue;
      }

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
      const dayTag = sig.timestamp.slice(0, 10);
      console.log(`  ${icon} ${sig.signalId}: ${dayTag} ${sig.sourceSystem} \u2192 ${decisionDisplay} (${sig.skill})${annotation}`);

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

  const verified = matchCount + mismatchCount;
  const sourceEntries = Object.entries(sourceCounts).map(([k, v]) => `${k} (${v})`).join(', ');

  console.log('--- Summary ---');
  console.log(`  Signals: ${signalResults.length} sent | ${verified} verified | ${matchCount} matched | ${skippedCount} ambient/historical skipped`);
  console.log(`  Decisions (verified signals): advance ${decisionCounts.advance}, intervene ${decisionCounts.intervene}, reinforce ${decisionCounts.reinforce}`);
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
  const { host, apiKey, adminKey, org, spanDays } = parseArgs();

  if (!apiKey) {
    console.error('Error: API_KEY env var or --api-key required. Set API_KEY in .env.local or pass --api-key.');
    process.exit(1);
  }

  if (!Number.isFinite(spanDays) || spanDays < 14) {
    console.error('Error: --span-days must be a number >= 14');
    process.exit(1);
  }

  const signals = buildSignals(spanDays);
  const base = host.replace(/\/$/, '');

  console.log(`\nSprings Realistic Seed (v4) \u2014 ${base} (org: ${org})\n`);
  console.log('Personas: Maya Kim, Alex Rivera, Jordan Mitchell, Sam Torres, Priya Patel, Ms. Davis');
  console.log('Sources:  canvas-lms, blackboard-lms, iready-diagnostic, absorb-lms');
  console.log(`Timeline: ${spanDays} days (${dateRangeLabel(signals)})`);
  console.log(`Signals:  ${signals.length} (learning gaps, trajectories, gifted-interest, ambient weekly)\n`);

  await registerMappings(base, adminKey, org);

  const signalResults = await sendSignals(base, apiKey, org, signals);

  const allMatch = await verifyNarrative(base, apiKey, org, signalResults);

  process.exit(allMatch ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
