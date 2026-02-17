/**
 * E2E Integration Tests: Signal → State → Decision
 *
 * Proves the unbroken POST /v1/signals → automatic state computation →
 * automatic decision evaluation → GET /v1/decisions chain at the HTTP level
 * with 3 realistic learner payloads (Maya K, Jordan 3rd, Aisha 5th).
 *
 * Validates the default policy end-to-end (POC v2, policy_version 2.0.0).
 *
 * Plan: .cursor/plans/poc-v1-e2e-validation.plan.md (TASK-001)
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
} from '../../src/state/store.js';
import {
  initDecisionStore,
  closeDecisionStore,
  clearDecisionStore,
} from '../../src/decision/store.js';
import { loadPolicy } from '../../src/decision/policy-loader.js';

// =============================================================================
// Sample Learner Payloads (external system data + canonical fields)
// =============================================================================

/**
 * Maya — Kindergarten, age 5
 * stabilityScore 0.28 (< 0.7) and timeSinceReinforcement 90000 (> 86400)
 * → Both conditions met → rule-reinforce fires
 */
const MAYA_PAYLOAD = {
  firstName: 'Maya',
  gradeLevel: 'K',
  age: 5,
  subjects: ['math', 'science'],
  progress: {
    totalXp: 320,
    currentLevel: 3,
    currentStreak: 4,
    mathMastery: 28,
    scienceMastery: 15,
    questsCompleted: 7,
    miniGamesPlayed: 12,
  },
  eligibleMiniGames: {
    math: ['number_pop', 'addition_blast', 'skip_count_runner', 'time_match'],
    science: ['memory_match', 'planet_jump', 'force_push', 'habitat_matchup'],
    reward: ['spin_wheel', 'treasure_chest', 'star_catch'],
  },
  gradeTuning: {
    animationSpeed: 0.8,
    transitionDelay: 600,
    targetScale: 1.2,
    forgiveness: 1.5,
  },
  // Canonical fields for default policy evaluation
  stabilityScore: 0.28,
  timeSinceReinforcement: 90000,
};

/**
 * Jordan — 3rd grade, age 8
 * stabilityScore 0.52 (< 0.7 ✓) but timeSinceReinforcement 3600 (NOT > 86400 ✗)
 * → Default path (reinforcement too recent) → matched_rule_id: null
 */
const JORDAN_PAYLOAD = {
  firstName: 'Jordan',
  gradeLevel: '3',
  age: 8,
  subjects: ['math', 'reading', 'science'],
  progress: {
    totalXp: 1250,
    currentLevel: 8,
    currentStreak: 12,
    mathMastery: 62,
    readingMastery: 45,
    scienceMastery: 38,
    questsCompleted: 34,
    miniGamesPlayed: 67,
  },
  eligibleMiniGames: {
    math: ['fraction_builder', 'multiplication_race', 'geometry_puzzle'],
    reading: ['word_detective', 'story_scramble', 'vocab_vault'],
    science: ['circuit_builder', 'ecosystem_sim', 'weather_lab'],
    reward: ['spin_wheel', 'treasure_chest', 'star_catch', 'badge_showcase'],
  },
  gradeTuning: {
    animationSpeed: 1.0,
    transitionDelay: 400,
    targetScale: 1.0,
    forgiveness: 1.0,
  },
  // Canonical fields
  stabilityScore: 0.52,
  timeSinceReinforcement: 3600,
};

/**
 * Aisha — 5th grade, age 10
 * stabilityScore 0.78 (NOT < 0.7 ✗) and timeSinceReinforcement 172800 (> 86400 ✓)
 * → Default path (stability too high) → matched_rule_id: null
 */
const AISHA_PAYLOAD = {
  firstName: 'Aisha',
  gradeLevel: '5',
  age: 10,
  subjects: ['math', 'reading', 'science', 'social_studies'],
  progress: {
    totalXp: 4820,
    currentLevel: 15,
    currentStreak: 21,
    mathMastery: 85,
    readingMastery: 78,
    scienceMastery: 72,
    socialStudiesMastery: 65,
    questsCompleted: 98,
    miniGamesPlayed: 156,
  },
  eligibleMiniGames: {
    math: ['algebra_intro', 'decimal_dash', 'data_detective'],
    reading: ['inference_engine', 'debate_arena', 'author_craft'],
    science: ['cell_explorer', 'chemistry_mix', 'space_mission'],
    social_studies: ['timeline_builder', 'map_quest', 'civics_challenge'],
    reward: ['spin_wheel', 'treasure_chest', 'star_catch', 'badge_showcase', 'avatar_unlock'],
  },
  gradeTuning: {
    animationSpeed: 1.2,
    transitionDelay: 300,
    targetScale: 0.9,
    forgiveness: 0.7,
  },
  // Canonical fields
  stabilityScore: 0.78,
  timeSinceReinforcement: 172800,
};

// =============================================================================
// Test helpers
// =============================================================================

const ORG_ID = 'org_8p3p';

/** Counter for unique signal IDs across tests */
let signalCounter = 0;

/**
 * Build a full SignalEnvelope from a learner payload and learner reference.
 */
function buildSignal(
  learnerReference: string,
  payload: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  signalCounter += 1;
  return {
    org_id: ORG_ID,
    signal_id: `e2e-sig-${Date.now()}-${signalCounter}-${Math.random().toString(36).slice(2, 8)}`,
    source_system: 'external-lms',
    learner_reference: learnerReference,
    timestamp: new Date().toISOString(),
    schema_version: 'v1',
    payload,
    ...overrides,
  };
}

// =============================================================================
// Test suite
// =============================================================================

describe('E2E: Signal → State → Decision (POC v2)', () => {
  let app: FastifyInstance;

  // ---------------------------------------------------------------------------
  // Setup / Teardown
  // ---------------------------------------------------------------------------

  beforeAll(async () => {
    // Init all 4 stores in-memory
    initIdempotencyStore(':memory:');
    initSignalLogStore(':memory:');
    initStateStore(':memory:');
    initDecisionStore(':memory:');

    // Load default policy (default.json)
    loadPolicy();

    // Create Fastify app with all routes under /v1 prefix
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
    signalCounter = 0;
  });

  // ---------------------------------------------------------------------------
  // E2E-001: Full cycle — POST signal, GET decision, verify trace
  // ---------------------------------------------------------------------------

  describe('E2E-001: Full cycle — POST signal → GET decision → verify trace', () => {
    const LEARNER_CASES = [
      {
        name: 'Maya (K, age 5) — rule fires (both conditions met)',
        learnerRef: 'maya-k',
        payload: MAYA_PAYLOAD,
        expectedMatchedRuleId: 'rule-reinforce',
      },
      {
        name: 'Jordan (3rd, age 8) — default (reinforcement too recent)',
        learnerRef: 'jordan-3rd',
        payload: JORDAN_PAYLOAD,
        expectedMatchedRuleId: null,
      },
      {
        name: 'Aisha (5th, age 10) — default (stability too high)',
        learnerRef: 'aisha-5th',
        payload: AISHA_PAYLOAD,
        expectedMatchedRuleId: null,
      },
    ] as const;

    for (const { name, learnerRef, payload, expectedMatchedRuleId } of LEARNER_CASES) {
      it(`should complete full signal → decision cycle for ${name}`, async () => {
        // 1. POST /v1/signals
        const signal = buildSignal(learnerRef, payload);
        const postRes = await app.inject({
          method: 'POST',
          url: '/v1/signals',
          payload: signal,
        });

        expect(postRes.statusCode).toBe(200);
        const postBody = postRes.json();
        expect(postBody.status).toBe('accepted');
        expect(postBody.org_id).toBe(ORG_ID);

        // 2. GET /v1/decisions for this learner
        const getRes = await app.inject({
          method: 'GET',
          url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=${learnerRef}&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
        });

        expect(getRes.statusCode).toBe(200);
        const getBody = getRes.json();
        expect(getBody.decisions).toBeInstanceOf(Array);
        expect(getBody.decisions.length).toBe(1);

        const decision = getBody.decisions[0];

        // 3. Assert decision_type = reinforce (all paths produce reinforce in v1)
        expect(decision.decision_type).toBe('reinforce');

        // 4. Assert trace.matched_rule_id
        expect(decision.trace.matched_rule_id).toBe(expectedMatchedRuleId);

        // 5. Assert trace.policy_version = 2.0.0
        expect(decision.trace.policy_version).toBe('2.0.0');

        // 6. Assert trace.state_id and trace.state_version present
        expect(decision.trace.state_id).toBeDefined();
        expect(typeof decision.trace.state_id).toBe('string');
        expect(decision.trace.state_version).toBeDefined();
        expect(typeof decision.trace.state_version).toBe('number');
        expect(decision.trace.state_version).toBeGreaterThanOrEqual(1);

        // 7. Assert decision shape completeness
        expect(decision.org_id).toBe(ORG_ID);
        expect(decision.learner_reference).toBe(learnerRef);
        expect(decision.decision_id).toBeDefined();
        expect(decision.decided_at).toBeDefined();
        expect(decision.decision_context).toBeDefined();
      });
    }
  });

  // ---------------------------------------------------------------------------
  // E2E-002: External data preserved in state (non-canonical fields survive)
  // ---------------------------------------------------------------------------

  describe('E2E-002: External data preserved in state', () => {
    it('should preserve non-canonical fields through signal ingestion', async () => {
      const learnerRef = 'maya-k-preserved';
      const signal = buildSignal(learnerRef, MAYA_PAYLOAD);

      // POST the signal
      const postRes = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });
      expect(postRes.statusCode).toBe(200);

      // GET /v1/signals to verify the full payload is stored
      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/signals?org_id=${ORG_ID}&learner_reference=${learnerRef}&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      });

      expect(getRes.statusCode).toBe(200);
      const getBody = getRes.json();
      expect(getBody.signals).toBeInstanceOf(Array);
      expect(getBody.signals.length).toBe(1);

      const storedSignal = getBody.signals[0];

      // External data fields preserved in signal payload
      expect(storedSignal.payload.firstName).toBe('Maya');
      expect(storedSignal.payload.gradeLevel).toBe('K');
      expect(storedSignal.payload.age).toBe(5);
      expect(storedSignal.payload.subjects).toEqual(['math', 'science']);

      // Nested external data preserved
      expect(storedSignal.payload.progress).toBeDefined();
      expect(storedSignal.payload.progress.totalXp).toBe(320);
      expect(storedSignal.payload.progress.currentLevel).toBe(3);

      expect(storedSignal.payload.eligibleMiniGames).toBeDefined();
      expect(storedSignal.payload.eligibleMiniGames.math).toEqual([
        'number_pop', 'addition_blast', 'skip_count_runner', 'time_match',
      ]);

      expect(storedSignal.payload.gradeTuning).toBeDefined();
      expect(storedSignal.payload.gradeTuning.animationSpeed).toBe(0.8);

      // Canonical fields also preserved
      expect(storedSignal.payload.stabilityScore).toBe(0.28);
      expect(storedSignal.payload.timeSinceReinforcement).toBe(90000);
    });
  });

  // ---------------------------------------------------------------------------
  // E2E-003: Multiple learners, org isolation
  // ---------------------------------------------------------------------------

  describe('E2E-003: Multi-learner org isolation', () => {
    it('should isolate decisions per learner within the same org', async () => {
      // POST signals for all 3 learners
      const learners = [
        { ref: 'maya-k-iso', payload: MAYA_PAYLOAD },
        { ref: 'jordan-3rd-iso', payload: JORDAN_PAYLOAD },
        { ref: 'aisha-5th-iso', payload: AISHA_PAYLOAD },
      ];

      for (const { ref, payload } of learners) {
        const signal = buildSignal(ref, payload);
        const res = await app.inject({
          method: 'POST',
          url: '/v1/signals',
          payload: signal,
        });
        expect(res.statusCode).toBe(200);
      }

      // Each learner sees only their own decision
      for (const { ref } of learners) {
        const res = await app.inject({
          method: 'GET',
          url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=${ref}&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.decisions.length).toBe(1);
        expect(body.decisions[0].learner_reference).toBe(ref);
        expect(body.decisions[0].org_id).toBe(ORG_ID);
      }
    });

    it('should return empty decisions for a different org', async () => {
      // POST signal under org_8p3p
      const signal = buildSignal('maya-k-orgiso', MAYA_PAYLOAD);
      const postRes = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });
      expect(postRes.statusCode).toBe(200);

      // GET decisions for a different org → empty
      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/decisions?org_id=org_other&learner_reference=maya-k-orgiso&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      });
      expect(getRes.statusCode).toBe(200);
      const body = getRes.json();
      expect(body.decisions).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // E2E-004: Decision persists and is queryable by time range
  // ---------------------------------------------------------------------------

  describe('E2E-004: Decision queryable by time range', () => {
    it('should find decision within matching time range and miss outside it', async () => {
      const learnerRef = 'maya-k-time';
      const signal = buildSignal(learnerRef, MAYA_PAYLOAD);

      // POST signal
      const postRes = await app.inject({
        method: 'POST',
        url: '/v1/signals',
        payload: signal,
      });
      expect(postRes.statusCode).toBe(200);

      // GET decisions — wide range that includes now → found
      const foundRes = await app.inject({
        method: 'GET',
        url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=${learnerRef}&from_time=2020-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      });
      expect(foundRes.statusCode).toBe(200);
      const foundBody = foundRes.json();
      expect(foundBody.decisions.length).toBe(1);

      // GET decisions — past range that excludes the decision → empty
      const missedRes = await app.inject({
        method: 'GET',
        url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=${learnerRef}&from_time=2020-01-01T00:00:00Z&to_time=2020-12-31T23:59:59Z`,
      });
      expect(missedRes.statusCode).toBe(200);
      const missedBody = missedRes.json();
      expect(missedBody.decisions).toEqual([]);

      // GET decisions — future range that excludes the decision → empty
      const futureRes = await app.inject({
        method: 'GET',
        url: `/v1/decisions?org_id=${ORG_ID}&learner_reference=${learnerRef}&from_time=2030-01-01T00:00:00Z&to_time=2030-12-31T23:59:59Z`,
      });
      expect(futureRes.statusCode).toBe(200);
      const futureBody = futureRes.json();
      expect(futureBody.decisions).toEqual([]);
    });
  });
});
