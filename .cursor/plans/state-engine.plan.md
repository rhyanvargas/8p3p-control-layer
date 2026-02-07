---
name: STATE Engine
overview: Implement Stage 3 of the control layer lifecycle—STATE store, applySignals logic, validator, and integration with Signal Log and Ingestion. Delivers canonical learner state with versioning and provenance; no external API. Depends on adding getSignalsByIds to Signal Log store first.
todos:
  - id: TASK-001
    content: Add getSignalsByIds to Signal Log store
    status: completed
  - id: TASK-002
    content: Add STATE types and error codes to shared
    status: completed
  - id: TASK-003
    content: Implement STATE store (SQLite + applied_signals)
    status: completed
  - id: TASK-004
    content: Implement STATE validator
    status: completed
  - id: TASK-005
    content: Implement STATE engine (computeNewState + applySignals)
    status: completed
  - id: TASK-006
    content: Wire ingestion to applySignals and init STATE store in server
    status: pending
  - id: TASK-007
    content: Contract tests STATE-001 through STATE-008
    status: pending
  - id: TASK-008
    content: Unit tests for state store and engine
    status: pending
isProject: false
---

# STATE Engine Implementation Plan

**Spec**: `docs/specs/state-engine.md`

## Prerequisites

Before starting implementation:

- Signal Ingestion and Signal Log implemented (POST/GET /v1/signals)
- Signal Log store has `appendSignal`, `querySignals` (no `getSignalsByIds` yet—TASK-001 adds it)
- `src/shared/types.ts` has `SignalRecord`, `ValidationResult`, `RejectionReason`
- `src/ingestion/forbidden-keys.ts` has `FORBIDDEN_KEYS` and `detectForbiddenKeys` (reusable for state)

## Tasks

### TASK-001: Add getSignalsByIds to Signal Log store

- **Status**: pending
- **Files**: `src/signalLog/store.ts`
- **Action**: Modify
- **Details**:
  - Add `getSignalsByIds(orgId: string, signalIds: string[]): SignalRecord[]` per `docs/specs/signal-log.md`.
  - Query by `org_id` and `signal_id IN (...)`; return rows ordered by `accepted_at ASC`, then `id ASC`.
  - If any `signal_id` is not found, throw an error with `code: 'unknown_signal_id'` (and message/field_path as needed).
  - If any returned signal has `org_id !== orgId`, throw with `code: 'signals_not_in_org_scope'`.
  - Return array of `SignalRecord` (reuse `rowToSignalRecord`-style mapping).
- **Depends on**: none
- **Verification**: Unit test in signal-log-store (getSignalsByIds returns signals in accepted_at order; throws for unknown id and wrong org).

### TASK-002: Add STATE types and error codes to shared

- **Status**: pending
- **Files**: `src/shared/types.ts`, `src/shared/error-codes.ts`
- **Action**: Modify
- **Details**:
  - In `types.ts`: Add `LearnerState` (org_id, learner_reference, state_id, state_version, updated_at, state, provenance), `ApplySignalsRequest` (org_id, learner_reference, signal_ids, requested_at), `ApplySignalsResult` (org_id, learner_reference, prior_state_version, new_state_version, state_id, applied_signal_ids, updated_at).
  - In `error-codes.ts`: Add `UNKNOWN_SIGNAL_ID`, `SIGNALS_NOT_IN_ORG_SCOPE`, `STATE_PAYLOAD_NOT_OBJECT`, `STATE_VERSION_CONFLICT` (values: `unknown_signal_id`, `signals_not_in_org_scope`, `state_payload_not_object`, `state_version_conflict`).
- **Depends on**: none
- **Verification**: TypeScript compiles; no lint errors.

### TASK-003: Implement STATE store (SQLite + applied_signals)

- **Status**: pending
- **Files**: `src/state/store.ts`
- **Action**: Create
- **Details**:
  - Create `learner_state` table per spec (id, org_id, learner_reference, state_id, state_version, updated_at, state TEXT, last_signal_id, last_signal_timestamp; UNIQUE(org_id, learner_reference, state_version)).
  - Create `applied_signals` table (org_id, learner_reference, signal_id, state_version, applied_at; PRIMARY KEY(org_id, learner_reference, signal_id)).
  - Indexes: `idx_learner_state_lookup`, `idx_learner_state_current` per spec.
  - Implement: `initStateStore(dbPath)`, `getState(orgId, learnerReference)`, `getStateByVersion(orgId, learnerReference, version)`, `saveState(state)`, `closeStateStore()`, `clearStateStore()`.
  - Helpers: check/applied_signals for idempotency (e.g. `isSignalApplied(orgId, learnerRef, signalId)`, `recordAppliedSignals(...)`).
  - Use same patterns as `signalLog/store.ts` (better-sqlite3, JSON.stringify for state).
- **Depends on**: TASK-002
- **Verification**: Unit tests: init creates tables; getState/saveState round-trip; getStateByVersion; clearStateStore.

### TASK-004: Implement STATE validator

- **Status**: pending
- **Files**: `src/state/validator.ts`
- **Action**: Create
- **Details**:
  - `validateApplySignalsRequest(request: unknown): ValidationResult` — require org_id (non-blank), learner_reference (non-blank), signal_ids (non-empty array of strings). Return errors with codes `org_scope_required`, `missing_required_field` and optional `field_path`.
  - `validateStateObject(state: Record<string, unknown>): ValidationResult` — use same forbidden-key check as ingestion (import `detectForbiddenKeys` from `../ingestion/forbidden-keys.js` with basePath `'state'`). Return `forbidden_semantic_key_detected` with field_path when found; ensure non-object (e.g. array) returns `state_payload_not_object`.
- **Depends on**: TASK-002
- **Verification**: Unit tests for validator (valid request passes; missing org_id/learner_reference/empty signal_ids fail; state with forbidden key fails).

### TASK-005: Implement STATE engine (computeNewState + applySignals)

- **Status**: pending
- **Files**: `src/state/engine.ts`
- **Action**: Create
- **Details**:
  - **Deep merge**: Implement deep merge (objects merge recursively; arrays replace; explicit null removes key; primitives overwrite). Use for merging signal payloads into state.
  - **computeNewState(currentState: LearnerState | null, signals: SignalRecord[]): Record<string, unknown>** — start with current state?.state ?? {}; for each signal in order, deepMerge(state, signal.payload); return state.
  - **applySignals(request: ApplySignalsRequest)**:
    1. Validate request (validator); if invalid return/reject with ValidationResult errors.
    2. Call `getSignalsByIds(request.org_id, request.signal_ids)`; on throw (unknown_signal_id / signals_not_in_org_scope), return rejection with that code.
    3. Get current state via store.getState(orgId, learnerReference).
    4. Compute new state with computeNewState; call validateStateObject on result; if invalid return rejection.
    5. Optimistic write: new version = (current?.state_version ?? 0) + 1; build LearnerState; saveState (and record applied_signals). If save fails due to version conflict (STATE_VERSION_CONFLICT), retry once by re-reading current and re-computing (spec: re-fetch and retry).
  - Generate `state_id` per spec (e.g. `{org_id}:{learner_reference}:v{version}`).
  - Provenance: last_signal_id and last_signal_timestamp from last signal in ordered list.
  - Idempotency: before applying, filter out already-applied signal_ids (query applied_signals); only apply new ones; if none new, return prior state as result (same state_id/version).
- **Depends on**: TASK-001, TASK-002, TASK-003, TASK-004
- **Verification**: Unit tests for computeNewState (merge order, empty state); applySignals happy path and rejection paths.

### TASK-006: Wire ingestion to applySignals and init STATE store in server

- **Status**: pending
- **Files**: `src/ingestion/handler.ts`, `src/server.ts`
- **Action**: Modify
- **Details**:
  - In `server.ts`: Add STATE store init (e.g. `STATE_STORE_DB_PATH` or reuse/separate path); call `initStateStore(...)` after Signal Log init; ensure data dir exists.
  - In `ingestion/handler.ts`: After `appendSignal(signal, acceptedAt)` for an accepted signal, call `applySignals({ org_id: signal.org_id, learner_reference: signal.learner_reference, signal_ids: [signal.signal_id], requested_at: acceptedAt })`. Catch rejection from applySignals: either log and continue (signal already in log) or surface—spec says "synchronous during ingestion" so apply is best-effort or fail the request; recommend log and continue so ingestion remains available even if STATE apply fails temporarily.
  - Decision: On applySignals rejection after appendSignal, log error and still return 200 with status accepted (signal is in log; STATE can be retried later) to keep ingestion resilient. Document in code comment.
- **Depends on**: TASK-005
- **Verification**: Integration: POST a signal, then GET state via store or engine.getState (if exposed for tests)—state version 1 exists. No new REST endpoint; state not exposed externally.

### TASK-007: Contract tests STATE-001 through STATE-008

- **Status**: pending
- **Files**: `tests/contracts/state-engine.test.ts`
- **Action**: Create
- **Details**:
  - Use in-memory SQLite for Signal Log, Idempotency, and STATE stores. Build ApplySignalsRequest and call applySignals (or trigger via ingestion POST then assert state).
  - STATE-001: ApplySignalsRequest with known signal_ids → ApplySignalsResult, new_state_version >= prior_state_version, applied_signal_ids match.
  - STATE-002: signal_ids include unknown id → rejected, unknown_signal_id.
  - STATE-003: org A request but signal belongs to org B → rejected, signals_not_in_org_scope.
  - STATE-004: Simulate state not object (e.g. internal path or payload that yields array)—rejected, state_payload_not_object.
  - STATE-005: Signal payload with forbidden key (e.g. course) → rejected, forbidden_semantic_key_detected.
  - STATE-006: Two sequential applySignals → second new_state_version > first.
  - STATE-007: Same signal_ids applied twice with same prior state → idempotent (same result or duplicate behavior).
  - STATE-008: Concurrent apply (two overlapping requests)—final state_version and state identical regardless of order (may require parallel invocations or deterministic ordering in test).
- **Depends on**: TASK-006
- **Verification**: `npm test -- tests/contracts/state-engine.test.ts` passes.

### TASK-008: Unit tests for state store and engine

- **Status**: pending
- **Files**: `tests/unit/state-store.test.ts`, `tests/unit/state-engine.test.ts`
- **Action**: Create
- **Details**:
  - **state-store.test.ts**: initStateStore creates schema; getState returns null for unknown learner; saveState then getState returns same LearnerState; getStateByVersion returns correct version; clearStateStore wipes data; applied_signals recording and isSignalApplied (or equivalent).
  - **state-engine.test.ts**: computeNewState with empty current and one signal; computeNewState merge order; validateStateObject (delegate to validator); applySignals validation failures (missing org_id, empty signal_ids); applySignals unknown_signal_id; applySignals forbidden key in payload; monotonic version; provenance last_signal_id.
- **Depends on**: TASK-005
- **Verification**: `npm test -- tests/unit/state-store.test.ts tests/unit/state-engine.test.ts` passes.

## Files Summary

### To Create


| File                                   | Task     | Purpose                                   |
| -------------------------------------- | -------- | ----------------------------------------- |
| `src/state/store.ts`                   | TASK-003 | SQLite STATE store + applied_signals      |
| `src/state/validator.ts`               | TASK-004 | Request and state object validation       |
| `src/state/engine.ts`                  | TASK-005 | computeNewState, applySignals, deep merge |
| `tests/contracts/state-engine.test.ts` | TASK-007 | STATE-001–STATE-008 contract tests        |
| `tests/unit/state-store.test.ts`       | TASK-008 | STATE store unit tests                    |
| `tests/unit/state-engine.test.ts`      | TASK-008 | STATE engine unit tests                   |


### To Modify


| File                        | Task     | Changes                                                                                           |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `src/signalLog/store.ts`    | TASK-001 | Add getSignalsByIds                                                                               |
| `src/shared/types.ts`       | TASK-002 | Add LearnerState, ApplySignalsRequest, ApplySignalsResult                                         |
| `src/shared/error-codes.ts` | TASK-002 | Add unknown_signal_id, signals_not_in_org_scope, state_payload_not_object, state_version_conflict |
| `src/ingestion/handler.ts`  | TASK-006 | After appendSignal, call applySignals                                                             |
| `src/server.ts`             | TASK-006 | initStateStore, ensure STATE db path                                                              |


## Test Plan


| Test ID   | Type     | Description                                               | Task     |
| --------- | -------- | --------------------------------------------------------- | -------- |
| STATE-001 | contract | ApplySignals happy path                                   | TASK-007 |
| STATE-002 | contract | Unknown signal ID → unknown_signal_id                     | TASK-007 |
| STATE-003 | contract | Cross-org signal → signals_not_in_org_scope               | TASK-007 |
| STATE-004 | contract | State not object → state_payload_not_object               | TASK-007 |
| STATE-005 | contract | Forbidden key in state → forbidden_semantic_key_detected  | TASK-007 |
| STATE-006 | contract | Monotonic state_version                                   | TASK-007 |
| STATE-007 | contract | Idempotency same signals + prior state                    | TASK-007 |
| STATE-008 | contract | Deterministic conflict resolution                         | TASK-007 |
| (unit)    | unit     | Store init, getState, getStateByVersion, saveState, clear | TASK-008 |
| (unit)    | unit     | Engine computeNewState, applySignals paths                | TASK-008 |


## Risks


| Risk                                     | Impact | Mitigation                                                                                                 |
| ---------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| getSignalsByIds throws vs returns result | Low    | Use throw with .code; engine catches and maps to rejection with field_path where needed                    |
| Optimistic lock retry loop               | Medium | Cap retries (e.g. 2); then return state_version_conflict                                                   |
| Ingestion + STATE sync failure           | Medium | Log and keep 200 accepted so Signal Log has signal; STATE can be reapplied on next read or batch job later |
| Applied_signals vs replay order          | Low    | Apply only signals not in applied_signals; fetch by ids and sort by accepted_at so order is deterministic  |


## Verification Checklist

- All tasks completed
- All tests pass (`npm test`)
- Linter passes (`npm run lint`)
- Type check passes (`npm run typecheck` or `tsc --noEmit`)
- No external setState endpoint (STATE authority maintained)
- Spec success criteria in state-engine.md satisfied

## Implementation Order

```
TASK-001 (getSignalsByIds)
    ↓
TASK-002 (types + error codes)
    ↓
TASK-003 (STATE store)     TASK-004 (validator)
    ↓                             ↓
    └──────→ TASK-005 (engine) ←──┘
                  ↓
            TASK-006 (wire ingestion + server)
                  ↓
    ┌─────────────┴─────────────┐
    ↓                           ↓
TASK-007 (contract tests)   TASK-008 (unit tests)
```

