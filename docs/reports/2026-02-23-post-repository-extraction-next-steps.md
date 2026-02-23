# Next Steps — Post–Repository Extraction

**Date:** 2026-02-23  
**Context:** All implementation plans in `.cursor/plans/` are complete (Idempotency, Signal Log, State repository extraction).  
**References:** `docs/foundation/roadmap.md`, `docs/reports/2026-02-23-ceo-scope-approval.md`

---

## Completed Plans

| Plan | Status | Outcome |
|------|--------|---------|
| Idempotency Repository Extraction | Done | `IdempotencyRepository` + `SqliteIdempotencyRepository`, `setIdempotencyRepository()` |
| Signal Log Repository Extraction | Done | `SignalLogRepository` + `SqliteSignalLogRepository`, `setSignalLogRepository()` |
| State Repository Extraction | Done | `StateRepository` + `SqliteStateRepository`, `setStateRepository()` |

All existing function signatures and consumer imports are unchanged. Phase 2 (e.g. DynamoDB) can swap adapters via the `set*Repository()` injection points without changing engine or handler code.

---

## Recommended Next Steps

1. **QA execution**  
   Run the QA test suite for the current implementation:  
   **`docs/testing/qa-test-post-repository-extraction.md`**  
   Use it for QA sign-off before pilot/demo.

2. **Week 1 checkpoint (CEO scope)**  
   From `docs/reports/2026-02-23-ceo-scope-approval.md`, the Week 1 checkpoint requires:
   - Queryable ingestion outcomes (accepted/rejected/duplicate) — **covered by GET /v1/ingestion**
   - Read-only GET /v1/state — **implemented**
   - API key enforced — **implemented** (when `API_KEY` set)
   - Decisions visible in stream (receipts may be stubbed) — **GET /v1/decisions**  
   Confirm these are demo-ready and document any gaps.

3. **Roadmap and planning**  
   - Update **`docs/foundation/roadmap.md`** to state that repository-extraction plans are complete and point to this report for next steps.  
   - Any **new** implementation work (e.g. receipt polish, Phase 2 DynamoDB, tenant provisioning) should get a new spec/plan in `docs/specs/` and `.cursor/plans/` as per `docs/foundation/definitive-workflow.md`.

4. **Phase 2 (when scheduled)**  
   - Add plans for DynamoDB adapters (one per store) that implement the existing repository interfaces.  
   - In `server.ts`, replace `init*Store(dbPath)` with `set*Repository(new DynamoDb*Repository(config))`; no other app code changes required.

---

## No New Plans in `.cursor/plans/` Until…

- A new feature or migration is specified (spec or report), and  
- An implementation plan is added under `.cursor/plans/` and executed via `/implement-spec`.

Current state: **no active execution plans**; next work is QA sign-off, Week 1 checkpoint validation, and roadmap update, then new plans as needed.
