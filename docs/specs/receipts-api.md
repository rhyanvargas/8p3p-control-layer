# Receipts API (GET /v1/receipts)

## Overview
Receipts are the system’s first-class audit artifacts: **frozen evaluation state + matched rule + rationale** for every emitted decision. Today, receipt data lives in `Decision.trace` and is queried via `GET /v1/decisions` and the Decision Trace inspection panel (`/inspect`).

This feature introduces a dedicated **compliance/audit query surface**: `GET /v1/receipts`. Implementation should be a thin wrapper over the existing decision log (projection of decision trace), preserving contract stability of `GET /v1/decisions`.

## Requirements

### Functional
- [x] **New endpoint**: Add `GET /v1/receipts`.
- [x] **Query semantics**: Parameters MUST match `GET /v1/decisions` for consistency:
  - `org_id` (required)
  - `learner_reference` (required)
  - `from_time` (required, RFC3339)
  - `to_time` (required, RFC3339; must be >= `from_time`)
  - `page_token` (optional)
  - `page_size` (optional, 1–1000, default 100)
- [x] **Response shape**: Return `GetReceiptsResponse`:
  - `org_id`
  - `learner_reference`
  - `receipts: Receipt[]`
  - `next_page_token`
- [x] **Receipt projection**: Each `Receipt` MUST include:
  - `decision_id`
  - `decision_type`
  - `decided_at`
  - `trace` (same semantics and fields as `Decision.trace`)
- [x] **Ordering + pagination**: Deterministic ordering and pagination MUST match `GET /v1/decisions` (Phase 1 store semantics: `decided_at ASC`, then stable cursor).
- [x] **Auth behavior**: When API key auth is enabled, `GET /v1/receipts` MUST be protected under `/v1/*` like other endpoints.
- [x] **No new storage**: MUST not create a new receipt table in Phase 1; receipts are a view over the decision log.

### Acceptance Criteria
- Given decisions exist for `(org_id, learner_reference)` in a time range, when `GET /v1/receipts` is called with that range, then it returns `200` with `receipts.length >= 1` and each receipt contains `trace.state_snapshot`, `trace.matched_rule`, and `trace.rationale`.
- Given `from_time > to_time`, when `GET /v1/receipts` is called, then it returns `400` with `invalid_time_range`.
- Given decisions exist for org A and org B, when `GET /v1/receipts` is called for org A, then no receipts from org B are returned.

## Constraints
- Receipts MUST remain **a projection of the decision log** to preserve a single source of truth (`Decision.trace`).
- The endpoint MUST not introduce mutations or “receipt generation” workflows.
- The endpoint MUST not change the contract or behavior of `GET /v1/decisions`.

## Out of Scope
- Backfilling or migrating legacy decisions that lack enriched trace (handled by decision store read defaults and/or separate migration).
- Receipt write APIs (POST/PUT) or deletion.
- Cross-learner/org-wide receipt search (future; would require indexing decisions differently).

## Dependencies

### Required from Other Specs
| Dependency | Source Document | Status |
|------------|-----------------|--------|
| Decision contract + trace semantics | `docs/api/openapi.yaml` (`Decision.trace`) | Defined ✓ |
| Decision query validation semantics | `src/decision/validator.ts` (`validateGetDecisionsRequest`) | Defined ✓ |
| Decision storage + paging semantics | `docs/specs/decision-engine.md` + `src/decision/store.ts` | Defined ✓ |
| Receipt concept in inspection surfaces | `docs/specs/inspection-api.md` | Defined ✓ |

### Provides to Other Specs
| Function | Used By |
|----------|---------|
| `GET /v1/receipts` | Compliance / audit consumers |

## Error Codes

### Existing (reuse)
| Code | Source |
|------|--------|
| `org_scope_required` | Shared |
| `missing_required_field` | Shared |
| `invalid_timestamp` | Shared |
| `invalid_time_range` | Signal Log / Decision query validation |
| `invalid_type` | Shared |
| `invalid_page_token` | Signal Log / Decision query validation |
| `page_size_out_of_range` | Signal Log / Decision query validation |

### New (add during implementation)
| Code | Description |
|------|-------------|
| (none) | Reuse existing codes |

## Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| RCPT-API-001 | Happy path receipts query | Valid query params | `200`, receipts array, `next_page_token` |
| RCPT-API-002 | Invalid time range rejected | `from_time > to_time` | `400`, `invalid_time_range` |
| RCPT-API-003 | Paging determinism | `page_size=1` across pages | Stable order, no duplication |
| RCPT-API-004 | Org isolation | Mixed-org dataset | Only org-scoped receipts |
| RCPT-API-005 | Receipt contains enriched trace | Known decision in store | `trace.state_snapshot`, `trace.matched_rule`, `trace.rationale` present |

> **Test strategy note:** These should be HTTP-level contract tests mirroring `tests/contracts/output-api.test.ts`, but targeting `GET /v1/receipts`.

## Notes
- Receipt objects are intentionally **derived**, not separately stored, to keep auditability consistent and avoid divergence.

