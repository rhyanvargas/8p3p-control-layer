# Archived Review: Spec-Driven Development Flow (OpenAPI)

**Archived from:** `docs/api/REVIEW-spec-consistency.md`  
**Archived on:** 2026-02-11  
**Note:** This is a historical snapshot and may be stale vs current implementation.  

---

# Review: Spec-Driven Development Flow (OpenAPI)

**Scope:** `/review --spec docs/api/openapi.yaml`  
**Purpose:** Verify spec-driven development flow is accurate and consistent.  
**Reviewed:** `docs/api/openapi.yaml`, `src/server.ts`, `src/ingestion/routes.ts`, `src/ingestion/handler.ts`, `src/signalLog/routes.ts`, `src/signalLog/handler.ts`, `src/shared/types.ts`, `.cursor/rules/control-layer-constraints/RULE.md`

---

## Review Summary

**Files Reviewed:** 8  
**Issues Found:** 1 error (fixed), 0 warnings

### Issue Registry

| ID     | Issue | Root Cause | Responsible Document | Status |
|--------|--------|------------|---------------------|--------|
| ISS-001 | POST /v1/signals returned 201 for accepted; OpenAPI specifies 200 | Implementation used 201 for "created"; spec defines 200 for "Signal accepted or duplicate (idempotent)" | `src/ingestion/handler.ts` | **Fixed** – reply.status(200) for accepted |

---

## Spec Compliance (OpenAPI vs Implementation)

### Endpoints

| Spec Path | Method | Implemented | Notes |
|-----------|--------|--------------|--------|
| `/v1/signals` | POST | Yes | Registered via `registerIngestionRoutes(v1)`; prefix `/v1` in server |
| `/v1/signals` | GET | Yes | Registered via `registerSignalLogRoutes(v1)` |
| `/v1/decisions` | GET | No (by design) | Documented in OpenAPI; implementation deferred per plan (`registerDecisionRoutes` commented) |

### Request/Response Schemas

- **POST /v1/signals**
  - Request: `SignalEnvelope` – aligned with `src/contracts/schemas/signal-envelope.json` and `src/shared/types.ts`.
  - Response 200: `SignalIngestResult` – implementation returns `org_id`, `signal_id`, `status`, `received_at`, optional `rejection_reason`; matches spec. Status code corrected to 200 for accepted.
  - Response 400: `SignalIngestResult` with `rejection_reason` – matches.

- **GET /v1/signals**
  - Query params: `org_id`, `learner_reference`, `from_time`, `to_time`, `page_token`, `page_size` – implemented and validated in `signalLog/validator.ts` and handler.
  - Response 200: `SignalLogReadResponse` (`org_id`, `learner_reference`, `signals`, `next_page_token`) – matches `src/shared/types.ts` and handler.
  - Response 400: `SignalLogError` – handler returns `SignalLogErrorResponse` with `error`, `code`, `field_path`, `details`; matches spec.

- **GET /v1/decisions**
  - Contract-only; no route registered. When implemented, should follow OpenAPI `GetDecisionsResponse` and query params.

### Document Traceability

- OpenAPI `description` fields reference `docs/specs/signal-ingestion.md` and `docs/specs/signal-log.md`; those files exist.
- Component comments in OpenAPI reference `src/contracts/schemas/signal-envelope.json` and Component Interface Contracts.
- `.cursor/rules/control-layer-constraints/RULE.md` requires alignment with `docs/api/openapi.yaml` and `npm run validate:api`; satisfied.

### Validation

- `npm run validate:api` (redocly lint) passes for `docs/api/openapi.yaml`.

---

## Cross-Document Dependencies

- [x] Signal ingestion: OpenAPI ↔ implementation aligned (paths, schemas, status codes).
- [x] Signal log: OpenAPI ↔ implementation aligned (query params, response shapes).
- [x] Decisions: OpenAPI defines contract; implementation deferred; no drift.

---

## Checklist (Document Traceability for Spec Reviews)

- [x] All dependencies reference correct source documents.
- [x] No inline definitions that belong in other specs.
- [x] Error codes and shapes match existing contracts.
- [x] Cross-document references use explicit paths (docs/specs/..., docs/api/openapi.yaml).

---

## Next Steps

- Implementation is consistent with the OpenAPI spec after the 200/201 fix.
- When adding GET /v1/decisions, register the route under `/v1` and implement handler/response per `GetDecisionsResponse` and query parameters in the spec.
- Re-run `/review --spec docs/api/openapi.yaml` after adding new endpoints or changing contracts.
