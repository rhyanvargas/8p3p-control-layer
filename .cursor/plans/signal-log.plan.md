---
name: Signal Log
overview: Implement the Signal Log component (Stage 2 of the control layer lifecycle). Creates an immutable, append-only storage layer for accepted signals with a read-only query API (GET /signals). Integrates with Signal Ingestion to forward accepted signals. Must pass 5 contract tests (SIGLOG-001 through SIGLOG-005) plus additional integration tests.
todos:
  - id: TASK-001
    content: Add Signal Log Types
    status: completed
  - id: TASK-002
    content: Add Signal Log Error Codes
    status: completed
  - id: TASK-003
    content: Create Signal Log Store
    status: completed
  - id: TASK-004
    content: Create Signal Log Store Unit Tests
    status: completed
  - id: TASK-005
    content: Create Signal Log Validator
    status: completed
  - id: TASK-006
    content: Create Signal Log Handler
    status: completed
  - id: TASK-007
    content: Create Signal Log Routes
    status: completed
  - id: TASK-008
    content: Integrate with Server
    status: completed
  - id: TASK-009
    content: Integrate Ingestion with Signal Log
    status: completed
  - id: TASK-010
    content: Create Contract Tests
    status: completed
  - id: TASK-011
    content: Final Verification
    status: completed
isProject: false
---

# Signal Log

**Spec**: `docs/specs/signal-log.md`

## Prerequisites

Before starting implementation:

- Signal Ingestion (Stage 1) must be complete ✅

## Tasks

### TASK-001: Add Signal Log Types

- **Status**: completed
- **Files**: `src/shared/types.ts`
- **Action**: Modify
- **Details**: Add TypeScript interfaces for Signal Log:
  - `SignalRecord` - Extends SignalEnvelope with `accepted_at` field
  - `SignalLogReadRequest` - Query parameters (org_id, learner_reference, from_time, to_time, page_token?, page_size?)
  - `SignalLogReadResponse` - Response with signals array and next_page_token
  - `SignalLogQueryResult` - Internal result type for store queries
- **Depends on**: none
- **Verification**: `npm run typecheck` passes

---

### TASK-002: Add Signal Log Error Codes

- **Status**: completed
- **Files**: `src/shared/error-codes.ts`
- **Action**: Modify
- **Details**: Add error codes for Signal Log validation:
  - `INVALID_TIME_RANGE = 'invalid_time_range'`
  - `INVALID_PAGE_TOKEN = 'invalid_page_token'`
  - `PAGE_SIZE_OUT_OF_RANGE = 'page_size_out_of_range'`
  - `LEARNER_NOT_FOUND = 'learner_not_found'` (optional, for empty results)
- **Depends on**: none
- **Verification**: `npm run typecheck` passes

---

### TASK-003: Create Signal Log Store

- **Status**: completed
- **Files**: `src/signalLog/store.ts`
- **Action**: Create
- **Details**: SQLite-backed storage for signal records:
  - `initSignalLogStore(dbPath: string): void` - Initialize database with schema
  - `appendSignal(signal: SignalEnvelope, acceptedAt: string): SignalRecord` - Store accepted signal
  - `querySignals(request: SignalLogReadRequest): SignalLogQueryResult` - Query with pagination
  - `closeSignalLogStore(): void` - Close database connection
  - `clearSignalLogStore(): void` - Clear for testing
  - Create table with: id, org_id, signal_id, source_system, learner_reference, timestamp, schema_version, payload, metadata, accepted_at
  - Create index on (org_id, learner_reference, accepted_at) for efficient queries
  - Implement cursor-based pagination using `id` as position
  - Use base64 encoding for opaque page tokens
- **Depends on**: TASK-001
- **Verification**: Unit tests pass

---

### TASK-004: Create Signal Log Store Unit Tests

- **Status**: completed
- **Files**: `tests/unit/signal-log-store.test.ts`
- **Action**: Create
- **Details**: Unit tests for store functionality:
  - Test appendSignal stores and returns SignalRecord
  - Test querySignals returns correct signals for time range
  - Test pagination returns correct page_token
  - Test page_token decodes and resumes correctly
  - Test empty results return empty array
  - Test org isolation (signals from org B not in org A query)
  - Test ordering is by accepted_at ascending
  - Use in-memory SQLite for test isolation
- **Depends on**: TASK-003
- **Verification**: `npm run test:unit` passes

---

### TASK-005: Create Signal Log Validator

- **Status**: completed
- **Files**: `src/signalLog/validator.ts`
- **Action**: Create
- **Details**: Validate query parameters:
  - `validateSignalLogQuery(params: unknown): ValidationResult` - Validate query params
  - Check org_id present and non-empty
  - Check learner_reference present and non-empty
  - Check from_time is valid RFC3339 with timezone
  - Check to_time is valid RFC3339 with timezone
  - Check from_time <= to_time (time range validation)
  - Check page_size is between 1-1000 (default 100 if not provided)
  - Check page_token format if provided (valid base64)
  - Return `{ valid: boolean, errors: RejectionReason[], parsed?: SignalLogReadRequest }`
- **Depends on**: TASK-001, TASK-002
- **Verification**: `npm run typecheck` passes

---

### TASK-006: Create Signal Log Handler

- **Status**: completed
- **Files**: `src/signalLog/handler.ts`
- **Action**: Create
- **Details**: Fastify route handler for `GET /signals`:
  - `handleSignalLogQuery(request, reply): Promise<SignalLogReadResponse>`
  - Parse query parameters from request.query
  - Validate with validator
  - If invalid, return 400 with error response
  - Query store with validated params
  - Transform result to SignalLogReadResponse
  - Return 200 with response
- **Depends on**: TASK-003, TASK-005
- **Verification**: `npm run typecheck` passes

---

### TASK-007: Create Signal Log Routes

- **Status**: completed
- **Files**: `src/signalLog/routes.ts`
- **Action**: Create
- **Details**: Register routes with Fastify:
  - `registerSignalLogRoutes(app: FastifyInstance): void`
  - Register `GET /signals` with handler
  - Configure query parameter schema for Fastify validation (optional, since we do manual validation)
- **Depends on**: TASK-006
- **Verification**: Routes register without errors

---

### TASK-008: Integrate with Server

- **Status**: completed
- **Files**: `src/server.ts`
- **Action**: Modify
- **Details**:
  - Import `registerSignalLogRoutes` from `./signalLog/routes.js`
  - Import and call `initSignalLogStore` with DB path from env (`SIGNAL_LOG_DB_PATH`)
  - Call `registerSignalLogRoutes(server)` after Fastify init
  - Consider using same DB file as idempotency store, or separate file
- **Depends on**: TASK-007
- **Verification**: Server starts, `GET /signals` responds

---

### TASK-009: Integrate Ingestion with Signal Log

- **Status**: completed
- **Files**: `src/ingestion/handler.ts`
- **Action**: Modify
- **Details**:
  - Import `appendSignal` from `../signalLog/store.js`
  - After idempotency check passes (new signal), call `appendSignal(signal, receivedAt)`
  - The signal is now persisted in Signal Log before returning response
  - This ensures accepted signals are always in the log
- **Depends on**: TASK-003, TASK-008
- **Verification**: Accepted signals appear in Signal Log

---

### TASK-010: Create Contract Tests

- **Status**: completed
- **Files**: `tests/contracts/signal-log.test.ts`
- **Action**: Create
- **Details**: Implement all contract tests:
  - `SIGLOG-001`: Query valid time window → Returns signals[] + next_page_token
  - `SIGLOG-002`: Invalid time range (from > to) → `rejected`, `invalid_time_range`
  - `SIGLOG-003`: Page size = 0 → `rejected`, `page_size_out_of_range`
  - `SIGLOG-004`: Paging determinism → Same query twice returns identical sequence
  - `SIGLOG-005`: Immutability guarantee → Record unchanged on re-read
  - `SIGLOG-006`: org_id isolation → Signals from org B not visible to org A
  - `SIGLOG-007`: Empty result → Valid query with no matches returns empty signals[]
  - `SIGLOG-008`: Pagination continuation → Second page with token returns next batch
  - `SIGLOG-009`: Default page_size → No page_size defaults to 100
  - `SIGLOG-010`: Integration with ingestion → Accepted signal appears in log
- **Depends on**: TASK-009
- **Verification**: `npm run test:contracts` passes all tests

---

### TASK-011: Final Verification

- **Status**: completed
- **Files**: none
- **Action**: Verify
- **Details**:
  - Run `npm run lint` - must pass
  - Run `npm run typecheck` - must pass
  - Run `npm test` - all tests must pass
  - Manual test: POST a signal, then GET /signals to verify it appears
  - Verify pagination works correctly
  - Verify determinism: same query returns same results
- **Depends on**: TASK-010
- **Verification**: All checks pass

---

## Files Summary

### To Create


| File                                  | Task     | Purpose                    |
| ------------------------------------- | -------- | -------------------------- |
| `src/signalLog/store.ts`              | TASK-003 | SQLite storage layer       |
| `src/signalLog/validator.ts`          | TASK-005 | Query parameter validation |
| `src/signalLog/handler.ts`            | TASK-006 | GET /signals handler       |
| `src/signalLog/routes.ts`             | TASK-007 | Fastify route registration |
| `tests/unit/signal-log-store.test.ts` | TASK-004 | Store unit tests           |
| `tests/contracts/signal-log.test.ts`  | TASK-010 | Contract tests (SIGLOG-*)  |


### To Modify


| File                        | Task     | Changes                                |
| --------------------------- | -------- | -------------------------------------- |
| `src/shared/types.ts`       | TASK-001 | Add SignalRecord, SignalLogRead* types |
| `src/shared/error-codes.ts` | TASK-002 | Add Signal Log error codes             |
| `src/server.ts`             | TASK-008 | Initialize store, register routes      |
| `src/ingestion/handler.ts`  | TASK-009 | Forward accepted signals to Signal Log |


## Test Plan


| Test ID    | Type     | Description                        | Task     |
| ---------- | -------- | ---------------------------------- | -------- |
| SIGLOG-001 | contract | Query valid time window            | TASK-010 |
| SIGLOG-002 | contract | Invalid time range                 | TASK-010 |
| SIGLOG-003 | contract | Page size out of range             | TASK-010 |
| SIGLOG-004 | contract | Paging determinism                 | TASK-010 |
| SIGLOG-005 | contract | Immutability guarantee             | TASK-010 |
| SIGLOG-006 | contract | org_id isolation                   | TASK-010 |
| SIGLOG-007 | contract | Empty result handling              | TASK-010 |
| SIGLOG-008 | contract | Pagination continuation            | TASK-010 |
| SIGLOG-009 | contract | Default page_size                  | TASK-010 |
| SIGLOG-010 | contract | Integration with ingestion         | TASK-010 |
| STORE-001  | unit     | appendSignal stores correctly      | TASK-004 |
| STORE-002  | unit     | querySignals returns correct range | TASK-004 |
| STORE-003  | unit     | Pagination token encoding          | TASK-004 |
| STORE-004  | unit     | Ordering by accepted_at            | TASK-004 |


## Risks


| Risk                             | Impact | Mitigation                                                      |
| -------------------------------- | ------ | --------------------------------------------------------------- |
| Shared DB with idempotency store | Medium | Use separate DB path env var or same file with different tables |
| Page token format changes        | Low    | Use versioned token format (e.g., `v1:{id}` base64)             |
| Large result sets                | Medium | Enforce page_size max of 1000, use index                        |
| Timestamp parsing edge cases     | Medium | Reuse RFC3339 validation from signal-envelope validator         |


## Verification Checklist

- `GET /signals` returns SignalLogReadResponse for valid queries
- Time range validation enforces `from_time <= to_time`
- page_size validation enforces 1-1000 bounds
- Pagination returns stable, deterministic results
- Records are immutable (no UPDATE/DELETE exists)
- org_id isolation prevents cross-tenant access
- Signal Ingestion forwards accepted signals to Signal Log
- All SIGLOG-001 through SIGLOG-005 contract tests pass
- Determinism: same query always produces same output
- `npm run lint` passes
- `npm run typecheck` passes
- `npm test` passes

## Implementation Order

```
TASK-001 (types) ──────┬── TASK-003 (store) ── TASK-004 (store tests)
                       │         │
TASK-002 (errors) ─────┼─────────┼── TASK-005 (validator)
                       │         │         │
                       │         ▼         ▼
                       │    TASK-006 (handler)
                       │         │
                       │         ▼
                       │    TASK-007 (routes)
                       │         │
                       │         ▼
                       └── TASK-008 (server integration)
                                 │
                                 ▼
                           TASK-009 (ingestion integration)
                                 │
                                 ▼
                           TASK-010 (contract tests)
                                 │
                                 ▼
                           TASK-011 (final verification)
```

## Next Steps

After plan approval:

1. Run `/implement-spec .cursor/plans/signal-log.plan.md` to execute this plan
2. Agent will track progress through each task using the todos in frontmatter
3. Or implement manually, updating task status as you complete each step

