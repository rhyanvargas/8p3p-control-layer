# Review: State Engine Spec vs API Contracts and Overall Direction

**Scope:** `/review @docs/specs/state-engine.md` — ensure the spec aligns with API contracts and project direction.  
**Reviewed:** `docs/specs/state-engine.md`, `docs/api/openapi.yaml`, `docs/api/asyncapi.yaml`, `docs/specs/signal-log.md`, `docs/specs/signal-ingestion.md`, foundation Component Interface Contracts, Contract Test Matrix, REVIEW-alignment-and-next-steps.md

---

## Review Summary

**Files Reviewed:** 8 (state-engine spec, OpenAPI, AsyncAPI, signal-log, signal-ingestion, foundation contracts, matrix, alignment doc)  
**Issues Found:** 1 error (fixed in spec), 0 warnings

### Issue Registry

| ID     | Issue | Root Cause | Responsible Document | Status |
|--------|--------|------------|----------------------|--------|
| ISS-001 | Integration Points said "querySignals" for Signal Log; STATE Engine uses internal `getSignalsByIds` | Copy-paste or conflation of REST API name with internal function | `docs/specs/state-engine.md` | **Fixed** – "Receives From" now references `getSignalsByIds` and signal-log.md |

---

## Alignment with API Contracts

### OpenAPI (`docs/api/openapi.yaml`)

- **No STATE endpoint** — Correct. State-engine spec states "internal component with no external API surface"; OpenAPI has no `/v1/state` or setState. ✅
- **Decision trace** — OpenAPI `Decision` schema requires `trace.state_id` and `trace.state_version`. State-engine defines `LearnerState` with `state_id` and `state_version` and exposes `getState()` for the Decision Engine. Trace values are supplied from LearnerState. ✅
- **Lifecycle** — OpenAPI description: "Ingestion → Signal Log → STATE Engine → Decision Engine → Output". State-engine: "Stage 3 of 5 (Ingestion → Signal Log → **STATE Engine** → Decision Engine → Output)". ✅

### AsyncAPI (`docs/api/asyncapi.yaml`)

- **Channels** — `signal.ingested` and `decision.emitted` only. State-engine spec "Out of Scope" explicitly defers "Event emission for state changes (future: StateUpdatedEvent)". No STATE channel required. ✅
- **Lifecycle** — Same as OpenAPI. ✅
- **Signal shape** — AsyncAPI `Signal` matches SignalEnvelope (no `accepted_at` in event payload). State-engine consumes `SignalRecord[]` from Signal Log (with `accepted_at`) via `getSignalsByIds`; ordering by `accepted_at` is in state-engine spec. ✅

### Signal Log (`docs/specs/signal-log.md`)

- **getSignalsByIds** — State-engine Dependencies and Integration Points (after fix) reference `getSignalsByIds()`. Signal-log spec defines it: signature, behavior (org isolation, order by `accepted_at`), and errors `unknown_signal_id`, `signals_not_in_org_scope`. ✅
- **Error codes** — State-engine reuses `unknown_signal_id` and `signals_not_in_org_scope` from Signal Log’s getSignalsByIds; no duplicate definition. ✅

### Signal Ingestion (`docs/specs/signal-ingestion.md`)

- **Forbidden keys** — State-engine lists the same forbidden semantic keys as signal-ingestion; wording "The same forbidden keys from Signal Ingestion apply to the state object" is correct. ✅
- **Error codes** — State-engine reuses `org_scope_required`, `missing_required_field`, `forbidden_semantic_key_detected`; no conflict. ✅

---

## Alignment with Foundation

### Component Interface Contracts

- **LearnerState** — Fields match (org_id, learner_reference, state_id, state_version, updated_at, state, provenance.last_signal_id, last_signal_timestamp). ✅
- **ApplySignalsRequest / ApplySignalsResult** — Field names and semantics match. ✅
- **STATE internal only** — Foundation: "STATE interfaces are internal surfaces"; spec: "internal component with no external API surface." ✅
- **Decision trace** — Foundation Decision schema requires `trace.state_id`, `trace.state_version`; spec feeds Decision Engine via `getState()` returning LearnerState. ✅

### Contract Test Matrix

- **STATE-001–STATE-008** — State-engine spec includes all eight in Contract Tests table with matching expected outcomes. ✅
- **field_path** — Matrix STATE-002 expects `field_path="signal_ids[0]"`, STATE-005 expects `field_path="state.x.course"`. Spec validation tables do not mention `field_path`. **Suggestion:** During implementation, include `field_path` in rejection/validation results where applicable so contract tests can assert it.

---

## Document Traceability

- [x] State-engine derives from "Component Interface Contracts, Contract Test Matrix, and Interface Validation Ruleset" (stated in spec).
- [x] Dependencies reference `docs/specs/signal-log.md` for `getSignalsByIds`.
- [x] No inline definition of Signal Log’s internal function; spec references the source.
- [x] Error codes: existing from ingestion/log; new ones assigned to `src/shared/error-codes.ts` (implementation concern).
- [x] Cross-document references use explicit paths (e.g. signal-log.md).

---

## Checklist (Spec vs API / Direction)

### Code Quality (N/A – spec only)

- N/A for spec document.

### Standards Compliance

- [x] Lifecycle and stage numbering consistent with OpenAPI, AsyncAPI, and foundation.
- [x] STATE authority (no setState) stated and reflected in OpenAPI (no state endpoint).
- [x] Org isolation and error codes aligned with signal-log and signal-ingestion.

### Security

- [x] No external state override; no hardcoded secrets in spec.
- [x] Org isolation and cross-org errors specified.

### Document Traceability

- [x] Dependencies reference correct source (signal-log.md for getSignalsByIds).
- [x] No inline definitions that belong in other specs.
- [x] Error codes either reused from source specs or assigned to shared error-codes (implementation).

### Cross-Document Dependencies

- [x] **Signal Log** — getSignalsByIds defined in signal-log.md; state-engine references it (fixed).
- [x] **Signal Ingestion** — Forbidden keys and reused error codes referenced, not redefined.
- [x] **Decision Engine / Output** — LearnerState provides state_id/state_version for Decision trace; OpenAPI/AsyncAPI Decision schema aligned.

---

## Spec Compliance (State-Engine vs Foundation + API)

- [x] LearnerState, ApplySignalsRequest, ApplySignalsResult match foundation and support Decision trace.
- [x] STATE-001–STATE-008 covered in spec.
- [x] No external setState; STATE authority maintained.
- [x] Integration Points corrected to use getSignalsByIds.

---

## Change Applied

In `docs/specs/state-engine.md`, **Integration Points → Receives From** was updated from:

- `Signal Log (querySignals) - Retrieves signal payloads by ID`

to:

- `Signal Log (getSignalsByIds) - Retrieves signal payloads by ID for application (internal; see docs/specs/signal-log.md)`

so the spec correctly names the internal function and points to the source spec.

---

## Next Steps

1. **State-engine spec** — Aligned with API contracts and direction; one correction applied. No further spec changes required for this review.
2. **Implementation** — When building STATE Engine, include `field_path` in validation/rejection results where relevant so STATE-002 and STATE-005 contract tests can assert it per the Contract Test Matrix.
3. **Next plan** — Per REVIEW-alignment-and-next-steps.md, create and execute the State Engine implementation plan from `docs/specs/state-engine.md`.
