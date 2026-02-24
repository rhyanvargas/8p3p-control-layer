---
name: CEO Fact-Check Actions
overview: Track and implement the four recommended actions from the CEO statement fact-check report so contract discipline and narrative alignment are not forgotten.
todos:
  - id: glossary
    content: Add terminology glossary to foundation docs (Signal = event; pipeline wording)
    status: completed
  - id: trace-required
    content: Make Decision.trace state_snapshot, matched_rule, rationale required in schema and engine
    status: completed
  - id: phase2-mappings
    content: Prioritize Phase 2 tenant field mappings DEF-DEC-006 for payload schema enforcement
    status: completed
  - id: receipts-endpoint
    content: Consider and implement GET /v1/receipts (or equivalent) for compliance/audit
    status: completed
isProject: false
---

# CEO Fact-Check Recommended Actions

**Source:** [docs/reports/2026-02-24-ceo-statement-fact-check.md](docs/reports/2026-02-24-ceo-statement-fact-check.md)

These actions address the valid concerns from the CEO fact-check while leaving the API contract stable.

---

## 1. Add terminology glossary (foundation docs)

**Goal:** Align investor/sales language ("events → state → decisions → receipts") with our internal term "signal" without renaming routes.

- Add a short **Terminology** or **Glossary** section to a foundation doc (e.g. [docs/foundation/ip-defensibility-and-value-proposition.md](docs/foundation/ip-defensibility-and-value-proposition.md) or a new [docs/foundation/terminology.md](docs/foundation/terminology.md)).
- Define: **Signal** = the canonical term for an external learning event accepted by the control layer.
- State the pipeline in both forms: "events (signals) → state → decisions → receipts."
- No code or API changes.

---

## 2. Make trace fields required (optional hardening)

**Goal:** Guarantee every decision includes a full receipt (frozen state snapshot, matched rule, rationale).

- In [src/contracts/schemas/decision.json](src/contracts/schemas/decision.json): add `state_snapshot`, `matched_rule`, and `rationale` to the `trace` object's **required** array (they are currently optional).
- In [src/shared/types.ts](src/shared/types.ts): remove the `?` from `Decision.trace.state_snapshot`, `matched_rule`, and `rationale` so TypeScript reflects required.
- In the decision engine ([src/decision/engine.ts](src/decision/engine.ts) / policy evaluation path): ensure every emitted decision always populates these three fields (no conditional omit).
- Run contract tests and validators; update OpenAPI in [docs/api/openapi.yaml](docs/api/openapi.yaml) if it mirrors the schema.

**Note:** Marked optional in the report; do this only if CEO explicitly wants receipts guaranteed on every decision.

---

## 3. Phase 2 tenant field mappings (DEF-DEC-006)

**Goal:** Stricter payload semantics per tenant without breaking vendor-agnosticism.

- This is already scoped in [docs/foundation/ip-defensibility-and-value-proposition.md](docs/foundation/ip-defensibility-and-value-proposition.md) (Phase 2: Tenant-Scoped Field Mappings).
- Implement declarative per-tenant field mappings (e.g. which fields are required in `payload`, optional normalization rules).
- Requires: tenant config store, validation layer that applies tenant schema to incoming `SignalEnvelope.payload`, and docs/spec updates. Prioritize when product commits to stricter payload enforcement.

---

## 4. Consider GET /v1/receipts (or equivalent)

**Goal:** Give compliance/audit a first-class "receipts" query surface.

- Today receipt data lives in `Decision.trace` and is read via `GET /v1/decisions` and the Decision Trace panel at `/inspect`.
- Add a dedicated route (e.g. `GET /v1/receipts`) that returns decision trace data (same or subset of current decision response) for org/learner/time range—either as an alias or a thin wrapper over the decision log.
- Touch: [src/server.ts](src/server.ts) route registration, new or existing [src/decision/](src/decision/) handler, [docs/api/openapi.yaml](docs/api/openapi.yaml), and optionally [docs/specs/](docs/specs/) for the receipts API.

---

## Dependency order

- **1** can be done immediately (docs only).
- **2** is independent (schema + engine).
- **3** is a larger feature (tenant config + validation).
- **4** can follow after 1 and 2; may depend on product decision to expose receipts as a separate resource.
