---
name: POC v1 E2E Validation — Single Rule, Sample Payloads
overview: "Prove the unbroken signal → state → decision chain at the HTTP level with 3 realistic learner payloads (Maya K, Jordan 3rd, Aisha 5th). Validates the POC v1 single-rule policy end-to-end: POST /v1/signals with external data + canonical fields → automatic state computation → automatic decision evaluation → GET /v1/decisions returns correct decision_type and trace. Also documents spec↔code alignment status and positions deferred plans in execution order."
todos:
  - id: TASK-001
    content: "Create E2E integration test: signal-to-decision with 3 sample learner payloads"
    status: completed
  - id: TASK-002
    content: Document spec↔code alignment status and execution sequencing
    status: completed
  - id: TASK-003
    content: Regression check — all tests pass including new E2E
    status: completed
isProject: false
---

# POC v1 E2E Validation — Single Rule, Sample Payloads

**Spec**: `docs/specs/decision-engine.md` (§4.7 Canonical State Fields, §Policy Model, §Triggering Model)

## Prerequisites

- Decision Engine (Stage 4) fully implemented and all 322 tests passing ✓
- E2E Cycle Completion plan executed (graceful shutdown, all stores closed) ✓
- `default.json` policy at v1.0.0 with single `rule-reinforce` rule ✓
- Spec↔code alignment verified: `policy_version: "1.0.0"`, semver validation, `invalid_policy_version` error code all present ✓

## Scope

**In scope**: HTTP-level E2E test proving `POST /v1/signals` → `GET /v1/decisions` cycle with realistic external system payloads augmented with POC v1 canonical fields (`stabilityScore`, `timeSinceReinforcement`).

**Explicitly deferred**:

- `policy-expansion.plan.md` (v2 policy, all 7 decision types) — execute after this plan proves v1 authority
- `repository-extraction.plan.md` (DEF-DEC-002) — execute after policy expansion; see §Execution Sequencing below

## Clarification Notes

- **Signal payload contract (§4.7)**: POC v1 requires canonical fields directly in the signal payload. The external system data (firstName, progress, eligibleMiniGames, gradeTuning) coexists with canonical fields. STATE engine deep-merges everything; policy evaluates only canonical fields.
- **Three test paths exercised**: (1) rule fires (both conditions met), (2) default path — stability above threshold, (3) default path — reinforcement too recent. These map directly to DEC-008 test vectors 8a, 8b, 8c but at the HTTP level.
- **No code changes to src/**: This plan adds one integration test file only. All source code is stable.

## Tasks

### TASK-001: Create E2E integration test with 3 sample learner payloads

- **Status**: completed
- **Files**: `tests/integration/e2e-signal-to-decision.test.ts`
- **Action**: Create
- **Depends on**: none
- **Details**:
HTTP-level integration test using Fastify `app.inject()`. Full server setup (all stores, policy, all routes). Three learner profiles from the external system mock data, each augmented with canonical fields for POC v1.
**Test structure:**
  1. `beforeAll`: Init all 4 stores (`:memory:`), load policy, create Fastify app, register all routes (ingestion + signal log + decision)
  2. `beforeEach`: Clear all stores for isolation
  3. `afterAll`: Close app and stores
  **Sample payloads (3 learners):**

  | Learner             | `stabilityScore` | `timeSinceReinforcement` | Expected Rule                | Expected `matched_rule_id` |
  | ------------------- | ---------------- | ------------------------ | ---------------------------- | -------------------------- |
  | Maya (K, age 5)     | 0.28             | 90000                    | Fires (both conditions met)  | `rule-reinforce`           |
  | Jordan (3rd, age 8) | 0.52             | 3600                     | Default (time too recent)    | `null`                     |
  | Aisha (5th, age 10) | 0.78             | 172800                   | Default (stability too high) | `null`                     |

  **Test cases:**
  **E2E-001: Full cycle — POST signal, GET decision, verify trace**
  For each learner:
  1. POST `/v1/signals` with external data + canonical fields → expect 200, status `accepted`
  2. GET `/v1/decisions` for that learner → expect 200, exactly 1 decision
  3. Assert `decision_type` = `reinforce` (all paths produce reinforce in v1)
  4. Assert `trace.matched_rule_id` matches expected (rule-reinforce or null)
  5. Assert `trace.policy_version` = `1.0.0`
  6. Assert `trace.state_id` and `trace.state_version` are present
  **E2E-002: External data preserved in state (non-canonical fields survive deep merge)**
  POST Maya's signal, then GET `/v1/signals` to verify the full payload (including `firstName`, `progress`, etc.) is stored. This confirms external data is not lost — it flows through ingestion and state alongside the canonical fields.
  **E2E-003: Multiple learners, org isolation**
  POST signals for all 3 learners under `org_8p3p`. GET decisions for each learner → each sees only their own decision. GET decisions for a different org → empty.
  **E2E-004: Decision persists and is queryable by time range**
  POST a signal, then GET decisions with a narrow time range that includes the decision → found. GET with a time range that excludes it → empty.
  **Payload templates** (inline in test, derived from user-provided mock data):
  ```typescript
  const MAYA_PAYLOAD = {
    firstName: 'Maya',
    gradeLevel: 'K',
    age: 5,
    subjects: ['math', 'science'],
    progress: {
      totalXp: 320, currentLevel: 3, currentStreak: 4,
      mathMastery: 28, scienceMastery: 15,
      questsCompleted: 7, miniGamesPlayed: 12,
    },
    eligibleMiniGames: {
      math: ['number_pop', 'addition_blast', 'skip_count_runner', 'time_match'],
      science: ['memory_match', 'planet_jump', 'force_push', 'habitat_matchup'],
      reward: ['spin_wheel', 'treasure_chest', 'star_catch'],
    },
    gradeTuning: {
      animationSpeed: 0.8, transitionDelay: 600,
      targetScale: 1.2, forgiveness: 1.5,
    },
    // Canonical fields for POC v1 policy evaluation
    stabilityScore: 0.28,
    timeSinceReinforcement: 90000,
  };
  ```
  Jordan and Aisha follow the same pattern with their respective external data and canonical field values from the table above.
- **Verification**: `npm run test:integration` passes. All E2E-001 through E2E-004 cases green.

### TASK-002: Document spec↔code alignment status and execution sequencing

- **Status**: completed
- **Files**: This plan file (update inline)
- **Action**: Verify and document
- **Depends on**: TASK-001
- **Details**:
Confirm and record the following alignment items (all verified in review):
**Spec↔Code Alignment Status (all resolved):**

  | Item                                | Spec Reference          | Code Location                           | Status                  |
  | ----------------------------------- | ----------------------- | --------------------------------------- | ----------------------- |
  | `policy_version: "1.0.0"`           | §Policy Model, line 649 | `default.json` line 3                   | ✅ Aligned               |
  | Semver validation                   | §4.6, line 495          | `policy-loader.ts` lines 21–24, 136–141 | ✅ Implemented           |
  | `invalid_policy_version` error code | §4.6, line 505          | `error-codes.ts` lines 97–98            | ✅ Present               |
  | DEC-008 test vectors (3 cases)      | §Contract Tests         | `decision-engine.test.ts` lines 438–494 | ✅ Passing               |
  | Sync trigger isolation              | §Triggering Model       | `ingestion/handler.ts` lines 123–147    | ✅ try/catch, warn-level |
  | `matched_rule_id` nullable          | §4.1                    | `decision.json` trace schema            | ✅ `["string", "null"]`  |

  No spec↔code inconsistencies remain. All items flagged in the review are resolved.
- **Verification**: Alignment table documented. No action items remain.

### TASK-003: Regression check

- **Status**: completed
- **Files**: none (verification only)
- **Action**: Verify
- **Depends on**: TASK-001, TASK-002
- **Details**:
Full verification suite:
  - `npm test` — all tests pass (322 existing + new E2E tests)
  - `npm run build` — no type errors
  - `npm run lint` — no lint errors
  - `npm run test:integration` — E2E tests pass in isolation
- **Verification**: All commands exit 0.

## Files Summary

### To Create


| File                                               | Task     | Purpose                                                                        |
| -------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `tests/integration/e2e-signal-to-decision.test.ts` | TASK-001 | HTTP-level E2E test: POST signal → GET decision with 3 sample learner payloads |


### To Modify

None. All source code is stable.

## Test Plan


| Test ID | Type        | Description                                                                      | Task     |
| ------- | ----------- | -------------------------------------------------------------------------------- | -------- |
| E2E-001 | integration | Full cycle per learner: POST signal → GET decision → verify trace and rule match | TASK-001 |
| E2E-002 | integration | External data preserved: non-canonical fields survive deep merge                 | TASK-001 |
| E2E-003 | integration | Multi-learner org isolation                                                      | TASK-001 |
| E2E-004 | integration | Decision queryable by time range                                                 | TASK-001 |


## Risks


| Risk                                                                                                | Impact | Mitigation                                                                            |
| --------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| Fastify app setup with all 4 stores + policy may have initialization order issues                   | Low    | Follow `server.ts` init order exactly; existing output-api.test.ts proves the pattern |
| Signal payload with nested objects (eligibleMiniGames, gradeTuning) may hit forbidden key detection | Low    | Pre-verified: none of these keys are in the forbidden list                            |
| Time-sensitive assertions (decided_at) may flake                                                    | Low    | Assert only shape/presence, not exact timestamp values                                |


## Execution Sequencing

### Current position in the execution pipeline:

```
✅ Stage 1: Signal Ingestion
✅ Stage 2: Signal Log
✅ Stage 3: STATE Engine
✅ Stage 4: Decision Engine (all 322 tests passing)
✅ E2E Cycle Completion (graceful shutdown, commit clean)
→ POC v1 E2E Validation (THIS PLAN) ← you are here
   ↓
   Policy Expansion (v2, all 7 types) — DEFERRED, execute next
   ↓
   Repository Extraction (DEF-DEC-002) — DEFERRED, execute after policy expansion
   ↓
   Engine Decoupling (operator registry, hot-reload) — DEFERRED, execute during Phase 2 prep
   ↓
   Phase 2: AWS deployment
```

### Future: Engine Decoupling Improvements

These items were identified during the POC v1 review (policy↔code coupling analysis). They address the three coupling points where policy capabilities are currently hardcoded. **None are blockers for POC v1 or policy expansion.** Actionize when the trigger condition is met.


| Item                          | What                                                                                         | Trigger                                                           | Priority     | Plan                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------ | --------------------------------------- |
| Operator Registry             | Replace hardcoded `switch` in `evaluateCondition` with pluggable operator map                | When a new operator is needed (e.g., `between`, `in`, `contains`) | Low          | `policy-expansion.plan.md` §Future      |
| Policy Hot-Reload             | File watcher or API-triggered policy reload without server restart                           | Before multi-tenant production (Phase 2)                          | Medium       | `repository-extraction.plan.md` §Future |
| Self-Describing Policy Schema | Policy header declares required operators/combinators; engine validates support at load time | When supporting third-party policy authoring                      | Defer        | Not yet planned                         |
| Decision Types Closed Set     | Keep as-is (intentional contract guarantee)                                                  | N/A — adding an 8th type should require spec revision             | Don't change | N/A                                     |


**Reference**: `docs/foundation/ip-defensibility-and-value-proposition.md` §Canonical Fields: Ownership Boundary explains why 8P3P evaluates policy but does not compute canonical field values.

### When to execute `repository-extraction.plan.md`:

**After policy expansion, before Phase 2 AWS deployment.** Rationale:

1. **Policy expansion first** — it's pure configuration + test changes (zero code risk). Proves all 7 decision types work with the existing engine. If extraction goes wrong, you want the full policy test suite as a regression safety net.
2. **Repository extraction second** — it's a refactoring step that touches the store layer. Having all 7 DEC-008 vectors (9 cases) as guardrails makes the refactoring safe. The plan itself says: "Contract tests serve as migration guardrails."
3. **Phase 2 last** — extraction makes the DynamoDB swap mechanical. Don't pay the abstraction cost until the business logic is proven.

### Why policy expansion is deferred (not blocked):

The POC v1 single rule is sufficient to prove the chain works. Policy expansion adds coverage breadth (all 7 types) but doesn't validate anything new about the architecture. It can be executed independently whenever ready — the engine already supports all 7 types and compound conditions. The only changes are `default.json` and contract test vectors.

## Verification Checklist

- All tasks completed
- All tests pass (`npm test`)
- Linter passes (`npm run lint`)
- Type check passes (`npm run build`)
- E2E-001 through E2E-004 pass
- 3 learner payloads exercise rule-fire and default paths
- Spec↔code alignment documented with no remaining issues
- Execution sequencing documented for deferred plans

