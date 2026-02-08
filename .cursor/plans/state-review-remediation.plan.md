---
name: STATE Review Remediation
overview: "Address three review findings from the State Engine quality review: (1) wrap saveState + recordAppliedSignals in a single atomic transaction to prevent data integrity gaps, (2) add the missing STATE-013 learner isolation test to guard downstream data quality for the Decision Engine, and (3) document the Phase 2 storage abstraction prep note in the solo-dev-execution playbook so it is tracked when DynamoDB migration begins."
todos:
  - id: TASK-001
    content: Atomic saveState + recordAppliedSignals transaction in store
    status: completed
  - id: TASK-002
    content: Use atomic save in engine applySignals path
    status: pending
  - id: TASK-003
    content: Add STATE-013 learner isolation contract test
    status: pending
  - id: TASK-004
    content: Document Phase 2 storage abstraction prep in playbook Phase 2
    status: pending
isProject: false
---

# STATE Review Remediation

**Spec**: `docs/specs/state-engine.md`

## Context

From the `/review` findings:

- **ISS-002** (warning): `saveState` and `recordAppliedSignals` are called sequentially without a wrapping transaction. A crash between them leaves a state version without `applied_signals` records, risking duplicate signal application or orphaned state rows on restart.
- **ISS-003** (warning): The spec lists STATE-013 (learner isolation) but no test covers it. A future regression could leak state across learners, affecting Decision Engine data quality.
- **ISS-001** (deferred): No storage abstraction layer exists. Phase 2 DynamoDB migration will need a `StateRepository` interface. This should be documented now so it's addressed at Phase 2 start.

## Tasks

### TASK-001: Atomic saveState + recordAppliedSignals transaction

- **Status**: pending
- **Files**: `src/state/store.ts`
- **Action**: Modify
- **Details**:
  - Add a new function `saveStateWithAppliedSignals(state: LearnerState, appliedEntries: Array<{ signal_id: string; state_version: number; applied_at: string }>): void` that wraps both the `INSERT INTO learner_state` and the `INSERT OR IGNORE INTO applied_signals` in a single `db.transaction()` call.
  - Keep `saveState` and `recordAppliedSignals` as-is for backward compatibility and testing, but the new function becomes the primary path for the engine.
- **Depends on**: none
- **Verification**: `npm run lint && npm run typecheck` pass.

### TASK-002: Use atomic save in engine

- **Status**: pending
- **Files**: `src/state/engine.ts`
- **Action**: Modify
- **Details**:
  - Replace the sequential `stateStore.saveState(...)` + `stateStore.recordAppliedSignals(...)` calls in `applySignals` (around lines 224-233) with a single call to `stateStore.saveStateWithAppliedSignals(learnerState, entries)`.
  - The retry/catch logic around it stays the same (the transaction will throw on UNIQUE constraint failure just like `saveState` does today).
- **Depends on**: TASK-001
- **Verification**: All existing tests pass (`npm test`). The optimistic-lock retry tests still work because the constraint error surfaces from the transaction the same way.

### TASK-003: Add STATE-013 learner isolation test

- **Status**: pending
- **Files**: `tests/contracts/state-engine.test.ts`
- **Action**: Modify
- **Details**:
  - Add a new `describe('STATE-013: State isolation by learner')` block.
  - Test: append a signal for learner-1 and a different signal for learner-2 (same org). Apply each. Assert that `getState(org, 'learner-1')` contains only learner-1's payload, and `getState(org, 'learner-2')` contains only learner-2's payload. Versions are independent (both start at v1).
- **Depends on**: none (can run in parallel with TASK-001/002)
- **Verification**: `npm test -- tests/contracts/state-engine.test.ts` passes.

### TASK-004: Document Phase 2 storage abstraction prep in playbook

- **Status**: pending
- **Files**: `docs/foundation/solo-dev-execution-playbook.md`
- **Action**: Modify
- **Details**:
  - In the **Phase 2: Deploy to AWS** section, add a **"Phase 2 prep (storage)"** or **"Before migrating storage"** subsection (e.g. immediately after the Phase 2 heading or before "DynamoDB Table Design"). The note should state: before converting any store (Signal Log, STATE, Decision) to DynamoDB, extract a repository/interface from the current SQLite module so the engine or handlers depend on that interface; then implement one adapter for SQLite and one for DynamoDB. That keeps business logic unchanged and preserves all contract tests as the migration guard. Apply the same approach for STATE Store (StateRepository), Signal Log, and Decision Store when each is migrated.
  - This ensures the item is visible in the roadmap when Phase 2 planning begins.
- **Depends on**: none
- **Verification**: Playbook reads cleanly; no code changes.

## Files Summary

### To Modify


| File                                             | Task     | Changes                                                  |
| ------------------------------------------------ | -------- | -------------------------------------------------------- |
| `src/state/store.ts`                             | TASK-001 | Add `saveStateWithAppliedSignals` transactional function |
| `src/state/engine.ts`                            | TASK-002 | Replace sequential save+record with atomic call          |
| `tests/contracts/state-engine.test.ts`           | TASK-003 | Add STATE-013 learner isolation test                     |
| `docs/foundation/solo-dev-execution-playbook.md` | TASK-004 | Add Phase 2 prep (storage abstraction) subsection        |


## Test Plan


| Test ID    | Type            | Description                                         | Task     |
| ---------- | --------------- | --------------------------------------------------- | -------- |
| STATE-013  | contract        | Learner A state independent of learner B (same org) | TASK-003 |
| (existing) | unit + contract | All existing tests remain green                     | TASK-002 |


## Risks


| Risk                                                            | Impact | Mitigation                                                                                  |
| --------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| Transaction wrapper changes error shape for constraint failures | Low    | SQLite transactions surface the same error from the inner INSERT; retry tests validate this |
| STATE-013 test is too narrow                                    | Low    | Test covers same-org different-learner; cross-org is already covered by STATE-003           |


## Verification Checklist

- All tasks completed
- All tests pass (`npm test`)
- Linter passes (`npm run lint`)
- Type check passes (`npm run typecheck`)
- Playbook Phase 2 section documents storage abstraction prep item

## Implementation Order

```
TASK-001 (atomic store function)
    │
    v
TASK-002 (engine uses atomic save)      TASK-003 (STATE-013 test)      TASK-004 (playbook note)
```

TASK-001 → TASK-002 are sequential. TASK-003 and TASK-004 are independent and can run in parallel with 001/002.