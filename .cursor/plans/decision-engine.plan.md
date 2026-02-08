---
name: Decision Engine Implementation
overview: "Implement the Decision Engine (Stage 4 of 5) — the sole decision boundary in the control layer. Evaluates canonical learner state against a versioned compound-condition policy and emits deterministic, immutable decisions with full trace provenance including matched_rule_id. Covers: types, error codes, policy loader with recursive condition evaluator, SQLite decision store, request/decision validators, Ajv schema validator, core evaluateState() function, GET /v1/decisions endpoint, sync trigger integration, and all contract tests (DEC-001–DEC-008, OUT-API-001–OUT-API-003)."
todos:
  - id: TASK-001
    content: Add Decision Engine types to src/shared/types.ts
    status: completed
  - id: TASK-002
    content: Add Decision Engine error codes to src/shared/error-codes.ts
    status: completed
  - id: TASK-003
    content: Create policy loader with recursive condition evaluator
    status: completed
  - id: TASK-004
    content: Create Decision Store (SQLite)
    status: completed
  - id: TASK-005
    content: Create Decision Validator
    status: completed
  - id: TASK-006
    content: Create Decision JSON Schema + Ajv validator
    status: completed
  - id: TASK-007
    content: Create Decision Engine (evaluateState)
    status: completed
  - id: TASK-008
    content: Create Decision Handler + Routes (GET /v1/decisions)
    status: completed
  - id: TASK-009
    content: Server integration — wire stores, policy, routes
    status: completed
  - id: TASK-010
    content: Sync trigger — wire evaluateState into signal ingestion
    status: completed
  - id: TASK-011
    content: Unit tests — policy loader
    status: pending
  - id: TASK-012
    content: Unit tests — decision store
    status: pending
  - id: TASK-013
    content: Unit tests — decision validator
    status: pending
  - id: TASK-014
    content: Unit tests — decision engine
    status: pending
  - id: TASK-015
    content: Contract tests — DEC-001 through DEC-008
    status: pending
  - id: TASK-016
    content: Contract tests — OUT-API-001 through OUT-API-003
    status: pending
  - id: TASK-017
    content: Regression check — existing tests still pass
    status: pending
  - id: TASK-018
    content: Cleanup — delete docs/analyze/ directory
    status: pending
isProject: false
---

# Decision Engine Implementation

**Spec**: `docs/specs/decision-engine.md`

## Prerequisites

Before starting implementation:

- STATE Engine fully implemented and tests passing (Stage 3 complete)
- Signal Log and Signal Ingestion operational (Stages 1-2 complete)
- Decision Engine spec updated with compound conditions, canonical fields, DEC-008 test vectors
- `src/decision/policies/default.json` updated with POC v1 single-rule policy (stabilityScore 0.0–1.0, timeSinceReinforcement)

## Clarification Notes

- **Compound condition evaluator**: The recursive `all`/`any` tree walker is the most complex new logic. Implement and unit-test it first (TASK-003) before building the engine (TASK-007), since the engine depends on correct policy evaluation.
- **Sync trigger isolation**: Per spec, `evaluateState` failure must **not** fail signal ingestion. The integration (TASK-010) wraps the call in try/catch with warn-level logging, matching the existing `applySignals` pattern in `src/ingestion/handler.ts` lines 101-119.
- `**matched_rule_id` nullable**: The `trace_matched_rule_id` SQLite column is `TEXT` (nullable). In TypeScript, typed as `string | null`. The Ajv schema uses `{ "type": ["string", "null"] }`.
- **Page token encoding**: Reuse the same base64 cursor pattern from Signal Log handler (`src/signalLog/handler.ts`).
- `**:memory:` SQLite for tests**: All test suites use `:memory:` databases for speed and isolation, matching existing test patterns.

## Tasks

### TASK-001: Add Decision Engine types to src/shared/types.ts

- **Status**: pending
- **Files**: `src/shared/types.ts`
- **Action**: Modify
- **Depends on**: none
- **Details**:
Add the following types after the existing STATE Engine types section:
  ```typescript
  // ==========================================================================
  // Decision Engine Types (Stage 4)
  // ==========================================================================

  /** Leaf condition: compares a state field against a value */
  export interface ConditionLeaf {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
    value: string | number | boolean;
  }

  /** Compound AND condition */
  export interface ConditionAll {
    all: ConditionNode[];
  }

  /** Compound OR condition */
  export interface ConditionAny {
    any: ConditionNode[];
  }

  /** Recursive condition node (leaf | all | any) */
  export type ConditionNode = ConditionLeaf | ConditionAll | ConditionAny;

  /** Single policy rule */
  export interface PolicyRule {
    rule_id: string;
    condition: ConditionNode;
    decision_type: DecisionType;
  }

  /** Policy definition loaded from JSON */
  export interface PolicyDefinition {
    policy_id: string;
    policy_version: string;
    description: string;
    rules: PolicyRule[];
    default_decision_type: DecisionType;
  }

  /** Closed set of 7 decision types */
  export type DecisionType = 'reinforce' | 'advance' | 'intervene' | 'pause' | 'escalate' | 'recommend' | 'reroute';

  /** Runtime constant for decision type validation */
  export const DECISION_TYPES: readonly DecisionType[] = ['reinforce', 'advance', 'intervene', 'pause', 'escalate', 'recommend', 'reroute'] as const;

  /** Policy evaluation result */
  export interface PolicyEvaluationResult {
    decision_type: DecisionType;
    matched_rule_id: string | null;
  }

  /** Canonical Decision object */
  export interface Decision {
    org_id: string;
    decision_id: string;
    learner_reference: string;
    decision_type: DecisionType;
    decided_at: string;
    decision_context: Record<string, unknown>;
    trace: {
      state_id: string;
      state_version: number;
      policy_version: string;
      matched_rule_id: string | null;
    };
  }

  /** Request to evaluate state for a decision */
  export interface EvaluateStateForDecisionRequest {
    org_id: string;
    learner_reference: string;
    state_id: string;
    state_version: number;
    requested_at: string;
    evaluation_context?: Record<string, unknown>;
  }

  /** Discriminated outcome for evaluateState */
  export type EvaluateDecisionOutcome =
    | { ok: true; result: Decision }
    | { ok: false; errors: RejectionReason[] };

  /** Request for GET /v1/decisions */
  export interface GetDecisionsRequest {
    org_id: string;
    learner_reference: string;
    from_time: string;
    to_time: string;
    page_token?: string;
    page_size?: number;
  }

  /** Response for GET /v1/decisions */
  export interface GetDecisionsResponse {
    org_id: string;
    learner_reference: string;
    decisions: Decision[];
    next_page_token: string | null;
  }
  ```
- **Verification**: `npm run build` succeeds with no type errors

### TASK-002: Add Decision Engine error codes to src/shared/error-codes.ts

- **Status**: pending
- **Files**: `src/shared/error-codes.ts`
- **Action**: Modify
- **Depends on**: none
- **Details**:
Add after the STATE Engine section:
  ```typescript
  // ==========================================================================
  // Decision Engine Error Codes (Stage 4)
  // ==========================================================================

  /** Decision type not in closed set */
  INVALID_DECISION_TYPE: 'invalid_decision_type',

  /** decision_context is not a JSON object */
  DECISION_CONTEXT_NOT_OBJECT: 'decision_context_not_object',

  /** Trace field absent from decision */
  MISSING_TRACE: 'missing_trace',

  /** Trace references state that doesn't match evaluation input */
  TRACE_STATE_MISMATCH: 'trace_state_mismatch',

  /** No state exists for learner — cannot evaluate */
  STATE_NOT_FOUND: 'state_not_found',

  /** No policy loaded or available */
  POLICY_NOT_FOUND: 'policy_not_found',
  ```
- **Verification**: `npm run build` succeeds

### TASK-003: Create policy loader with recursive condition evaluator

- **Status**: pending
- **Files**: `src/decision/policy-loader.ts`
- **Action**: Create
- **Depends on**: TASK-001, TASK-002
- **Details**:
Implement three exported functions:
  1. `loadPolicy(policyPath?: string): PolicyDefinition` — Load JSON file, validate structure (all `decision_type` in closed set, all operators valid, `rule_id` unique, compound nodes have ≥2 children, no mixed leaf/compound). Default path: `process.env.DECISION_POLICY_PATH ?? path.join(process.cwd(), 'src/decision/policies/default.json')`. Cache the loaded policy in a module-level variable.
  2. `evaluatePolicy(state: Record<string, unknown>, policy: PolicyDefinition): PolicyEvaluationResult` — Walk rules in order. For each rule, call `evaluateCondition(state, rule.condition)`. If match → return `{ decision_type: rule.decision_type, matched_rule_id: rule.rule_id }`. No match → return `{ decision_type: policy.default_decision_type, matched_rule_id: null }`.
  3. `getLoadedPolicyVersion(): string` — Return cached policy version.
  Internal helper: `evaluateCondition(state: Record<string, unknown>, node: ConditionNode): boolean`
  - Leaf: read `state[node.field]`, compare against `node.value` using `node.operator`. Undefined field → `false`. Non-numeric operands for gt/gte/lt/lte → `false`. eq/neq use strict `===`/`!==`.
  - `all`: every child must return `true` (short-circuit on `false`)
  - `any`: at least one child must return `true` (short-circuit on `true`)
  Follow the module-level singleton pattern from `src/state/store.ts` for policy caching.
- **Verification**: `npm run build` succeeds. Manually test with `default.json` loading.

### TASK-004: Create Decision Store (SQLite)

- **Status**: pending
- **Files**: `src/decision/store.ts`
- **Action**: Create
- **Depends on**: TASK-001, TASK-002
- **Details**:
Follow the `src/state/store.ts` pattern exactly:
  - Module-level singleton `let db: Database.Database | null = null`
  - `initDecisionStore(dbPath: string): void` — Create table per spec (including `trace_matched_rule_id TEXT` nullable column), create index on `(org_id, learner_reference, decided_at)`, enable WAL mode
  - `saveDecision(decision: Decision): void` — Insert. Serialize `decision_context` as JSON string. Map `trace.*` to flat columns.
  - `getDecisions(request: GetDecisionsRequest): { decisions: Decision[]; hasMore: boolean; nextCursor?: number }` — Query by `(org_id, learner_reference)` with `decided_at BETWEEN from_time AND to_time`, ordered by `decided_at ASC, id ASC`. Cursor-based pagination: fetch `page_size + 1`, check hasMore, return nextCursor as the `id` of the extra row.
  - `getDecisionById(orgId: string, decisionId: string): Decision | null` — Single lookup.
  - `closeDecisionStore(): void`
  - `clearDecisionStore(): void` — Testing only.
  - Internal `rowToDecision(row): Decision` helper — Deserialize `decision_context` from JSON, reconstruct `trace` object from flat columns.
- **Verification**: `npm run build` succeeds.

### TASK-005: Create Decision Validator

- **Status**: pending
- **Files**: `src/decision/validator.ts`
- **Action**: Create
- **Depends on**: TASK-001, TASK-002
- **Details**:
Follow `src/state/validator.ts` pattern:
  1. `validateEvaluateRequest(request: unknown): ValidationResult` — Check: `org_id` present and non-blank (`org_scope_required`), `learner_reference` present (`missing_required_field`), `state_id` present (`missing_required_field`), `state_version` present and is number (`missing_required_field`).
  2. `validateDecisionContext(context: unknown): ValidationResult` — Must be non-null object, not array (`decision_context_not_object`). Run `detectForbiddenKeys(context, 'decision_context')` → `forbidden_semantic_key_detected`.
  3. `validateDecisionType(type: string): ValidationResult` — Check `DECISION_TYPES.includes(type)` → `invalid_decision_type`.
  4. `validateGetDecisionsRequest(params: unknown): ValidationResult & { parsed?: GetDecisionsRequest }` — Validate `org_id`, `learner_reference`, `from_time`/`to_time` (RFC3339, range valid), `page_size` (1–1000), `page_token`. Reuse patterns from Signal Log query validation. Return parsed request on success.
- **Verification**: `npm run build` succeeds.

### TASK-006: Create Decision JSON Schema + Ajv validator

- **Status**: pending
- **Files**: `src/contracts/schemas/decision.json`, `src/contracts/validators/decision.ts`
- **Action**: Create both files
- **Depends on**: TASK-001
- **Details**:
**decision.json** — JSON Schema Draft 07:
  - Required: `org_id`, `decision_id`, `learner_reference`, `decision_type`, `decided_at`, `decision_context`, `trace`
  - `decision_type`: enum with 7 values
  - `trace`: object with required `state_id` (string), `state_version` (integer), `policy_version` (string), `matched_rule_id` (type: `["string", "null"]`). `additionalProperties: false`.
  - `decision_context`: type object
  - `additionalProperties: false` at root
  **decision.ts** — Follow `src/contracts/validators/signal-envelope.ts` pattern:
  - Import schema with `import schema from '../schemas/decision.json' with { type: 'json' }`
  - Compile with Ajv
  - Export `validateDecision(data: unknown): ValidationResult`
  - Map Ajv errors to canonical codes: `invalid_decision_type`, `decision_context_not_object`, `missing_trace`
- **Verification**: `npm run build` succeeds. `npm run validate:schemas` passes.

### TASK-007: Create Decision Engine (evaluateState)

- **Status**: pending
- **Files**: `src/decision/engine.ts`
- **Action**: Create
- **Depends on**: TASK-003, TASK-004, TASK-005, TASK-006
- **Details**:
Implement `evaluateState(request: EvaluateStateForDecisionRequest): EvaluateDecisionOutcome`:
  1. Validate request via `validateEvaluateRequest` → reject if invalid
  2. Fetch state via `getState(org_id, learner_reference)` from `src/state/store.js`
  3. If null → `{ ok: false, errors: [{ code: STATE_NOT_FOUND }] }`
  4. If `state.state_id !== request.state_id || state.state_version !== request.state_version` → `trace_state_mismatch`
  5. Get cached policy version via `getLoadedPolicyVersion()`. If no policy → `policy_not_found`.
  6. Call `evaluatePolicy(state.state, loadedPolicy)` → get `{ decision_type, matched_rule_id }`
  7. Build `decision_context: {}` (empty object for Phase 1)
  8. Validate decision context via `validateDecisionContext`
  9. Construct `Decision` object: generate UUID for `decision_id`, `decided_at = new Date().toISOString()`, attach trace with `state_id`, `state_version`, `policy_version`, `matched_rule_id`
  10. Save via `saveDecision(decision)`
  11. Return `{ ok: true, result: decision }`
  Use `crypto.randomUUID()` for decision_id generation.
  Follow `src/state/engine.ts` patterns: never throw on rejection, return discriminated outcome.
  Also export `loadedPolicy` getter or use `getLoadedPolicy()` from policy-loader so tests can verify policy is loaded.
- **Verification**: `npm run build` succeeds.

### TASK-008: Create Decision Handler + Routes (GET /v1/decisions)

- **Status**: pending
- **Files**: `src/decision/handler.ts`, `src/decision/routes.ts`
- **Action**: Create both files
- **Depends on**: TASK-004, TASK-005
- **Details**:
**handler.ts** — Follow `src/signalLog/handler.ts` pattern:
  - `handleGetDecisions(request: FastifyRequest, reply: FastifyReply): Promise<GetDecisionsResponse | ErrorResponse>`
  - Parse query params, validate via `validateGetDecisionsRequest`
  - On validation failure: `reply.status(400)`, return error object with `code`, `message`, `field_path`
  - On success: call `getDecisions(parsed)`, build response with `next_page_token` encoding
  - Page token encode/decode: reuse same base64 cursor pattern as Signal Log
  **routes.ts** — Follow `src/signalLog/routes.ts` pattern:
  - `registerDecisionRoutes(app: FastifyInstance): void`
  - Register `app.get('/decisions', handleGetDecisions)`
- **Verification**: `npm run build` succeeds.

### TASK-009: Server integration — wire stores, policy, routes

- **Status**: pending
- **Files**: `src/server.ts`
- **Action**: Modify
- **Depends on**: TASK-003, TASK-004, TASK-008
- **Details**:
  1. Add imports: `initDecisionStore`, `closeDecisionStore` from `./decision/store.js`; `loadPolicy` from `./decision/policy-loader.js`; `registerDecisionRoutes` from `./decision/routes.js`
  2. Add `DECISION_DB_PATH` env var: `const decisionDbPath = process.env.DECISION_DB_PATH ?? './data/decisions.db'`
  3. Call `initDecisionStore(decisionDbPath)` after `initStateStore`
  4. Call `loadPolicy()` after store init, before route registration — `evaluateState` depends on cached policy
  5. Uncomment line 86: `registerDecisionRoutes(v1)` (remove the comment)
  6. Add `closeDecisionStore()` to graceful shutdown handler if one exists
- **Verification**: `npm run dev` starts without errors. `GET /v1/decisions?org_id=test&learner_reference=test&from_time=2024-01-01T00:00:00Z&to_time=2025-01-01T00:00:00Z` returns empty `decisions[]`.

### TASK-010: Sync trigger — wire evaluateState into signal ingestion

- **Status**: pending
- **Files**: `src/ingestion/handler.ts`
- **Action**: Modify
- **Depends on**: TASK-007, TASK-009
- **Details**:
After the existing `applySignals` block (around line 119), add a decision evaluation block:
  ```typescript
  // Step 4c: Evaluate state for decision (Decision Engine).
  // On rejection or throw we log and continue — ingestion must not fail due to decision evaluation.
  if (applyOutcome.ok) {
    try {
      const evalRequest: EvaluateStateForDecisionRequest = {
        org_id: signal.org_id,
        learner_reference: signal.learner_reference,
        state_id: applyOutcome.result.state_id,
        state_version: applyOutcome.result.new_state_version,
        requested_at: new Date().toISOString(),
      };
      const decisionOutcome = evaluateState(evalRequest);
      if (!decisionOutcome.ok) {
        request.log?.warn?.(
          { err: decisionOutcome.errors, org_id: signal.org_id, signal_id: signal.signal_id },
          'evaluateState rejected after applySignals; signal and state remain intact'
        );
      }
    } catch (err) {
      request.log?.warn?.(
        { err, org_id: signal.org_id, signal_id: signal.signal_id },
        'evaluateState threw after applySignals; signal and state remain intact'
      );
    }
  }
  ```
  Import `evaluateState` from `../decision/engine.js` and `EvaluateStateForDecisionRequest` from `../shared/types.js`.
- **Verification**: `npm run build` succeeds. Send a signal via POST and verify a decision is created (via GET /v1/decisions).

### TASK-011: Unit tests — policy loader

- **Status**: pending
- **Files**: `tests/unit/policy-loader.test.ts`
- **Action**: Create
- **Depends on**: TASK-003
- **Details**:
Test cases:
  - `loadPolicy()` loads default.json successfully, returns valid PolicyDefinition
  - `loadPolicy()` with missing file throws with `policy_not_found`
  - `loadPolicy()` with invalid JSON throws
  - `loadPolicy()` with invalid decision_type in rule throws
  - `loadPolicy()` with duplicate rule_ids throws
  - `evaluateCondition` leaf: eq/neq/gt/gte/lt/lte with numbers, strings, booleans
  - `evaluateCondition` leaf: undefined field → false
  - `evaluateCondition` leaf: non-numeric operand with gt/gte/lt/lte → false
  - `evaluateCondition` all: all match → true, one fails → false, short-circuits
  - `evaluateCondition` any: one match → true, none match → false, short-circuits
  - `evaluateCondition` nested: all containing any
  - `evaluatePolicy` first match wins (ordering matters)
  - `evaluatePolicy` no match → default_decision_type with null matched_rule_id
  - `evaluatePolicy` returns correct matched_rule_id
  - `getLoadedPolicyVersion()` returns cached version
- **Verification**: `npm run test:unit -- policy-loader` passes.

### TASK-012: Unit tests — decision store

- **Status**: pending
- **Files**: `tests/unit/decision-store.test.ts`
- **Action**: Create
- **Depends on**: TASK-004
- **Details**:
Follow `tests/unit/state-store.test.ts` pattern with `:memory:` SQLite:
  - `saveDecision` and `getDecisionById` round-trip
  - `saveDecision` with duplicate `decision_id` throws (immutability)
  - `getDecisions` time-range query returns correct results
  - `getDecisions` pagination: hasMore/nextCursor behavior
  - `getDecisions` org isolation: org A decisions not visible to org B
  - `getDecisions` empty result set
  - `trace.matched_rule_id` null round-trip
  - `decision_context` JSON serialization round-trip
- **Verification**: `npm run test:unit -- decision-store` passes.

### TASK-013: Unit tests — decision validator

- **Status**: pending
- **Files**: `tests/unit/decision-validator.test.ts`
- **Action**: Create
- **Depends on**: TASK-005
- **Details**:
Follow `tests/unit/state-validator.test.ts` pattern:
  - `validateEvaluateRequest`: valid request passes, missing org_id → `org_scope_required`, missing learner_reference/state_id/state_version → `missing_required_field`
  - `validateDecisionContext`: valid object passes, array → `decision_context_not_object`, forbidden key → `forbidden_semantic_key_detected`
  - `validateDecisionType`: all 7 valid types pass, invalid type → `invalid_decision_type`
  - `validateGetDecisionsRequest`: valid request passes, time range errors, pagination errors
- **Verification**: `npm run test:unit -- decision-validator` passes.

### TASK-014: Unit tests — decision engine

- **Status**: pending
- **Files**: `tests/unit/decision-engine.test.ts`
- **Action**: Create
- **Depends on**: TASK-007
- **Details**:
Follow `tests/unit/state-engine.test.ts` pattern with `:memory:` stores:
  - `evaluateState` with valid request returns `{ ok: true, result: Decision }`
  - Decision has correct trace (state_id, state_version, policy_version, matched_rule_id)
  - Missing org_id → `{ ok: false, errors: [org_scope_required] }`
  - Missing learner_reference → `{ ok: false, errors: [missing_required_field] }`
  - State not found → `{ ok: false, errors: [state_not_found] }`
  - State version mismatch → `{ ok: false, errors: [trace_state_mismatch] }`
  - Decision is persisted (retrievable via getDecisionById after evaluateState)
  - Determinism: same input twice → same decision_type (DEC-006 unit-level)
- **Verification**: `npm run test:unit -- decision-engine` passes.

### TASK-015: Contract tests — DEC-001 through DEC-008

- **Status**: pending
- **Files**: `tests/contracts/decision-engine.test.ts`
- **Action**: Create
- **Depends on**: TASK-007, TASK-010
- **Details**:
Full integration contract tests per spec §Contract Tests. Setup: init all stores (`:memory:`), load policy, create state via `applySignals` with canonical field payloads.
**DEC-001**: Happy path — apply signal with canonical fields, evaluateState, verify Decision shape + trace.
**DEC-002**: `validateDecisionType('promote')` → rejected, `invalid_decision_type`.
**DEC-003**: `validateDecisionContext([])` → rejected, `decision_context_not_object`.
**DEC-004**: `validateDecisionContext({ task: { assignee: 'bob' } })` → rejected, `forbidden_semantic_key_detected`.
**DEC-005**: Ajv schema validation on Decision missing trace → rejected, `missing_trace`.
**DEC-006**: Evaluate same state twice → identical `decision_type` and `matched_rule_id`.
**DEC-007**: evaluateState with wrong state_version → `trace_state_mismatch`.
**DEC-008**: Parameterized 3 cases (8a–8c) per spec test vectors table (POC v1: single rule + default). For each: apply signal payload → evaluateState → assert `decision_type` and `trace.matched_rule_id`.
- **Verification**: `npm run test:contracts -- decision-engine` passes.

### TASK-016: Contract tests — OUT-API-001 through OUT-API-003

- **Status**: pending
- **Files**: `tests/contracts/output-api.test.ts`
- **Action**: Create
- **Depends on**: TASK-008, TASK-009
- **Details**:
HTTP-level tests using `app.inject()` (follow `tests/contracts/signal-ingestion.test.ts` pattern):
**OUT-API-001**: Create decisions, then GET /v1/decisions with valid params → 200 with decisions array.
**OUT-API-002**: GET with `from_time > to_time` → 400, `invalid_time_range`.
**OUT-API-003**: GET with page_size=1 → get first page + next_page_token, GET with token → same results as direct query for page 2. Verify deterministic ordering.
- **Verification**: `npm run test:contracts -- output-api` passes.

### TASK-017: Regression check — existing tests still pass

- **Status**: pending
- **Files**: none (verification only)
- **Action**: Verify
- **Depends on**: TASK-010
- **Details**:
Run full test suite: `npm test`. Verify:
  - All existing signal ingestion contract tests pass
  - All existing signal log contract tests pass
  - All existing state engine contract tests pass
  - All existing unit tests pass
  - No type errors: `npm run build`
  - Linter passes: `npm run lint`
- **Verification**: `npm test` exits 0. `npm run build` exits 0. `npm run lint` exits 0.

### TASK-018: Cleanup — delete docs/analyze/ directory

- **Status**: pending
- **Files**: `docs/analyze/decision-governance-evaluation.md`, `docs/analyze/policy-suggestion.md`
- **Action**: Delete
- **Depends on**: TASK-017
- **Details**:
Delete the `docs/analyze/` directory and all files inside it to reduce confusion. The analysis documents have been incorporated into the spec (`docs/specs/decision-engine.md`):
  - `decision-governance-evaluation.md` → resolved in ISS-DGE-* binding decisions
  - `policy-suggestion.md` → incorporated into §4.6 PolicyDefinition, §4.7 Canonical State Fields, and default.json
  Run: `rm -rf docs/analyze/`
- **Verification**: `ls docs/analyze/` fails (directory does not exist).

## Files Summary

### To Create


| File                                      | Task     | Purpose                                                   |
| ----------------------------------------- | -------- | --------------------------------------------------------- |
| `src/decision/policy-loader.ts`           | TASK-003 | Policy loading, validation, recursive condition evaluator |
| `src/decision/store.ts`                   | TASK-004 | SQLite decision storage (init, save, get, close, clear)   |
| `src/decision/validator.ts`               | TASK-005 | Request and decision validation                           |
| `src/contracts/schemas/decision.json`     | TASK-006 | JSON Schema for Decision object                           |
| `src/contracts/validators/decision.ts`    | TASK-006 | Ajv-compiled Decision validator                           |
| `src/decision/engine.ts`                  | TASK-007 | Core evaluateState() function                             |
| `src/decision/handler.ts`                 | TASK-008 | GET /v1/decisions route handler                           |
| `src/decision/routes.ts`                  | TASK-008 | Fastify route registration                                |
| `tests/unit/policy-loader.test.ts`        | TASK-011 | Policy loader unit tests                                  |
| `tests/unit/decision-store.test.ts`       | TASK-012 | Decision store unit tests                                 |
| `tests/unit/decision-validator.test.ts`   | TASK-013 | Decision validator unit tests                             |
| `tests/unit/decision-engine.test.ts`      | TASK-014 | Decision engine unit tests                                |
| `tests/contracts/decision-engine.test.ts` | TASK-015 | DEC-001–DEC-008 contract tests                            |
| `tests/contracts/output-api.test.ts`      | TASK-016 | OUT-API-001–OUT-API-003 output API tests                  |


### To Modify


| File                        | Task     | Changes                                                                     |
| --------------------------- | -------- | --------------------------------------------------------------------------- |
| `src/shared/types.ts`       | TASK-001 | Add Decision Engine types (Decision, PolicyDefinition, ConditionNode, etc.) |
| `src/shared/error-codes.ts` | TASK-002 | Add 6 Decision Engine error codes                                           |
| `src/server.ts`             | TASK-009 | Init decision store, load policy, register routes                           |
| `src/ingestion/handler.ts`  | TASK-010 | Add evaluateState sync trigger after applySignals                           |


### To Delete


| File                                             | Task     | Reason                 |
| ------------------------------------------------ | -------- | ---------------------- |
| `docs/analyze/decision-governance-evaluation.md` | TASK-018 | Incorporated into spec |
| `docs/analyze/policy-suggestion.md`              | TASK-018 | Incorporated into spec |


## Test Plan


| Test ID     | Type     | Description                                                    | Task     |
| ----------- | -------- | -------------------------------------------------------------- | -------- |
| —           | unit     | Policy loader: condition evaluation, loading, validation       | TASK-011 |
| —           | unit     | Decision store: CRUD, pagination, isolation                    | TASK-012 |
| —           | unit     | Decision validator: request/context/type validation            | TASK-013 |
| —           | unit     | Decision engine: evaluateState outcomes                        | TASK-014 |
| DEC-001     | contract | Evaluate Decision Happy Path                                   | TASK-015 |
| DEC-002     | contract | Closed Decision Type Enforcement                               | TASK-015 |
| DEC-003     | contract | decision_context Must Be Object                                | TASK-015 |
| DEC-004     | contract | Forbidden Semantic Keys in decision_context                    | TASK-015 |
| DEC-005     | contract | Trace Required                                                 | TASK-015 |
| DEC-006     | contract | Deterministic Decision Output                                  | TASK-015 |
| DEC-007     | contract | Trace-State Mismatch                                           | TASK-015 |
| DEC-008     | contract | Traceability per decision type (3 parameterized cases, POC v1) | TASK-015 |
| OUT-API-001 | contract | GetDecisions Happy Path                                        | TASK-016 |
| OUT-API-002 | contract | Invalid Time Range                                             | TASK-016 |
| OUT-API-003 | contract | Paging Determinism                                             | TASK-016 |


## Risks


| Risk                                                                       | Impact | Mitigation                                                                                                                                                                          |
| -------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recursive condition evaluator has edge cases (deep nesting, type coercion) | Medium | Extensive unit tests in TASK-011 cover all operator types, undefined fields, type mismatches                                                                                        |
| Sync trigger adds latency to signal ingestion                              | Low    | evaluateState is synchronous SQLite; sub-millisecond on `:memory:`. Production may need async (Phase 2 concern)                                                                     |
| Page token compatibility with Signal Log pattern                           | Low    | Reuse exact same encode/decode functions                                                                                                                                            |
| `matched_rule_id` null handling in JSON schema                             | Low    | Use `{ "type": ["string", "null"] }` in JSON Schema Draft 07                                                                                                                        |
| Policy file path resolution differs between dev/test/prod                  | Medium | Use `process.env.DECISION_POLICY_PATH` with `process.cwd()` fallback. Tests load policy via explicit path or default.                                                               |
| Existing tests break due to new imports in handler.ts                      | Low    | The evaluateState call is wrapped in try/catch. If decision store not init'd in existing test setup, it throws and is caught. But better to explicitly check — covered in TASK-017. |


## Verification Checklist

- All tasks completed
- All tests pass (`npm test`)
- Linter passes (`npm run lint`)
- Type check passes (`npm run build`)
- All DEC-001–DEC-008 contract tests pass
- All OUT-API-001–OUT-API-003 contract tests pass
- Existing signal/state tests still pass (no regression)
- `docs/analyze/` directory deleted
- Matches spec requirements in `docs/specs/decision-engine.md`

## Implementation Order

```
TASK-001 (types) ──→ TASK-003 (policy-loader) ──→ TASK-007 (engine) ──→ TASK-010 (sync trigger) ──→ TASK-017 (regression)
                 ↗                                                ↗                                          ↓
TASK-002 (codes) ──→ TASK-004 (store) ──→ TASK-008 (handler) ──→ TASK-009 (server) ──────────────→ TASK-018 (cleanup)
                 ↘                    ↗
                  → TASK-005 (validator)
                  → TASK-006 (schema)

Unit tests run after their implementation task:
TASK-003 → TASK-011 (policy-loader tests)
TASK-004 → TASK-012 (store tests)
TASK-005 → TASK-013 (validator tests)
TASK-007 → TASK-014 (engine tests)

Contract tests run after integration:
TASK-010 → TASK-015 (DEC-001–DEC-008)
TASK-009 → TASK-016 (OUT-API-001–OUT-API-003)
```

