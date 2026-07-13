/**
 * Springs demo seed builders (v6)
 *
 * Pure signal builders for baseline (90-day arcs) and append (near-now micro-batch).
 * Imported by seed-springs-demo.mjs and unit tests — no network I/O here.
 */

export const MS_PER_DAY = 86_400_000;
export const MS_PER_MINUTE = 60_000;
export const DEFAULT_SPAN_DAYS = 90;
/** @deprecated Append is a near-now micro-batch; kept for callers that still pass `days`. */
export const DEFAULT_REFRESH_DAYS = 7;
/** Event-time stagger window for append micro-batches (simulates a recent LMS sync). */
export const DEFAULT_APPEND_WINDOW_MINUTES = 90;
/** @deprecated Use {@link DEFAULT_APPEND_WINDOW_MINUTES}. */
export const DEFAULT_REFRESH_WINDOW_MINUTES = DEFAULT_APPEND_WINDOW_MINUTES;

export const PERSONAS = {
  'stu-10042': {
    name: 'Maya Kim',
    scenarioId: 'whole-child',
    summary: 'Whole-child — Math advance, ELA reinforce, Reading intervene, Science intervene',
    continuation: 'Reading slowly improves; Science stays intervene; Math stays advance',
    skills: ['MATH-301', 'ELA-201', 'Reading', 'SCI-101'],
  },
  'stu-20891': {
    name: 'Alex Rivera',
    scenarioId: 'within-subject-gap',
    summary: 'Multi-skill — Math + English gap (ELA-101 vs ELA-201) + Science struggle',
    continuation: 'ELA-201 slight lift; Science flat intervene; Math stays advance',
    skills: ['MATH-301', 'ELA-101', 'ELA-201', 'SCI-101'],
  },
  'stu-30456': {
    name: 'Jordan Mitchell',
    scenarioId: 'recovery',
    summary: 'Math recovery trajectory + History + Science reinforce',
    continuation: 'Math stays advance; Science edges up (still reinforce)',
    skills: ['MATH-301', 'HIST-202', 'SCI-101'],
  },
  'stu-40123': {
    name: 'Sam Torres',
    scenarioId: 'decline',
    summary: 'Multi-skill decline — Math reinforce, Science intervene, ELA decaying → intervene',
    continuation: 'ELA keeps decaying; Math slips toward intervene; Science stays intervene',
    skills: ['MATH-301', 'SCI-101', 'ELA-201'],
  },
  'stu-50199': {
    name: 'Priya Patel',
    scenarioId: 'gifted',
    summary: 'Cross-skill excellence — Math, Science, ELA, Reading gifted-interest',
    continuation: 'Keep advance across four skills; maintain gifted-interest evidence',
    skills: ['MATH-301', 'SCI-101', 'ELA-101', 'Reading'],
  },
  'stu-60001': {
    name: 'Casey Nguyen',
    scenarioId: 'sparse-evidence',
    summary: 'Sparse evidence — early Math reinforce, not enough signal for a full profile',
    continuation: 'One more Math reinforce signal; still sparse overall',
    skills: ['MATH-301'],
  },
  'staff-0201': {
    name: 'Ms. Davis',
    scenarioId: 'staff-compliance',
    summary: 'Absorb Compliance',
    continuation: 'Stay overdue / intervene',
    skills: ['Annual Compliance 2026'],
  },
};

export const PERSONA_ORDER = [
  'stu-10042',
  'stu-20891',
  'stu-30456',
  'stu-40123',
  'stu-50199',
  'stu-60001',
  'staff-0201',
];

/** Springs learner policy — first match wins (mirrors springs/learner.json). */
export function expectDecisionFromScores({ masteryScore, stabilityScore, timeSinceReinforcement, riskSignal = 0 }) {
  if (stabilityScore < 0.3 && timeSinceReinforcement > 172800) return 'intervene';
  if (stabilityScore < 0.3 && timeSinceReinforcement <= 172800 && riskSignal > 0.75) return 'pause';
  if (stabilityScore >= 0.8 && masteryScore >= 0.8) return 'advance';
  if (stabilityScore < 0.65 && timeSinceReinforcement > 86400) return 'reinforce';
  if (stabilityScore >= 0) return 'reinforce';
  return 'reinforce';
}

export function expectDecisionFromCanvas(scoreGiven, timeSinceLastActivity = 50_000) {
  const masteryScore = scoreGiven / 100;
  const stabilityScore = Math.min(masteryScore * 0.9, 1);
  return expectDecisionFromScores({
    masteryScore,
    stabilityScore,
    timeSinceReinforcement: timeSinceLastActivity,
  });
}

export function expectDecisionFromBlackboard(scoreGiven, maxScore, timeSinceLastActivity = 60_000) {
  const masteryScore = scoreGiven / maxScore;
  const stabilityScore = masteryScore * 0.85;
  return expectDecisionFromScores({
    masteryScore,
    stabilityScore,
    timeSinceReinforcement: timeSinceLastActivity,
  });
}

export function expectDecisionFromIready(overallScaleScore, maxScaleScore, percentile, diagnosticGain = 0) {
  const masteryScore = overallScaleScore / maxScaleScore;
  const stabilityScore = percentile / 100;
  const riskSignal = Math.max(1 - (diagnosticGain + 50) / 100, 0);
  return expectDecisionFromScores({
    masteryScore,
    stabilityScore,
    timeSinceReinforcement: 200_000,
    riskSignal,
  });
}

export function waveStamp(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function clampDay(daysAgo, spanDays) {
  return Math.min(Math.max(daysAgo, 1), spanDays - 1);
}

/** RFC3339 UTC (timezone required) — strips millis for stable seed IDs / comparisons. */
export function toRfc3339(date) {
  return new Date(date).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** ISO timestamp for N calendar days before today (local midnight anchor + hour offset). */
export function atDaysAgo(daysAgoFromToday, hour = 10, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setTime(d.getTime() - daysAgoFromToday * MS_PER_DAY);
  return toRfc3339(d);
}

/**
 * Event time for incremental micro-batch append: minutes before `asOf` (default now).
 * Use for live ingestion-cycle simulation — not multi-day storyboard backfill.
 */
export function atMinutesAgo(minutesAgo = 0, asOf = new Date()) {
  const anchor = asOf instanceof Date ? asOf : new Date(asOf);
  return toRfc3339(new Date(anchor.getTime() - minutesAgo * MS_PER_MINUTE));
}

/**
 * Evenly space `count` event times across `[asOf - windowMinutes, asOf]`.
 * Index 0 is oldest; last index is exactly `asOf` (newest).
 */
export function appendBatchTimestamps(count, { asOf = new Date(), windowMinutes = DEFAULT_APPEND_WINDOW_MINUTES } = {}) {
  const anchor = asOf instanceof Date ? asOf : new Date(asOf);
  if (count <= 0) return [];
  if (count === 1) return [toRfc3339(anchor)];
  const out = [];
  for (let i = 0; i < count; i++) {
    const minutesAgo = Math.round((windowMinutes * (count - 1 - i)) / (count - 1));
    out.push(atMinutesAgo(minutesAgo, anchor));
  }
  return out;
}

/** @deprecated Use {@link appendBatchTimestamps}. */
export const refreshBatchTimestamps = appendBatchTimestamps;

export function canvasSignal({
  signalId,
  learnerRef,
  persona,
  skill,
  courseNumber,
  scoreGiven,
  daysAgo = 0,
  timestamp,
  expectDecision,
  verify = true,
  submissionType = 'online_quiz',
  timeSinceLastActivity = 50_000,
}) {
  const masteryScore = scoreGiven / 100;
  const stabilityScore = Math.min(masteryScore * 0.9, 1);
  const decision =
    expectDecision ?? expectDecisionFromScores({ masteryScore, stabilityScore, timeSinceReinforcement: timeSinceLastActivity });
  return {
    signalId,
    sourceSystem: 'canvas-lms',
    learnerRef,
    timestamp: timestamp ?? atDaysAgo(daysAgo, 10 + (daysAgo % 5)),
    persona,
    skill,
    expectDecision: decision,
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

export function blackboardSignal({
  signalId,
  learnerRef,
  persona,
  skill,
  courseNumber,
  scoreGiven,
  maxScore,
  daysAgo = 0,
  timestamp,
  expectDecision,
  verify = true,
  timeSinceLastActivity = 60_000,
}) {
  const masteryScore = scoreGiven / maxScore;
  const stabilityScore = masteryScore * 0.85;
  const decision =
    expectDecision ??
    expectDecisionFromScores({ masteryScore, stabilityScore, timeSinceReinforcement: timeSinceLastActivity });
  return {
    signalId,
    sourceSystem: 'blackboard-lms',
    learnerRef,
    timestamp: timestamp ?? atDaysAgo(daysAgo, 11 + (daysAgo % 4)),
    persona,
    skill,
    expectDecision: decision,
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

export function ireadySignal({
  signalId,
  learnerRef,
  persona,
  skill,
  daysAgo = 0,
  timestamp,
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
  const decision =
    expectDecision ??
    expectDecisionFromScores({
      masteryScore,
      stabilityScore,
      timeSinceReinforcement: 200_000,
      riskSignal,
    });
  return {
    signalId,
    sourceSystem: 'iready-diagnostic',
    learnerRef,
    timestamp: timestamp ?? atDaysAgo(daysAgo, 9),
    persona,
    skill,
    expectDecision: decision,
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

export function absorbSignal({
  signalId,
  learnerRef,
  persona,
  skill,
  daysAgo = 0,
  timestamp,
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
    timestamp: timestamp ?? atDaysAgo(daysAgo, 14),
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

/** Deterministic clamp helper for continuing trends. */
export function stepScore(current, delta, min, max) {
  return Math.min(max, Math.max(min, current + delta));
}

function buildGiftedBaseline(learnerRef, personaName, dayOffsets) {
  const canvasTracks = [
    { skill: 'MATH-301', courseNumber: 'MATH-301', scores: [96, 97, 98] },
    { skill: 'SCI-101', courseNumber: 'SCI-101', scores: [95, 96, 97] },
    { skill: 'ELA-101', courseNumber: 'ELA-101', scores: [97, 98, 99] },
  ];
  const signals = [];
  let dayIdx = 0;

  for (const track of canvasTracks) {
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

  const readingOffsets = [dayOffsets[dayIdx] ?? 20, dayOffsets[dayIdx + 1] ?? 12, dayOffsets[dayIdx + 2] ?? 5];
  const readingScores = [
    { overallScaleScore: 760, percentile: 92, diagnosticGain: 40 },
    { overallScaleScore: 770, percentile: 94, diagnosticGain: 42 },
    { overallScaleScore: 780, percentile: 96, diagnosticGain: 45 },
  ];
  readingScores.forEach((row, idx) => {
    signals.push(
      ireadySignal({
        signalId: `priya-reading-00${idx + 1}`,
        learnerRef,
        persona: personaName,
        skill: 'Reading',
        daysAgo: readingOffsets[idx] ?? 5,
        overallScaleScore: row.overallScaleScore,
        maxScaleScore: 800,
        percentile: row.percentile,
        diagnosticGain: row.diagnosticGain,
        expectDecision: 'advance',
      })
    );
  });

  return signals;
}

export function buildMayaBaseline(spanDays) {
  const c = (d) => clampDay(d, spanDays);
  return [
    canvasSignal({
      signalId: 'maya-canvas-math-001',
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'MATH-301',
      scoreGiven: 92,
      daysAgo: c(84),
      expectDecision: 'advance',
    }),
    canvasSignal({
      signalId: 'maya-canvas-math-hist-001',
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'MATH-301',
      scoreGiven: 94,
      daysAgo: c(62),
      expectDecision: 'advance',
      verify: false,
    }),
    canvasSignal({
      signalId: 'maya-canvas-ela-001',
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'ELA-201',
      scoreGiven: 88,
      daysAgo: c(58),
      expectDecision: 'reinforce',
      submissionType: 'online_upload',
      timeSinceLastActivity: 45_000,
    }),
    blackboardSignal({
      signalId: 'maya-bb-sci-001',
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'SCI-101',
      scoreGiven: 14,
      maxScore: 60,
      daysAgo: c(50),
      expectDecision: 'intervene',
      timeSinceLastActivity: 190_000,
    }),
    canvasSignal({
      signalId: 'maya-canvas-math-hist-002',
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'MATH-301',
      scoreGiven: 91,
      daysAgo: c(40),
      expectDecision: 'advance',
      verify: false,
    }),
    ireadySignal({
      signalId: 'maya-iready-read-001',
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'Reading',
      daysAgo: c(35),
      overallScaleScore: 380,
      maxScaleScore: 800,
      percentile: 22,
      diagnosticGain: -15,
      expectDecision: 'intervene',
    }),
    blackboardSignal({
      signalId: 'maya-bb-sci-hist-001',
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'SCI-101',
      scoreGiven: 18,
      maxScore: 60,
      daysAgo: c(28),
      expectDecision: 'intervene',
      verify: false,
      timeSinceLastActivity: 185_000,
    }),
    canvasSignal({
      signalId: 'maya-canvas-ela-hist-001',
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'ELA-201',
      scoreGiven: 86,
      daysAgo: c(22),
      expectDecision: 'reinforce',
      verify: false,
      submissionType: 'online_upload',
    }),
    ireadySignal({
      signalId: 'maya-iready-read-002',
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'Reading',
      daysAgo: c(12),
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
      daysAgo: c(3),
      expectDecision: 'advance',
      verify: false,
    }),
  ];
}

export function buildAlexBaseline(spanDays) {
  const c = (d) => clampDay(d, spanDays);
  return [
    canvasSignal({
      signalId: 'alex-canvas-math-001',
      learnerRef: 'stu-20891',
      persona: 'Alex Rivera',
      skill: 'MATH-301',
      scoreGiven: 90,
      daysAgo: c(85),
      expectDecision: 'advance',
    }),
    canvasSignal({
      signalId: 'alex-canvas-ela-101-001',
      learnerRef: 'stu-20891',
      persona: 'Alex Rivera',
      skill: 'ELA-101',
      scoreGiven: 82,
      daysAgo: c(80),
      expectDecision: 'reinforce',
    }),
    blackboardSignal({
      signalId: 'alex-bb-sci-hist-001',
      learnerRef: 'stu-20891',
      persona: 'Alex Rivera',
      skill: 'SCI-101',
      scoreGiven: 22,
      maxScore: 60,
      daysAgo: c(68),
      expectDecision: 'intervene',
      verify: false,
    }),
    canvasSignal({
      signalId: 'alex-canvas-ela-001',
      learnerRef: 'stu-20891',
      persona: 'Alex Rivera',
      skill: 'ELA-201',
      scoreGiven: 28,
      daysAgo: c(52),
      expectDecision: 'intervene',
      submissionType: 'online_upload',
      timeSinceLastActivity: 190_000,
    }),
    canvasSignal({
      signalId: 'alex-canvas-math-hist-001',
      learnerRef: 'stu-20891',
      persona: 'Alex Rivera',
      skill: 'MATH-301',
      scoreGiven: 88,
      daysAgo: c(44),
      expectDecision: 'advance',
      verify: false,
    }),
    canvasSignal({
      signalId: 'alex-canvas-ela-101-hist-001',
      learnerRef: 'stu-20891',
      persona: 'Alex Rivera',
      skill: 'ELA-101',
      scoreGiven: 80,
      daysAgo: c(38),
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
      daysAgo: c(28),
      expectDecision: 'intervene',
      timeSinceLastActivity: 180_000,
    }),
    canvasSignal({
      signalId: 'alex-canvas-ela-hist-002',
      learnerRef: 'stu-20891',
      persona: 'Alex Rivera',
      skill: 'ELA-201',
      scoreGiven: 30,
      daysAgo: c(16),
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
      daysAgo: c(4),
      expectDecision: 'reinforce',
      verify: false,
    }),
  ];
}

export function buildJordanBaseline(spanDays) {
  const c = (d) => clampDay(d, spanDays);
  return [
    canvasSignal({
      signalId: 'jordan-canvas-math-001',
      learnerRef: 'stu-30456',
      persona: 'Jordan Mitchell',
      skill: 'MATH-301',
      scoreGiven: 45,
      daysAgo: c(82),
      expectDecision: 'reinforce',
      timeSinceLastActivity: 95_000,
    }),
    canvasSignal({
      signalId: 'jordan-canvas-math-002',
      learnerRef: 'stu-30456',
      persona: 'Jordan Mitchell',
      skill: 'MATH-301',
      scoreGiven: 68,
      daysAgo: c(64),
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
      daysAgo: c(48),
      expectDecision: 'reinforce',
      timeSinceLastActivity: 40_000,
    }),
    blackboardSignal({
      signalId: 'jordan-bb-sci-001',
      learnerRef: 'stu-30456',
      persona: 'Jordan Mitchell',
      skill: 'SCI-101',
      scoreGiven: 36,
      maxScore: 60,
      daysAgo: c(40),
      expectDecision: 'reinforce',
      timeSinceLastActivity: 100_000,
    }),
    canvasSignal({
      signalId: 'jordan-canvas-math-003',
      learnerRef: 'stu-30456',
      persona: 'Jordan Mitchell',
      skill: 'MATH-301',
      scoreGiven: 90,
      daysAgo: c(32),
      expectDecision: 'advance',
      timeSinceLastActivity: 30_000,
    }),
    canvasSignal({
      signalId: 'jordan-canvas-math-hist-004',
      learnerRef: 'stu-30456',
      persona: 'Jordan Mitchell',
      skill: 'MATH-301',
      scoreGiven: 88,
      daysAgo: c(18),
      expectDecision: 'advance',
      verify: false,
    }),
    blackboardSignal({
      signalId: 'jordan-bb-sci-hist-001',
      learnerRef: 'stu-30456',
      persona: 'Jordan Mitchell',
      skill: 'SCI-101',
      scoreGiven: 40,
      maxScore: 60,
      daysAgo: c(12),
      expectDecision: 'reinforce',
      verify: false,
      timeSinceLastActivity: 95_000,
    }),
    canvasSignal({
      signalId: 'jordan-canvas-math-recent',
      learnerRef: 'stu-30456',
      persona: 'Jordan Mitchell',
      skill: 'MATH-301',
      scoreGiven: 91,
      daysAgo: c(6),
      expectDecision: 'advance',
      verify: false,
    }),
  ];
}

export function buildSamBaseline(spanDays) {
  const c = (d) => clampDay(d, spanDays);
  return [
    canvasSignal({
      signalId: 'sam-canvas-math-001',
      learnerRef: 'stu-40123',
      persona: 'Sam Torres',
      skill: 'MATH-301',
      scoreGiven: 62,
      daysAgo: c(84),
      expectDecision: 'reinforce',
      timeSinceLastActivity: 100_000,
    }),
    canvasSignal({
      signalId: 'sam-canvas-ela-001',
      learnerRef: 'stu-40123',
      persona: 'Sam Torres',
      skill: 'ELA-201',
      scoreGiven: 55,
      daysAgo: c(78),
      expectDecision: 'reinforce',
      submissionType: 'online_upload',
      timeSinceLastActivity: 90_000,
    }),
    blackboardSignal({
      signalId: 'sam-bb-sci-001',
      learnerRef: 'stu-40123',
      persona: 'Sam Torres',
      skill: 'SCI-101',
      scoreGiven: 16,
      maxScore: 60,
      daysAgo: c(66),
      expectDecision: 'intervene',
      timeSinceLastActivity: 185_000,
    }),
    canvasSignal({
      signalId: 'sam-canvas-ela-002',
      learnerRef: 'stu-40123',
      persona: 'Sam Torres',
      skill: 'ELA-201',
      scoreGiven: 48,
      daysAgo: c(56),
      expectDecision: 'reinforce',
      submissionType: 'online_upload',
      timeSinceLastActivity: 120_000,
    }),
    canvasSignal({
      signalId: 'sam-canvas-math-hist-001',
      learnerRef: 'stu-40123',
      persona: 'Sam Torres',
      skill: 'MATH-301',
      scoreGiven: 58,
      daysAgo: c(45),
      expectDecision: 'reinforce',
      verify: false,
      timeSinceLastActivity: 110_000,
    }),
    canvasSignal({
      signalId: 'sam-canvas-ela-003',
      learnerRef: 'stu-40123',
      persona: 'Sam Torres',
      skill: 'ELA-201',
      scoreGiven: 32,
      daysAgo: c(34),
      expectDecision: 'intervene',
      submissionType: 'online_upload',
      timeSinceLastActivity: 200_000,
    }),
    blackboardSignal({
      signalId: 'sam-bb-sci-hist-001',
      learnerRef: 'stu-40123',
      persona: 'Sam Torres',
      skill: 'SCI-101',
      scoreGiven: 12,
      maxScore: 60,
      daysAgo: c(24),
      expectDecision: 'intervene',
      verify: false,
      timeSinceLastActivity: 190_000,
    }),
    canvasSignal({
      signalId: 'sam-canvas-ela-hist-004',
      learnerRef: 'stu-40123',
      persona: 'Sam Torres',
      skill: 'ELA-201',
      scoreGiven: 38,
      daysAgo: c(20),
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
      daysAgo: c(7),
      expectDecision: 'intervene',
      verify: false,
      submissionType: 'online_upload',
      timeSinceLastActivity: 210_000,
    }),
  ];
}

export function buildPriyaBaseline(spanDays) {
  const c = (d) => clampDay(d, spanDays);
  return buildGiftedBaseline('stu-50199', 'Priya Patel', [
    c(86),
    c(78),
    c(70),
    c(62),
    c(54),
    c(46),
    c(38),
    c(28),
    c(20),
    c(14),
    c(9),
    c(4),
  ]);
}

export function buildCaseyBaseline(spanDays) {
  const c = (d) => clampDay(d, spanDays);
  // Sparse: two Math signals only — early reinforce, insufficient for a rich profile
  return [
    canvasSignal({
      signalId: 'casey-canvas-math-001',
      learnerRef: 'stu-60001',
      persona: 'Casey Nguyen',
      skill: 'MATH-301',
      scoreGiven: 58,
      daysAgo: c(10),
      expectDecision: 'reinforce',
      timeSinceLastActivity: 95_000,
    }),
    canvasSignal({
      signalId: 'casey-canvas-math-002',
      learnerRef: 'stu-60001',
      persona: 'Casey Nguyen',
      skill: 'MATH-301',
      scoreGiven: 61,
      daysAgo: c(3),
      expectDecision: 'reinforce',
      timeSinceLastActivity: 90_000,
    }),
  ];
}

export function buildDavisBaseline(spanDays) {
  const c = (d) => clampDay(d, spanDays);
  return [
    absorbSignal({
      signalId: 'davis-absorb-hist-001',
      learnerRef: 'staff-0201',
      persona: 'Ms. Davis',
      skill: 'Annual Compliance 2026',
      daysAgo: c(76),
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
      daysAgo: c(58),
      progress: 0.6,
      daysOverdue: 5,
      expectDecision: 'reinforce',
    }),
    absorbSignal({
      signalId: 'davis-absorb-hist-002',
      learnerRef: 'staff-0201',
      persona: 'Ms. Davis',
      skill: 'Annual Compliance 2026',
      daysAgo: c(42),
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
      daysAgo: c(24),
      progress: 0.35,
      daysOverdue: 20,
      expectDecision: 'intervene',
    }),
    absorbSignal({
      signalId: 'davis-absorb-recent',
      learnerRef: 'staff-0201',
      persona: 'Ms. Davis',
      skill: 'Annual Compliance 2026',
      daysAgo: c(5),
      progress: 0.32,
      daysOverdue: 25,
      expectDecision: 'intervene',
      verify: false,
    }),
  ];
}

function buildAmbient(spanDays) {
  const signals = [];
  const ambientRotations = [
    { learnerRef: 'stu-10042', persona: 'Maya Kim', skill: 'MATH-301', scoreGiven: 89, expectDecision: 'advance' },
    {
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'ELA-201',
      scoreGiven: 84,
      expectDecision: 'reinforce',
      submissionType: 'online_upload',
    },
    { learnerRef: 'stu-20891', persona: 'Alex Rivera', skill: 'MATH-301', scoreGiven: 87, expectDecision: 'advance' },
    { learnerRef: 'stu-20891', persona: 'Alex Rivera', skill: 'ELA-101', scoreGiven: 78, expectDecision: 'reinforce' },
    { learnerRef: 'stu-30456', persona: 'Jordan Mitchell', skill: 'MATH-301', scoreGiven: 72, expectDecision: 'reinforce' },
    { learnerRef: 'stu-30456', persona: 'Jordan Mitchell', skill: 'SCI-101', scoreGiven: 65, expectDecision: 'reinforce' },
    {
      learnerRef: 'stu-40123',
      persona: 'Sam Torres',
      skill: 'ELA-201',
      scoreGiven: 42,
      expectDecision: 'reinforce',
      submissionType: 'online_upload',
    },
    { learnerRef: 'stu-40123', persona: 'Sam Torres', skill: 'MATH-301', scoreGiven: 55, expectDecision: 'reinforce' },
    { learnerRef: 'stu-50199', persona: 'Priya Patel', skill: 'MATH-301', scoreGiven: 97, expectDecision: 'advance' },
    { learnerRef: 'stu-50199', persona: 'Priya Patel', skill: 'SCI-101', scoreGiven: 96, expectDecision: 'advance' },
    {
      learnerRef: 'staff-0201',
      persona: 'Ms. Davis',
      skill: 'Annual Compliance 2026',
      type: 'absorb',
      progress: 0.55,
      expectDecision: 'reinforce',
    },
  ];

  for (let day = spanDays - 2; day >= 2; day -= 7) {
    const rot = ambientRotations[Math.floor((spanDays - day) / 7) % ambientRotations.length];
    const ambientId = `ambient-d${String(day).padStart(3, '0')}-${rot.learnerRef}-${rot.skill.replace(/\s+/g, '-').toLowerCase()}`;

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
          submissionType: rot.submissionType,
        })
      );
    }
  }
  return signals;
}

/** Full 90-day baseline (chronological). */
export function buildBaselineSignals(spanDays = DEFAULT_SPAN_DAYS) {
  const signals = [
    ...buildMayaBaseline(spanDays),
    ...buildAlexBaseline(spanDays),
    ...buildJordanBaseline(spanDays),
    ...buildSamBaseline(spanDays),
    ...buildPriyaBaseline(spanDays),
    ...buildCaseyBaseline(spanDays),
    ...buildDavisBaseline(spanDays),
    ...buildAmbient(spanDays),
  ];
  return signals.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// ─── Append / continuing trends ──────────────────────────────────────────────

/**
 * Append wave: incremental micro-batch that continues each persona's arc.
 * Event times fall in `[asOf - windowMinutes, asOf]` (default last 90 minutes)
 * so a live demo looks like a real LMS sync just landed — not a multi-day backfill.
 * `wave` keys `signal_id` for idempotent retries; same wave → duplicates.
 *
 * @param {{ wave?: string, asOf?: Date|string, windowMinutes?: number, days?: number }} opts
 * `days` is ignored (deprecated); kept so older CLI flags do not crash.
 */
export function buildAppendSignals({
  wave = waveStamp(),
  asOf = new Date(),
  windowMinutes = DEFAULT_APPEND_WINDOW_MINUTES,
  days: _deprecatedDays,
} = {}) {
  const signals = [];

  // Maya — Math stable advance; Reading improves slightly; Science stays intervene; ELA reinforce
  const mayaMath = 94;
  const mayaEla = 85;
  const mayaReadScale = stepScore(360, 25, 300, 450); // slow improvement, still intervene band
  const mayaReadPct = stepScore(18, 4, 10, 28);
  const mayaSci = 15;
  signals.push(
    canvasSignal({
      signalId: `maya-canvas-math-append-${wave}-01`,
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'MATH-301',
      scoreGiven: mayaMath,
      expectDecision: expectDecisionFromCanvas(mayaMath),
    }),
    canvasSignal({
      signalId: `maya-canvas-ela-append-${wave}-01`,
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'ELA-201',
      scoreGiven: mayaEla,
      expectDecision: expectDecisionFromCanvas(mayaEla, 95_000),
      submissionType: 'online_upload',
      timeSinceLastActivity: 95_000,
    }),
    ireadySignal({
      signalId: `maya-iready-read-append-${wave}-01`,
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'Reading',
      overallScaleScore: mayaReadScale,
      maxScaleScore: 800,
      percentile: mayaReadPct,
      diagnosticGain: -10,
      expectDecision: expectDecisionFromIready(mayaReadScale, 800, mayaReadPct, -10),
    }),
    blackboardSignal({
      signalId: `maya-bb-sci-append-${wave}-01`,
      learnerRef: 'stu-10042',
      persona: 'Maya Kim',
      skill: 'SCI-101',
      scoreGiven: mayaSci,
      maxScore: 60,
      expectDecision: expectDecisionFromBlackboard(mayaSci, 60, 190_000),
      timeSinceLastActivity: 190_000,
    })
  );

  // Alex — Math advance; ELA-201 slight lift (still intervene); Science flat
  const alexEla201 = stepScore(30, 6, 20, 45); // slight lift, still intervene with long timeSince
  const alexSci = 14;
  signals.push(
    canvasSignal({
      signalId: `alex-canvas-math-append-${wave}-01`,
      learnerRef: 'stu-20891',
      persona: 'Alex Rivera',
      skill: 'MATH-301',
      scoreGiven: 91,
      expectDecision: expectDecisionFromCanvas(91),
    }),
    canvasSignal({
      signalId: `alex-canvas-ela201-append-${wave}-01`,
      learnerRef: 'stu-20891',
      persona: 'Alex Rivera',
      skill: 'ELA-201',
      scoreGiven: alexEla201,
      expectDecision: expectDecisionFromCanvas(alexEla201, 190_000),
      submissionType: 'online_upload',
      timeSinceLastActivity: 190_000,
    }),
    blackboardSignal({
      signalId: `alex-bb-sci-append-${wave}-01`,
      learnerRef: 'stu-20891',
      persona: 'Alex Rivera',
      skill: 'SCI-101',
      scoreGiven: alexSci,
      maxScore: 60,
      expectDecision: expectDecisionFromBlackboard(alexSci, 60, 180_000),
      timeSinceLastActivity: 180_000,
    })
  );

  // Jordan — Math stays advance; Science edges up (still reinforce)
  const jordanSci = stepScore(40, 6, 36, 52);
  signals.push(
    canvasSignal({
      signalId: `jordan-canvas-math-append-${wave}-01`,
      learnerRef: 'stu-30456',
      persona: 'Jordan Mitchell',
      skill: 'MATH-301',
      scoreGiven: 92,
      expectDecision: expectDecisionFromCanvas(92, 30_000),
      timeSinceLastActivity: 30_000,
    }),
    blackboardSignal({
      signalId: `jordan-bb-sci-append-${wave}-01`,
      learnerRef: 'stu-30456',
      persona: 'Jordan Mitchell',
      skill: 'SCI-101',
      scoreGiven: jordanSci,
      maxScore: 60,
      expectDecision: expectDecisionFromBlackboard(jordanSci, 60, 95_000),
      timeSinceLastActivity: 95_000,
    })
  );

  // Sam — ELA keeps decaying; Math slips toward intervene; Science stays intervene
  const samEla = stepScore(28, -4, 18, 40);
  const samMath = stepScore(55, -8, 28, 62);
  const samMathTime = samMath < 35 ? 200_000 : 110_000;
  signals.push(
    canvasSignal({
      signalId: `sam-canvas-ela-append-${wave}-01`,
      learnerRef: 'stu-40123',
      persona: 'Sam Torres',
      skill: 'ELA-201',
      scoreGiven: samEla,
      expectDecision: expectDecisionFromCanvas(samEla, 210_000),
      submissionType: 'online_upload',
      timeSinceLastActivity: 210_000,
    }),
    canvasSignal({
      signalId: `sam-canvas-math-append-${wave}-01`,
      learnerRef: 'stu-40123',
      persona: 'Sam Torres',
      skill: 'MATH-301',
      scoreGiven: samMath,
      expectDecision: expectDecisionFromCanvas(samMath, samMathTime),
      timeSinceLastActivity: samMathTime,
    }),
    blackboardSignal({
      signalId: `sam-bb-sci-append-${wave}-01`,
      learnerRef: 'stu-40123',
      persona: 'Sam Torres',
      skill: 'SCI-101',
      scoreGiven: 11,
      maxScore: 60,
      expectDecision: expectDecisionFromBlackboard(11, 60, 190_000),
      timeSinceLastActivity: 190_000,
    })
  );

  // Priya — keep advance across skills
  signals.push(
    canvasSignal({
      signalId: `priya-canvas-math-append-${wave}-01`,
      learnerRef: 'stu-50199',
      persona: 'Priya Patel',
      skill: 'MATH-301',
      scoreGiven: 98,
      expectDecision: 'advance',
    }),
    canvasSignal({
      signalId: `priya-canvas-sci-append-${wave}-01`,
      learnerRef: 'stu-50199',
      persona: 'Priya Patel',
      skill: 'SCI-101',
      scoreGiven: 97,
      expectDecision: 'advance',
    }),
    ireadySignal({
      signalId: `priya-iready-read-append-${wave}-01`,
      learnerRef: 'stu-50199',
      persona: 'Priya Patel',
      skill: 'Reading',
      overallScaleScore: 785,
      maxScaleScore: 800,
      percentile: 97,
      diagnosticGain: 46,
      expectDecision: 'advance',
    })
  );

  // Casey — one more sparse Math reinforce
  signals.push(
    canvasSignal({
      signalId: `casey-canvas-math-append-${wave}-01`,
      learnerRef: 'stu-60001',
      persona: 'Casey Nguyen',
      skill: 'MATH-301',
      scoreGiven: 63,
      expectDecision: expectDecisionFromCanvas(63, 90_000),
      timeSinceLastActivity: 90_000,
    })
  );

  // Ms. Davis — stay overdue / intervene
  signals.push(
    absorbSignal({
      signalId: `davis-absorb-append-${wave}-01`,
      learnerRef: 'staff-0201',
      persona: 'Ms. Davis',
      skill: 'Annual Compliance 2026',
      progress: 0.3,
      daysOverdue: 28,
      expectDecision: 'intervene',
    })
  );

  const stamps = appendBatchTimestamps(signals.length, { asOf, windowMinutes });
  for (let i = 0; i < signals.length; i++) {
    signals[i] = { ...signals[i], timestamp: stamps[i] };
  }

  return signals.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** @deprecated Use {@link buildAppendSignals}. */
export const buildRefreshSignals = buildAppendSignals;

/** Normalize CLI mode: `append` is canonical; `refresh` is a deprecated alias. */
export function normalizeSeedMode(mode) {
  if (mode === 'refresh') return 'append';
  return mode;
}

export function buildSignalsForMode(
  mode,
  {
    spanDays = DEFAULT_SPAN_DAYS,
    wave,
    asOf,
    windowMinutes = DEFAULT_APPEND_WINDOW_MINUTES,
    days: _deprecatedDays,
  } = {}
) {
  const resolved = normalizeSeedMode(mode);
  if (resolved === 'append') {
    const anchor = asOf ? (asOf instanceof Date ? asOf : new Date(asOf)) : new Date();
    return buildAppendSignals({
      wave: wave ?? waveStamp(anchor),
      asOf: anchor,
      windowMinutes,
    });
  }
  return buildBaselineSignals(spanDays);
}
