---
name: CEO Fact-Check Actions
overview: Track and implement recommended actions from CEO statement fact-check and CEO pilot positioning directive (2026-02-24). Original 4 actions complete; 2 PII hardening tasks added per CEO directive.
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
  - id: pii-forbidden-keys
    content: "DEF-DEC-008-PII: Add PII keys (firstName, email, ssn, birthdate, etc.) to forbidden-keys list in src/ingestion/forbidden-keys.ts"
    status: completed
  - id: canonical-snapshot
    content: "DEF-DEC-007: Canonicalize state_snapshot in src/decision/engine.ts — include only policy-evaluated fields, exclude non-canonical/PII fields"
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

---

## 5. PII forbidden keys (DEF-DEC-008-PII) — v1 pilot hardening

**Goal:** Reject inbound PII at ingestion so personal data never enters STATE or receipts.

**Source:** CEO directive (2026-02-24): "Any inbound PII fields are rejected or stripped."

- In [src/ingestion/forbidden-keys.ts](src/ingestion/forbidden-keys.ts): add a new PII category to `FORBIDDEN_KEYS`:
`firstName, lastName, first_name, last_name, fullName, full_name, email, emailAddress, email_address, phone, phoneNumber, phone_number, ssn, social_security, socialSecurity, birthdate, birthday, birth_date, date_of_birth, dateOfBirth, dob, address, streetAddress, street_address, zipCode, zip_code, postalCode, postal_code`
- **Note:** Bare `name` intentionally excluded — too generic and would produce false positives on legitimate payload keys (e.g., skill name, assessment name). Covered variants `firstName`, `lastName`, `fullName`, `full_name` catch PII usage.
- Existing `forbidden_semantic_key_detected` error code applies — no new error codes needed.
- Update tests in `tests/unit/forbidden-keys.test.ts` to cover PII keys.
- Spec: `docs/specs/signal-ingestion.md` §Forbidden Semantic Keys — PII Keys.

---

## 6. Canonical receipt snapshot (DEF-DEC-007) — v1 pilot hardening

**Goal:** Receipt `state_snapshot` includes only canonical fields that the policy evaluates, not the full STATE object. Prevents PII leakage.

**Source:** CEO directive (2026-02-24): "We will configure receipts to exclude PII."

- In [src/decision/engine.ts](src/decision/engine.ts) Step 6 (~line 130): instead of `JSON.parse(JSON.stringify(currentState.state))`, build a snapshot containing only the canonical fields used by the loaded policy's rules (extract field names from `policy.rules[].condition` tree) plus `learner_reference`, `state_id`, `state_version`.
- Helper function: `extractCanonicalSnapshot(state, policy)` — walks the policy condition tree to collect referenced field names, then picks only those from state.
- Update contract tests that assert `state_snapshot` content to expect canonical-only fields.
- Spec: `docs/specs/inspection-api.md` §3.1 (updated 2026-02-24).

---

## Dependency order

- **1–4** are complete (glossary, trace required, tenant mappings, receipts endpoint).
- **5** (PII forbidden keys) is independent — can be implemented immediately.
- **6** (canonical snapshot) is independent — can be implemented immediately.
- **5 and 6 together** close the PII gap required by CEO directive before pilot handoff.

