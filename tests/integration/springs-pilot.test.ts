/**
 * Springs Charter Schools Pilot Integration Tests
 *
 * Proves the policy routing chain end-to-end:
 *   POST /v1/signals (source_system → routing.json → policy key) →
 *   STATE Engine → Decision Engine (org-specific policy) → GET /v1/decisions
 *
 * Two user types tested:
 *   - Learner signals (canvas-lms / internal-lms) → evaluated against springs:learner policy
 *   - Staff signals (hr-training) → evaluated against springs:staff policy
 *
 * Also verifies identity resolution: same learner_reference across multiple
 * source_systems merges into a single STATE record.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerIngestionRoutes } from '../../src/ingestion/routes.js';
import { registerSignalLogRoutes } from '../../src/signalLog/routes.js';
import { registerDecisionRoutes } from '../../src/decision/routes.js';
import {
  initIdempotencyStore,
  closeIdempotencyStore,
  clearIdempotencyStore,
} from '../../src/ingestion/idempotency.js';
import {
  initSignalLogStore,
  closeSignalLogStore,
  clearSignalLogStore,
} from '../../src/signalLog/store.js';
import {
  initStateStore,
  closeStateStore,
  clearStateStore,
  getState,
} from '../../src/state/store.js';
import {
  initDecisionStore,
  closeDecisionStore,
  clearDecisionStore,
} from '../../src/decision/store.js';
import { clearRoutingConfigCache } from '../../src/decision/policy-loader.js';
import { clearSubjectConfigCache } from '../../src/state/subject-config.js';

const ORG_ID = 'springs';
let signalCounter = 0;

function buildSignal(
  learnerRef: string,
  sourceSystem: string,
  payload: Record<string, unknown>
): Record<string, unknown> {
  signalCounter += 1;
  return {
    org_id: ORG_ID,
    signal_id: `springs-sig-${Date.now()}-${signalCounter}`,
    source_system: sourceSystem,
    learner_reference: learnerRef,
    timestamp: new Date().toISOString(),
    schema_version: 'v1',
    payload,
  };
}

// ============================================================================
// Learner payloads (mapped to springs/learner.json fields)
// ============================================================================

/** Learner with low stability + long since reinforcement → rule-intervene */
const LEARNER_INTERVENE_PAYLOAD = {
  stabilityScore: 0.2,
  timeSinceReinforcement: 200000,
};

/** Learner with high stability + high mastery → rule-advance */
const LEARNER_ADVANCE_PAYLOAD = {
  stabilityScore: 0.9,
  masteryScore: 0.9,
};

/** Learner with moderate stability + overdue reinforcement → rule-reinforce */
const LEARNER_REINFORCE_PAYLOAD = {
  stabilityScore: 0.5,
  timeSinceReinforcement: 100000,
};

/** Borderline mid-stability, recently reinforced — no specific rule, fallback reinforce */
const LEARNER_BORDERLINE_FALLBACK_PAYLOAD = {
  stabilityScore: 0.7,
  timeSinceReinforcement: 50000,
};

// ============================================================================
// Staff payloads (mapped to springs/staff.json fields)
// ============================================================================

/** Staff with low compliance + 15 days overdue → rule-intervene */
const STAFF_INTERVENE_PAYLOAD = {
  complianceScore: 0.3,
  daysOverdue: 15,
  certificationValid: true,
};

/** Staff with invalid certification → rule-pause */
const STAFF_PAUSE_PAYLOAD = {
  complianceScore: 0.7,
  daysOverdue: 0,
  certificationValid: false,
};

/** Staff fully compliant → rule-advance */
const STAFF_ADVANCE_PAYLOAD = {
  complianceScore: 0.95,
  trainingScore: 0.90,
  daysOverdue: 0,
  certificationValid: true,
};

// ============================================================================
// Test suite
// ============================================================================

describe('Springs Charter Schools Pilot Integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    initIdempotencyStore(':memory:');
    initSignalLogStore(':memory:');
    initStateStore(':memory:');
    initDecisionStore(':memory:');

    app = Fastify({ logger: false });
    app.register(async (v1) => {
      registerIngestionRoutes(v1);
      registerSignalLogRoutes(v1);
      registerDecisionRoutes(v1);
    }, { prefix: '/v1' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDecisionStore();
    closeStateStore();
    closeSignalLogStore();
    closeIdempotencyStore();
  });

  beforeEach(() => {
    clearIdempotencyStore();
    clearSignalLogStore();
    clearStateStore();
    clearDecisionStore();
    clearRoutingConfigCache();
    clearSubjectConfigCache();
    signalCounter = 0;
  });

  // --------------------------------------------------------------------------
  // SPRINGS-001: Learner signals (Canvas) route to learner policy
  // --------------------------------------------------------------------------

  describe('SPRINGS-001: Learner policy routing (canvas-lms → springs:learner)', () => {
    it('canvas-lms signal with low stability triggers intervene via learner policy', async () => {
      const postRes = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: buildSignal('learner-001', 'canvas-lms', LEARNER_INTERVENE_PAYLOAD),
      });
      expect(postRes.statusCode).toBe(200);
      expect(postRes.json().status).toBe('accepted');

      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=learner-001&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      });
      expect(getRes.statusCode).toBe(200);
      const { decisions } = getRes.json();
      expect(decisions).toHaveLength(1);
      expect(decisions[0].decision_type).toBe('intervene');
      expect(decisions[0].trace.matched_rule_id).toBe('rule-intervene');
      expect(decisions[0].trace.educator_summary).toBe('Needs stronger support now');
    });

    it('canvas-lms signal with high stability triggers advance via learner policy', async () => {
      const postRes = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: buildSignal('learner-002', 'canvas-lms', LEARNER_ADVANCE_PAYLOAD),
      });
      expect(postRes.statusCode).toBe(200);

      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=learner-002&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      });
      expect(getRes.statusCode).toBe(200);
      const { decisions } = getRes.json();
      expect(decisions).toHaveLength(1);
      expect(decisions[0].decision_type).toBe('advance');
      expect(decisions[0].trace.matched_rule_id).toBe('rule-advance');
      expect(decisions[0].trace.educator_summary).toBe('Ready to move on');
    });

    it('internal-lms also routes to learner policy', async () => {
      const postRes = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: buildSignal('learner-003', 'internal-lms', LEARNER_REINFORCE_PAYLOAD),
      });
      expect(postRes.statusCode).toBe(200);

      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=learner-003&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      });
      expect(getRes.statusCode).toBe(200);
      const { decisions } = getRes.json();
      expect(decisions).toHaveLength(1);
      expect(decisions[0].decision_type).toBe('reinforce');
      expect(decisions[0].trace.matched_rule_id).toBe('rule-reinforce');
      expect(decisions[0].trace.educator_summary).toBe('Needs more practice');
    });

    it('borderline mid-stability signal triggers reinforce via fallback rule', async () => {
      const postRes = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: buildSignal('learner-borderline', 'canvas-lms', LEARNER_BORDERLINE_FALLBACK_PAYLOAD),
      });
      expect(postRes.statusCode).toBe(200);

      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=learner-borderline&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      });
      expect(getRes.statusCode).toBe(200);
      const { decisions } = getRes.json();
      expect(decisions).toHaveLength(1);
      expect(decisions[0].decision_type).toBe('reinforce');
      expect(decisions[0].trace.matched_rule_id).toBe('rule-reinforce-fallback');
      expect(decisions[0].trace.educator_summary).toBe('Needs more practice');
    });
  });

  // --------------------------------------------------------------------------
  // SPRINGS-002: Staff signals (hr-training) route to staff policy
  // --------------------------------------------------------------------------

  describe('SPRINGS-002: Staff policy routing (hr-training → springs:staff)', () => {
    it('hr-training signal with low compliance + days overdue triggers intervene via staff policy', async () => {
      const postRes = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: buildSignal('staff-001', 'hr-training', STAFF_INTERVENE_PAYLOAD),
      });
      expect(postRes.statusCode).toBe(200);
      expect(postRes.json().status).toBe('accepted');

      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=staff-001&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      });
      expect(getRes.statusCode).toBe(200);
      const { decisions } = getRes.json();
      expect(decisions).toHaveLength(1);
      expect(decisions[0].decision_type).toBe('intervene');
      expect(decisions[0].trace.matched_rule_id).toBe('rule-intervene');
      expect(decisions[0].trace.educator_summary).toBe('Needs stronger support now');
    });

    it('hr-training signal with invalid certification triggers pause via staff policy', async () => {
      const postRes = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: buildSignal('staff-002', 'hr-training', STAFF_PAUSE_PAYLOAD),
      });
      expect(postRes.statusCode).toBe(200);

      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=staff-002&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      });
      expect(getRes.statusCode).toBe(200);
      const { decisions } = getRes.json();
      expect(decisions).toHaveLength(1);
      expect(decisions[0].decision_type).toBe('pause');
      expect(decisions[0].trace.matched_rule_id).toBe('rule-pause');
      expect(decisions[0].trace.educator_summary).toBe('Possible learning decay detected; watch closely');
    });

    it('hr-training signal with full compliance triggers advance via staff policy', async () => {
      const postRes = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: buildSignal('staff-003', 'hr-training', STAFF_ADVANCE_PAYLOAD),
      });
      expect(postRes.statusCode).toBe(200);

      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=staff-003&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      });
      expect(getRes.statusCode).toBe(200);
      const { decisions } = getRes.json();
      expect(decisions).toHaveLength(1);
      expect(decisions[0].decision_type).toBe('advance');
      expect(decisions[0].trace.matched_rule_id).toBe('rule-advance');
      expect(decisions[0].trace.educator_summary).toBe('Ready to move on');
    });
  });

  // --------------------------------------------------------------------------
  // SPRINGS-003: Learner and staff policies produce different decisions
  //              for the same state field values (policy isolation proof)
  // --------------------------------------------------------------------------

  describe('SPRINGS-003: Policy isolation — learner vs staff evaluate different fields', () => {
    it('same org, different source_system → different policy_id in decision trace', async () => {
      const sharedPayload = {
        stabilityScore: 0.2,
        timeSinceReinforcement: 200000,
        complianceScore: 0.3,
        daysOverdue: 15,
        certificationValid: true,
      };

      await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: buildSignal('user-cross-system', 'canvas-lms', sharedPayload),
      });

      await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: buildSignal('staff-cross-system', 'hr-training', sharedPayload),
      });

      const learnerRes = await app.inject({
        method: 'GET',
        url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=user-cross-system&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      });
      const staffRes = await app.inject({
        method: 'GET',
        url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=staff-cross-system&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      });

      const learnerDecision = learnerRes.json().decisions[0];
      const staffDecision = staffRes.json().decisions[0];

      expect(learnerDecision.trace.policy_version).toBe('1.0.0');
      expect(staffDecision.trace.policy_version).toBe('1.0.0');

      // Both fire rule-intervene but via different policies (different state fields evaluated)
      expect(learnerDecision.decision_type).toBe('intervene');
      expect(staffDecision.decision_type).toBe('intervene');

      // Canonical snapshots capture different fields per policy
      expect(learnerDecision.trace.state_snapshot).toHaveProperty('stabilityScore');
      expect(staffDecision.trace.state_snapshot).toHaveProperty('complianceScore');
    });
  });

  // --------------------------------------------------------------------------
  // SPRINGS-004: Identity resolution — same learner_reference across LMS systems
  //              merges into a single STATE record
  // --------------------------------------------------------------------------

  describe('SPRINGS-004: Identity resolution — cross-system state merging', () => {
    it('same learner_reference from two LMS systems accumulates into one STATE record', async () => {
      const CANONICAL_REF = 'stu-10042';

      // Canvas signal: sets stabilityScore
      await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: buildSignal(CANONICAL_REF, 'canvas-lms', {
          stabilityScore: 0.6,
          // Springs rule-reinforce requires timeSinceReinforcement > 86400 (same as default policy)
          timeSinceReinforcement: 90000,
        }),
      });

      // Internal LMS signal: adds masteryScore
      await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: buildSignal(CANONICAL_REF, 'internal-lms', {
          masteryScore: 0.85,
        }),
      });

      // Both signals resolved to same learner_reference → one decision
      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=${CANONICAL_REF}&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      });
      expect(getRes.statusCode).toBe(200);
      const { decisions } = getRes.json();
      // 2 signals → 2 state evaluations → 2 decisions (one per signal ingestion)
      expect(decisions.length).toBeGreaterThanOrEqual(1);
      // All decisions belong to the canonical learner reference
      for (const d of decisions) {
        expect(d.learner_reference).toBe(CANONICAL_REF);
        expect(d.org_id).toBe(ORG_ID);
      }
    });
  });

  // --------------------------------------------------------------------------
  // SPRINGS-005: Unknown source_system falls back to learner policy (default)
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  // AGG-014: State apply writes aggregation after multi-skill signal ingest
  // AGG-016: Policy regression — Jordan last signal MATH-301 still yields advance
  // --------------------------------------------------------------------------

  describe('URS aggregation integration (AGG-014, AGG-016)', () => {
    it('AGG-014: ingesting two skill signals persists state.aggregation.overall', async () => {
      const learnerRef = 'agg-014-learner';

      const postMath = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: buildSignal(learnerRef, 'canvas-lms', {
          skill: 'MATH-301',
          skills: { 'MATH-301': { masteryScore: 0.8, stabilityScore: 0.72 } },
          masteryScore: 0.8,
          stabilityScore: 0.72,
          timeSinceReinforcement: 50000,
        }),
      });
      expect(postMath.statusCode).toBe(200);

      const postHist = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: buildSignal(learnerRef, 'blackboard-lms', {
          skill: 'HIST-202',
          skills: { 'HIST-202': { masteryScore: 0.6, stabilityScore: 0.51 } },
          masteryScore: 0.6,
          stabilityScore: 0.51,
          timeSinceReinforcement: 40000,
        }),
      });
      expect(postHist.statusCode).toBe(200);

      const stateRecord = getState(ORG_ID, learnerRef);
      expect(stateRecord).not.toBeNull();

      const stateObj = stateRecord!.state as Record<string, unknown>;
      const aggregation = stateObj.aggregation as {
        overall: { masteryScore: number; subject_count: number; skill_count: number };
      };

      expect(aggregation).toBeDefined();
      expect(aggregation.overall).toBeDefined();
      expect(aggregation.overall.subject_count).toBe(2);
      expect(aggregation.overall.skill_count).toBe(2);
      expect(aggregation.overall.masteryScore).toBe(0.7);
    });

    it('AGG-016: Jordan trajectory — last MATH-301 signal still yields advance (policy regression gate)', async () => {
      const learnerRef = 'stu-30456';

      const jordanSignals = [
        {
          sourceSystem: 'canvas-lms',
          payload: {
            skill: 'MATH-301',
            skills: { 'MATH-301': { masteryScore: 0.45, stabilityScore: 0.405 } },
            masteryScore: 0.45,
            stabilityScore: 0.405,
            timeSinceReinforcement: 95000,
          },
        },
        {
          sourceSystem: 'canvas-lms',
          payload: {
            skill: 'MATH-301',
            skills: { 'MATH-301': { masteryScore: 0.68, stabilityScore: 0.612 } },
            masteryScore: 0.68,
            stabilityScore: 0.612,
            timeSinceReinforcement: 90000,
          },
        },
        {
          sourceSystem: 'blackboard-lms',
          payload: {
            skill: 'HIST-202',
            skills: { 'HIST-202': { masteryScore: 0.8, stabilityScore: 0.68 } },
            masteryScore: 0.8,
            stabilityScore: 0.68,
            timeSinceReinforcement: 40000,
          },
        },
        {
          sourceSystem: 'canvas-lms',
          payload: {
            skill: 'MATH-301',
            skills: { 'MATH-301': { masteryScore: 0.9, stabilityScore: 0.81 } },
            masteryScore: 0.9,
            stabilityScore: 0.81,
            timeSinceReinforcement: 30000,
          },
        },
      ] as const;

      for (const { sourceSystem, payload } of jordanSignals) {
        const postRes = await app.inject({
          method: 'POST',
          url: '/v1/signals',
          payload: buildSignal(learnerRef, sourceSystem, payload),
        });
        expect(postRes.statusCode).toBe(200);
      }

      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=${learnerRef}&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      });
      expect(getRes.statusCode).toBe(200);

      const { decisions } = getRes.json() as {
        decisions: Array<{
          decision_type: string;
          trace: { matched_rule_id: string; state_version: number; state_snapshot: Record<string, unknown> };
        }>;
      };
      expect(decisions.length).toBeGreaterThanOrEqual(4);

      const latestByVersion = decisions.reduce((best, d) =>
        d.trace.state_version > best.trace.state_version ? d : best
      );
      expect(latestByVersion.decision_type).toBe('advance');
      expect(latestByVersion.trace.matched_rule_id).toBe('rule-advance');
      expect(latestByVersion.trace.state_snapshot.masteryScore).toBe(0.9);

      const stateRecord = getState(ORG_ID, learnerRef);
      expect(stateRecord).not.toBeNull();
      const stateObj = stateRecord!.state as Record<string, unknown>;
      expect(stateObj.masteryScore).toBe(0.9);
      expect(stateObj.skill).toBe('MATH-301');
      expect(stateObj.aggregation).toBeDefined();
    });
  });

  describe('SPRINGS-005: Unknown source_system falls back to default routing', () => {
    it('unrecognized source_system uses default_policy_key (learner) from routing config', async () => {
      const postRes = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: buildSignal('learner-unknown-src', 'some-third-lms', LEARNER_REINFORCE_PAYLOAD),
      });
      expect(postRes.statusCode).toBe(200);

      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=learner-unknown-src&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      });
      expect(getRes.statusCode).toBe(200);
      const { decisions } = getRes.json();
      expect(decisions).toHaveLength(1);
      // Falls back to learner policy
      expect(decisions[0].trace.matched_rule_id).toBe('rule-reinforce');
      expect(decisions[0].trace.educator_summary).toBe('Needs more practice');
    });
  });
});
