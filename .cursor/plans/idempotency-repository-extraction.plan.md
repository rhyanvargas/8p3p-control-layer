---
name: Idempotency Repository Extraction
overview: "Extract a vendor-agnostic IdempotencyRepository interface from the current SQLite-specific idempotency store, then implement SqliteIdempotencyRepository as the Phase 1 adapter. Goal: make the DynamoDB migration in Phase 2 mechanical — create a new adapter class, swap it in server.ts, done. All existing function signatures and exports are preserved so handler and all tests require zero changes."
todos:
  - id: TASK-001
    content: Define IdempotencyRepository interface in src/ingestion/idempotency-repository.ts
    status: completed
  - id: TASK-002
    content: Implement SqliteIdempotencyRepository class in src/ingestion/idempotency.ts
    status: completed
  - id: TASK-003
    content: Add repository injection support to idempotency store module
    status: completed
  - id: TASK-004
    content: Update server.ts — confirm wiring + add Phase 2 migration comment
    status: completed
  - id: TASK-005
    content: Update signal-ingestion spec — document repository interface
    status: completed
  - id: TASK-006
    content: Regression check — all tests pass, build clean, lint clean
    status: completed
isProject: false
---

# Idempotency Repository Extraction

**Sources**: `docs/specs/signal-ingestion.md`, `docs/archive/playbooks/solo-dev-execution-playbook.md` §Phase 2

## Prerequisites

- Decision Repository Extraction plan executed (pattern proven)
- All tests passing, no lint or type errors

## Clarification Notes

- **Scope is Idempotency Store only.** This is the simplest store — 2 production functions (`checkAndStore`, `close`). Extracting it first validates the pattern before applying to larger stores.
- **Zero downstream changes.** All existing module-level function exports (`initIdempotencyStore`, `checkAndStore`, `closeIdempotencyStore`, `clearIdempotencyStore`, `getDatabase`) keep their signatures. The ingestion handler and all tests continue importing from `./idempotency.js` unchanged.
- `**clearIdempotencyStore()` is test-only.** It lives on the `SqliteIdempotencyRepository` class but is intentionally excluded from the `IdempotencyRepository` interface.
- `**getDatabase()` is test-only.** Same pattern as Decision Store — exposed on the class, not on the interface.

## Tasks

### TASK-001: Define IdempotencyRepository interface

- **Status**: pending
- **Files**: `src/ingestion/idempotency-repository.ts`
- **Action**: Create
- **Depends on**: none
- **Details**:
Create the `IdempotencyRepository` interface:

```typescript
  import type { IdempotencyResult } from '../shared/types.js';

  /**
   * IdempotencyRepository — vendor-agnostic duplicate detection contract.
   * Phase 1: SqliteIdempotencyRepository (in idempotency.ts)
   * Phase 2: DynamoDbIdempotencyRepository (conditional writes on Signals table)
   *
   * clearIdempotencyStore() is intentionally omitted — it is a test utility,
   * not a production contract.
   */
  export interface IdempotencyRepository {
    checkAndStore(orgId: string, signalId: string): IdempotencyResult;
    close(): void;
  }
```

- **Verification**: `npm run build` succeeds (no consumers yet, just the interface).

### TASK-002: Implement SqliteIdempotencyRepository class

- **Status**: pending
- **Files**: `src/ingestion/idempotency.ts`
- **Action**: Modify
- **Depends on**: TASK-001
- **Details**:
Add a `SqliteIdempotencyRepository` class to `idempotency.ts` that implements `IdempotencyRepository`. The class encapsulates the SQLite `Database` instance and uses the same SQL logic currently in the module-level functions:
  - Constructor accepts `dbPath: string`, creates the database + schema + WAL (same as `initIdempotencyStore`)
  - `checkAndStore(orgId, signalId)` — same INSERT OR IGNORE + SELECT logic
  - `close()` — closes the database connection
  - `clear(): void` — DELETE all rows (test utility, on the class but **not** on the interface)
  - `getDatabase(): Database.Database` — test accessor (matches existing `getDatabase()` pattern)
  Export the class alongside existing functions. Do **not** change existing module-level functions yet (TASK-003 handles delegation).

```typescript
  import type { IdempotencyRepository } from './idempotency-repository.js';

  export class SqliteIdempotencyRepository implements IdempotencyRepository {
    private db: Database.Database;
    constructor(dbPath: string) { /* init schema, WAL */ }
    checkAndStore(orgId: string, signalId: string): IdempotencyResult { /* INSERT OR IGNORE + SELECT */ }
    close(): void { this.db.close(); }
    clear(): void { this.db.exec('DELETE FROM signal_ids'); }
    getDatabase(): Database.Database { return this.db; }
  }
```

- **Verification**: `npm run build` succeeds. Class is exported but not yet wired.

### TASK-003: Add repository injection support to idempotency store module

- **Status**: pending
- **Files**: `src/ingestion/idempotency.ts`
- **Action**: Modify
- **Depends on**: TASK-002
- **Details**:
Refactor the module-level singleton to delegate to an injected `IdempotencyRepository`:
  1. Replace `let db: Database.Database | null = null` with `let repository: IdempotencyRepository | null = null`
  2. `initIdempotencyStore(dbPath)` → creates `SqliteIdempotencyRepository`, assigns to `repository`
  3. `checkAndStore(orgId, signalId)` → delegates to `repository!.checkAndStore(orgId, signalId)` (throws if null)
  4. `closeIdempotencyStore()` → `if (repository) { repository.close(); repository = null; }` (preserve no-op when null)
  5. Add `setIdempotencyRepository(repo: IdempotencyRepository): void` — injection point for Phase 2 or test doubles. **Defensive**: close existing repository (if any) before assigning.
  6. `clearIdempotencyStore()` → `(repository as SqliteIdempotencyRepository).clear()` with instanceof guard
  7. `getDatabase()` → return `null` when `repository` is null; otherwise `(repository as SqliteIdempotencyRepository).getDatabase()` with instanceof guard. Preserve existing return type `Database.Database | null`.
  **Critical**: All existing exports keep their exact signatures. No import changes needed in any consumer.
- **Verification**: `npm run build` succeeds. `npm test` passes (all tests).

### TASK-004: Update server.ts — confirm wiring

- **Status**: pending
- **Files**: `src/server.ts`
- **Action**: Modify (minimal)
- **Depends on**: TASK-003
- **Details**:
Since `initIdempotencyStore(dbPath)` now internally creates and injects the `SqliteIdempotencyRepository`, the server requires no functional changes. This task is verification + documentation:
  - Confirm `initIdempotencyStore(dbPath)` still works
  - Confirm `closeIdempotencyStore()` in the shutdown hook delegates to `repository.close()`
  - Add a comment noting the Phase 2 migration path:

```typescript
    // Idempotency store (Stage 1). Phase 2: replace initIdempotencyStore(dbPath)
    // with setIdempotencyRepository(new DynamoDbIdempotencyRepository(config))
    // or fold into Signals table via conditional writes.
    initIdempotencyStore(dbPath);
```

- **Verification**: `npm run dev` starts without errors. `POST /v1/signals` still works.

### TASK-005: Update signal-ingestion spec

- **Status**: pending
- **Files**: `docs/specs/signal-ingestion.md`
- **Action**: Modify
- **Depends on**: TASK-004
- **Details**:
Update the spec to document the repository extraction:
  1. **§Implementation Components → Idempotency Store**: Note that `IdempotencyRepository` interface is now defined in `src/ingestion/idempotency-repository.ts` and `SqliteIdempotencyRepository` is the Phase 1 implementation.
  2. **§Dependencies**: Add note about Phase 2 DI readiness.
  3. **§File Structure**: Add `src/ingestion/idempotency-repository.ts` to the tree.
- **Verification**: Spec is internally consistent. All described artifacts exist in codebase.

### TASK-006: Regression check

- **Status**: pending
- **Files**: none (verification only)
- **Action**: Verify
- **Depends on**: TASK-005
- **Details**:
Full verification suite:
  - `npm test` — all tests pass (unchanged count)
  - `npm run build` — no type errors
  - `npm run lint` — no lint errors
  - Verify `IdempotencyRepository` interface exists and `SqliteIdempotencyRepository` implements it
  - Verify `setIdempotencyRepository()` export is available for Phase 2 consumers
- **Verification**: All commands exit 0. Zero test count change (refactoring only, no new behavior).

## Files Summary

### To Create


| File                                      | Task     | Purpose                                                    |
| ----------------------------------------- | -------- | ---------------------------------------------------------- |
| `src/ingestion/idempotency-repository.ts` | TASK-001 | IdempotencyRepository interface (vendor-agnostic contract) |


### To Modify


| File                             | Task               | Changes                                                                                                   |
| -------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------- |
| `src/ingestion/idempotency.ts`   | TASK-002, TASK-003 | Add SqliteIdempotencyRepository class, refactor module-level functions to delegate to injected repository |
| `src/server.ts`                  | TASK-004           | Add Phase 2 migration comment                                                                             |
| `docs/specs/signal-ingestion.md` | TASK-005           | Document repository interface, update file tree                                                           |


## Risks


| Risk                                            | Impact | Mitigation                                                                                           |
| ----------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| Repository extraction breaks existing tests     | Medium | TASK-003 preserves all function signatures; TASK-006 gates on full test suite                        |
| `clearIdempotencyStore()` breaks after refactor | Low    | Implement `clear()` on SqliteIdempotencyRepository; module-level wrapper uses instanceof guard       |
| `getDatabase()` breaks after refactor           | Low    | Implement `getDatabase()` on SqliteIdempotencyRepository; module-level wrapper uses instanceof guard |


## Verification Checklist

- All tasks completed
- All tests pass (`npm test`)
- Linter passes (`npm run lint`)
- Type check passes (`npm run build`)
- `IdempotencyRepository` interface defined in `src/ingestion/idempotency-repository.ts`
- `SqliteIdempotencyRepository` implements the interface
- `setIdempotencyRepository()` exported for Phase 2 injection
- All existing function signatures unchanged (zero downstream impact)
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
initIdempotencyStore(dbPath);   // creates SqliteIdempotencyRepository internally

// Phase 2 (future — option A: dedicated table):
import { DynamoDbIdempotencyRepository } from './ingestion/dynamodb-idempotency.js';
import { setIdempotencyRepository } from './ingestion/idempotency.js';
setIdempotencyRepository(new DynamoDbIdempotencyRepository(dynamoConfig));

// Phase 2 (future — option B: fold into Signals table via conditional writes):
// IdempotencyRepository.checkAndStore() → DynamoDB PutItem with ConditionExpression
```

Contract tests serve as migration guardrails — if all SIG-API-010 (idempotency) tests pass with the new adapter, the migration is correct.