#!/usr/bin/env node
/**
 * Springs Charter Schools Demo Seed Script (v6)
 *
 * Full onboarding-to-intelligence pipeline demo:
 *   Phase 1 — Register field mappings for 4 LMS source systems via admin API
 *   Phase 2 — Send synthesized LMS-shaped signals (baseline or append)
 *   Phase 3 — Verify decisions and output narrative summary
 *
 * Modes:
 *   baseline (default) — full ~90-day arcs across 7 personas (wipe recommended)
 *   append             — near-now micro-batch continuing trends (add without wipe)
 *   refresh            — deprecated alias for append
 *
 * Usage:
 *   npm run seed:springs-demo
 *   npm run seed:springs-demo -- --mode append [--wave YYYYMMDD] [--as-of ISO] [--window-minutes 90]
 *   node examples/springs/seed-springs-demo.mjs [--host URL] [--api-key KEY] [--admin-key KEY] [--org ORG]
 */

import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  PERSONAS,
  PERSONA_ORDER,
  DEFAULT_SPAN_DAYS,
  DEFAULT_APPEND_WINDOW_MINUTES,
  waveStamp,
  buildSignalsForMode,
  normalizeSeedMode,
} from './seed-builders.mjs';

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

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    host: DEFAULT_HOST,
    apiKey: process.env.API_KEY,
    adminKey: process.env.ADMIN_API_KEY,
    org: DEFAULT_ORG,
    spanDays: DEFAULT_SPAN_DAYS,
    mode: 'baseline',
    wave: null,
    asOf: null,
    windowMinutes: DEFAULT_APPEND_WINDOW_MINUTES,
    /** @deprecated Ignored — append uses near-now event times. */
    days: null,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host' && args[i + 1]) opts.host = args[++i];
    else if (args[i] === '--api-key' && args[i + 1]) opts.apiKey = args[++i];
    else if (args[i] === '--admin-key' && args[i + 1]) opts.adminKey = args[++i];
    else if (args[i] === '--org' && args[i + 1]) opts.org = args[++i];
    else if (args[i] === '--span-days' && args[i + 1]) opts.spanDays = Number.parseInt(args[++i], 10);
    else if (args[i] === '--mode' && args[i + 1]) opts.mode = args[++i];
    else if (args[i] === '--wave' && args[i + 1]) opts.wave = args[++i];
    else if (args[i] === '--as-of' && args[i + 1]) opts.asOf = args[++i];
    else if (args[i] === '--window-minutes' && args[i + 1]) {
      opts.windowMinutes = Number.parseInt(args[++i], 10);
    } else if (args[i] === '--days' && args[i + 1]) {
      opts.days = Number.parseInt(args[++i], 10);
    }
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
          }`
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

async function getLatestDecisionForLearner(base, apiKey, org, learnerRef, skill = null) {
  let url = `${base}/v1/decisions?org_id=${encodeURIComponent(org)}&learner_reference=${encodeURIComponent(learnerRef)}&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`;
  if (skill) url += `&skill=${encodeURIComponent(skill)}`;
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
        const latest = await getLatestDecisionForLearner(base, apiKey, org, sig.learnerRef, sig.skill);
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

function personaContinuationLine(learnerRef, mode) {
  const persona = PERSONAS[learnerRef];
  if (!persona) return;
  if (mode === 'append') {
    console.log(`  \uD83D\uDD04 Continuation: ${persona.continuation}`);
  } else if (learnerRef === 'stu-10042') {
    console.log('  \uD83D\uDCCA Whole-child: Math advance; ELA reinforce; Reading intervene; Science intervene.');
    console.log('  \uD83D\uDCCA Four skills / three subjects — mastery_breakdown shows Math + English + Science.');
  } else if (learnerRef === 'stu-20891') {
    console.log('  \uD83D\uDCCA Multi-skill: Math advance + English gap (ELA-201 vs ELA-101) + Science intervene.');
  } else if (learnerRef === 'stu-30456') {
    console.log('  \uD83D\uDCCA Trajectory: intervention worked \u2014 MATH-301 masteryScore 0.45 \u2192 0.68 \u2192 0.90 over 3 signals.');
    console.log('  \uD83D\uDCCA Multi-subject: Math + History + Science \u2014 overall is equal-weight subject mean.');
  } else if (learnerRef === 'stu-40123') {
    console.log('  \uD83D\uDCCA Multi-skill decline: Math reinforce, Science intervene, ELA-201 55% \u2192 48% \u2192 32%.');
  } else if (learnerRef === 'stu-50199') {
    console.log('  \uD83D\uDCCA Gifted-interest: 4 skills (Math, Science, ELA, Reading) \u00d7 advance-only history.');
  } else if (learnerRef === 'stu-60001') {
    console.log('  \uD83D\uDCCA Sparse evidence: only Math reinforce so far — early profile, not a full multi-skill story.');
  } else if (learnerRef === 'staff-0201') {
    console.log('  \uD83D\uDCCA Staff alert: compliance dropped 0.60 \u2192 0.35, 20 days overdue. Panel 3 action pending.');
  }
}

async function verifyNarrative(base, apiKey, org, signalResults, mode) {
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

  for (const learnerRef of PERSONA_ORDER) {
    const persona = PERSONAS[learnerRef];
    const signals = byPersona[learnerRef] ?? [];
    if (signals.length === 0) continue;

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
      else if (sig.signalId === 'davis-absorb-002' || sig.signalId?.includes('davis-absorb-append')) {
        annotation = ' [declining]';
      }

      const decisionDisplay = sig.outcome === 'duplicate' ? 'duplicate' : displayDecision;
      const dayTag = sig.timestamp.slice(0, 10);
      console.log(`  ${icon} ${sig.signalId}: ${dayTag} ${sig.sourceSystem} \u2192 ${decisionDisplay} (${sig.skill})${annotation}`);

      if (!isMatch && sig.outcome !== 'duplicate') {
        console.log(`    \u26A0 Expected ${sig.expectDecision}, got ${displayDecision}`);
      }
    }

    personaContinuationLine(learnerRef, mode);
    console.log();
  }

  const verified = matchCount + mismatchCount;
  const sourceEntries = Object.entries(sourceCounts)
    .map(([k, v]) => `${k} (${v})`)
    .join(', ');

  console.log('--- Summary ---');
  console.log(
    `  Mode: ${mode} | Signals: ${signalResults.length} sent | ${verified} verified | ${matchCount} matched | ${skippedCount} ambient/historical skipped`
  );
  console.log(
    `  Decisions (verified signals): advance ${decisionCounts.advance}, intervene ${decisionCounts.intervene}, reinforce ${decisionCounts.reinforce}`
  );
  console.log(`  Sources: ${sourceEntries}`);
  console.log(`  Field mappings: ${Object.keys(FIELD_MAPPINGS).length} registered (Phase 1)`);
  console.log();

  if (mode === 'baseline') {
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
  }

  const mayaSummary = await getLearnerSummary(base, apiKey, org, 'stu-10042');
  if (mayaSummary?.current_state?.mastery_breakdown) {
    const mb = mayaSummary.current_state.mastery_breakdown;
    const skillIds = Object.keys(mb.skills ?? {});
    const subjects = Object.keys(mb.subjects ?? {});
    console.log('--- mastery_breakdown (Maya Kim — whole-child) ---');
    console.log(`  skills (${skillIds.length}): ${skillIds.join(', ')}`);
    console.log(`  subjects (${subjects.length}): ${subjects.join(', ')}`);
    console.log(`  overall.skill_count: ${mb.overall?.skill_count}`);
    console.log(`  overall.subject_count: ${mb.overall?.subject_count}`);
    if (skillIds.length >= 4 && subjects.length >= 3) {
      console.log('  \u2713 Math + Reading + Science + English skills across 3+ subjects');
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
  const parsed = parseArgs();
  const { host, apiKey, adminKey, org, spanDays, wave, asOf, windowMinutes, days } = parsed;
  const mode = normalizeSeedMode(parsed.mode);

  if (!apiKey) {
    console.error('Error: API_KEY env var or --api-key required. Set API_KEY in .env.local or pass --api-key.');
    process.exit(1);
  }

  if (mode !== 'baseline' && mode !== 'append') {
    console.error('Error: --mode must be "baseline" or "append" (alias: "refresh")');
    process.exit(1);
  }

  if (parsed.mode === 'refresh') {
    console.warn('Warning: --mode refresh is deprecated; use --mode append.');
  }

  if (mode === 'baseline' && (!Number.isFinite(spanDays) || spanDays < 14)) {
    console.error('Error: --span-days must be a number >= 14');
    process.exit(1);
  }

  if (
    mode === 'append' &&
    (!Number.isFinite(windowMinutes) || windowMinutes < 1 || windowMinutes > 24 * 60)
  ) {
    console.error('Error: --window-minutes must be a number between 1 and 1440 for append mode');
    process.exit(1);
  }

  let resolvedAsOf = new Date();
  if (asOf) {
    resolvedAsOf = new Date(asOf);
    if (Number.isNaN(resolvedAsOf.getTime())) {
      console.error('Error: --as-of must be a valid ISO-8601 timestamp (e.g. 2026-07-11T20:00:00Z)');
      process.exit(1);
    }
  }

  if (mode === 'append' && days != null) {
    console.warn(
      'Warning: --days is deprecated for append mode (near-now micro-batch). Use --window-minutes and --as-of instead.'
    );
  }

  const resolvedWave = wave ?? waveStamp(resolvedAsOf);
  const signals = buildSignalsForMode(mode, {
    spanDays,
    wave: resolvedWave,
    asOf: resolvedAsOf,
    windowMinutes,
  });
  const base = host.replace(/\/$/, '');

  console.log(`\nSprings Realistic Seed (v6) \u2014 ${base} (org: ${org}) [mode=${mode}]\n`);
  console.log(`Personas: ${PERSONA_ORDER.map((r) => PERSONAS[r].name).join(', ')}`);
  console.log('Sources:  canvas-lms, blackboard-lms, iready-diagnostic, absorb-lms');
  if (mode === 'append') {
    console.log(
      `Append:   wave=${resolvedWave}, window=${windowMinutes}m, asOf=${resolvedAsOf.toISOString()} (near-now micro-batch)`
    );
  } else {
    console.log(`Timeline: ${spanDays} days (${dateRangeLabel(signals)})`);
  }
  console.log(`Signals:  ${signals.length} (${dateRangeLabel(signals)})\n`);

  await registerMappings(base, adminKey, org);

  const signalResults = await sendSignals(base, apiKey, org, signals);

  const allMatch = await verifyNarrative(base, apiKey, org, signalResults, mode);

  process.exit(allMatch ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
