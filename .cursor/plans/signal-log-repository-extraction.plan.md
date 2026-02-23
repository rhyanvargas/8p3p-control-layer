---
name: Signal Log Repository Extraction
overview: "Extract a vendor-agnostic SignalLogRepository interface from the current SQLite-specific signal log store, then implement SqliteSignalLogRepository as the Phase 1 adapter. Goal: make the DynamoDB migration in Phase 2 mechanical — create a new adapter class, swap it in server.ts, done. All existing function signatures and exports are preserved so engine, handler, and all tests require zero changes."
todos:
  - id: TASK-001
    content: Define SignalLogRepository interface in src/signalLog/repository.ts
    status: pending
  - id: TASK-002
    content: Implement SqliteSignalLogRepository class in src/signalLog/store.ts
    status: pending
  - id: TASK-003
    content: Add repository injection support to signal log store module
    status: pending
  - id: TASK-004
    content: Update server.ts — confirm wiring + add Phase 2 migration comment
    status: pending
  - id: TASK-005
    content: Update signal-log spec — document repository interface and file structure
    status: pending
  - id: TASK-006
    content: Regression check — all tests pass, build clean, lint clean
    status: pending
isProject: false
---

# Signal Log Repository Extraction

**Sources**: `docs/specs/signal-log.md` §Implementation Components, `docs/specs/aws-deployment.md` §DynamoDB Adapters

## Prerequisites

- Decision Repository Extraction plan executed (pattern proven)
- Idempotency Repository Extraction plan executed (validates second store)
- All tests passing, no lint or type errors

## Clarification Notes

- **Scope is Signal Log Store only.** This store has the richest read interface: `appendSignal`, `querySignals`, `getSignalsByIds`, and `close`. The interface must capture all four production operations.
- **Zero downstream changes.** All existing module-level function exports (`initSignalLogStore`, `appendSignal`, `querySignals`, `getSignalsByIds`, `closeSignalLogStore`, `clearSignalLogStore`, `getSignalLogDatabase`, `encodePageToken`, `decodePageToken`) keep their signatures. The ingestion handler, STATE Engine, query handler, and all tests continue importing from `./store.js` unchanged.
- `**clearSignalLogStore()` is test-only.** It lives on the `SqliteSignalLogRepository` class but is intentionally excluded from the `SignalLogRepository` interface.
- `**encodePageToken` / `decodePageToken` stay on store module.** Pagination encoding is not vendor-specific — it's an API-layer concern. They remain standalone exported functions shared across adapters. (DynamoDB pagination will use `LastEvaluatedKey`-based tokens with its own encode/decode.)
- `**getSignalsByIds()` error semantics preserved.** The `unknown_signal_id` and `signals_not_in_org_scope` error codes thrown by this function are part of the public contract. The interface must document these, and any adapter must implement the same two-phase lookup (primary query → missing-ID resolution).

## Tasks

### TASK-001: Define SignalLogRepository interface

- **Status**: pending
- **Files**: `src/signalLog/repository.ts`
- **Action**: Create
- **Depends on**: none
- **Details**:
Create the `SignalLogRepository` interface:

```typescript
  import type {
    SignalEnvelope,
    SignalRecord,
    SignalLogReadRequest,
    SignalLogQueryResult,
  } from '../shared/types.js';

  /**
   * SignalLogRepository — vendor-agnostic immutable signal storage contract.
   * Phase 1: SqliteSignalLogRepository (in store.ts)
   * Phase 2: DynamoDbSignalLogRepository
   *
   * Core guarantees all adapters must uphold:
   * - Immutability: append-only, no UPDATE or DELETE
   * - Org isolation: queries scoped to org_id
   * - Error contracts: getSignalsByIds throws 'unknown_signal_id' or
   *   'signals_not_in_org_scope' for missing/cross-org IDs
   *
   * clearSignalLogStore() is intentionally omitted — test utility only.
   */
  export interface SignalLogRepository {
    appendSignal(signal: SignalEnvelope, acceptedAt: string): SignalRecord;
    querySignals(request: SignalLogReadRequest): SignalLogQueryResult;
    getSignalsByIds(orgId: string, signalIds: string[]): SignalRecord[];
    close(): void;
  }
```

- **Verification**: `npm run build` succeeds (no consumers yet, just the interface).

### TASK-002: Implement SqliteSignalLogRepository class

- **Status**: pending
- **Files**: `src/signalLog/store.ts`
- **Action**: Modify
- **Depends on**: TASK-001
- **Details**:
Add a `SqliteSignalLogRepository` class to `store.ts` that implements `SignalLogRepository`. The class encapsulates the SQLite `Database` instance and uses the same SQL logic currently in the module-level functions:
  - Constructor accepts `dbPath: string`, creates the database + schema + indexes + WAL (same as `initSignalLogStore`)
  - `appendSignal(signal, acceptedAt)` — same INSERT logic
  - `querySignals(request)` — same cursor-based pagination query (uses module-level `decodePageToken`)
  - `getSignalsByIds(orgId, signalIds)` — same two-phase lookup with `unknown_signal_id` / `signals_not_in_org_scope` error semantics
  - `close()` — closes the database connection
  - `clear(): void` — DELETE all rows (test utility, on the class but **not** on the interface)
  - `getDatabase(): Database.Database` — test accessor
  Export the class alongside existing functions. Do **not** change existing module-level functions yet (TASK-003 handles delegation).
  Reuse internal helpers (`rowToSignalRecord`, `decodePageToken`) — they stay as module-level functions shared between the class and the legacy wrappers.

```typescript
  import type { SignalLogRepository } from './repository.js';

  export class SqliteSignalLogRepository implements SignalLogRepository {
    private db: Database.Database;
    constructor(dbPath: string) { /* init schema, indexes, WAL */ }
    appendSignal(signal: SignalEnvelope, acceptedAt: string): SignalRecord { /* INSERT */ }
    querySignals(request: SignalLogReadRequest): SignalLogQueryResult { /* cursor-based query */ }
    getSignalsByIds(orgId: string, signalIds: string[]): SignalRecord[] { /* two-phase lookup */ }
    close(): void { this.db.close(); }
    clear(): void { this.db.exec('DELETE FROM signal_log'); }
    getDatabase(): Database.Database { return this.db; }
  }
```

- **Verification**: `npm run build` succeeds. Class is exported but not yet wired.

### TASK-003: Add repository injection support to signal log store module

- **Status**: pending
- **Files**: `src/signalLog/store.ts`
- **Action**: Modify
- **Depends on**: TASK-002
- **Details**:
Refactor the module-level singleton to delegate to an injected `SignalLogRepository`:
  1. Replace `let db: Database.Database | null = null` with `let repository: SignalLogRepository | null = null`
  2. `initSignalLogStore(dbPath)` → creates `SqliteSignalLogRepository`, assigns to `repository`
  3. `appendSignal(signal, acceptedAt)` → delegates to `repository!.appendSignal(signal, acceptedAt)` (throws if null)
  4. `querySignals(request)` → delegates to `repository!.querySignals(request)`
  5. `getSignalsByIds(orgId, signalIds)` → delegates to `repository!.getSignalsByIds(orgId, signalIds)`
  6. `closeSignalLogStore()` → `if (repository) { repository.close(); repository = null; }` (preserve no-op when null)
  7. Add `setSignalLogRepository(repo: SignalLogRepository): void` — injection point for Phase 2 or test doubles. **Defensive**: close existing repository (if any) before assigning.
  8. `clearSignalLogStore()` → `(repository as SqliteSignalLogRepository).clear()` with instanceof guard
  9. `getSignalLogDatabase()` → return `null` when `repository` is null; otherwise `(repository as SqliteSignalLogRepository).getDatabase()` with instanceof guard. Preserve existing return type `Database.Database | null`.
  10. `encodePageToken()` / `decodePageToken()` — unchanged (not repository-specific)
  **Critical**: All existing exports keep their exact signatures. No import changes needed in any consumer.
- **Verification**: `npm run build` succeeds. `npm test` passes (all tests).

### TASK-004: Update server.ts — confirm wiring

- **Status**: pending
- **Files**: `src/server.ts`
- **Action**: Modify (minimal)
- **Depends on**: TASK-003
- **Details**:
Since `initSignalLogStore(dbPath)` now internally creates and injects the `SqliteSignalLogRepository`, the server requires no functional changes. This task is verification + documentation:
  - Confirm `initSignalLogStore(signalLogDbPath)` still works
  - Confirm `closeSignalLogStore()` in the shutdown hook delegates to `repository.close()`
  - Add a comment noting the Phase 2 migration path:

```typescript
    // Signal Log store (Stage 2). Phase 2: replace initSignalLogStore(dbPath)
    // with setSignalLogRepository(new DynamoDbSignalLogRepository(config))
    initSignalLogStore(signalLogDbPath);
```

- **Verification**: `npm run dev` starts without errors. `GET /v1/signals` returns empty `signals[]`.

### TASK-005: Update signal-log spec

- **Status**: pending
- **Files**: `docs/specs/signal-log.md`
- **Action**: Modify
- **Depends on**: TASK-004
- **Details**:
Update the spec to document the repository extraction:
  1. **§Implementation Components → Signal Log Store**: Note that `SignalLogRepository` interface is now defined in `src/signalLog/repository.ts` and `SqliteSignalLogRepository` is the Phase 1 implementation.
  2. **§Phase 2 / Dependencies**: Add note about DI readiness and DynamoDB adapter contract.
  3. **§File Structure**: Add `src/signalLog/repository.ts` to the tree.
  4. **§Error contracts**: Confirm `unknown_signal_id` and `signals_not_in_org_scope` are documented as interface-level requirements (any adapter must implement).
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
  - Verify `SignalLogRepository` interface exists and `SqliteSignalLogRepository` implements it
  - Verify `setSignalLogRepository()` export is available for Phase 2 consumers
  - Verify `getSignalsByIds` error codes (`unknown_signal_id`, `signals_not_in_org_scope`) still work correctly
- **Verification**: All commands exit 0. Zero test count change (refactoring only, no new behavior).

## Files Summary

### To Create


| File                          | Task     | Purpose                                                  |
| ----------------------------- | -------- | -------------------------------------------------------- |
| `src/signalLog/repository.ts` | TASK-001 | SignalLogRepository interface (vendor-agnostic contract) |


### To Modify


| File                       | Task               | Changes                                                                                                 |
| -------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------- |
| `src/signalLog/store.ts`   | TASK-002, TASK-003 | Add SqliteSignalLogRepository class, refactor module-level functions to delegate to injected repository |
| `src/server.ts`            | TASK-004           | Add Phase 2 migration comment                                                                           |
| `docs/specs/signal-log.md` | TASK-005           | Document repository interface, update file tree, confirm error contracts                                |


## Risks


| Risk                                                   | Impact | Mitigation                                                                                   |
| ------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------- |
| Repository extraction breaks existing tests            | Medium | TASK-003 preserves all function signatures; TASK-006 gates on full test suite                |
| `getSignalsByIds` error codes lost during refactor     | High   | Interface documents error contract; TASK-006 specifically verifies both error paths          |
| `clearSignalLogStore()` breaks after refactor          | Low    | Implement `clear()` on SqliteSignalLogRepository; module-level wrapper uses instanceof guard |
| `encodePageToken`/`decodePageToken` accidentally moved | Low    | Explicitly kept at module level; not part of repository interface                            |


## Verification Checklist

- All tasks completed
- All tests pass (`npm test`)
- Linter passes (`npm run lint`)
- Type check passes (`npm run build`)
- `SignalLogRepository` interface defined in `src/signalLog/repository.ts`
- `SqliteSignalLogRepository` implements the interface
- `setSignalLogRepository()` exported for Phase 2 injection
- All existing function signatures unchanged (zero downstream impact)
- `getSignalsByIds` error codes preserved (`unknown_signal_id`, `signals_not_in_org_scope`)
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
initSignalLogStore(dbPath);   // creates SqliteSignalLogRepository internally

// Phase 2 (future):
import { DynamoDbSignalLogRepository } from './signalLog/dynamodb-repository.js';
import { setSignalLogRepository } from './signalLog/store.js';
setSignalLogRepository(new DynamoDbSignalLogRepository(dynamoConfig));
```

Contract tests serve as migration guardrails — if all SIG-LOG-* and SIG-API-* tests pass with the new adapter, the migration is correct.

## DynamoDB Adapter Notes (Phase 2 reference)

These notes capture decisions for the future DynamoDB adapter, reducing Phase 2 discovery time:

- **Table design**: Signals table with `PK = ORG#<org_id>`, `SK = SIG#<signal_id>`. GSI on `learner_reference + accepted_at` for `querySignals`.
- **appendSignal**: `PutItem` with `ConditionExpression: attribute_not_exists(PK)` (enforces immutability + uniqueness).
- **querySignals**: `Query` on GSI with `LastEvaluatedKey`-based pagination. `encodePageToken`/`decodePageToken` will need adapter-specific overrides (DynamoDB tokens are opaque maps, not integer cursors).
- **getSignalsByIds**: `BatchGetItem` for primary lookup, then same two-phase resolution for missing IDs.

