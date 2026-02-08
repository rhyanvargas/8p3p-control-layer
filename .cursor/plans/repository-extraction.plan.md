---
name: Decision Repository Extraction (DEF-DEC-002)
overview: "Extract a vendor-agnostic DecisionRepository interface from the current SQLite-specific decision store, then implement SqliteDecisionRepository as the Phase 1 adapter. Goal: make the DynamoDB migration in Phase 2 mechanical — create a new adapter class, swap it in server.ts, done. All existing function signatures and exports are preserved so engine, handler, and all tests require zero changes."
todos:
  - id: TASK-001
    content: Define DecisionRepository interface in src/decision/repository.ts
    status: pending
  - id: TASK-002
    content: Implement SqliteDecisionRepository class in src/decision/store.ts
    status: pending
  - id: TASK-003
    content: Add repository injection support to decision store module
    status: pending
  - id: TASK-004
    content: Update server.ts — confirm repository wiring + add Phase 2 migration comment
    status: pending
  - id: TASK-005
    content: Update decision-engine spec — document repository interface and file structure
    status: pending
  - id: TASK-006
    content: Regression check — all tests pass, build clean, lint clean
    status: pending
isProject: false
---

# Decision Repository Extraction (DEF-DEC-002)

**Sources**: `docs/specs/decision-engine.md` §Phase 2: Storage Abstraction, §DecisionRepository Interface

## Prerequisites

- E2E Cycle Completion plan executed (graceful shutdown fixed, policy v2 deployed, all tests passing)
- `docs/specs/decision-engine.md` §Phase 2 defines the target `DecisionRepository` interface
- No lint or type errors

## Clarification Notes

- **Scope is Decision Store only.** STATE Store, Signal Log Store, and Idempotency Store follow the same singleton pattern but are not refactored here. If this extraction proves clean, apply the same pattern to other stores in Phase 2.
- **Zero downstream changes.** All existing module-level function exports (`saveDecision`, `getDecisions`, `getDecisionById`, `closeDecisionStore`, `clearDecisionStore`, `encodePageToken`) keep their signatures. Engine, handler, and all 320+ tests continue importing from `./store.js` unchanged.
- `**clearDecisionStore()` is test-only.** It lives on the `SqliteDecisionRepository` class but is intentionally excluded from the `DecisionRepository` interface. The module-level wrapper uses a type guard to call it.
- `**encodePageToken` stays on store module.** Pagination encoding is not vendor-specific — it's an API-layer concern. It remains a standalone exported function.

## Tasks

### TASK-001: Define DecisionRepository interface

- **Status**: pending
- **Files**: `src/decision/repository.ts`
- **Action**: Create
- **Depends on**: none
- **Details**:
Create the `DecisionRepository` interface as specified in `docs/specs/decision-engine.md` §Phase 2:
  ```typescript
  import type { Decision, GetDecisionsRequest } from '../shared/types.js';

  /**
   * DecisionRepository — vendor-agnostic persistence contract.
   * Phase 1: SqliteDecisionRepository (in store.ts)
   * Phase 2: DynamoDbDecisionRepository
   *
   * clearDecisionStore() is intentionally omitted — it is a test utility,
   * not a production contract.
   */
  export interface DecisionRepository {
    saveDecision(decision: Decision): void;
    getDecisions(request: GetDecisionsRequest): {
      decisions: Decision[];
      hasMore: boolean;
      nextCursor?: number;
    };
    getDecisionById(orgId: string, decisionId: string): Decision | null;
    close(): void;
  }
  ```
- **Verification**: `npm run build` succeeds (no consumers yet, just the interface).

### TASK-002: Implement SqliteDecisionRepository class

- **Status**: pending
- **Files**: `src/decision/store.ts`
- **Action**: Modify
- **Depends on**: TASK-001
- **Details**:
Add a `SqliteDecisionRepository` class to `store.ts` that implements `DecisionRepository`. The class encapsulates the SQLite `Database` instance and uses the same SQL logic currently in the module-level functions:
  - Constructor accepts `dbPath: string`, creates the database + schema + index + WAL (same as `initDecisionStore`)
  - `saveDecision(decision)` — same INSERT logic
  - `getDecisions(request)` — same query + cursor pagination logic
  - `getDecisionById(orgId, decisionId)` — same single-row SELECT
  - `close()` — closes the database connection
  - `clear(): void` — DELETE all rows (test utility, on the class but **not** on the interface)
  - `getDatabase(): Database.Database` — test accessor (matches existing `getDecisionStoreDatabase()` pattern)
  Export the class alongside existing functions. Do **not** change existing module-level functions yet (TASK-003 handles delegation).
  Reuse internal helpers (`rowToDecision`, `decodePageToken`) — they stay as module-level functions shared between the class and the legacy wrappers.
  ```typescript
  import type { DecisionRepository } from './repository.js';

  export class SqliteDecisionRepository implements DecisionRepository {
    private db: Database.Database;
    constructor(dbPath: string) { /* init schema, index, WAL */ }
    saveDecision(decision: Decision): void { /* INSERT */ }
    getDecisions(request: GetDecisionsRequest): { decisions: Decision[]; hasMore: boolean; nextCursor?: number } { /* query */ }
    getDecisionById(orgId: string, decisionId: string): Decision | null { /* SELECT */ }
    close(): void { this.db.close(); }
    clear(): void { this.db.exec('DELETE FROM decisions'); }
    getDatabase(): Database.Database { return this.db; }
  }
  ```
- **Verification**: `npm run build` succeeds. Class is exported but not yet wired.

### TASK-003: Add repository injection support to decision store module

- **Status**: pending
- **Files**: `src/decision/store.ts`
- **Action**: Modify
- **Depends on**: TASK-002
- **Details**:
Refactor the module-level singleton to delegate to an injected `DecisionRepository`:
  1. Replace `let db: Database.Database | null = null` with `let repository: DecisionRepository | null = null`
  2. `initDecisionStore(dbPath)` → creates `SqliteDecisionRepository`, assigns to `repository`
  3. `saveDecision(decision)` → delegates to `repository!.saveDecision(decision)` (throws if null)
  4. `getDecisions(request)` → delegates to `repository!.getDecisions(request)`
  5. `getDecisionById(orgId, decisionId)` → delegates to `repository!.getDecisionById(orgId, decisionId)`
  6. `closeDecisionStore()` → calls `repository!.close()`, sets `repository = null`
  7. Add `setDecisionRepository(repo: DecisionRepository): void` — injection point for Phase 2 or test doubles
  8. `clearDecisionStore()` → `(repository as SqliteDecisionRepository).clear()` with instanceof guard
  9. `getDecisionStoreDatabase()` → `(repository as SqliteDecisionRepository).getDatabase()` with instanceof guard
  10. `encodePageToken()` — unchanged (not repository-specific)
  **Critical**: All existing exports keep their exact signatures. No import changes needed in any consumer.
- **Verification**: `npm run build` succeeds. `npm test` passes (all tests).

### TASK-004: Update server.ts — confirm wiring

- **Status**: pending
- **Files**: `src/server.ts`
- **Action**: Modify (minimal)
- **Depends on**: TASK-003
- **Details**:
Since `initDecisionStore(dbPath)` now internally creates and injects the `SqliteDecisionRepository`, the server requires no functional changes. This task is verification + documentation:
  - Confirm `initDecisionStore(decisionDbPath)` still works
  - Confirm `closeDecisionStore()` in the shutdown hook delegates to `repository.close()`
  - Add a comment noting the Phase 2 migration path:
    ```typescript
    // Decision store (Stage 4). Phase 2: replace initDecisionStore(dbPath)
    // with setDecisionRepository(new DynamoDbDecisionRepository(config))
    initDecisionStore(decisionDbPath);
    ```
- **Verification**: `npm run dev` starts without errors. `GET /v1/decisions` returns empty `decisions[]`.

### TASK-005: Update decision-engine spec

- **Status**: pending
- **Files**: `docs/specs/decision-engine.md`
- **Action**: Modify
- **Depends on**: TASK-004
- **Details**:
Update the spec to document the repository extraction:
  1. **§Implementation Components → Decision Store**: Note that `DecisionRepository` interface is now defined in `src/decision/repository.ts` and `SqliteDecisionRepository` is the Phase 1 implementation.
  2. **§Phase 2**: Update DEF-DEC-002 status to `**Partially Resolved**` — interface defined, SQLite adapter created, DynamoDB adapter deferred.
  3. **§File Structure**: Add `src/decision/repository.ts` to the tree.
- **Verification**: Spec is internally consistent. All described artifacts exist in codebase.

### TASK-006: Regression check

- **Status**: pending
- **Files**: none (verification only)
- **Action**: Verify
- **Depends on**: TASK-005
- **Details**:
Full verification suite:
  - `npm test` — all tests pass (unchanged count from E2E plan)
  - `npm run build` — no type errors
  - `npm run lint` — no lint errors
  - Verify `DecisionRepository` interface exists and `SqliteDecisionRepository` implements it
  - Verify `setDecisionRepository()` export is available for Phase 2 consumers
- **Verification**: All commands exit 0. Zero test count change (refactoring only, no new behavior).

## Files Summary

### To Create


| File                         | Task     | Purpose                                                 |
| ---------------------------- | -------- | ------------------------------------------------------- |
| `src/decision/repository.ts` | TASK-001 | DecisionRepository interface (vendor-agnostic contract) |


### To Modify


| File                            | Task               | Changes                                                                                                |
| ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| `src/decision/store.ts`         | TASK-002, TASK-003 | Add SqliteDecisionRepository class, refactor module-level functions to delegate to injected repository |
| `src/server.ts`                 | TASK-004           | Add Phase 2 migration comment                                                                          |
| `docs/specs/decision-engine.md` | TASK-005           | Document repository interface, update DEF-DEC-002 status, update file tree                             |


## Risks


| Risk                                               | Impact | Mitigation                                                                                        |
| -------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| Repository extraction breaks existing tests        | Medium | TASK-003 preserves all function signatures; TASK-006 gates on full test suite                     |
| `clearDecisionStore()` breaks after refactor       | Low    | Implement `clear()` on SqliteDecisionRepository; module-level wrapper uses instanceof guard       |
| `getDecisionStoreDatabase()` breaks after refactor | Low    | Implement `getDatabase()` on SqliteDecisionRepository; module-level wrapper uses instanceof guard |


## Verification Checklist

- All tasks completed
- All tests pass (`npm test`)
- Linter passes (`npm run lint`)
- Type check passes (`npm run build`)
- `DecisionRepository` interface defined in `src/decision/repository.ts`
- `SqliteDecisionRepository` implements the interface
- `setDecisionRepository()` exported for Phase 2 injection
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
initDecisionStore(dbPath);   // creates SqliteDecisionRepository internally

// Phase 2 (future):
import { DynamoDbDecisionRepository } from './decision/dynamodb-repository.js';
import { setDecisionRepository } from './decision/store.js';
setDecisionRepository(new DynamoDbDecisionRepository(dynamoConfig));
```

Contract tests serve as migration guardrails — if all DEC-* and OUT-API-* tests pass with the new adapter, the migration is correct.