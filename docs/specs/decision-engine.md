# Decision Engine Specification

> Derived from Component Interface Contracts §4–§5, Contract Test Matrix §5–§6, Interface Validation Ruleset, and ISS-DGE architectural decisions.

## Overview

The Decision Engine evaluates canonical learner state against versioned policy and emits **deterministic, immutable decisions** with full trace provenance. It is the sole decision boundary in the control layer — decisions are derived exclusively from STATE evaluation, never from raw signals or external input. Decisions are first-class outputs: emitted via API and events, but **never enforced** in downstream systems.

**Lifecycle Position:** Stage 4 of 5 (Ingestion → Signal Log → STATE Engine → **Decision Engine** → Output)

## Core Principle: STATE-Derived Decisions

The PRD mandates that decisions are "derived exclusively from STATE evaluation." This means:

- Signals do not directly produce decisions
- STATE storage alone does not produce decisions — evaluation against policy is required
- The Decision Engine is the only legitimate decision boundary
- Decisions are immutable records with deterministic output: same STATE (id + version) + same policy version → same decision

## Architectural Decisions (Binding)

These decisions were resolved before implementation (ISS-DGE series) and are **binding**:

| ISS ID | Decision | Rationale |
|--------|----------|-----------|
| ISS-DGE-001 | **Full 7-type closed set** (`reinforce \| advance \| intervene \| pause \| escalate \| recommend \| reroute`) | Defined in OpenAPI, Contract Test Matrix, Component Interface Contracts §0.3 |
| ISS-DGE-002 | **JSON policy files** with compound condition support, loaded at runtime, versioned. | Runtime-loaded JSON keeps policy separate from code. Compound conditions (`all`/`any`) enable multi-field evaluation while remaining declarative and data-driven. |
| ISS-DGE-003 | **Embedded trace** in Decision record (Phase 1). Trace includes `policy_version`. Evolve to separate trace store later if auditing needs grow. | Aligns with OpenAPI `Decision.trace` schema. Minimizes storage complexity. |
| ISS-DGE-004 | **Keep "Decision Engine"** everywhere (code: `src/decision/`, routes, specs). "Decision Governance" used only in doctrine/rationale docs. | Avoids rename tax across 10+ artifacts. |
| ISS-DGE-005 | **Both triggers**: sync chaining (applySignals → evaluateState) as default, plus on-demand evaluate function for ad-hoc queries. | Sync completes the lifecycle automatically; on-demand supports re-evaluation and testing. |
| ISS-DGE-008 | **Evaluation context** defined as optional input to `evaluateState()` (time, triggering event ref). | Keeps interface extensible without breaking callers. |

## Data Schemas

### 4.1 Decision

The canonical decision object. Matches the OpenAPI `Decision` schema with the addition of `policy_version` and `matched_rule_id` in trace.

```json
{
  "org_id": "string",
  "decision_id": "string",
  "learner_reference": "string",
  "decision_type": "reinforce | advance | intervene | pause | escalate | recommend | reroute",
  "decided_at": "string (RFC3339)",
  "decision_context": {},
  "trace": {
    "state_id": "string",
    "state_version": "integer",
    "policy_version": "string",
    "matched_rule_id": "string | null"
  }
}
```

#### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `org_id` | string | Tenant identifier (1–128 characters) |
| `decision_id` | string | Unique identifier for this decision (UUID) |
| `learner_reference` | string | Learner identifier (1–256 characters) |
| `decision_type` | string | One of 7 closed-set types (see §4.5) |
| `decided_at` | string | When the decision was made (RFC3339) |
| `decision_context` | object | Opaque, downstream-neutral context (no domain semantics) |
| `trace.state_id` | string | ID of the state snapshot used for evaluation |
| `trace.state_version` | integer | Version of the state snapshot used for evaluation |
| `trace.policy_version` | string | Version of the policy used to produce this decision |
| `trace.matched_rule_id` | string or null | ID of the policy rule that fired. `null` when `default_decision_type` was used (no rule matched). Enables per-rule traceability. |

### 4.2 EvaluateStateForDecisionRequest (Internal Invocation)

From Component Interface Contracts §4.1, extended with optional `evaluation_context` per ISS-DGE-008.

```json
{
  "org_id": "string",
  "learner_reference": "string",
  "state_id": "string",
  "state_version": "integer",
  "requested_at": "string (RFC3339)",
  "evaluation_context": {}
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `org_id` | string | Yes | Tenant identifier |
| `learner_reference` | string | Yes | Learner identifier |
| `state_id` | string | Yes | State snapshot to evaluate |
| `state_version` | integer | Yes | State version to evaluate |
| `requested_at` | string | Yes | When evaluation was requested (RFC3339) |
| `evaluation_context` | object | No | Optional context (time, triggering event ref). **Phase 1 note:** accepted and stored but not consumed by the evaluation flow. Included now to keep the interface stable for future extensibility (e.g., time-based policies, event-triggered re-evaluation). |

### 4.3 EvaluateDecisionOutcome (Discriminated Result)

`evaluateState` returns a discriminated outcome rather than throwing on rejection. Consumers **must** inspect the `ok` field before accessing results. Follows the same pattern as `ApplySignalsOutcome`.

**Success:**

```json
{
  "ok": true,
  "result": "Decision (see 4.1)"
}
```

**Rejection:**

```json
{
  "ok": false,
  "errors": [
    {
      "code": "string (canonical error code)",
      "message": "string (human-readable description)",
      "field_path": "string | undefined (dot-delimited path to offending field)"
    }
  ]
}
```

Each entry in the `errors` array is a `RejectionReason` (defined in `src/shared/types.ts`).

**Determinism requirement (per foundation G4):** Identical invalid input must always produce the same error code and field_path, excluding timestamps. Callers should not rely on error message text for branching; use `code` exclusively.

**Error codes returned by `evaluateState()` (request validation and runtime checks):**

| Code | Trigger |
|------|---------|
| `org_scope_required` | `org_id` missing or blank |
| `missing_required_field` | `learner_reference`, `state_id`, or `state_version` missing |
| `state_not_found` | No state exists for learner (cannot evaluate) |
| `trace_state_mismatch` | State coordinates in store don't match request (`state_id` or `state_version` diverged) |
| `policy_not_found` | No policy loaded or available |

**Error codes for Decision object validation (Ajv validator / safety-net checks):**

These codes validate the structural integrity of `Decision` objects. Since the engine produces decisions by construction, these serve as defense-in-depth guards and are used by the Ajv schema validator (`src/contracts/validators/decision.ts`):

| Code | Trigger |
|------|---------|
| `invalid_decision_type` | Decision type not in closed set |
| `decision_context_not_object` | `decision_context` is not a plain object |
| `forbidden_semantic_key_detected` | Forbidden key in `decision_context` |
| `missing_trace` | Trace field absent from decision |

### Consumer Contract

Internal consumers (Output Interfaces, future pipeline stages) **must** follow these rules when handling `EvaluateDecisionOutcome`:

- **Pattern-match on `ok`** before accessing `result` or `errors`. Never assume success.
- **Branch on `code`, not `message`** — error message text is informational and may change; use `code` exclusively for control flow.
- **Log full `errors` array** when `ok === false`, and propagate the first error's `code` for upstream reporting.

### 4.4 GetDecisionsRequest / GetDecisionsResponse (Output API)

From Component Interface Contracts §5.

**GetDecisionsRequest** (query parameters for `GET /v1/decisions`):

| Parameter | Type | Required | Constraints |
|-----------|------|----------|-------------|
| `org_id` | string | Yes | 1–128 characters |
| `learner_reference` | string | Yes | 1–256 characters |
| `from_time` | string | Yes | RFC3339 format |
| `to_time` | string | Yes | RFC3339 format, must be >= from_time |
| `page_token` | string | No | Opaque pagination token |
| `page_size` | integer | No | 1–1000, default 100 |

**GetDecisionsResponse:**

```json
{
  "org_id": "string",
  "learner_reference": "string",
  "decisions": [
    "Decision (see 4.1)"
  ],
  "next_page_token": "string | null"
}
```

### 4.5 Decision Types (Closed Set)

Seven types only. No additions without spec revision.

| Decision Type | Description |
|--------------|-------------|
| `reinforce` | Continue current learning path |
| `advance` | Progress to next level |
| `intervene` | Require assistance |
| `pause` | Temporary hold |
| `escalate` | Elevate to human review |
| `recommend` | Suggest content |
| `reroute` | Change learning path |

Runtime constant: `DECISION_TYPES = ['reinforce', 'advance', 'intervene', 'pause', 'escalate', 'recommend', 'reroute']`

### 4.6 PolicyDefinition

Schema for JSON policy files (ISS-DGE-002). Supports compound conditions via recursive `all`/`any` combinators, enabling multi-field evaluation while keeping policy declarative and data-driven.

```json
{
  "policy_id": "string",
  "policy_version": "string (semver)",
  "description": "string",
  "rules": [
    {
      "rule_id": "string (unique within policy)",
      "condition": "ConditionNode (see below)",
      "decision_type": "string (one of 7 types)"
    }
  ],
  "default_decision_type": "string (one of 7 types)"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `policy_id` | string | Unique policy identifier |
| `policy_version` | string | Semver version, recorded in every decision trace |
| `description` | string | Human-readable description |
| `rules` | array | Ordered list of condition→decision mappings. First match wins. |
| `rules[].rule_id` | string | Unique identifier for this rule within the policy. Recorded in `trace.matched_rule_id`. |
| `rules[].condition` | ConditionNode | Condition tree to evaluate against state (see §4.6.1) |
| `rules[].decision_type` | string | Decision type to emit if condition matches |
| `default_decision_type` | string | Fallback decision type when no rules match. `trace.matched_rule_id` is `null` in this case. |

#### 4.6.1 ConditionNode (Recursive)

A `ConditionNode` is either a **leaf comparison** or a **compound combinator**. This enables arbitrary AND/OR logic over state fields while remaining JSON-serializable.

**Leaf node** — compares a single state field against a value:

```json
{
  "field": "string (state field name)",
  "operator": "eq | neq | gt | gte | lt | lte",
  "value": "string | number | boolean"
}
```

**Compound node (AND)** — all children must match:

```json
{
  "all": [ "ConditionNode", "ConditionNode", "..." ]
}
```

**Compound node (OR)** — at least one child must match:

```json
{
  "any": [ "ConditionNode", "ConditionNode", "..." ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `field` | string | State field name to evaluate (leaf only) |
| `operator` | string | Comparison operator: `eq`, `neq`, `gt`, `gte`, `lt`, `lte` (leaf only) |
| `value` | string, number, or boolean | Value to compare against. Supports numeric thresholds (`stabilityScore`, `timeSinceReinforcement`), strings, and booleans. (leaf only) |
| `all` | array of ConditionNode | Logical AND — every child must evaluate to true (compound only) |
| `any` | array of ConditionNode | Logical OR — at least one child must evaluate to true (compound only) |

**Type constraints:**
- A ConditionNode must be exactly one of: leaf (`field` + `operator` + `value`), `all` combinator, or `any` combinator. Mixing leaf fields with combinators in the same node is invalid.
- Compound nodes must contain at least 2 children.
- Nesting depth is unlimited but should be kept shallow for readability (recommended max: 3 levels).

### 4.7 Canonical State Fields (POC v2)

The default policy evaluates against these canonical state fields. All numeric scores use **0.0–1.0 scale** to match `masteryScore` and avoid cross-system confusion. Phase 1 assumes signals produce these fields directly; Phase 2 introduces a normalization layer to map vendor-specific payloads to this canonical schema (see DEF-DEC-006).

**POC v2 scope:** The default policy actively evaluates all 5 canonical fields below across its priority-ordered rule set. Missing fields evaluate to `false` at the leaf level, so callers can still send partial payloads without breaking evaluation (but may fall through to defaults).

| Field | Type | Range / Values | Description |
|-------|------|---------------|-------------|
| `stabilityScore` | number | 0.0–1.0 | Composite measure of learner stability in current path |
| `masteryScore` | number | 0.0–1.0 | Current mastery score for the learner |
| `timeSinceReinforcement` | number | >= 0 (seconds) | Elapsed time since last reinforcement event |
| `confidenceInterval` | number | 0.0–1.0 | System confidence in the learner assessment (derived) |
| `riskSignal` | number | 0.0–1.0 | Risk of knowledge/skill regression (derived) |

> **Signal payload contract (Phase 1 / POC v2):** For Phase 1, signal payloads should include these fields directly when possible (e.g., `{ "stabilityScore": 0.65, "masteryScore": 0.72, "timeSinceReinforcement": 90000, "confidenceInterval": 0.8, "riskSignal": 0.2 }`). The STATE Engine deep-merges payloads into state, making these fields available for policy evaluation. Phase 2 will introduce tenant-scoped field mappings so source systems can use their own terminology (see DEF-DEC-006).

## Core Constraints

### Determinism

- Same `(state_id, state_version, policy_version)` → same `decision_type` and semantically equivalent `decision_context`
- Decisions can be reproduced by replaying evaluation against the same state snapshot and policy version
- Concurrent evaluations for the same input produce identical decisions

### Immutability

- **No UPDATE operations** — Decision records cannot be modified after creation
- **No DELETE operations** — Decision records cannot be removed
- **Append-only** — Only INSERT operations are allowed

### Closed Type Set

- Only the 7 types in §4.5 are valid
- Any other type → `invalid_decision_type` rejection
- No runtime extension of the set

### Trace Required

- Every decision **must** include `trace` with `state_id`, `state_version`, `policy_version`, and `matched_rule_id`
- Trace binds the decision to the exact state snapshot, policy, and rule that produced it
- `matched_rule_id` is the `rule_id` of the first matching rule, or `null` when `default_decision_type` was used
- Missing trace → `missing_trace` rejection

### No Downstream Enforcement

- Decisions are emitted, never executed
- Output does not include UI/workflow directives
- Output does not include enforcement/execution status
- Downstream systems are responsible for execution

### Org Isolation

- All operations **must** include `org_id`
- Decisions for org A are **never** visible to org B
- Missing or blank `org_id` → `org_scope_required` error

### Decision Context Opacity

- `decision_context` is opaque and downstream-neutral
- Must be a plain JSON object (not array, not primitive)
- Subject to forbidden semantic key detection (same rules as signal payload and state)

## Validation Rules

### EvaluateState Request Validation

| Condition | Result |
|-----------|--------|
| `org_id` missing/blank | `rejected`, `org_scope_required` |
| `learner_reference` missing/blank | `rejected`, `missing_required_field` |
| `state_id` missing/blank | `rejected`, `missing_required_field` |
| `state_version` missing | `rejected`, `missing_required_field` |
| State not found for learner | `rejected`, `state_not_found` |
| State version mismatch | `rejected`, `trace_state_mismatch` |
| No policy loaded | `rejected`, `policy_not_found` |

### Decision Object Validation

| Condition | Result |
|-----------|--------|
| `decision_type` not in closed set | `rejected`, `invalid_decision_type` |
| `decision_context` not an object | `rejected`, `decision_context_not_object` |
| `decision_context` contains forbidden semantic key | `rejected`, `forbidden_semantic_key_detected` |
| `trace` missing | `rejected`, `missing_trace` |
| `trace.state_id` doesn't match evaluation input | `rejected`, `trace_state_mismatch` |
| `trace.state_version` doesn't match evaluation input | `rejected`, `trace_state_mismatch` |

### GetDecisions Query Validation

Same rules as Signal Log query validation (reuse patterns):

| Condition | Result |
|-----------|--------|
| `org_id` missing/blank | `rejected`, `org_scope_required` |
| `learner_reference` missing/blank | `rejected`, `missing_required_field` |
| `from_time > to_time` | `rejected`, `invalid_time_range` |
| Invalid RFC3339 format | `rejected`, `invalid_timestamp` |
| `page_size = 0` or `> 1000` | `rejected`, `page_size_out_of_range` |
| Invalid `page_token` | `rejected`, `invalid_page_token` |

### Forbidden Semantic Keys in decision_context

The same forbidden keys from Signal Ingestion apply to the `decision_context` object:

```
ui, screen, view, page, route, url, link, button, cta
workflow, task, job, assignment, assignee, owner
status, step, stage, completion, progress_percent
course, lesson, module, quiz, score, grade
content_id, content_url
```

## Error Codes

### Reused (from Signal Ingestion / Signal Log / STATE Engine)

| Code | Description |
|------|-------------|
| `org_scope_required` | Missing or blank org_id |
| `missing_required_field` | Required field absent |
| `forbidden_semantic_key_detected` | Forbidden key in decision_context |
| `invalid_time_range` | from_time is after to_time (GetDecisions) |
| `invalid_timestamp` | Time not RFC3339 (GetDecisions) |
| `invalid_page_token` | Malformed page_token (GetDecisions) |
| `page_size_out_of_range` | page_size 0 or > 1000 (GetDecisions) |

### New (add to `src/shared/error-codes.ts`)

| Code | Description | Example Trigger |
|------|-------------|-----------------|
| `invalid_decision_type` | Decision type not in closed set | `decision_type="promote"` |
| `decision_context_not_object` | decision_context is not a JSON object | `decision_context=[]` |
| `missing_trace` | Trace field absent from decision | Omit trace from decision |
| `trace_state_mismatch` | Trace references state that doesn't match evaluation input | Trace `state_version=2` but request `state_version=3` |
| `state_not_found` | No state exists for learner — cannot evaluate | Evaluate before any signals applied |
| `policy_not_found` | No policy loaded or available | Policy file missing at startup |

## Implementation Components

### 1. Decision Store (`src/decision/store.ts`)

SQLite-backed storage for decision records:

```sql
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  decision_id TEXT NOT NULL UNIQUE,       -- Global uniqueness (UUIDs)
  learner_reference TEXT NOT NULL,
  decision_type TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  decision_context TEXT NOT NULL,
  trace_state_id TEXT NOT NULL,
  trace_state_version INTEGER NOT NULL,
  trace_policy_version TEXT NOT NULL,
  trace_matched_rule_id TEXT,            -- NULL when default_decision_type was used
  UNIQUE(org_id, decision_id)             -- Composite key mirrors DynamoDB PK (org_id) + SK (decision_id).
                                          -- Functionally redundant with column-level UNIQUE on decision_id
                                          -- (UUIDs are globally unique) but retained for migration parity.
);

CREATE INDEX idx_decisions_query
  ON decisions(org_id, learner_reference, decided_at);
```

**Functions:**
- `initDecisionStore(dbPath: string): void` — Initialize database with schema
- `saveDecision(decision: Decision): void` — Insert immutable record
- `getDecisions(request: GetDecisionsRequest): { decisions: Decision[]; hasMore: boolean; nextCursor?: number }` — Time-range query with pagination
- `getDecisionById(orgId: string, decisionId: string): Decision | null` — Retrieve single decision
- `closeDecisionStore(): void` — Close database connection
- `clearDecisionStore(): void` — Clear for testing

**Access pattern notes (DynamoDB-ready):**
- Write: Insert by `(org_id, decision_id)` — maps to DynamoDB PK
- Read: Query by `(org_id, learner_reference)` with `decided_at` time range — maps to DynamoDB GSI1 (`org_id + learner_reference + decided_at`)
- No UPDATE/DELETE operations (immutable)

### 2. Decision Engine (`src/decision/engine.ts`)

Core evaluation logic. Primary function:

```typescript
function evaluateState(request: EvaluateStateForDecisionRequest): EvaluateDecisionOutcome
```

> **Side effects:** `evaluateState()` is a side-effecting function — on success, it persists the decision to the Decision Store before returning. This matches the `applySignals()` pattern where the function both computes and persists. On rejection (`ok: false`), no side effects occur.

**Evaluation Flow:**

1. Validate request (`org_id`, `learner_reference`, `state_id`, `state_version`)
2. Fetch current state via `getState()` from STATE Store
3. Verify state exists → `state_not_found` if null
4. Verify state matches request (`state_id`, `state_version`) → `trace_state_mismatch` if diverged
5. Load current policy (or use cached policy from startup)
6. Evaluate policy against state → get `decision_type` and `matched_rule_id` (recursive condition tree walk; see §Policy Evaluation Semantics)
7. Build `decision_context` (opaque, from evaluation metadata)
8. Validate `decision_context` for forbidden keys
9. Construct `Decision` object with trace (`state_id`, `state_version`, `policy_version`, `matched_rule_id`)
10. Save decision to Decision Store
11. Return `{ ok: true, result: Decision }`

**On rejection:** Return `{ ok: false, errors: [...] }` — never throw.

### 3. Decision Validator (`src/decision/validator.ts`)

Validate decision-related inputs:
- `validateEvaluateRequest(request: unknown): ValidationResult` — validate `EvaluateStateForDecisionRequest`
- `validateDecisionContext(context: Record<string, unknown>): ValidationResult` — check for forbidden semantic keys (reuse `forbidden-keys.ts`)
- `validateDecisionType(type: string): ValidationResult` — check against closed set
- `validateGetDecisionsRequest(request: unknown): ValidationResult` — validate query params (reuse time-range and pagination validation patterns from Signal Log)

### 4. Policy Loader (`src/decision/policy-loader.ts`)

Load and evaluate JSON policy files:
- `loadPolicy(policyPath?: string): PolicyDefinition` — Load and validate a JSON policy file. Default path resolved via `process.env.DECISION_POLICY_PATH ?? path.join(process.cwd(), 'src/decision/policies/default.json')`. This follows the existing DB path pattern (e.g., `process.env.STATE_STORE_DB_PATH ?? './data/state.db'`). Using `process.cwd()` instead of source-relative paths ensures correct resolution regardless of whether code runs from `src/` or compiled `dist/`.
- `evaluatePolicy(state: Record<string, unknown>, policy: PolicyDefinition): { decision_type: DecisionType; matched_rule_id: string | null }` — Walk rules in order, recursively evaluate each rule's condition tree against state. Return first matching rule's `decision_type` and `rule_id`, or `{ decision_type: default_decision_type, matched_rule_id: null }` if no rules match.
- `getLoadedPolicyVersion(): string` — Return current policy version for trace recording

**Validation (at load time):**
- Policy file must parse as valid JSON
- `policy_version` must be valid semver (`MAJOR.MINOR.PATCH`, optional prerelease/build metadata). Enforced at load time; rejects with `invalid_policy_version` error code.
- All `decision_type` values must be in the closed set
- All leaf `condition.operator` values must be in the allowed set (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`)
- All `rule_id` values must be unique within the policy
- Each `ConditionNode` must be exactly one of: leaf, `all`, or `any` (no mixing)
- Compound nodes (`all`/`any`) must contain at least 2 children
- At least one rule or a `default_decision_type` required

**Error handling:**
- Missing policy file → throw with `policy_not_found` error code
- Non-semver `policy_version` → throw with `invalid_policy_version` error code
- Invalid policy structure → throw with descriptive error

### 5. Decision JSON Schema (`src/contracts/schemas/decision.json`)

JSON Schema for `Decision` object matching the updated OpenAPI schema (including `policy_version` and `matched_rule_id` in trace):
- All required fields: `org_id`, `decision_id`, `learner_reference`, `decision_type`, `decided_at`, `decision_context`, `trace`
- `decision_type` enum with all 7 values
- `trace` with required `state_id`, `state_version`, `policy_version`, `matched_rule_id`
- `matched_rule_id` typed as `string | null`
- `decision_context` as object type
- `additionalProperties: false` on trace

### 6. Decision Ajv Validator (`src/contracts/validators/decision.ts`)

Follows the same pattern as `src/contracts/validators/signal-envelope.ts`:
- Load `decision.json` schema
- Compile with Ajv
- Export `validateDecision(data: unknown): ValidationResult`

### 7. Decision Handler (`src/decision/handler.ts`)

Fastify route handler for `GET /v1/decisions`:
1. Parse and validate query parameters (`org_id`, `learner_reference`, `from_time`, `to_time`, `page_token`, `page_size`)
2. Reuse time-range and pagination validation from Signal Log handler pattern
3. Query Decision Store
4. Build `GetDecisionsResponse` with pagination
5. Return response

Error responses follow the `SignalLogError` schema already in OpenAPI.

### 8. Decision Routes (`src/decision/routes.ts`)

Register `GET /decisions` endpoint with Fastify (exposed as `GET /v1/decisions` via the server's `/v1` prefix):
- `registerDecisionRoutes(fastify: FastifyInstance): void`

### 9. Server Integration (`src/server.ts`)

- Import `registerDecisionRoutes` from `./decision/routes.js`
- Import `initDecisionStore` from `./decision/store.js`
- Import `loadPolicy` from `./decision/policy-loader.js`
- Initialize decision store at startup (add `DECISION_DB_PATH` env var, default `./data/decisions.db`)
- Call `loadPolicy()` at startup to cache the policy before any evaluation can occur — `evaluateState()` depends on the cached policy being available. Must run after store init, before route registration.
- Register decision routes under `/v1` prefix (uncomment existing line 86)

## Triggering Model

### Sync Trigger (Default — ISS-DGE-005)

After a successful `applySignals()` call (`ok: true`), automatically invoke `evaluateState()`:

```typescript
// After applySignals succeeds:
const evalRequest: EvaluateStateForDecisionRequest = {
  org_id: result.org_id,
  learner_reference: result.learner_reference,
  state_id: result.state_id,
  state_version: result.new_state_version,
  requested_at: new Date().toISOString(),
};
const decisionOutcome = evaluateState(evalRequest);
```

**Critical constraint:** Decision evaluation failure must **not** fail signal ingestion. If `evaluateState` returns `ok: false`, log the error but do not reject the signal.

### On-Demand Trigger

The `evaluateState()` function is independently callable for:
- Ad-hoc re-evaluation
- Testing
- Manual evaluation by internal consumers

Both triggers use the same `evaluateState()` function and produce identical results for identical inputs.

## Evaluation Flow

```
EvaluateStateForDecisionRequest
        │
        ▼
┌──────────────────┐
│ Validate Request │ ← Check org_id, learner_reference, state_id, state_version
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Fetch Current    │ ← Query STATE Store via getState()
│ Learner State    │ ← Verify state exists
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Verify State     │ ← state_id and state_version must match request
│ Coordinates      │ ← Mismatch → trace_state_mismatch
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Load Policy      │ ← Get current policy (cached from startup)
│                  │ ← No policy → policy_not_found
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Evaluate Policy  │ ← Walk rules in order, evaluate condition tree recursively
│ Against State    │ ← First match → decision_type + matched_rule_id
│                  │ ← No match → default_decision_type (matched_rule_id = null)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Build Decision   │ ← Construct decision_context (opaque metadata)
│ Context          │ ← Validate: forbidden key check
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Construct        │ ← Generate decision_id (UUID)
│ Decision Object  │ ← Set decided_at timestamp
│                  │ ← Attach trace (state_id, state_version, policy_version, matched_rule_id)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Save Decision    │ ← Insert immutable record to Decision Store
└────────┬─────────┘
         │
         ▼
  EvaluateDecisionOutcome (ok: true → Decision | ok: false → errors)
```

## Policy Model

### Policy Files

JSON files stored at `src/decision/policies/`. Loaded at startup, versioned via `policy_version` field.

**Default policy (`src/decision/policies/default.json`):**

> **POC v2 policy: full 7-rule policy (priority-ordered, first match wins).** Expands from the single REINFORCE rule to an explicit rule for every decision type in the closed set. Rules use only the canonical state fields (§4.7). The highest-risk decisions are evaluated first; safe fallbacks remain `reinforce`.

```json
{
  "policy_id": "default",
  "policy_version": "2.0.0",
  "description": "POC v2 policy: 7 rules covering all decision types. Uses canonical state fields (stabilityScore, masteryScore, timeSinceReinforcement, confidenceInterval, riskSignal). Priority-ordered; first match wins.",
  "rules": [
    {
      "rule_id": "rule-escalate",
      "condition": {
        "all": [
          { "field": "confidenceInterval", "operator": "lt", "value": 0.3 },
          { "any": [
            { "field": "stabilityScore", "operator": "lt", "value": 0.3 },
            { "field": "riskSignal", "operator": "gt", "value": 0.8 }
          ]}
        ]
      },
      "decision_type": "escalate"
    },
    {
      "rule_id": "rule-pause",
      "condition": {
        "all": [
          { "field": "confidenceInterval", "operator": "lt", "value": 0.3 },
          { "field": "stabilityScore", "operator": "lt", "value": 0.5 }
        ]
      },
      "decision_type": "pause"
    },
    {
      "rule_id": "rule-reroute",
      "condition": {
        "all": [
          { "field": "riskSignal", "operator": "gt", "value": 0.7 },
          { "field": "stabilityScore", "operator": "lt", "value": 0.5 },
          { "field": "confidenceInterval", "operator": "gte", "value": 0.3 }
        ]
      },
      "decision_type": "reroute"
    },
    {
      "rule_id": "rule-intervene",
      "condition": {
        "all": [
          { "field": "stabilityScore", "operator": "lt", "value": 0.4 },
          { "field": "confidenceInterval", "operator": "gte", "value": 0.3 }
        ]
      },
      "decision_type": "intervene"
    },
    {
      "rule_id": "rule-reinforce",
      "condition": {
        "all": [
          { "field": "stabilityScore", "operator": "lt", "value": 0.7 },
          { "field": "timeSinceReinforcement", "operator": "gt", "value": 86400 }
        ]
      },
      "decision_type": "reinforce"
    },
    {
      "rule_id": "rule-advance",
      "condition": {
        "all": [
          { "field": "stabilityScore", "operator": "gte", "value": 0.8 },
          { "field": "masteryScore", "operator": "gte", "value": 0.8 },
          { "field": "riskSignal", "operator": "lt", "value": 0.3 },
          { "field": "confidenceInterval", "operator": "gte", "value": 0.7 }
        ]
      },
      "decision_type": "advance"
    },
    {
      "rule_id": "rule-recommend",
      "condition": {
        "all": [
          { "field": "riskSignal", "operator": "gte", "value": 0.5 },
          { "field": "stabilityScore", "operator": "gte", "value": 0.7 }
        ]
      },
      "decision_type": "recommend"
    }
  ],
  "default_decision_type": "reinforce"
}
```

> **Rule priority rationale (highest → lowest danger):** `escalate` → `pause` → `reroute` → `intervene` → `reinforce` → `advance` → `recommend` → default (`reinforce`). This ordering ensures that low-confidence / high-risk situations are handled before “growth” or “suggestion” decisions. The `escalate` rule intentionally nests `any` inside `all` to exercise compound condition evaluation (ISS-DGE-002).

### Policy Evaluation Semantics

**Rule evaluation (top level):**

1. Rules are evaluated in array order (first match wins)
2. For each rule, the condition tree is evaluated recursively (see below)
3. If a rule's condition evaluates to `true`, return `{ decision_type: rule.decision_type, matched_rule_id: rule.rule_id }`
4. If no rules match, return `{ decision_type: default_decision_type, matched_rule_id: null }`
5. All `decision_type` values must be in the closed set

**Condition tree evaluation (recursive):**

6. **Leaf node:** Compare `state[condition.field]` against `condition.value` using `condition.operator`
   - If `state[condition.field]` is `undefined` (field not present in state), the leaf evaluates to `false` — the evaluator does not throw
   - Operators `gt`, `gte`, `lt`, `lte` perform numeric comparison. If either operand is not a number, the leaf evaluates to `false`
   - Operators `eq`, `neq` perform strict equality comparison (`===` / `!==`). Works with strings, numbers, and booleans
7. **`all` node (AND):** Evaluates to `true` if **every** child ConditionNode evaluates to `true`. Short-circuits on first `false`.
8. **`any` node (OR):** Evaluates to `true` if **at least one** child ConditionNode evaluates to `true`. Short-circuits on first `true`.
9. Compound nodes are evaluated recursively — children may be leaf nodes or nested `all`/`any` nodes

### Policy Versioning

- `policy_version` is recorded in every decision's `trace.policy_version`
- New policy = new `policy_version` value
- Old decisions retain their original policy version in trace (immutable)
- Enables reproducibility: given `(state_id, state_version, policy_version)`, the decision can be re-derived

## Contract Tests

Implement all tests from the Contract Test Matrix §5 (Decision Engine) and §6 (Output Interfaces):

### Decision Engine Tests (§5)

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| DEC-001 | Evaluate Decision Happy Path | Valid `EvaluateStateForDecisionRequest` for existing state | Valid `Decision` with trace |
| DEC-002 | Closed Decision Type Enforcement | Decision with `decision_type="promote"` | rejected, `invalid_decision_type` |
| DEC-003 | `decision_context` Must Be Object | `decision_context=[]` | rejected, `decision_context_not_object` |
| DEC-004 | Forbidden Semantic Keys in `decision_context` | `decision_context={"task":{"assignee":"bob"}}` | rejected, `forbidden_semantic_key_detected` |
| DEC-005 | Trace Required | Omit trace | rejected, `missing_trace` |
| DEC-006 | Deterministic Decision Output | Evaluate same `(state_id, state_version)` twice | Identical `decision_type` and equivalent `decision_context` |
| DEC-007 | Trace-State Mismatch | Trace references different `state_version` than request | rejected, `trace_state_mismatch` |
| DEC-008 | Traceability per decision type (parameterized, 9 cases — POC v2) | State with canonical fields tuned to trigger each decision type plus default paths (see table below) | Decision with correct `decision_type`, `trace.matched_rule_id` matching the expected rule (or `null` for default), and correct `trace.policy_version` |

**DEC-008 test vectors (POC v2 — all 7 types + default paths):**

| Case | State Fields | Expected `decision_type` | Expected `matched_rule_id` |
|------|--------------|-------------------------|---------------------------|
| 8a | `stabilityScore: 0.2, confidenceInterval: 0.2, riskSignal: 0.9` | `escalate` | `rule-escalate` |
| 8b | `stabilityScore: 0.4, confidenceInterval: 0.2` | `pause` | `rule-pause` |
| 8c | `stabilityScore: 0.4, confidenceInterval: 0.5, riskSignal: 0.8` | `reroute` | `rule-reroute` |
| 8d | `stabilityScore: 0.3, confidenceInterval: 0.5` | `intervene` | `rule-intervene` |
| 8e | `stabilityScore: 0.5, timeSinceReinforcement: 100000` | `reinforce` | `rule-reinforce` |
| 8f | `stabilityScore: 0.9, masteryScore: 0.9, riskSignal: 0.1, confidenceInterval: 0.8` | `advance` | `rule-advance` |
| 8g | `stabilityScore: 0.8, riskSignal: 0.6` | `recommend` | `rule-recommend` |
| 8h | `stabilityScore: 0.9, timeSinceReinforcement: 1000` | `reinforce` | `null` (default) |
| 8i | `stabilityScore: 0.6, timeSinceReinforcement: 1000, confidenceInterval: 0.8` | `reinforce` | `null` (default) |

> **DEC-008 rationale:** DEC-001 validates a single happy path. DEC-008 is a parameterized sweep proving traceability for every decision type in the closed set, including nested compound conditions (`rule-escalate`) and explicit default fall-through (`matched_rule_id: null`).

> **Testing strategy note:** DEC-001, DEC-006, DEC-007, and DEC-008 test the full `evaluateState()` flow end-to-end. DEC-002–DEC-005 test the validator functions directly (e.g., `validateDecisionType`, `validateDecisionContext`, Ajv schema validator), since the engine produces valid decisions by construction — these edge cases cannot be triggered through normal `evaluateState()` execution. This ensures the safety-net validators are exercised even though the engine won't produce invalid output.

### Output API Tests (§6)

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| OUT-API-001 | GetDecisions Happy Path | Valid `GetDecisionsRequest` | Valid `GetDecisionsResponse` with `decisions[]` |
| OUT-API-002 | Invalid Time Range | `from_time > to_time` | rejected, `invalid_time_range` |
| OUT-API-003 | Paging Determinism | Same query + `page_token` twice | Identical `decision_id` sequence |

### Deferred to Phase 3 (EventBridge)

| Test ID | Description | Deferred To |
|---------|-------------|-------------|
| OUT-EVT-001 | DecisionEmittedEvent Shape | Phase 3 |
| OUT-EVT-002 | Invalid event_type | Phase 3 |
| OUT-EVT-003 | Decision Emission Idempotency | Phase 3 |

## Integration Points

### Receives From

- **STATE Engine** (`getState`) — Retrieves current learner state for evaluation (internal; see `docs/specs/state-engine.md`)

### Feeds Into

- **Output Interfaces** (Stage 5) — `GET /v1/decisions` endpoint exposes decisions
- **Future: EventBridge** (Phase 3) — `decision.emitted` event (see `docs/api/asyncapi.yaml`)

**Exposed function for sync trigger:**
```typescript
evaluateState(request: EvaluateStateForDecisionRequest): EvaluateDecisionOutcome
```
Called automatically after `applySignals()` succeeds, or on-demand by any internal consumer.

**Exposed function for Output API (store-level):**
```typescript
getDecisions(request: GetDecisionsRequest): { decisions: Decision[]; hasMore: boolean; nextCursor?: number }
```
Called by `GET /v1/decisions` handler. The handler converts the store-level cursor pagination (`hasMore`, `nextCursor`) to the API-level page token format (`next_page_token`) defined in `GetDecisionsResponse` (§4.4). This two-layer separation keeps the store vendor-agnostic while the handler owns the API contract.

## File Structure

```
src/
├── decision/
│   ├── engine.ts                      # Core evaluation logic (evaluateState)
│   ├── store.ts                       # SQLite decision storage
│   ├── validator.ts                   # Request/decision validation
│   ├── policy-loader.ts              # Policy loading and evaluation
│   ├── handler.ts                     # GET /decisions route handler
│   ├── routes.ts                      # Fastify route registration
│   └── policies/
│       └── default.json               # Default Phase 1 policy
├── contracts/
│   ├── schemas/
│   │   └── decision.json              # Decision JSON Schema
│   └── validators/
│       └── decision.ts                # Ajv-compiled Decision validator
├── shared/
│   ├── types.ts                       # Add Decision, Policy, evaluation types
│   └── error-codes.ts                 # Add DEC error codes
└── server.ts                          # Wire decision store + routes

tests/
├── contracts/
│   ├── decision-engine.test.ts        # DEC-001–DEC-008 contract tests
│   └── output-api.test.ts            # OUT-API-001–OUT-API-003 tests
└── unit/
    ├── decision-store.test.ts         # Decision store unit tests
    ├── decision-engine.test.ts        # Decision engine unit tests
    ├── decision-validator.test.ts     # Decision validator unit tests
    └── policy-loader.test.ts          # Policy loader unit tests
```

## Success Criteria

Implementation is complete when:

- [ ] `evaluateState()` evaluates state against policy and returns a Decision
- [ ] Decision type is from the 7-type closed set only
- [ ] Decision includes trace with `state_id`, `state_version`, `policy_version`, `matched_rule_id`
- [ ] Deterministic: same `(state_id, state_version, policy_version)` → same decision
- [ ] `decision_context` validated for forbidden semantic keys
- [ ] `decision_context` must be a plain object
- [ ] Decisions are immutable (no UPDATE/DELETE)
- [ ] Org isolation: decisions scoped to `org_id`
- [ ] Sync trigger: signal ingestion → state update → decision automatically created
- [ ] Decision evaluation failure does not fail signal ingestion
- [ ] `GET /v1/decisions` returns valid `GetDecisionsResponse`
- [ ] Time-range and pagination validation on GetDecisions
- [ ] All DEC-001 through DEC-008 contract tests pass
- [ ] Traceability validated for all 7 decision types + default paths (DEC-008, 9 cases — POC v2)
- [ ] All OUT-API-001 through OUT-API-003 output API tests pass
- [ ] Existing STATE Engine and Signal Log tests still pass (no regression)

## Dependencies

- **better-sqlite3** — Already installed (used for Signal Log and STATE Store)
- **STATE Store** — Requires `getState()` function (defined in `docs/specs/state-engine.md`)
- **Forbidden Keys** — Reuses `detectForbiddenKeys()` from `src/ingestion/forbidden-keys.ts`

## Phase 2: Storage Abstraction (Vendor-Agnostic Preparation)

Phase 2 (AWS deployment) will migrate persistence away from SQLite (e.g., to DynamoDB). To keep business logic stable and contract tests usable as migration guardrails, the Decision Engine should depend on a **storage interface** rather than SQLite-specific modules.

### DecisionRepository Interface (Contract)

Define a repository interface (mirrors `StateRepository`):

```typescript
interface DecisionRepository {
  saveDecision(decision: Decision): void;
  getDecisions(request: GetDecisionsRequest): { decisions: Decision[]; hasMore: boolean; nextCursor?: number };
  getDecisionById(orgId: string, decisionId: string): Decision | null;
  close(): void;
}
```

> **Testing note:** `clearDecisionStore()` is exposed by the SQLite implementation for test teardown but is intentionally omitted from the repository interface. Test-only utilities are implementation-specific, not part of the production contract. This matches the `StateRepository` pattern.

### Adapter Approach

- **SqliteDecisionRepository**: Extracted from the current `src/decision/store.ts` implementation
- **DynamoDbDecisionRepository**: Phase 2 implementation using DynamoDB

### DynamoDB Table Design

| Attribute | Role |
|-----------|------|
| PK | `org_id` |
| SK | `decision_id` |
| GSI1PK | `org_id` |
| GSI1SK | `learner_reference + decided_at` |

This supports the two access patterns: write by `(org_id, decision_id)` and query by `(org_id, learner_reference, decided_at)`.

### Phase 2 Prerequisites

The current module-level singleton database pattern (`let db`) prevents dependency injection. Phase 2 should refactor Decision Engine construction to accept a `DecisionRepository` instance (or factory) to make backend swaps mechanical.

**Tracking**: The operational migration checklist and storage preparation steps live in `docs/foundation/solo-dev-execution-playbook.md` under Phase 2.

## Out of Scope

- Signal normalization layer (tenant field mappings → canonical fields) — deferred to Phase 2 (see DEF-DEC-006)
- Event emission (`decision.emitted`) — deferred to Phase 3 (EventBridge)
- Policy management API (policies are static JSON files in Phase 1)
- Policy authoring/editing interface
- Full decision trace store (Phase 1 embeds trace in decision record)
- State schema interpretation (state is opaque to Decision Engine)

### Deferred Items

| ID | Item | Origin | Deferred To |
|----|------|--------|-------------|
| DEF-DEC-001 | Event emission (`decision.emitted`) for OUT-EVT-* tests | Contract Test Matrix §6.4–6.6 | Phase 3 (EventBridge) |
| DEF-DEC-002 | Extract `DecisionRepository` interface for DI | ISS-DGE-002, Playbook Phase 2 | Phase 2 |
| DEF-DEC-003 | Separate decision trace store (if auditing needs grow) | ISS-DGE-003 | Future |
| DEF-DEC-004 | Data-driven policy engine (replace simple JSON rules) | ISS-DGE-002 | **Resolved** — compound condition schema (`all`/`any` combinators) provides data-driven evaluation in Phase 1 |
| DEF-DEC-005 | Policy rules for all 7 decision types | ISS-DGE-001 | **Resolved** — default policy expanded to 7 rules (POC v2, `policy_version: "2.0.0"`), with DEC-008 vectors covering all types. |
| DEF-DEC-006 | Signal normalization layer: tenant-scoped field mappings from vendor payloads to canonical state fields. Phase 1 assumes identity mapping (signals produce canonical fields directly). | Policy-suggestion analysis, architectural decision | Phase 2 |
