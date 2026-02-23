---
name: Inspection API
overview: "Implement the Inspection API per docs/specs/inspection-api.md: (1) ingestion outcome log with GET /v1/ingestion, (2) state query API with GET /v1/state and GET /v1/state/list, (3) enriched decision trace (state_snapshot, matched_rule, rationale), (4) output_metadata.priority on decisions. All read-only. Powers the four inspection panels for enterprise pilots."
todos:
  - id: TASK-001
    content: Add new error codes (state_version_not_found, invalid_outcome_filter, limit_out_of_range)
    status: completed
  - id: TASK-002
    content: Create ingestion-log-store.ts with schema, appendIngestionOutcome(), getIngestionOutcomes()
    status: completed
  - id: TASK-003
    content: Create ingestion-log-handler.ts and register GET /v1/ingestion route
    status: completed
  - id: TASK-004
    content: Modify ingestion handler to call appendIngestionOutcome() in all 3 paths
    status: completed
  - id: TASK-005
    content: Add listLearners() to state store for GET /v1/state/list
    status: completed
  - id: TASK-006
    content: Create state handler and routes for GET /v1/state and GET /v1/state/list
    status: completed
  - id: TASK-007
    content: Extend policy-loader evaluatePolicy to return evaluated_fields and matched_rule
    status: pending
  - id: TASK-008
    content: Add output_metadata (priority) to Decision and decision store
    status: pending
  - id: TASK-009
    content: Extend decision store schema for enriched trace columns
    status: pending
  - id: TASK-010
    content: Modify engine evaluateState for enriched trace (state_snapshot, matched_rule, rationale)
    status: pending
  - id: TASK-011
    content: Update decision schema, OpenAPI, and decision handler for enriched trace
    status: pending
  - id: TASK-012
    content: Contract tests INSP-001 through INSP-017
    status: pending
isProject: false
---

# Inspection API

**Spec**: `docs/specs/inspection-api.md`

## Prerequisites

Before starting implementation:

- No lint or type errors
- All existing tests pass (343+)
- `docs/specs/inspection-api.md` reviewed

## Tasks

### TASK-001: Add new error codes

- **Status**: completed
- **Files**: `src/shared/error-codes.ts`
- **Action**: Modify
- **Depends on**: none
- **Details**: Add three error codes per spec §Error Codes:
  - `STATE_VERSION_NOT_FOUND: 'state_version_not_found'`
  - `INVALID_OUTCOME_FILTER: 'invalid_outcome_filter'`
  - `LIMIT_OUT_OF_RANGE: 'limit_out_of_range'`
- **Verification**: `npm run build` succeeds; `ErrorCode` type includes new values.

---

### TASK-002: Create ingestion-log-store.ts

- **Status**: completed
- **Files**: `src/ingestion/ingestion-log-store.ts`
- **Action**: Create
- **Depends on**: TASK-001
- **Details**:
  - Create `ingestion_log` table per spec §1.2 (id, org_id, signal_id, source_system, learner_reference, timestamp, schema_version, outcome, received_at, rejection_code, rejection_message, rejection_field_path)
  - `initIngestionLogStore(dbPath: string): void` — init DB, create table and indexes
  - `appendIngestionOutcome(entry: IngestionOutcomeEntry): void` — append-only insert (normal store behavior; may throw)
  - `getIngestionOutcomes(request: GetIngestionOutcomesRequest): { entries: IngestionOutcome[]; nextCursor: string | null }` — query by org_id, optional outcome filter, limit 1–500, cursor pagination, order by received_at DESC
  - `closeIngestionLogStore(): void`, `clearIngestionLogStore(): void` (test only)
  - Use `INGESTION_LOG_DB_PATH` env var, default `./data/ingestion-log.db`
- **Verification**: Unit tests pass; store can append and query.

---

### TASK-003: Create ingestion-log-handler.ts and register route

- **Status**: completed
- **Files**: `src/ingestion/ingestion-log-handler.ts`, `src/ingestion/routes.ts`, `src/server.ts`
- **Action**: Create | Modify
- **Depends on**: TASK-002
- **Details**:
  - Create `src/contracts/schemas/ingestion-outcome.json` (per spec File Structure)
  - Handler: validate `org_id` (required, 1–128 chars), `limit` (1–500, default 50), `outcome` (optional: accepted|rejected|duplicate), `cursor` (optional)
  - Return 400 for `org_scope_required`, `missing_required_field`, `invalid_outcome_filter`, `limit_out_of_range`
  - Call `getIngestionOutcomes()`, return IngestionLogResponse (entries, next_cursor)
  - Include `rejection_reason` in entries when outcome=rejected
  - Register `GET /ingestion` in routes; add to server's v1 scope (with ingestion routes or new route group)
  - Wire store lifecycle in `src/server.ts`: `initIngestionLogStore()` at startup and `closeIngestionLogStore()` in the shutdown hook (match other stores)
- **Verification**: `GET /v1/ingestion?org_id=X` returns 200 with entries array.

---

### TASK-004: Modify ingestion handler to call appendIngestionOutcome()

- **Status**: completed
- **Files**: `src/ingestion/handler.ts`
- **Depends on**: TASK-002
- **Details**:
  - In all three return paths (rejected, duplicate, accepted), call `appendIngestionOutcome()` **before** returning the HTTP response
  - For rejected: capture org_id, signal_id, source_system, learner_reference, timestamp, schema_version from body (use defaults for missing), outcome: 'rejected', rejection_reason
  - For duplicate: same, outcome: 'duplicate', rejection_reason: null
  - For accepted: same, outcome: 'accepted', rejection_reason: null
  - Wrap the call in try/catch: if appendIngestionOutcome throws, log error but do NOT reject the signal or change the HTTP response (spec §1.4: outcome logging must not fail signal acceptance)
- **Verification**: INSP-001, INSP-002, INSP-003 pass (contract tests).

---

### TASK-005: Add listLearners() to state store

- **Status**: completed
- **Files**: `src/state/store.ts`
- **Action**: Modify
- **Depends on**: none
- **Details**:
  - Add `listLearners(orgId: string, limit: number, cursor?: string): { learners: StateSummary[]; nextCursor: string | null }`
  - StateSummary: `{ learner_reference: string; state_version: number; updated_at: string }`
  - Query distinct learners per org with latest state_version. Use keyset pagination (e.g. cursor = base64(updated_at, learner_reference)) or offset-based for simplicity
  - Order by updated_at DESC
- **Verification**: Unit test: listLearners returns correct learner summaries.

---

### TASK-006: Create state handler and routes

- **Status**: completed
- **Files**: `src/state/handler.ts`, `src/state/routes.ts`, `src/server.ts`
- **Action**: Create | Modify
- **Depends on**: TASK-005
- **Details**:
  - `GET /v1/state`: params org_id, learner_reference, optional version. Return LearnerState (or 404 state_not_found, state_version_not_found). Use getState() and getStateByVersion()
  - `GET /v1/state/list`: params org_id, limit, cursor. Return StateSummaryListResponse. Use listLearners()
  - Validate org_id, learner_reference (400 org_scope_required, missing_required_field)
  - Register routes in server
- **Verification**: INSP-006, INSP-007, INSP-008, INSP-009 pass.

---

### TASK-007: Extend policy-loader evaluatePolicy to return evaluated_fields and matched_rule

- **Status**: pending
- **Files**: `src/decision/policy-loader.ts`, `src/shared/types.ts`
- **Action**: Modify
- **Depends on**: none
- **Details**:
  - Extend PolicyEvaluationResult: add `matched_rule?: { rule_id, decision_type, condition, evaluated_fields }`, `evaluated_fields?: EvaluatedField[]`
  - EvaluatedField: `{ field, operator, threshold, actual_value }`
  - During condition tree walk in evaluatePolicy, collect each leaf comparison's field, operator, value (threshold), and state[field] (actual_value)
  - When a rule matches, return the full rule object with evaluated_fields populated
  - When default matches, return matched_rule: null
- **Verification**: Unit tests pass; evaluatePolicy returns evaluated_fields for matching rules.

---

### TASK-008: Add output_metadata (priority) to Decision and decision store

- **Status**: pending
- **Files**: `src/shared/types.ts`, `src/decision/store.ts`, `src/decision/engine.ts`
- **Action**: Modify
- **Depends on**: none
- **Details**:
  - Update `Decision` type in `src/shared/types.ts`:
    - Add `output_metadata?: { priority: number | null; ttl_seconds?: number | null; downstream_targets?: string[] }`
    - Extend `trace` type with optional enriched fields (added in TASK-010): `state_snapshot?`, `matched_rule?`, `rationale?`
  - Add column `output_metadata TEXT` to decisions table (ALTER TABLE or migration in SqliteDecisionRepository init)
  - In engine: when rule matches, priority = 1-based index of rule in policy.rules; when default, priority = null
  - Store and retrieve output_metadata in saveDecision/getDecisions
- **Verification**: INSP-013 pass; new decisions include output_metadata.priority.

---

### TASK-009: Extend decision store schema for enriched trace columns

- **Status**: pending
- **Files**: `src/decision/store.ts`
- **Action**: Modify
- **Depends on**: TASK-008
- **Details**:
  - Add columns: `trace_state_snapshot TEXT`, `trace_matched_rule TEXT`, `trace_rationale TEXT`
  - Use schema migration: check if columns exist, ALTER TABLE if not (SQLite supports this)
  - Update saveDecision to accept and store enriched trace fields
  - Update rowToDecision to include trace.state_snapshot, trace.matched_rule, trace.rationale when present (null for historical)
- **Verification**: New decisions persist and retrieve enriched trace.

---

### TASK-010: Modify engine evaluateState for enriched trace

- **Status**: pending
- **Files**: `src/decision/engine.ts`
- **Action**: Modify
- **Depends on**: TASK-007, TASK-009
- **Details**:
  - After fetching state, clone `currentState.state` as `state_snapshot` (deep copy)
  - Call evaluatePolicy (now returns matched_rule, evaluated_fields)
  - Generate rationale string: rule match → "Rule {rule_id} fired: {field} ({actual}) {op} {threshold} AND/OR ..."; default → "No rules matched. Default decision: {default_decision_type}"
  - Build trace with state_snapshot, matched_rule, rationale
  - Pass to saveDecision
- **Verification**: INSP-010, INSP-011, INSP-012, INSP-017 pass.

---

### TASK-011: Update decision schema, OpenAPI, and decision handler for enriched trace

- **Status**: pending
- **Files**: `src/contracts/schemas/decision.json`, `docs/api/openapi.yaml`, `src/decision/handler.ts`
- **Action**: Modify
- **Depends on**: TASK-010
- **Details**:
  - Extend decision.json schema:
    - Keep backward-compat for historical decisions by making the new trace fields optional (not in `required`)
    - **Important:** `trace` currently has `additionalProperties: false` — add `state_snapshot`, `matched_rule`, `rationale` as explicit `properties` (do not rely on extra props)
  - Update OpenAPI Decision schema
  - Decision handler (GET /v1/decisions) already returns decisions from store; ensure enriched traces are serialized. No schema change needed if store returns full object
- **Verification**: Historical decisions without enriched trace return cleanly (INSP-014); OpenAPI validates.

---

### TASK-012: Contract tests INSP-001 through INSP-017

- **Status**: pending
- **Files**: `tests/contracts/inspection-api.test.ts`
- **Action**: Create
- **Depends on**: TASK-003, TASK-004, TASK-006, TASK-008, TASK-010
- **Details**:
  - Create contract test file following `tests/contracts/signal-ingestion.test.ts` pattern
  - Full app setup: idempotency, signal log, state, decision, ingestion log stores; ingestion, signal log, decision, ingestion, state routes
  - INSP-001: POST valid signal → GET /v1/ingestion shows outcome: accepted
  - INSP-002: POST invalid signal → GET /v1/ingestion shows outcome: rejected with rejection_reason.code
  - INSP-003: POST duplicate signal → GET /v1/ingestion shows outcome: duplicate
  - INSP-004: GET /v1/ingestion returns entries received_at DESC
  - INSP-005: GET /v1/ingestion?outcome=rejected filters correctly
  - INSP-006: GET /v1/state returns current learner state
  - INSP-007: GET /v1/state?version=N returns specific version
  - INSP-008: GET /v1/state for unknown learner returns 404 state_not_found
  - INSP-009: GET /v1/state/list returns learner index
  - INSP-010: New decision includes trace.state_snapshot matching state
  - INSP-011: New decision includes trace.matched_rule with evaluated_fields
  - INSP-012: New decision includes trace.rationale (non-empty)
  - INSP-013: New decision includes output_metadata.priority
  - INSP-014: Historical decision without enriched trace returns cleanly (no error)
  - INSP-015: Org isolation on GET /v1/ingestion
  - INSP-016: Org isolation on GET /v1/state
  - INSP-017: Default-path decision has rationale "No rules matched"
- **Verification**: All 17 tests pass; `npm test` green.

---

## Files Summary

### To Create


| File                                           | Task     | Purpose                             |
| ---------------------------------------------- | -------- | ----------------------------------- |
| `src/ingestion/ingestion-log-store.ts`         | TASK-002 | Ingestion outcome storage           |
| `src/ingestion/ingestion-log-handler.ts`       | TASK-003 | GET /v1/ingestion handler           |
| `src/contracts/schemas/ingestion-outcome.json` | TASK-003 | IngestionOutcome schema (contracts) |
| `src/state/handler.ts`                         | TASK-006 | State query handler                 |
| `src/state/routes.ts`                          | TASK-006 | State route registration            |
| `tests/contracts/inspection-api.test.ts`       | TASK-012 | INSP-001 through INSP-017           |
| `tests/unit/ingestion-log-store.test.ts`       | TASK-002 | Unit tests for ingestion log store  |
| `tests/unit/state-handler.test.ts`             | TASK-006 | Unit tests for state handler        |


### To Modify


| File                                  | Task                         | Changes                                                 |
| ------------------------------------- | ---------------------------- | ------------------------------------------------------- |
| `src/shared/error-codes.ts`           | TASK-001                     | Add 3 error codes                                       |
| `src/ingestion/handler.ts`            | TASK-004                     | Call appendIngestionOutcome in all paths                |
| `src/ingestion/routes.ts`             | TASK-003                     | Register GET /ingestion                                 |
| `src/server.ts`                       | TASK-003, TASK-006           | Init ingestion log store, register state routes         |
| `src/state/store.ts`                  | TASK-005                     | Add listLearners()                                      |
| `src/decision/policy-loader.ts`       | TASK-007                     | Return evaluated_fields, matched_rule                   |
| `src/shared/types.ts`                 | TASK-007, TASK-008           | PolicyEvaluationResult, EvaluatedField, output_metadata |
| `src/decision/store.ts`               | TASK-008, TASK-009           | output_metadata column, enriched trace columns          |
| `src/decision/engine.ts`              | TASK-008, TASK-010           | output_metadata, enriched trace                         |
| `src/contracts/schemas/decision.json` | TASK-011                     | Extended trace schema                                   |
| `docs/api/openapi.yaml`               | TASK-003, TASK-006, TASK-011 | New endpoints, schemas                                  |


---

## Test Plan


| Test ID  | Type     | Description                                                    | Task     |
| -------- | -------- | -------------------------------------------------------------- | -------- |
| INSP-001 | contract | Ingestion log captures accepted signal                         | TASK-012 |
| INSP-002 | contract | Ingestion log captures rejected signal                         | TASK-012 |
| INSP-003 | contract | Ingestion log captures duplicate signal                        | TASK-012 |
| INSP-004 | contract | GET /v1/ingestion returns entries received_at DESC             | TASK-012 |
| INSP-005 | contract | GET /v1/ingestion?outcome=rejected filters correctly           | TASK-012 |
| INSP-006 | contract | GET /v1/state returns current learner state                    | TASK-012 |
| INSP-007 | contract | GET /v1/state?version=N returns specific version               | TASK-012 |
| INSP-008 | contract | GET /v1/state for unknown learner returns 404                  | TASK-012 |
| INSP-009 | contract | GET /v1/state/list returns learner index                       | TASK-012 |
| INSP-010 | contract | New decision includes trace.state_snapshot                     | TASK-012 |
| INSP-011 | contract | New decision includes trace.matched_rule with evaluated_fields | TASK-012 |
| INSP-012 | contract | New decision includes trace.rationale                          | TASK-012 |
| INSP-013 | contract | New decision includes output_metadata.priority                 | TASK-012 |
| INSP-014 | contract | Historical decision without enriched trace returns cleanly     | TASK-012 |
| INSP-015 | contract | Org isolation on GET /v1/ingestion                             | TASK-012 |
| INSP-016 | contract | Org isolation on GET /v1/state                                 | TASK-012 |
| INSP-017 | contract | Default-path decision has rationale "No rules matched"         | TASK-012 |
| (unit)   | unit     | Ingestion log store append, query                              | TASK-002 |
| (unit)   | unit     | State handler listLearners                                     | TASK-006 |


---

## Risks


| Risk                                                         | Impact | Mitigation                                                                        |
| ------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------- |
| appendIngestionOutcome throws and breaks ingestion           | High   | Wrap in try/catch; log and swallow. Spec mandates this.                           |
| State store has no listLearners — need new query             | Medium | Add listLearners with subquery for latest state per learner                       |
| SQLite ALTER TABLE for new columns on existing DB            | Medium | Use "ALTER TABLE ADD COLUMN IF NOT EXISTS" or check column existence before alter |
| Policy loader evaluatePolicy signature change breaks callers | Medium | Extend return type; existing callers get new fields (optional)                    |
| Historical decisions without enriched trace                  | Low    | Handler returns null/undefined for missing fields; no error                       |


---

## Verification Checklist

- All tasks completed
- All tests pass (`npm test`)
- Linter passes (`npm run lint`)
- Type check passes (`npm run typecheck`)
- Matches spec requirements
- Existing 343+ tests still pass (no regression)
- OpenAPI spec updated
- `npm run validate:contracts` passes if applicable

---

## Implementation Order

```
TASK-001 → TASK-002 → TASK-003 → TASK-004
TASK-005 → TASK-006 ──────────────────────┐
TASK-007 → TASK-008 → TASK-009 → TASK-010 → TASK-011 → TASK-012
```

Recommended sequence for Week 1 checkpoint: TASK-001 through TASK-006 first (ingestion log + state API), then TASK-008 (output_metadata priority), then TASK-007, TASK-009, TASK-010, TASK-011 (enriched trace). TASK-012 runs throughout as implementation completes.