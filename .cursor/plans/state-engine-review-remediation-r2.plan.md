---
name: STATE Engine Review Remediation (Round 2)
overview: "Address findings from the second /review cycle: (1) harden the conflict path by extracting SQLite-specific error detection from engine.ts into store.ts behind a vendor-neutral StateVersionConflictError, (2) add missing contract tests STATE-009 through STATE-012 and unit tests for saveStateWithAppliedSignals, (3) update the state-engine spec to document saveStateWithAppliedSignals and add a Phase 2 Storage Abstraction section with the StateRepository interface contract, (4) expand the solo-dev-execution-playbook Phase 2 section with detailed StateRepository interface signatures and migration checklist."
todos:
  - id: TASK-001
    content: Extract SQLite error detection into store, expose vendor-neutral StateVersionConflictError
    status: completed
  - id: TASK-002
    content: Refactor engine.ts to catch StateVersionConflictError instead of SQLite-specific errors
    status: completed
  - id: TASK-003
    content: Update unit tests for refactored conflict path
    status: completed
  - id: TASK-004
    content: Add missing contract tests STATE-009 through STATE-012
    status: completed
  - id: TASK-005
    content: Add unit tests for saveStateWithAppliedSignals
    status: completed
  - id: TASK-006
    content: Update state-engine spec with store function changes and Phase 2 storage abstraction section
    status: completed
  - id: TASK-007
    content: Expand playbook Phase 2 section with StateRepository interface and migration checklist
    status: completed
isProject: false
---

# STATE Engine Review Remediation (Round 2)

**Spec**: `docs/specs/state-engine.md`
**Prior Plan**: `.cursor/plans/state-review-remediation.plan.md` (completed)
**Review Source**: `/review` findings (ISS-001, ISS-002, ISS-003, ISS-004, ISS-005, ISS-006, ISS-007)

## Context

From the second `/review` cycle, seven issues were identified. This plan addresses them in priority order:

- **ISS-001** (error): `isSqliteConstraintError()` lives in `engine.ts` — business logic should not know about SQLite. Extract to store, expose vendor-neutral error.
- **ISS-003** (error): Contract tests STATE-009 through STATE-012 are listed in spec but missing from `tests/contracts/state-engine.test.ts`.
- **ISS-005** (warning): `saveStateWithAppliedSignals()` has no dedicated unit tests in `tests/unit/state-store.test.ts`.
- **ISS-002** (error): No storage interface/repository pattern for cloud migration. Document `StateRepository` interface in spec and playbook for Phase 2.
- **ISS-004** (warning): `saveState()` is dead code on production path — add deprecation note.
- **ISS-006** (warning): `requested_at` not validated — note in spec for future tightening.
- **ISS-007** (warning): Module-level singleton prevents DI — deferred to Phase 2.

### Priority Order

1. **Conflict-path hardening** (TASK-001 → TASK-002 → TASK-003) — ISS-001
2. **Missing tests** (TASK-004, TASK-005) — ISS-003, ISS-005
3. **Spec and playbook documentation** (TASK-006, TASK-007) — ISS-002, ISS-004, ISS-006, ISS-007

## Prerequisites

Before starting implementation:

- All 180 existing tests pass
- Prior remediation plan fully completed (state-review-remediation.plan.md)
- Review report accepted

---

## Tasks

### TASK-001: Extract SQLite error detection into store, expose vendor-neutral StateVersionConflictError

- **Status**: completed
- **Files**: `src/state/store.ts`
- **Action**: Modify
- **Details**:
  1. Define a `StateVersionConflictError` class in `store.ts` that extends `Error` with a `code` property set to `'state_version_conflict'`.
  2. Move the `isSqliteConstraintError()` helper from `engine.ts` into `store.ts` as a private/unexported function.
  3. Modify `saveStateWithAppliedSignals()` to catch SQLite constraint errors internally and re-throw them as `StateVersionConflictError`.
  4. Export `StateVersionConflictError` so the engine and tests can reference it.
  5. Add a `@deprecated` JSDoc tag to `saveState()` noting it was superseded by `saveStateWithAppliedSignals()`.
- **Depends on**: none
- **Verification**: `npm run typecheck` passes. Existing tests may break until TASK-002/003 update the engine and tests.

### TASK-002: Refactor engine.ts to catch StateVersionConflictError instead of SQLite-specific errors

- **Status**: completed
- **Files**: `src/state/engine.ts`
- **Action**: Modify
- **Details**:
  1. Remove `isSqliteConstraintError()` and the `SignalLogError` / `isSignalLogError` helper from `engine.ts` (if the latter is only used for this path).
  2. Import `StateVersionConflictError` from `store.ts`.
  3. In the `applySignals()` save loop, replace `isSqliteConstraintError(saveErr)` with `saveErr instanceof StateVersionConflictError`.
  4. Remove the now-unnecessary `export` of `isSqliteConstraintError` from `engine.ts`.
  5. Keep `deepMerge`, `computeNewState`, `formatStateId`, and `applySignals` exports unchanged.
  - **Note**: `isSignalLogError` is used for the `getSignalsByIds` error path (not SQLite-related), so it should be preserved.
- **Depends on**: TASK-001
- **Verification**: `npm run typecheck` passes. Full test suite runs.

### TASK-003: Update unit tests for refactored conflict path

- **Status**: completed
- **Files**: `tests/unit/state-engine.test.ts`
- **Action**: Modify
- **Details**:
  1. Remove the `isSqliteConstraintError helper` describe block (tests for `isSqliteConstraintError` which is no longer exported from engine).
  2. The `optimistic-lock retry on version conflict` tests should continue to work since the engine's behavior is unchanged (retry on conflict, return conflict error after max retries). Verify they still pass.
  3. Optionally add a new test that verifies `StateVersionConflictError` is correctly caught (e.g., mock `saveStateWithAppliedSignals` to throw `StateVersionConflictError` directly).
- **Depends on**: TASK-002
- **Verification**: `npm test -- tests/unit/state-engine.test.ts` passes. No test regressions.

### TASK-004: Add missing contract tests STATE-009 through STATE-012

- **Status**: completed
- **Files**: `tests/contracts/state-engine.test.ts`
- **Action**: Modify
- **Details**:
Add four new `describe` blocks following the existing contract test pattern:
**STATE-009: New learner state**
  - Append a signal and apply it for a brand-new learner (no prior state).
  - Assert: `prior_state_version === 0`, `new_state_version === 1`, `state_id` matches format, persisted state matches signal payload.
  **STATE-010: Empty state object allowed**
  - Append a signal whose payload is `{}` (empty object) and apply it.
  - Assert: `ok === true`, `getState()` returns `state: {}` (empty object is valid).
  **STATE-011: Provenance tracking**
  - Append two signals and apply both.
  - Assert: persisted `provenance.last_signal_id` equals the second signal's ID, `provenance.last_signal_timestamp` equals the second signal's `accepted_at`.
  **STATE-012: Get state by version (historical)**
  - Apply two signals sequentially (creating v1 and v2).
  - Assert: `getStateByVersion(org, learner, 1)` returns v1 state, `getStateByVersion(org, learner, 2)` returns v2 state. Both are independently retrievable.
- **Depends on**: none (can run in parallel with TASK-001/002/003)
- **Verification**: `npm test -- tests/contracts/state-engine.test.ts` passes with 15+ tests.

### TASK-005: Add unit tests for saveStateWithAppliedSignals

- **Status**: completed
- **Files**: `tests/unit/state-store.test.ts`
- **Action**: Modify
- **Details**:
Add a new `describe('saveStateWithAppliedSignals')` block with these tests:
  1. **Happy path**: Save state + applied signals in one call. Assert state is persisted and `isSignalApplied` returns true for each signal.
  2. **Atomicity — rollback on conflict**: Insert a conflicting row first, then call `saveStateWithAppliedSignals`. Assert it throws `StateVersionConflictError` and that applied_signals were NOT inserted (transaction rolled back).
  3. **Idempotent applied signals**: If a signal is already in `applied_signals`, the `INSERT OR IGNORE` should not error. Call with a mix of new and already-applied signal IDs; assert no error and state is saved.
  4. **Empty entries array**: Call with an empty `appliedEntries` array. Assert state is saved, no applied_signals rows added.
- **Depends on**: TASK-001 (needs `StateVersionConflictError` to exist)
- **Verification**: `npm test -- tests/unit/state-store.test.ts` passes.

### TASK-006: Update state-engine spec with store function changes and Phase 2 storage abstraction section

- **Status**: completed
- **Files**: `docs/specs/state-engine.md`
- **Action**: Modify
- **Details**:
  1. **Update Implementation Components → STATE Store** (section 1, around line 241):
    - Add `saveStateWithAppliedSignals()` to the functions list as the primary save path.
    - Mark `saveState()` as deprecated (kept for backward compatibility).
    - Add `isSignalApplied()` and `recordAppliedSignals()` to the documented function list.
  2. **Add section: "Phase 2: Storage Abstraction"** (before or after "Out of Scope"):
    - Document the `StateRepository` interface contract with method signatures.
    - Explain the adapter pattern: `SqliteStateRepository` (current) and `DynamoDbStateRepository` (Phase 2).
    - Note that the engine must depend on the interface, not the concrete store.
    - Reference ISS-001 (conflict error abstraction) as the first step already completed.
    - Note ISS-007 (module-level singleton → dependency injection) as a Phase 2 prerequisite.
  3. **Update Success Criteria**: Add checkmarks for STATE-009 through STATE-013 contract tests.
  4. **Add note about `requested_at` validation** (ISS-006): In Validation Rules → ApplySignalsRequest, add a note that `requested_at` is currently not validated but should be validated as RFC3339 in a future tightening pass.
- **Depends on**: TASK-001 (to document the new error abstraction accurately)
- **Verification**: Spec reads consistently with implementation. No code changes.

### TASK-007: Expand playbook Phase 2 section with StateRepository interface and migration checklist

- **Status**: completed
- **Files**: `docs/foundation/solo-dev-execution-playbook.md`
- **Action**: Modify
- **Details**:
Expand the existing "Before migrating storage (Phase 2 prep)" subsection (around line 196) with:
  1. **StateRepository interface signatures**:
    ```typescript
     interface StateRepository {
       getState(orgId: string, learnerRef: string): LearnerState | null;
       getStateByVersion(orgId: string, learnerRef: string, version: number): LearnerState | null;
       saveStateWithAppliedSignals(state: LearnerState, entries: AppliedSignalEntry[]): void;
       isSignalApplied(orgId: string, learnerRef: string, signalId: string): boolean;
       close(): void;
     }
    ```
  2. **Migration checklist**:
    - Define `StateRepository` interface in `src/state/types.ts`
    - Implement `SqliteStateRepository` (extract from current `store.ts`)
    - Refactor engine to accept `StateRepository` via constructor/factory
    - All contract tests pass with `SqliteStateRepository`
    - Implement `DynamoDbStateRepository`
    - All contract tests pass with `DynamoDbStateRepository`
    - Apply same pattern to Signal Log (`SignalLogRepository`)
  3. **Key design notes**:
    - `StateVersionConflictError` is already vendor-neutral (done in this plan's TASK-001)
    - DynamoDB uses `TransactWriteItems` instead of `db.transaction()`
    - DynamoDB uses native Map type instead of `JSON.stringify` to TEXT column
    - Connection management moves from module singleton to injected instance
- **Depends on**: TASK-006 (spec should be updated first for consistency)
- **Verification**: Playbook reads cleanly. No code changes.

---

## Files Summary

### To Modify


| File                                             | Task     | Changes                                                                                                                            |
| ------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/state/store.ts`                             | TASK-001 | Add `StateVersionConflictError`, move `isSqliteConstraintError` in, wrap save to throw vendor-neutral error, deprecate `saveState` |
| `src/state/engine.ts`                            | TASK-002 | Remove `isSqliteConstraintError`, import and catch `StateVersionConflictError`                                                     |
| `tests/unit/state-engine.test.ts`                | TASK-003 | Remove `isSqliteConstraintError` tests, verify retry tests still pass                                                              |
| `tests/contracts/state-engine.test.ts`           | TASK-004 | Add STATE-009, STATE-010, STATE-011, STATE-012 contract tests                                                                      |
| `tests/unit/state-store.test.ts`                 | TASK-005 | Add `saveStateWithAppliedSignals` unit tests                                                                                       |
| `docs/specs/state-engine.md`                     | TASK-006 | Update store functions, add Phase 2 section, update success criteria                                                               |
| `docs/foundation/solo-dev-execution-playbook.md` | TASK-007 | Expand Phase 2 prep with StateRepository interface and migration checklist                                                         |


### No New Files

All changes are modifications to existing files.

---

## Test Plan


| Test ID      | Type            | Description                                                      | Task     |
| ------------ | --------------- | ---------------------------------------------------------------- | -------- |
| STATE-009    | contract        | New learner state: first signal → version 1                      | TASK-004 |
| STATE-010    | contract        | Empty state object `{}` is valid                                 | TASK-004 |
| STATE-011    | contract        | Provenance tracks last applied signal                            | TASK-004 |
| STATE-012    | contract        | Historical state versions retrievable                            | TASK-004 |
| UNIT-SWAS-01 | unit            | saveStateWithAppliedSignals happy path                           | TASK-005 |
| UNIT-SWAS-02 | unit            | Atomicity: rollback on conflict throws StateVersionConflictError | TASK-005 |
| UNIT-SWAS-03 | unit            | Idempotent INSERT OR IGNORE for applied signals                  | TASK-005 |
| UNIT-SWAS-04 | unit            | Empty appliedEntries array                                       | TASK-005 |
| (existing)   | unit + contract | All 180 existing tests remain green after refactor               | TASK-003 |


---

## Risks


| Risk                                                                         | Impact | Mitigation                                                                                                                                |
| ---------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Wrapping SQLite errors in store changes error shape for existing retry tests | Medium | TASK-003 verifies retry tests still work; the engine now catches `StateVersionConflictError` which is always thrown on the same code path |
| Removing `isSqliteConstraintError` export breaks external consumers          | Low    | Only imported in `tests/unit/state-engine.test.ts` — updated in TASK-003                                                                  |
| `saveState()` deprecation confuses future contributors                       | Low    | JSDoc `@deprecated` tag and spec update in TASK-006 make intent clear                                                                     |
| Phase 2 spec additions become stale before Phase 2 starts                    | Low    | Scoped to interface contract only; implementation details deferred                                                                        |


---

## Verification Checklist

- All tasks completed
- All tests pass (`npm test`) — target: 190+ tests (180 existing + 8 new)
- Linter passes (`npm run lint`)
- Type check passes (`npm run typecheck`)
- Engine no longer imports or references SQLite-specific types/functions
- `StateVersionConflictError` is the only conflict error visible to engine
- Contract tests cover STATE-001 through STATE-013 (complete matrix)
- `saveStateWithAppliedSignals` has dedicated unit tests
- State-engine spec documents `saveStateWithAppliedSignals` and Phase 2 storage abstraction
- Playbook Phase 2 section includes `StateRepository` interface signatures and migration checklist

---

## Implementation Order

```
TASK-001 (vendor-neutral error in store)
    │
    ▼
TASK-002 (engine catches new error)          TASK-004 (contract tests STATE-009..012)
    │
    ▼
TASK-003 (update unit tests for refactor)    TASK-005 (saveStateWithAppliedSignals unit tests)
    │                                             │
    ▼                                             ▼
TASK-006 (update state-engine spec)
    │
    ▼
TASK-007 (expand playbook Phase 2)
```

**Critical path**: TASK-001 → TASK-002 → TASK-003 → TASK-006 → TASK-007
**Parallel lane**: TASK-004 and TASK-005 can start immediately and run alongside the critical path.