/**
 * Unit tests — SqliteFeedbackRepository (FEEDBACK-008/009 unit layer, org scope, ordering).
 */

import { mkdtempSync, rmSync } from 'fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDecisionStore, closeDecisionStore, saveDecision } from '../../src/decision/store.js';
import {
  initFeedbackStore,
  closeFeedbackStore,
  clearFeedbackStore,
  getFeedbackRepository,
} from '../../src/feedback/sqlite-repository.js';
import type { Decision } from '../../src/shared/types.js';

let tmpDir: string;
let decPath: string;
let fbPath: string;

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    org_id: 'org_A',
    decision_id: randomUUID(),
    learner_reference: 'L1',
    decision_type: 'reinforce',
    decided_at: '2026-01-01T12:00:00.000Z',
    decision_context: {},
    trace: {
      state_id: 'org_A:L1:v1',
      state_version: 1,
      policy_id: 'default',
      policy_version: '1.0.0',
      matched_rule_id: null,
      state_snapshot: {},
      matched_rule: null,
      rationale: 't',
      educator_summary: 's',
    },
    ...overrides,
  };
}

describe('SqliteFeedbackRepository', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'fb-unit-'));
    decPath = join(tmpDir, 'decisions.db');
    fbPath = join(tmpDir, 'feedback.db');
    closeDecisionStore();
    closeFeedbackStore();
    initDecisionStore(decPath);
    initFeedbackStore({ feedbackDbPath: fbPath, decisionsDbPath: decPath });
  });

  afterEach(() => {
    closeFeedbackStore();
    closeDecisionStore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips saveFeedback + listFeedbackForDecision', async () => {
    const d = makeDecision();
    saveDecision(d);
    const repo = getFeedbackRepository()!;
    const rec = {
      feedback_id: randomUUID(),
      decision_id: d.decision_id,
      org_id: d.org_id,
      learner_reference: d.learner_reference,
      session_id: 'sess1',
      action: 'approve' as const,
      reason_category: 'agree_primary',
      reason_text: 'ok',
      suggested_decision_type: null,
      created_at: '2026-01-02T00:00:00.000Z',
    };
    await repo.saveFeedback(rec);
    const rows = await repo.listFeedbackForDecision(d.org_id, d.decision_id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.feedback_id).toBe(rec.feedback_id);
    expect(rows[0]!.action).toBe('approve');
  });

  it('orders listFeedbackForDecision by created_at ASC', async () => {
    const d = makeDecision();
    saveDecision(d);
    const repo = getFeedbackRepository()!;
    await repo.saveFeedback({
      feedback_id: randomUUID(),
      decision_id: d.decision_id,
      org_id: d.org_id,
      learner_reference: d.learner_reference,
      session_id: 's',
      action: 'reject',
      reason_category: 'other',
      reason_text: null,
      suggested_decision_type: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    await repo.saveFeedback({
      feedback_id: randomUUID(),
      decision_id: d.decision_id,
      org_id: d.org_id,
      learner_reference: d.learner_reference,
      session_id: 's',
      action: 'approve',
      reason_category: 'agree_primary',
      reason_text: null,
      suggested_decision_type: null,
      created_at: '2026-01-03T00:00:00.000Z',
    });
    await repo.saveFeedback({
      feedback_id: randomUUID(),
      decision_id: d.decision_id,
      org_id: d.org_id,
      learner_reference: d.learner_reference,
      session_id: 's',
      action: 'ignore',
      reason_category: 'other',
      reason_text: null,
      suggested_decision_type: null,
      created_at: '2026-01-02T00:00:00.000Z',
    });
    const rows = await repo.listFeedbackForDecision(d.org_id, d.decision_id);
    expect(rows.map((r) => r.action)).toEqual(['reject', 'ignore', 'approve']);
  });

  it('FEEDBACK-008 (unit): recordView dedupes within 10s window', async () => {
    const d = makeDecision();
    saveDecision(d);
    const repo = getFeedbackRepository()!;
    const r1 = await repo.recordView(
      {
        view_id: randomUUID(),
        decision_id: d.decision_id,
        org_id: d.org_id,
        session_id: 'sess',
        viewed_at: '2026-01-01T00:00:00.000Z',
      },
      10
    );
    expect(r1.recorded).toBe(true);
    const r2 = await repo.recordView(
      {
        view_id: randomUUID(),
        decision_id: d.decision_id,
        org_id: d.org_id,
        session_id: 'sess',
        viewed_at: '2026-01-01T00:00:05.000Z',
      },
      10
    );
    expect(r2.recorded).toBe(false);
  });

  it('recordView allows second insert after window', async () => {
    const d = makeDecision();
    saveDecision(d);
    const repo = getFeedbackRepository()!;
    await repo.recordView(
      {
        view_id: randomUUID(),
        decision_id: d.decision_id,
        org_id: d.org_id,
        session_id: 'sess',
        viewed_at: '2026-01-01T00:00:00.000Z',
      },
      60
    );
    const r2 = await repo.recordView(
      {
        view_id: randomUUID(),
        decision_id: d.decision_id,
        org_id: d.org_id,
        session_id: 'sess',
        viewed_at: '2026-01-01T00:01:10.000Z',
      },
      60
    );
    expect(r2.recorded).toBe(true);
  });

  it('FEEDBACK-009 (unit): countPendingByType respects org and feedback coverage', async () => {
    for (let i = 0; i < 5; i += 1) {
      saveDecision(
        makeDecision({
          decision_id: `da-${i}`,
          decided_at: `2026-01-0${i + 1}T12:00:00.000Z`,
          decision_type: i % 2 === 0 ? 'reinforce' : 'advance',
        })
      );
    }
    for (let i = 0; i < 3; i += 1) {
      saveDecision(
        makeDecision({
          org_id: 'org_B',
          decision_id: `db-${i}`,
          decided_at: '2026-01-10T12:00:00.000Z',
        })
      );
    }
    clearFeedbackStore();
    const repo = getFeedbackRepository()!;
    await repo.saveFeedback({
      feedback_id: randomUUID(),
      decision_id: 'da-0',
      org_id: 'org_A',
      learner_reference: 'L1',
      session_id: 's',
      action: 'approve',
      reason_category: 'agree_primary',
      reason_text: null,
      suggested_decision_type: null,
      created_at: '2026-01-20T00:00:00.000Z',
    });
    await repo.saveFeedback({
      feedback_id: randomUUID(),
      decision_id: 'da-1',
      org_id: 'org_A',
      learner_reference: 'L1',
      session_id: 's',
      action: 'approve',
      reason_category: 'agree_primary',
      reason_text: null,
      suggested_decision_type: null,
      created_at: '2026-01-20T00:00:00.000Z',
    });
    const now = '2026-02-01T00:00:00.000Z';
    const r = await repo.countPendingByType('org_A', 0, now);
    expect(r.total).toBe(3);
    expect(r.byType.reinforce + r.byType.advance + r.byType.intervene + r.byType.pause).toBe(3);
  });
});
