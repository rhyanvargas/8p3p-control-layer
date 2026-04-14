# Multi-School Architecture (Charter Network Scoping)

> Defines how 8P3P models charter networks with multiple schools under a single `org_id`, using `school_id` as a query-time filter dimension — not a data-isolation boundary. Enables cross-school learner continuity (the "carry context" promise) while preserving per-school visibility for principals and teachers.

## Overview

Charter networks like Springs Charter (20 schools, 1 IT director) need a single tenant that spans all their schools. The 8P3P pitch deck positions the Living Student Record as a **cross-grade, cross-classroom, cross-school** view — a student who transfers from School A to School B should retain their full learning history.

This spec establishes `school_id` as a **recommended convention field** carried in signal `metadata`. It does not change the `SignalEnvelope` top-level contract or introduce a new DynamoDB table. The school dimension is query-time filtering on existing data — not a new isolation boundary.

**Design principle:** `org_id` is the trust boundary (data isolation, API key scoping, billing). `school_id` is an **operational filter** within that boundary (per-school dashboards, per-school decision queries). This maximises the compounding value of the Living Student Record while giving school-level staff the focused views they need.

---

## Data Model

### Signal Convention

Signals from a charter network include `school_id` in the `metadata` object:

```json
{
  "org_id": "springs",
  "signal_id": "sig-20260410-001",
  "source_system": "canvas-lms",
  "learner_reference": "L-12345",
  "timestamp": "2026-04-10T14:30:00Z",
  "schema_version": "v1",
  "payload": {
    "stabilityScore": 0.65,
    "masteryScore": 0.80
  },
  "metadata": {
    "school_id": "springs-es-03",
    "correlation_id": "req-abc-123"
  }
}
```

`school_id` is **optional** — signals without it are valid. Orgs that operate a single school (or do not need school-level filtering) omit it entirely.

### Why `metadata` (not `payload` or top-level)

| Location | Verdict | Rationale |
|----------|---------|-----------|
| Top-level (`SignalEnvelope.school_id`) | **Rejected** | Breaks the existing contract. Every consumer would need updating. Adds a field that only matters for multi-school orgs. |
| `payload.school_id` | **Rejected** | Payload is the learning data that flows into state. `school_id` is operational context — it should not pollute state or trigger policy rules unless explicitly configured. |
| `metadata.school_id` | **Chosen** | `metadata` already exists for operational context (`correlation_id`, `trace_id`). School identity is operational context. No contract change — `metadata` is already `additionalProperties: false` only for the currently listed fields, but the JSON Schema allows extension. |

### SignalMetadata Extension

```typescript
export interface SignalMetadata {
  correlation_id?: string;
  trace_id?: string;
  school_id?: string;   // NEW — charter network school identifier
}
```

This is the **only type change** in this spec. The `metadata` object in the JSON Schema (`src/contracts/schemas/signal-envelope.json`) and OpenAPI spec (`docs/api/openapi.yaml`) gain an optional `school_id` string property.

### State, Decision, and Signal Log — No Structural Changes

| Store | Change | Rationale |
|-------|--------|-----------|
| Signal Log | **None** — `school_id` is already stored as part of the full `SignalEnvelope` (includes `metadata`) | Queryable via existing `metadata` column if needed |
| STATE Engine | **None** — state is keyed by `(org_id, learner_reference)`. A student in school A and school B has one unified state. | This is the "carry context" design: school transfers preserve learning history |
| Decision Engine | **None** — decisions reference state, not school. Policy rules can condition on state fields derived from any school's signals. | Cross-school decisions compound naturally |
| Ingestion Log | **None** — the `IngestionOutcomeEntry` already stores `source_system`; `school_id` is in the stored signal metadata | Queryable for per-school ingestion health |

---

## Query-Time School Filtering

### Existing Endpoints — Optional `school_id` Filter

The following read endpoints gain an optional `school_id` query parameter. When provided, results are filtered to signals/decisions where `metadata.school_id` matches. When omitted, all signals/decisions for the org are returned (network-wide view).

| Endpoint | Filter Mechanism |
|----------|-----------------|
| `GET /v1/signals` | Filter signal log rows where `metadata->>'school_id' = :school_id` |
| `GET /v1/ingestion` | Filter ingestion outcomes where the originating signal's `metadata.school_id` matches |
| `GET /v1/state/list` | Filter learners who have at least one signal with the given `school_id` |
| `GET /v1/decisions` | Filter decisions whose triggering signal had the matching `school_id` |
| `GET /v1/learners/:ref/summary` (future) | Filter `signals_summary` and `recent_decisions` by `school_id` |

**No filter on `GET /v1/state`:** A learner's state is the unified view across all schools. Filtering state by school would fragment the Living Student Record — exactly the problem we solve. A principal who asks "show me this student's state" sees the full picture, including signals from other schools. This is a feature, not a bug.

### Decision `school_id` Propagation

When a signal produces a decision, the decision's `decision_context` includes `school_id` if it was present in the triggering signal's metadata:

```json
{
  "decision_context": {
    "school_id": "springs-es-03"
  }
}
```

This enables downstream consumers (dashboards, notification systems) to route decisions to the right school without re-querying the signal log.

**Implementation:** In `handler-core.ts`, after `evaluateState()` succeeds, merge `signal.metadata.school_id` (when present) into `decision_context` before `saveDecision()`. This is a 2-line change in the existing pipeline.

---

## DynamoDB Considerations (AWS Deployment)

### Signal Table — GSI for School Queries

The existing Signals table GSI (`gsi1-learner-time`) keys on `org_id` + `learner_timestamp`. For efficient per-school queries, a second GSI is recommended:

| GSI | PK | SK | Projection |
|-----|----|----|------------|
| `gsi2-school-time` | `org_id#school_id` | `learner_timestamp` | Keys only (fetch full item on demand) |

**When to add:** This GSI is only needed when per-school signal queries become a pilot requirement. At Springs' scale (~20 schools, moderate signal volume), filtering in the application layer after the org-level Query is acceptable for Phase 1. Add the GSI in Phase 2 when multi-school onboarding scales.

### Decisions Table — School in `decision_context`

Decisions already store `decision_context` as a DynamoDB Map. No schema change needed — `school_id` is a key within that map. For Phase 2 per-school decision aggregation, a sparse GSI on `decision_context.school_id` could be added.

---

## Springs Charter Pilot — Concrete Example

| Entity | Value | Notes |
|--------|-------|-------|
| `org_id` | `springs` | One tenant for the entire charter network |
| `school_id` values | `springs-es-01` through `springs-es-20` | One per school; convention: `{org}-{type}-{number}` |
| `learner_reference` | From SIS (PowerSchool student ID) | Unique across the network; pseudonymous |
| API key | One `x-api-key` for the network | Emerson (IT Director) manages one key |
| Policies | One org-wide policy (`springs:learner`) initially | Per-school policy routing (Phase 1 roadmap) if different schools need different thresholds |
| Field mappings | One per `source_system` (`canvas-lms`) | All 20 schools use the same Canvas instance — one mapping suffices |

**Student transfer scenario:**

1. Student L-12345 attends `springs-es-03` (elementary). Signals carry `metadata.school_id: "springs-es-03"`.
2. Student transfers to `springs-ms-01` (middle school). New signals carry `metadata.school_id: "springs-ms-01"`.
3. The middle school teacher queries `GET /v1/state?org_id=springs&learner_reference=L-12345` → sees the **full** state including elementary school signals. No data migration. No API change. The "carry context" promise is fulfilled.
4. The middle school principal queries `GET /v1/decisions?org_id=springs&school_id=springs-ms-01` → sees only decisions from middle school signals. The elementary principal sees only elementary decisions. Emerson (IT Director) omits `school_id` → sees all decisions network-wide.

---

## Requirements

### Functional

- [ ] `SignalMetadata` type gains optional `school_id: string` property
- [ ] `signal-envelope.json` JSON Schema gains `school_id` in `metadata.properties` (optional string, maxLength 128)
- [ ] OpenAPI spec `SignalEnvelope.metadata` gains `school_id` property
- [ ] `school_id` from `signal.metadata` is propagated into `decision_context.school_id` when present
- [ ] `GET /v1/signals` accepts optional `school_id` query parameter; when set, filters results to matching `metadata.school_id`
- [ ] `GET /v1/ingestion` accepts optional `school_id` query parameter
- [ ] `GET /v1/state/list` accepts optional `school_id` query parameter (filters learners with signals from that school)
- [ ] `GET /v1/decisions` accepts optional `school_id` query parameter (filters by `decision_context.school_id`)
- [ ] `GET /v1/state` does **not** accept `school_id` — state is always the full cross-school view
- [ ] All query filters are applied in the application layer (no new DynamoDB GSIs required for Phase 1)
- [ ] Signals without `metadata.school_id` are valid — school_id is optional

### Acceptance Criteria

- Given a signal with `metadata.school_id: "springs-es-03"`, when ingested, then the signal log stores the full metadata including `school_id`
- Given a signal with `school_id` that produces a decision, then `decision_context.school_id` is `"springs-es-03"` in the stored decision
- Given learner L-12345 has signals from `springs-es-03` and `springs-ms-01`, when `GET /v1/state?org_id=springs&learner_reference=L-12345` is called, then the state reflects signals from both schools (unified view)
- Given the same learner, when `GET /v1/decisions?org_id=springs&learner_reference=L-12345&school_id=springs-ms-01` is called, then only decisions from middle school signals are returned
- Given `GET /v1/decisions?org_id=springs&learner_reference=L-12345` (no school_id filter), then all decisions across all schools are returned
- Given a signal without `metadata.school_id`, when ingested, then `decision_context` does not contain `school_id` and decision queries without `school_id` filter return it normally

---

## Constraints

- **`school_id` is not a security boundary** — it is an operational filter within an org. A user with the org's API key can see all schools' data by omitting the filter. Per-school access control is out of scope (requires per-school API keys or RBAC, deferred to Phase 2).
- **No new DynamoDB tables or GSIs in Phase 1** — filtering is application-layer. GSI `gsi2-school-time` is a Phase 2 optimization.
- **`school_id` naming convention is org-defined** — 8P3P does not enforce a format. Document the `{org}-{type}-{number}` convention as a recommendation for Springs.
- **State is always cross-school** — this is by design. Fragmenting state by school defeats the core value proposition.

---

## Out of Scope

| Item | Rationale | Revisit When |
|------|-----------|--------------|
| Per-school API keys / RBAC | Security model is org-level for pilot | Phase 2 multi-tenant RBAC |
| `school_id` as a required field | Optional is correct — single-school orgs don't need it | Never (keep optional) |
| Per-school policies (different thresholds per school) | Policy routing by `source_system` exists; school-level routing is Phase 1 | Phase 1 roadmap item |
| DynamoDB GSI for school-scoped queries | Application-layer filter is sufficient at pilot scale | Signal volume exceeds ~100K/month per org |
| Classroom / grade-level scoping | Finer granularity than school is deferred | Teacher dashboard UX requirements |
| Cross-org school transfers (student leaves Springs for another network) | Requires inter-org data portability | Phase 4 (Living Student Record portability) |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| `SignalEnvelope` type + JSON Schema | `docs/specs/signal-ingestion.md` | **Complete** |
| `SignalMetadata` type | `src/shared/types.ts` | **Complete** — extend with `school_id` |
| `decision_context` in Decision type | `docs/specs/decision-engine.md` | **Complete** — already `Record<string, unknown>` |
| OpenAPI `SignalEnvelope.metadata` schema | `docs/api/openapi.yaml` | **Complete** — add `school_id` property |
| Signal log query by metadata field | `docs/specs/signal-log.md` | **Complete** — SQLite JSON functions; DynamoDB filter expression |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| `school_id` in `decision_context` | Learner summary API — filter by school |
| `school_id` query filter on read endpoints | Admin dashboard (Phase 2) — per-school views |
| Network-wide unified state | Learner trajectory API — full cross-school trend |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `missing_required_field` | Validation — `org_id` absent |
| `invalid_format` | Validation — `school_id` exceeds maxLength |

### New (add during implementation)

None. `school_id` is optional and unvalidated beyond maxLength. Invalid values simply produce no filter matches.

---

## Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| SCH-001 | Signal with school_id accepted | Signal with `metadata.school_id: "springs-es-03"` | 200 accepted; signal stored with metadata intact |
| SCH-002 | Signal without school_id accepted | Signal with `metadata: {}` (no school_id) | 200 accepted; no `school_id` in stored metadata |
| SCH-003 | Decision propagates school_id | Signal with `school_id` → produces decision | Decision `decision_context.school_id === "springs-es-03"` |
| SCH-004 | Decision without school_id | Signal without `school_id` → produces decision | Decision `decision_context` does not contain `school_id` |
| SCH-005 | GET /v1/decisions with school_id filter | 2 decisions: one from school A, one from school B | `school_id=A` returns only school A decision |
| SCH-006 | GET /v1/decisions without school_id filter | Same 2 decisions | Both decisions returned |
| SCH-007 | GET /v1/state ignores school_id | Learner with signals from 2 schools | State reflects signals from both schools; no `school_id` param accepted |
| SCH-008 | Student transfer — state continuity | L-12345 gets signals from school A then school B | State contains data from both schools' signals |

> **Test strategy:** SCH-001 through SCH-004 are ingestion contract tests (extend `tests/contracts/signal-ingestion.test.ts`). SCH-005 through SCH-008 are integration tests using Fastify `inject` with seeded data from two schools. SCH-008 is the key "carry context" scenario.

---

## Notes

- **Naming convention for Springs:** Recommend `springs-{type}-{nn}` where type is `es` (elementary), `ms` (middle), `hs` (high). Document in the pilot integration guide.
- **Connector layer interaction:** When a Canvas connector is activated for `springs`, all 20 schools' Canvas webhooks point to the same webhook URL. The school identity comes from the Canvas webhook payload (which includes the Canvas account/sub-account ID). The webhook adapter or field mapping can extract this into `metadata.school_id`. This may require a minor extension to `webhook-adapters.md` for metadata extraction.
- **Future: per-school policy routing.** Phase 1 roadmap includes per-source policy routing. Per-school routing could be modeled as `routing.school_map: { "springs-es-03": "elementary-policy" }` in the routing config. This is additive and does not require changes to this spec.

---

*Spec created: 2026-04-10 | Phase: v1.1 (pilot) | Depends on: signal-ingestion.md, decision-engine.md. Recommended next: `/plan-impl docs/specs/multi-school-architecture.md`*
