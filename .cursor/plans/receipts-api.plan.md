---
name: Receipts API
overview: Add GET /v1/receipts as a thin compliance/audit query surface over the existing decision log. Receipts are a projection of Decision.trace (no new storage). Query params and ordering match GET /v1/decisions; response shape is GetReceiptsResponse with Receipt[] (decision_id, decision_type, decided_at, trace). Auth and error codes reuse existing /v1/* behavior.
todos:
  - id: TASK-001
    content: Add Receipt and GetReceiptsResponse types to shared types
    status: pending
  - id: TASK-002
    content: Implement receipts handler (thin wrapper over getDecisions)
    status: pending
  - id: TASK-003
    content: Register GET /receipts route and add /v1/receipts to server endpoints
    status: pending
  - id: TASK-004
    content: Add OpenAPI path and schemas for GET /v1/receipts
    status: pending
  - id: TASK-005
    content: Add contract tests RCPT-API-001 through RCPT-API-005
    status: pending
isProject: false
---

# Receipts API

**Spec**: `docs/specs/receipts-api.md`

## Prerequisites

Before starting implementation:

- Decision API and store implemented (`GET /v1/decisions`, `validateGetDecisionsRequest`, `getDecisions`, `encodePageToken` in `src/decision/`)
- OpenAPI defines `Decision` and `Decision.trace` semantics

## Tasks

### TASK-001: Add Receipt and GetReceiptsResponse types to shared types

- **Status**: pending
- **Files**: `src/shared/types.ts`
- **Action**: Modify
- **Details**: Add `Receipt` as a type-level projection of `Decision` to prevent drift (e.g., `Pick<Decision, 'decision_id' | 'decision_type' | 'decided_at' | 'trace'>`). Add `GetReceiptsResponse` (org_id, learner_reference, receipts: Receipt[], next_page_token). Place near existing GetDecisionsRequest/GetDecisionsResponse.
- **Depends on**: none
- **Verification**: Types export correctly; `Receipt.trace` includes state_snapshot, matched_rule, rationale per spec.

### TASK-002: Implement receipts handler (thin wrapper over getDecisions)

- **Status**: pending
- **Files**: `src/decision/receipts-handler.ts` (new)
- **Action**: Create
- **Details**: New file with `handleGetReceipts`. Parse query params, call `validateGetDecisionsRequest` (reuse), call `getDecisions` and `encodePageToken` from store. Map each Decision to Receipt (decision_id, decision_type, decided_at, trace). Return GetReceiptsResponse with same next_page_token semantics. On validation failure return 400 with same error shape as decision handler (reuse existing error codes; no new codes per spec).
- **Depends on**: TASK-001
- **Verification**: Unit or handler test: valid params → 200 and receipts array; from_time > to_time → 400 invalid_time_range; org isolation and pagination match decisions behavior.

### TASK-003: Register GET /receipts route and add /v1/receipts to server endpoints

- **Status**: pending
- **Files**: `src/decision/routes.ts`, `src/server.ts`, `docs/api/README.md`
- **Action**: Modify
- **Details**: In routes.ts import handleGetReceipts and register `app.get('/receipts', handleGetReceipts)`. In server.ts add `'/v1/receipts'` to the `endpoints` array in the root handler so it appears in API discovery. Update `docs/api/README.md` endpoint table to include `GET /v1/receipts`. Receipts are served under the same `/v1` prefix and apiKeyPreHandler, so auth is already applied.
- **Depends on**: TASK-002
- **Verification**: GET /v1/receipts with valid query returns 200 (or 401 when API key required); root GET / lists /v1/receipts.

### TASK-004: Add OpenAPI path and schemas for GET /v1/receipts

- **Status**: pending
- **Files**: `docs/api/openapi.yaml`
- **Action**: Modify
- **Details**: Add path `/v1/receipts` with get operation (tag: `Decision`); parameters identical to `/v1/decisions` (org_id, learner_reference, from_time, to_time, page_token, page_size). Responses 200 (GetReceiptsResponse), 400 (SignalLogError), 401 (API key). Add components/schemas: `Receipt` (decision_id, decision_type, decided_at, trace with the exact same trace sub-schema as `Decision`), `GetReceiptsResponse` (org_id, learner_reference, receipts[], next_page_token).
  - **Contract enforcement note**: No new JSON Schema is required in Phase 1 because `Receipt` introduces no new shape (it is a strict projection of `Decision` and reuses `Decision.trace`). Avoid divergence by keeping the `Receipt.trace` schema verbatim.
- **Depends on**: TASK-001
- **Verification**: OpenAPI validates; /docs shows GET /v1/receipts and Receipt/GetReceiptsResponse schemas; `npm run validate:contracts` passes.

### TASK-005: Add contract tests RCPT-API-001 through RCPT-API-005

- **Status**: pending
- **Files**: `tests/contracts/receipts-api.test.ts` (new)
- **Action**: Create
- **Details**: HTTP-level contract tests using Fastify app.inject(), mirroring `tests/contracts/output-api.test.ts`. Reuse same store setup (initDecisionStore, clearDecisionStore, saveDecision, createDecision helper). Implement: RCPT-API-001 happy path (valid params → 200, receipts array, next_page_token); RCPT-API-002 invalid time range (from_time > to_time → 400, invalid_time_range); RCPT-API-003 paging determinism (page_size=1 across pages, stable order, no duplication); RCPT-API-004 org isolation (mixed-org dataset, only org-scoped receipts); RCPT-API-005 receipt contains enriched trace (trace.state_snapshot, trace.matched_rule, trace.rationale present).
- **Depends on**: TASK-003
- **Verification**: `npm test -- tests/contracts/receipts-api.test.ts` passes; all five test IDs covered.

## Files Summary

### To Create


| File                                   | Task     | Purpose                                                                  |
| -------------------------------------- | -------- | ------------------------------------------------------------------------ |
| `src/decision/receipts-handler.ts`     | TASK-002 | Handler for GET /v1/receipts (validate + getDecisions + map to receipts) |
| `tests/contracts/receipts-api.test.ts` | TASK-005 | Contract tests RCPT-API-001..005                                         |


### To Modify


| File                     | Task     | Changes                                                 |
| ------------------------ | -------- | ------------------------------------------------------- |
| `src/shared/types.ts`    | TASK-001 | Add Receipt, GetReceiptsResponse                        |
| `src/decision/routes.ts` | TASK-003 | Register GET /receipts, handleGetReceipts               |
| `src/server.ts`          | TASK-003 | Add '/v1/receipts' to endpoints array                   |
| `docs/api/openapi.yaml`  | TASK-004 | Path /v1/receipts, schemas Receipt, GetReceiptsResponse |
| `docs/api/README.md`     | TASK-003 | Add `GET /v1/receipts` to endpoint table                |


## Test Plan


| Test ID      | Type     | Description                                                                       | Task     |
| ------------ | -------- | --------------------------------------------------------------------------------- | -------- |
| RCPT-API-001 | contract | Happy path receipts query — valid params → 200, receipts array, next_page_token   | TASK-005 |
| RCPT-API-002 | contract | Invalid time range rejected — from_time > to_time → 400, invalid_time_range       | TASK-005 |
| RCPT-API-003 | contract | Paging determinism — page_size=1 across pages, stable order, no duplication       | TASK-005 |
| RCPT-API-004 | contract | Org isolation — mixed-org dataset, only org-scoped receipts returned              | TASK-005 |
| RCPT-API-005 | contract | Receipt contains enriched trace — state_snapshot, matched_rule, rationale present | TASK-005 |


## Risks


| Risk                                                    | Impact | Mitigation                                                                                              |
| ------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| Receipt response shape drifts from Decision.trace       | Medium | Define `Receipt` as a projection of `Decision` (e.g. `Pick<Decision, ...>`) so trace stays aligned.     |
| Pagination token reuse between /decisions and /receipts | Low    | Spec requires same semantics; reusing getDecisions + encodePageToken keeps tokens identical by design.  |
| OpenAPI and implementation get out of sync              | Low    | Add contract tests; run `npm run validate:contracts`; keep Receipt.trace schema verbatim with Decision. |


## Verification Checklist

- All tasks completed
- All tests pass (`npm test`)
- Contract validation passes (`npm run validate:contracts`)
- Linter passes (`npm run lint`)
- Type check passes (`npm run typecheck`)
- GET /v1/receipts returns 200 with receipts for valid query; 400 for from_time > to_time; org isolation and pagination match GET /v1/decisions
- No new storage or mutation; receipts are projection of decision log only

## Implementation Order

```
TASK-001 → TASK-002 → TASK-003 → TASK-005
    ↘
     TASK-004
```

(TASK-004 can be done in parallel with TASK-002 after TASK-001. TASK-005 after TASK-003.)

## Next Steps

After generating the plan:

- Review and adjust task ordering/dependencies
- Run `/implement-spec .cursor/plans/receipts-api.plan.md`

