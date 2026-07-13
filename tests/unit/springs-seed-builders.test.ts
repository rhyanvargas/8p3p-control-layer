/**
 * Unit tests for Springs seed builders (baseline + append continuing trends).
 */
import { describe, it, expect } from 'vitest';
import {
  waveStamp,
  atMinutesAgo,
  buildAppendSignals,
  buildRefreshSignals,
  buildMayaBaseline,
  buildCaseyBaseline,
  buildBaselineSignals,
  buildSignalsForMode,
  normalizeSeedMode,
  expectDecisionFromScores,
  PERSONAS,
  DEFAULT_APPEND_WINDOW_MINUTES,
} from '../../examples/springs/seed-builders.mjs';

describe('springs seed builders', () => {
  it('waveStamp formats UTC YYYYMMDD', () => {
    expect(waveStamp(new Date(Date.UTC(2026, 6, 11)))).toBe('20260711');
  });

  it('atMinutesAgo stamps relative to asOf (RFC3339 with timezone)', () => {
    const asOf = new Date('2026-07-11T20:00:00.000Z');
    expect(atMinutesAgo(0, asOf)).toBe('2026-07-11T20:00:00Z');
    expect(atMinutesAgo(90, asOf)).toBe('2026-07-11T18:30:00Z');
  });

  it('normalizeSeedMode maps refresh alias to append', () => {
    expect(normalizeSeedMode('append')).toBe('append');
    expect(normalizeSeedMode('refresh')).toBe('append');
    expect(normalizeSeedMode('baseline')).toBe('baseline');
  });

  it('append builders produce unique signalIds containing the wave stamp', () => {
    const wave = '20260711';
    const signals = buildAppendSignals({ wave, asOf: new Date('2026-07-11T20:00:00.000Z') });
    expect(signals.length).toBeGreaterThan(5);

    const ids = signals.map((s) => s.signalId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toContain(`append-${wave}`);
    }
  });

  it('append event times are a near-now micro-batch relative to asOf', () => {
    const asOf = new Date('2026-07-11T20:00:00.000Z');
    const windowMinutes = 90;
    const signals = buildAppendSignals({ wave: '20260711', asOf, windowMinutes });

    const times = signals.map((s) => Date.parse(s.timestamp));
    const oldest = Math.min(...times);
    const newest = Math.max(...times);

    expect(newest).toBe(asOf.getTime());
    expect(oldest).toBe(asOf.getTime() - windowMinutes * 60_000);
    for (const t of times) {
      expect(t).toBeLessThanOrEqual(asOf.getTime());
      expect(t).toBeGreaterThanOrEqual(asOf.getTime() - windowMinutes * 60_000);
    }
    expect(asOf.getTime() - oldest).toBeLessThanOrEqual(DEFAULT_APPEND_WINDOW_MINUTES * 60_000);
  });

  it('append timestamps are deterministic for the same asOf', () => {
    const asOf = new Date('2026-07-11T20:00:00.000Z');
    const a = buildAppendSignals({ wave: '20260711', asOf, windowMinutes: 90 }).map((s) => s.timestamp);
    const b = buildAppendSignals({ wave: '20260711', asOf, windowMinutes: 90 }).map((s) => s.timestamp);
    expect(a).toEqual(b);
  });

  it('buildRefreshSignals is an alias for buildAppendSignals', () => {
    expect(buildRefreshSignals).toBe(buildAppendSignals);
  });

  it('buildSignalsForMode accepts refresh as append alias', () => {
    const asOf = new Date('2026-07-11T20:00:00.000Z');
    const viaAppend = buildSignalsForMode('append', { wave: '20260711', asOf });
    const viaRefresh = buildSignalsForMode('refresh', { wave: '20260711', asOf });
    expect(viaRefresh.map((s) => s.signalId)).toEqual(viaAppend.map((s) => s.signalId));
  });

  it('Maya append covers four skills with mixed expected decisions', () => {
    const signals = buildAppendSignals({
      wave: '20260711',
      asOf: new Date('2026-07-11T20:00:00.000Z'),
    }).filter((s) => s.learnerRef === 'stu-10042');
    const bySkill = Object.fromEntries(signals.map((s) => [s.skill, s.expectDecision]));
    expect(Object.keys(bySkill).sort()).toEqual(['ELA-201', 'MATH-301', 'Reading', 'SCI-101']);
    expect(bySkill['MATH-301']).toBe('advance');
    expect(bySkill['ELA-201']).toBe('reinforce');
    expect(bySkill['Reading']).toBe('intervene');
    expect(bySkill['SCI-101']).toBe('intervene');
  });

  it('Maya baseline covers four skills with distinct decision types', () => {
    const signals = buildMayaBaseline(90).filter((s) => s.verify !== false);
    const bySkill = Object.fromEntries(signals.map((s) => [s.skill, s.expectDecision]));
    expect(bySkill['MATH-301']).toBe('advance');
    expect(bySkill['ELA-201']).toBe('reinforce');
    expect(bySkill['Reading']).toBe('intervene');
    expect(bySkill['SCI-101']).toBe('intervene');
  });

  it('Casey Nguyen is sparse-evidence (Math reinforce only)', () => {
    expect(PERSONAS['stu-60001'].scenarioId).toBe('sparse-evidence');
    const signals = buildCaseyBaseline(90);
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s.skill === 'MATH-301')).toBe(true);
    expect(signals.every((s) => s.expectDecision === 'reinforce')).toBe(true);
  });

  it('baseline includes Casey and all scenario personas', () => {
    const signals = buildBaselineSignals(90);
    const refs = new Set(signals.map((s) => s.learnerRef));
    expect(refs.has('stu-60001')).toBe(true);
    expect(refs.has('stu-10042')).toBe(true);
    expect(refs.has('staff-0201')).toBe(true);
  });

  it('expectDecisionFromScores mirrors Springs learner policy order', () => {
    expect(
      expectDecisionFromScores({ masteryScore: 0.2, stabilityScore: 0.2, timeSinceReinforcement: 200000 })
    ).toBe('intervene');
    expect(
      expectDecisionFromScores({ masteryScore: 0.9, stabilityScore: 0.9, timeSinceReinforcement: 50000 })
    ).toBe('advance');
    expect(
      expectDecisionFromScores({ masteryScore: 0.5, stabilityScore: 0.5, timeSinceReinforcement: 100000 })
    ).toBe('reinforce');
  });
});
