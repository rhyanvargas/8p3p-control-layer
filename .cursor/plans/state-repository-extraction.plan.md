---
name: State Repository Extraction
overview: "Extract a vendor-agnostic StateRepository interface from the current SQLite-specific state store, then implement SqliteStateRepository as the Phase 1 adapter. This is the most complex extraction — two tables (learner_state, applied_signals), optimistic-lock conflict handling, transactional writes, and version-history queries. Goal: make the DynamoDB migration in Phase 2 mechanical — create a new adapter class, swap it in server.ts, done. All existing function signatures and exports are preserved so engine, handler, and all tests require zero changes."
todos:
  - id: TASK-001
    content: Define StateRepository interface in src/state/repository.ts
    status: completed
  - id: TASK-002
    content: Implement SqliteStateRepository class in src/state/store.ts
    status: completed
  - id: TASK-003
    content: Add repository injection support to state store module
    status: completed
  - id: TASK-004
    content: Update server.ts — confirm wiring + add Phase 2 migration comment
    status: completed
  - id: TASK-005
    content: Update state-engine spec — document repository interface and file structure
    status: completed
  - id: TASK-006
    content: Regression check — all tests pass, build clean, lint clean
    status: completed
isProject: false
---

# State Repository Extraction

**Sources**: `docs/specs/state-engine.md` §Implementation Components, `docs/specs/aws-deployment.md` §DynamoDB Adapters

## Prerequisites

- Decision Repository Extraction plan executed (pattern proven)
- Idempotency Repository Extraction plan executed
- Signal Log Repository Extraction plan executed
- All tests passing, no lint or type errors

## Clarification Notes

- **Scope is State Store only.** This is the most complex of the four stores: two tables (`learner_state`, `applied_signals`), optimistic-lock conflict detection, transactional writes (`saveStateWithAppliedSignals`), and version-history queries.
- **Zero downstream changes.** All existing module-level function exports (`initStateStore`, `getState`, `getStateByVersion`, `saveState`, `saveStateWithAppliedSignals`, `isSignalApplied`, `recordAppliedSignals`, `closeStateStore`, `clearStateStore`, `getStateStoreDatabase`) keep their signatures. The STATE Engine and all tests continue importing from `./store.js` unchanged.
- `**StateVersionConflictError` remains module-level.** It is an error class, not a repository concern. Both SQLite and DynamoDB adapters throw this same error on version conflicts. It stays exported from `store.ts` and is not part of the interface — it's part of the error contract.
- `**clearStateStore()` is test-only.** It lives on the `SqliteStateRepository` class but is intentionally excluded from the `StateRepository` interface.
- `**saveState()` is deprecated.** The interface still includes it for backward compatibility, but the preferred method is `saveStateWithAppliedSignals()`. The deprecation annotation is preserved.
- **Transactional guarantee must be preserved.** `saveStateWithAppliedSignals` wraps state insert + applied-signals inserts in a single SQLite transaction. The interface documents this atomicity requirement — any adapter must ensure crash-safety (DynamoDB: TransactWriteItems).

## Tasks

### TASK-001: Define StateRepository interface

- **Status**: completed
- **Files**: `src/state/repository.ts`
- **Action**: Create
- **Depends on**: none
- **Details**:
Create the `StateRepository` interface:

```typescript
  import type { LearnerState } from '../shared/types.js';

  /**
   * StateRepository — vendor-agnostic learner state persistence contract.
   * Phase 1: SqliteStateRepository (in store.ts)
   * Phase 2: DynamoDbStateRepository
   *
   * Core guarantees all adapters must uphold:
   * - Immutable history: each state version is a new record (append-only)
   * - Optimistic lock: saveState/saveStateWithAppliedSignals throws
   *   StateVersionConflictError on duplicate (org_id, learner_reference, state_version)
   * - Atomicity: saveStateWithAppliedSignals persists state + applied_signals
   *   in a single atomic operation (SQLite transaction / DynamoDB TransactWriteItems)
   * - Applied-signal idempotency: recordAppliedSignals uses INSERT OR IGNORE semantics
   *
   * clearStateStore() is intentionally omitted — test utility only.
   */
  export interface StateRepository {
    getState(orgId: string, learnerReference: string): LearnerState | null;
    getStateByVersion(orgId: string, learnerReference: string, version: number): LearnerState | null;
    saveState(state: LearnerState): void;
    saveStateWithAppliedSignals(
      state: LearnerState,
      appliedEntries: Array<{ signal_id: string; state_version: number; applied_at: string }>
    ): void;
    isSignalApplied(orgId: string, learnerReference: string, signalId: string): boolean;
    recordAppliedSignals(
      orgId: string,
      learnerReference: string,
      entries: Array<{ signal_id: string; state_version: number; applied_at: string }>
    ): void;
    close(): void;
  }
```

- **Verification**: `npm run build` succeeds (no consumers yet, just the interface).

### TASK-002: Implement SqliteStateRepository class

- **Status**: completed
- **Files**: `src/state/store.ts`
- **Action**: Modify
- **Depends on**: TASK-001
- **Details**:
Add a `SqliteStateRepository` class to `store.ts` that implements `StateRepository`. The class encapsulates the SQLite `Database` instance and uses the same SQL logic currently in the module-level functions:
  - Constructor accepts `dbPath: string`, creates the database + schema + indexes + WAL (same as `initStateStore`) — both `learner_state` and `applied_signals` tables
  - `getState(orgId, learnerReference)` — same SELECT with ORDER BY state_version DESC LIMIT 1
  - `getStateByVersion(orgId, learnerReference, version)` — same single-version SELECT
  - `saveState(state)` — same INSERT logic (deprecated, kept for backward compat)
  - `saveStateWithAppliedSignals(state, appliedEntries)` — same transactional INSERT with `StateVersionConflictError` on constraint violation
  - `isSignalApplied(orgId, learnerReference, signalId)` — same SELECT 1 check
  - `recordAppliedSignals(orgId, learnerReference, entries)` — same transactional INSERT OR IGNORE
  - `close()` — closes the database connection
  - `clear(): void` — DELETE from both tables (test utility, on the class but **not** on the interface)
  - `getDatabase(): Database.Database` — test accessor
  Export the class alongside existing functions. Do **not** change existing module-level functions yet (TASK-003 handles delegation).
  Reuse internal helpers (`rowToLearnerState`, `isSqliteConstraintError`) — they stay as module-level functions shared between the class and the legacy wrappers.
  `StateVersionConflictError` stays as a module-level export — both SQLite and future DynamoDB adapters throw it.

```typescript
  import type { StateRepository } from './repository.js';

  export class SqliteStateRepository implements StateRepository {
    private db: Database.Database;
    constructor(dbPath: string) { /* init both tables, indexes, WAL */ }
    getState(orgId: string, learnerReference: string): LearnerState | null { /* SELECT ... ORDER BY state_version DESC LIMIT 1 */ }
    getStateByVersion(orgId: string, learnerReference: string, version: number): LearnerState | null { /* SELECT */ }
    saveState(state: LearnerState): void { /* INSERT */ }
    saveStateWithAppliedSignals(state: LearnerState, appliedEntries: Array<{...}>): void { /* transaction */ }
    isSignalApplied(orgId: string, learnerReference: string, signalId: string): boolean { /* SELECT 1 */ }
    recordAppliedSignals(orgId: string, learnerReference: string, entries: Array<{...}>): void { /* transaction */ }
    close(): void { this.db.close(); }
    clear(): void { this.db.exec('DELETE FROM applied_signals'); this.db.exec('DELETE FROM learner_state'); }
    getDatabase(): Database.Database { return this.db; }
  }
```

- **Verification**: `npm run build` succeeds. Class is exported but not yet wired.

### TASK-003: Add repository injection support to state store module

- **Status**: completed
- **Files**: `src/state/store.ts`
- **Action**: Modify
- **Depends on**: TASK-002
- **Details**:
Refactor the module-level singleton to delegate to an injected `StateRepository`:
  1. Replace `let db: Database.Database | null = null` with `let repository: StateRepository | null = null`
  2. `initStateStore(dbPath)` → creates `SqliteStateRepository`, assigns to `repository`
  3. `getState(orgId, learnerReference)` → delegates to `repository!.getState(orgId, learnerReference)` (throws if null)
  4. `getStateByVersion(orgId, learnerReference, version)` → delegates to `repository!.getStateByVersion(...)`
  5. `saveState(state)` → delegates to `repository!.saveState(state)`
  6. `saveStateWithAppliedSignals(state, appliedEntries)` → delegates to `repository!.saveStateWithAppliedSignals(state, appliedEntries)`
  7. `isSignalApplied(orgId, learnerReference, signalId)` → delegates to `repository!.isSignalApplied(...)`
  8. `recordAppliedSignals(orgId, learnerReference, entries)` → delegates to `repository!.recordAppliedSignals(...)`
  9. `closeStateStore()` → `if (repository) { repository.close(); repository = null; }` (preserve no-op when null)
  10. Add `setStateRepository(repo: StateRepository): void` — injection point for Phase 2 or test doubles. **Defensive**: close existing repository (if any) before assigning.
  11. `clearStateStore()` → `(repository as SqliteStateRepository).clear()` with instanceof guard
  12. `getStateStoreDatabase()` → return `null` when `repository` is null; otherwise `(repository as SqliteStateRepository).getDatabase()` with instanceof guard. Preserve existing return type `Database.Database | null`.
  **Critical**: All existing exports keep their exact signatures. No import changes needed in any consumer.
  **Critical**: `StateVersionConflictError` and `isSqliteConstraintError` remain module-level exports — no change.
- **Verification**: `npm run build` succeeds. `npm test` passes (all tests).

### TASK-004: Update server.ts — confirm wiring

- **Status**: completed
- **Files**: `src/server.ts`
- **Action**: Modify (minimal)
- **Depends on**: TASK-003
- **Details**:
Since `initStateStore(dbPath)` now internally creates and injects the `SqliteStateRepository`, the server requires no functional changes. This task is verification + documentation:
  - Confirm `initStateStore(stateDbPath)` still works
  - Confirm `closeStateStore()` in the shutdown hook delegates to `repository.close()`
  - Add a comment noting the Phase 2 migration path:

```typescript
    // STATE store (Stage 3). Phase 2: replace initStateStore(dbPath)
    // with setStateRepository(new DynamoDbStateRepository(config))
    initStateStore(stateDbPath);
```

- **Verification**: `npm run dev` starts without errors. POST /v1/signals → state update flow works.

### TASK-005: Update state-engine spec

- **Status**: completed
- **Files**: `docs/specs/state-engine.md`
- **Action**: Modify
- **Depends on**: TASK-004
- **Details**:
Update the spec to document the repository extraction:
  1. **§Implementation Components → State Store**: Note that `StateRepository` interface is now defined in `src/state/repository.ts` and `SqliteStateRepository` is the Phase 1 implementation.
  2. **§Deferred Concerns / Phase 2**: Add or update note about DI readiness, `setStateRepository()`, and DynamoDB adapter contract.
  3. **§File Structure**: Add `src/state/repository.ts` to the tree.
  4. **§Optimistic Lock / Conflict Handling**: Confirm `StateVersionConflictError` is documented as a module-level export used by all adapters.
  5. **§Atomicity**: Confirm `saveStateWithAppliedSignals` transactional guarantee is documented as an interface-level requirement.
- **Verification**: Spec is internally consistent. All described artifacts exist in codebase.

### TASK-006: Regression check

- **Status**: completed
- **Files**: none (verification only)
- **Action**: Verify
- **Depends on**: TASK-005
- **Details**:
Full verification suite:
  - `npm test` — all tests pass (unchanged count)
  - `npm run build` — no type errors
  - `npm run lint` — no lint errors
  - Verify `StateRepository` interface exists and `SqliteStateRepository` implements it
  - Verify `setStateRepository()` export is available for Phase 2 consumers
  - Verify `StateVersionConflictError` still thrown on optimistic-lock conflicts
  - Verify `saveStateWithAppliedSignals` transactional behavior preserved
  - Verify `isSignalApplied` / `recordAppliedSignals` idempotency preserved
- **Verification**: All commands exit 0. Zero test count change (refactoring only, no new behavior).

## Files Summary

### To Create


| File                      | Task     | Purpose                                              |
| ------------------------- | -------- | ---------------------------------------------------- |
| `src/state/repository.ts` | TASK-001 | StateRepository interface (vendor-agnostic contract) |


### To Modify


| File                         | Task               | Changes                                                                                             |
| ---------------------------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| `src/state/store.ts`         | TASK-002, TASK-003 | Add SqliteStateRepository class, refactor module-level functions to delegate to injected repository |
| `src/server.ts`              | TASK-004           | Add Phase 2 migration comment                                                                       |
| `docs/specs/state-engine.md` | TASK-005           | Document repository interface, update file tree, confirm atomicity + conflict error contracts       |


## Risks


| Risk                                                            | Impact | Mitigation                                                                                   |
| --------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| Repository extraction breaks existing tests                     | Medium | TASK-003 preserves all function signatures; TASK-006 gates on full test suite                |
| `StateVersionConflictError` semantics lost during refactor      | High   | Error class stays module-level; both class and module-level wrappers use the same throw path |
| Transactional atomicity of `saveStateWithAppliedSignals` broken | High   | Transaction logic moves into class method unchanged; regression test in TASK-006             |
| `clearStateStore()` breaks after refactor                       | Low    | Implement `clear()` on SqliteStateRepository; module-level wrapper uses instanceof guard     |
| `isSqliteConstraintError` incorrectly moved to interface        | Low    | Explicitly stays as private module-level helper; only used by SqliteStateRepository          |


## Verification Checklist

- All tasks completed
- All tests pass (`npm test`)
- Linter passes (`npm run lint`)
- Type check passes (`npm run build`)
- `StateRepository` interface defined in `src/state/repository.ts`
- `SqliteStateRepository` implements the interface
- `setStateRepository()` exported for Phase 2 injection
- All existing function signatures unchanged (zero downstream impact)
- `StateVersionConflictError` preserved as module-level export
- `saveStateWithAppliedSignals` atomicity verified (state + applied_signals in one transaction)
- `isSignalApplied` / `recordAppliedSignals` idempotency verified
- Spec updated with repository documentation

## Implementation Order

```
TASK-001 (interface) → TASK-002 (class) → TASK-003 (injection) → TASK-004 (server) → TASK-005 (spec) → TASK-006 (regression)
```

Linear sequence — each task depends on the previous. No parallel paths.

## Phase 2 Migration Path

After this plan is complete, the DynamoDB migration becomes mechanical:

```typescript
// Phase 1 (current):
initStateStore(dbPath);   // creates SqliteStateRepository internally

// Phase 2 (future):
import { DynamoDbStateRepository } from './state/dynamodb-repository.js';
import { setStateRepository } from './state/store.js';
setStateRepository(new DynamoDbStateRepository(dynamoConfig));
```

Contract tests serve as migration guardrails — if all STATE-* tests pass with the new adapter, the migration is correct.

## DynamoDB Adapter Notes (Phase 2 reference)

These notes capture decisions for the future DynamoDB adapter, reducing Phase 2 discovery time:

- **Table design**: State table with `PK = ORG#<org_id>#LRN#<learner_reference>`, `SK = VER#<state_version>`. Latest version: `SK = LATEST` (overwritten on each save for O(1) current-state reads).
- **getState**: `GetItem` on `PK + SK=LATEST`.
- **getStateByVersion**: `GetItem` on `PK + SK=VER#<version>`.
- **saveStateWithAppliedSignals**: `TransactWriteItems` with:
  - `Put(state item)` with `ConditionExpression: attribute_not_exists(PK)` (optimistic lock)
  - `Put(LATEST item)` (overwrite)
  - `Put(applied_signals items)` per signal — throw `StateVersionConflictError` on `TransactionCanceledException` with `ConditionalCheckFailed` reason.
- **isSignalApplied**: `GetItem` on applied-signals table/GSI.
- **recordAppliedSignals**: `BatchWriteItem` — inherently idempotent (PutItem overwrites).

