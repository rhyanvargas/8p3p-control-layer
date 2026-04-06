# 8P3P Control Layer — Product Strategy Gap Analysis (v3)

**Date:** 2026-04-06
**Prepared by:** Rhyan (CTO)
**For:** Al Ware (CEO / Partner) — Approval Requested
**Source inputs:** Huddle notes 4/6/26, company positioning statements, current roadmap, specs (`docs/specs/`), implementation plans (`.cursor/plans/`), external integration platform architecture review, and Connector Layer UX analysis

---

## Summary

The 4/6/26 huddle produced four major product requirements — document-based policy creation, pre-configured platform integrations (Canvas, I-Ready, Branching Minds), AI-powered schema mapping, and a yearly policy lock — that are not fully represented in the current roadmap, specs, or implementation plans. An external integration platform architecture review and a subsequent Connector Layer UX analysis were cross-referenced to validate the approach.

The Connector Layer analysis revealed a critical finding: the existing specs solve the *engineering* of data transformation but do not eliminate the **"connector tax"** — the manual configuration burden that makes every pilot a custom engineering project. The current pilot integration guide (`docs/guides/pilot-integration-guide.md` §8) asks customers to *build their own webhook receiver and implement field mapping in code*. This is the exact problem pre-configured connectors are designed to solve.

The existing v1.1 engineering work is sound and should continue without interruption; these new requirements layer *on top of* what is already being built. No existing specs need to be torn down — four new specs need to be written, two existing stories need to be revised, and four targeted refinements should be made to existing specs.

---

## What the Huddle Established

### Company Positioning (confirmed)

| Statement | Engineering Status |
|---|---|
| "Works with systems schools already use" | **Covered** — webhook adapters + declarative field mappings handle any LMS |
| "Single living student record" | **Partial** — learner state + summary API provides the data; "living record" as a product concept is not yet named or surfaced in docs |
| "Detect learning gaps earlier" | **Covered** — state delta detection + trajectory API detect directional trends |
| "Clear next-step recommendations" | **Covered** — 4-type decision engine (`reinforce`, `advance`, `intervene`, `pause`) |
| "Grows more valuable over time / harder to replace" | **Covered in architecture, not in product language** — signal history + trajectory accumulate irreplaceable longitudinal data; this needs to be stated explicitly in product docs |

### New Requirements from Huddle

| Requirement | Current Status | Gap Level |
|---|---|---|
| Document upload → AI policy generation → preview → confirm → yearly lock | Only a single-call text-input story exists in backlog (US-POLICY-BUILDER-001) | **Major** |
| Pre-configured integrations for Canvas, I-Ready, Branching Minds | Generic mapping engine exists; no templates or activation workflow | **Major** |
| AI-powered schema field mapping with user confirmation | No spec exists | **Major** |
| Long-term: K–workforce "credit report for learning", B2C, SDK, partner hub | Phase 4 roadmap acknowledges direction; not yet detailed | **Minor (correct phase)** |

---

## Gap Analysis

### Gap 1 — Policy Creation Workflow (Major)

**What exists:** `US-POLICY-BUILDER-001` in the v1.2 backlog describes natural language → JSON policy generation via a decoupled LLM service. It is a single API call accepting a text description.

**What the huddle requires:** A multi-stage product workflow:
1. Admin uploads standards/curricula documents (PDF, DOCX)
2. System parses and extracts learning intent from the documents
3. AI generates one or more draft policies
4. Admin previews, edits, and confirms
5. Confirmed policy is activated with a yearly lock (mid-year edits blocked)

**What needs to change:**
- `US-POLICY-BUILDER-001` must be split into three stories: document upload/parsing, AI generation from parsed intent, and preview/confirm/lock workflow
- A new spec is required: `docs/specs/policy-creation-workflow.md`
- A new micro-spec is required: `docs/specs/policy-locking.md` (yearly lock, immutability window, draft vs. active states)
- The existing policy management API spec (`docs/specs/policy-management-api.md`) needs a `locked_at` attribute and lock/unlock endpoints added

**What is unaffected:** The policy storage (DynamoDB), policy inspection API, and decision engine are all correct and untouched by this addition.

---

### Gap 2 — Connector Layer + Pre-Configured Integration Templates (Major)

**What exists:** Two infrastructure specs cover the internal machinery:

- `tenant-field-mappings.md` — the **transform engine** (Layer 1): aliases, computed transforms, required fields, type enforcement. Stored per `(org_id, source_system)` in DynamoDB. This is correct but requires the admin to construct full mapping JSON manually.
- `webhook-adapters.md` — the **webhook adapter** (Layer 2): accepts raw LMS payloads at `POST /v1/webhooks/:source_system`, extracts envelope fields via declarative config, feeds the transform engine. This eliminates the need for customers to build their own webhook receiver.

**What is missing:** The **Connector Activation Layer** (Layer 3) — the product UX that eliminates the "connector tax." This is the layer that makes it "Add Canvas → done."

**The connector tax problem:** The current pilot integration guide (`docs/guides/pilot-integration-guide.md` §8–§9) asks customers to:
1. Implement event → `SignalEnvelope` transformation (custom code)
2. Implement canonical field mapping + normalization (custom code)
3. Send signals to `POST /v1/signals` with their own webhook receiver

This means every pilot = custom engineering work. The webhook adapter spec (Layer 2) improves this by accepting raw payloads, but the admin still must manually construct mapping JSON via `PUT /v1/admin/mappings/:org_id/:source_system` — knowing the exact Canvas field paths, transform expressions, and envelope extraction config. That is still connector tax.

**What the huddle requires and best-practice connector UX dictates:**

The correct Connector Layer flow (aligned with Stripe Connect, Plaid Link, Linear integrations):

```
STEP 1: Admin activates connector
  POST /v1/admin/connectors/activate { "source_system": "canvas-lms" }
  → Template copied to FieldMappingsTable for this org
  → Returns: webhook URL, setup instructions, selected event types

STEP 2: Admin configures event types (wizard-style)
  PUT /v1/admin/connectors/:source_system/config
  { "event_types": ["submission_created", "grade_updated"] }
  → Only selected event types become signals; others are skipped

STEP 3: Admin adds webhook URL to LMS
  Webhook URL: https://api.8p3p.dev/v1/webhooks/canvas-lms
  API key: <provided during onboarding>
  → Signals flow automatically. No custom code.
```

**The three-layer architecture:**

```
┌─────────────────────────────────────────────────────┐
│  LAYER 3: Connector Activation UX          ← NEW   │
│  Activate → configure event types → get webhook URL │
│  Spec: integration-templates.md                     │
├─────────────────────────────────────────────────────┤
│  LAYER 2: Webhook Adapter (raw payload ingestion)   │
│  POST /v1/webhooks/:source_system                   │
│  Spec: webhook-adapters.md (spec'd, not built)      │
├─────────────────────────────────────────────────────┤
│  LAYER 1: Transform Engine (payload normalization)  │
│  aliases → transforms → required → types            │
│  Spec: tenant-field-mappings.md (spec'd, not built) │
├─────────────────────────────────────────────────────┤
│  FOUNDATION: Signal Ingestion Pipeline              │
│  POST /v1/signals → state → decision                │
│  Spec: signal-ingestion.md (BUILT, 507+ TESTS)     │
└─────────────────────────────────────────────────────┘
```

Layer 3 does not require changing Layers 1 or 2 architecturally. The activation API writes into the same `FieldMappingsTable` that the transform engine reads. The webhook adapter endpoint is the same — it gets its config from a template-seeded row instead of a manually constructed one.

**What needs to change:**
- A new spec is required: `docs/specs/integration-templates.md` covering:
  - **Connector catalog**: `GET /v1/admin/connectors` — list available connectors (Canvas, I-Ready, Branching Minds) with status (available / activated / configured)
  - **Activation API**: `POST /v1/admin/connectors/activate` — copies template into `FieldMappingsTable`, returns webhook URL + setup instructions
  - **Event type configuration**: `PUT /v1/admin/connectors/:source_system/config` — select which LMS event types become signals
  - **Template registry**: pre-built `envelope` + `transform` + `event_types` configurations, versioned and owned by 8P3P
  - **Template versioning**: when a platform changes its webhook schema, 8P3P updates the template; tenant mappings track `template_id` / `template_version` for upgrade detection
- `docs/specs/webhook-adapters.md` needs event type filtering added: adapter checks payload event type against allowed list, skips non-selected events
- `docs/specs/tenant-field-mappings.md` needs `template_id` / `template_version` metadata on the DynamoDB item shape
- `docs/guides/pilot-integration-guide.md` needs rewrite: "activate Canvas connector" replaces "implement webhook receiver"
- This is a **Pre-Month 0 requirement** — without it, the pilot with Springs requires manual engineering for every LMS connection

**Risk if skipped:** Every pilot = custom engineering work. Onboarding is non-repeatable. This directly contradicts the Phase 1 roadmap goal of "repeatable deployments" and the company positioning of "works with systems schools already use."

**Build order:** Layer 1 (tenant-field-mappings) → Layer 2 (webhook-adapters) → Layer 3 (integration-templates). All three must ship before Month 0.

---

### Gap 3 — AI-Powered Schema Mapping (Major, Phase 2)

**What exists:** Manual JSON mapping creation only.

**What the huddle requires:** A school uploads or pastes a sample payload from their LMS → AI suggests which fields map to canonical fields (`stabilityScore`, `masteryScore`, etc.) → admin confirms → mapping is saved.

**What needs to change:**
- A new spec is required: `docs/specs/ai-schema-mapping.md`
- New user story: `US-SCHEMA-MAPPING-001` in the v1.2 backlog
- Like the policy builder, the AI service is decoupled from the core API. The core API adds `POST /v1/admin/mappings/suggest` → delegates to mapping suggestion service → returns draft with confidence scores → admin confirms with existing `PUT /v1/admin/mappings/:org_id/:source_system`
- **Phase 2 work** (6–12 months) — but the admin API route shape should be designed with this in mind before the v1.1 mapping admin routes are finalized

---

### Gap 4 — "Living Student Record" — Product Terminology (Minor, Documentation)

**What exists:** "Learner state" in terminology docs — a technical term for the accumulated state object. The `learner-summary-api.md` aggregates it into a readable response.

**What is missing:** The product concept of a "Living Student Record" as the differentiator — not named anywhere in product-facing docs. The competitive advantage (systems can be replaced but the record persists) is implied by the architecture but never stated.

**What needs to change (low effort, high impact for partner conversations):**
- Add "Living Student Record" to `docs/foundation/terminology.md` — product-level definition mapping it to the combination of: learner state (current), signal history, decisions, and trajectory
- Add a paragraph to `docs/foundation/architecture.md` that names this composite as the core value asset
- Consider whether `GET /v1/learners/:ref/summary` should be positioned as the "Living Student Record" read endpoint in the pilot integration guide

---

### Gap 5 — Yearly Policy Lock (Medium, Phase 1)

**What exists:** Policy management API supports create, update, soft-delete, and active/disabled status. No temporal immutability.

**What the huddle requires:** Once a policy is activated for the school year, it should be locked. Edits mid-year are blocked. New policies can be drafted alongside a locked one for the next year.

**What needs to change:**
- Add `locked_at`, `lock_until`, and `lock_reason` attributes to the policy DynamoDB item shape
- Add `POST /v1/admin/policies/:org_id/:policy_key/lock` and `/unlock` endpoints
- Business rule: `PUT` on a locked policy → 409 Conflict with `policy_locked` error code
- This is small enough to be a micro-spec or an amendment to `docs/specs/policy-management-api.md`

---

## Integration Platform Architecture Review

An external review recommended framing the ingestion layer as a "Signal Ingestion Platform" with a Kinesis signal bus, S3 raw event store, separate transform Lambdas, OAuth connector auth, and a formalized canonical signal schema. Below is the CTO assessment of each recommendation against the actual codebase.

### Adopted Recommendations

| Recommendation | Justification | Action |
|---|---|---|
| **Template Registry (pre-built connectors)** | Aligns with Gap #2. Without templates, every pilot = custom engineering. Templates are the product layer that makes the generic mapping engine usable. | Already planned — `integration-templates.md` spec (Priority 1) |
| **"Ship opinionated templates first, flexibility later"** | The existing architecture is flexibility-first (generic engine). The product experience must be templates-first. This is a product sequencing decision, not an architecture change. | Guides template spec: ship Canvas/I-Ready/Branching Minds defaults, tenant customization is opt-in |
| **Event type filtering in templates** | Real LMS webhooks fire for multiple event types (submission created, grade changed, enrollment updated). Only some should become learning signals. Current webhook adapter treats all payloads identically. | **New refinement** — add `event_types` filter to `integration-templates.md` spec and extend `webhook-adapters.md` with event type routing |
| **Signal type taxonomy** | Currently, all signals are treated as the same kind of event. Adding a `signal_type` field (e.g., `assessment`, `attendance`, `observation`) enables event routing and per-type policy evaluation. | **New refinement** — add optional `signal_type` to `SignalEnvelope` as a v1.2 forward-compatible field; document in `signal-ingestion.md` as reserved |
| **AI schema mapping (Phase 2)** | Aligns with Gap #3. Decoupled LLM service, not embedded in core. | Already planned — `ai-schema-mapping.md` spec (Priority 4) |
| **Raw event archival** | Storing pre-transformation payloads alongside the signal log enables replay and audit when mapping configs change. | **Low-priority additive** — add to `webhook-adapters.md` as an optional S3 archive step; Phase 2 |

### Rejected Recommendations (with evidence)

| Recommendation | Why Rejected | Evidence |
|---|---|---|
| **"Canonical Signal Model is the most important missing piece"** | The canonical model already exists. `SignalEnvelope` (`src/shared/types.ts` lines 32-41) defines the input contract. Five canonical state fields (`stabilityScore`, `masteryScore`, `timeSinceReinforcement`, `confidenceInterval`, `riskSignal`) are defined in `docs/foundation/terminology.md`. The tenant field mappings spec defines how raw LMS payloads are transformed into canonical fields. | `SignalEnvelope` interface, `terminology.md` §Canonical State Fields, `tenant-field-mappings.md` §Computed Transforms |
| **Kinesis / Kafka / SQS streaming bus** | Over-engineering for pilot scale (~3 schools, ~500K LIUs/year). Synchronous API Gateway → Lambda → DynamoDB handles pilot volume trivially. The `webhook-adapters.md` spec explicitly defers async: "Synchronous is sufficient for pilot." Streaming adds operational complexity with zero value at current scale. | `webhook-adapters.md` §Out of Scope, `aws-deployment.md` architecture |
| **Separate Transform Lambda** | The transformation pipeline already exists in-process: validate → forbidden keys → aliases → transforms → required → types → idempotency → state → decision. Extracting transforms to a separate Lambda adds latency and deployment complexity for no gain. | `signal-ingestion.md` §Implementation Components, `tenant-field-mappings.md` §Ingestion Pipeline Order |
| **OAuth / connector-level authentication** | For pilot, LMS webhook → API key auth is sufficient. Canvas webhook config is a single URL + shared secret. OAuth integration with Canvas REST APIs (pulling data) is a different product surface from receiving webhooks. | `webhook-adapters.md` §Constraints: "No webhook verification (v1.1) — Rely on API key auth" |
| **DLQ / retry queues** | Idempotency already exists (`signal_id` dedup). Failed signals return synchronous errors with actionable codes. At pilot volume, retry logic belongs in the LMS webhook config, not in 8P3P infrastructure. | `signal-ingestion.md` §Idempotency, 15 contract tests validating error paths |

### Net Assessment

~40% of the external recommendations describe capabilities that already exist in the codebase. ~30% aligns with gaps already identified in this report. ~20% is premature infrastructure for Phase 3+. ~10% introduces useful refinements (event type filtering, signal type taxonomy) worth adopting now.

The core insight is correct: **8P3P is building a governed signal ingestion system that turns fragmented LMS data into decision-ready intelligence.** But the decision intelligence (state accumulation → policy evaluation → deterministic decisions) is the product — the ingestion layer is the means, not the end. Over-investing in ingestion infrastructure at the expense of the decision layer would be a strategic error.

---

## Re-Alignment Actions (File-Level, Build Order)

Based on the combined huddle requirements, integration platform review, and Connector Layer UX analysis, the following specific file changes are needed. Actions are ordered by **dependency chain and build sequence**, not just priority. Items marked **[BEFORE PILOT]** block the pilot deployment timeline.

### Build Sequence: Connector Layer (Layers 1 → 2 → 3)

The connector stack must be built bottom-up. Each layer depends on the one below it.

| Order | Layer | Spec | Action | Status |
|---|---|---|---|---|
| 1 | Layer 1: Transform Engine | `docs/specs/tenant-field-mappings.md` | **Refine**: Add `template_id` and `template_version` optional metadata to DynamoDB item shape. Proceed with existing `.cursor/plans/tenant-field-mappings.plan.md` (TASK-008 note: `PUT` body accepts optional template metadata). | Spec'd, plan ready **[BEFORE PILOT]** |
| 2 | Layer 2: Webhook Adapter | `docs/specs/webhook-adapters.md` | **Refine**: Add `event_type` filtering — adapter checks incoming payload event type against allowed list per mapping config, skips non-signal events (e.g., enrollment changes). Add optional S3 raw payload archive as a Phase 2 note. | Spec'd, needs plan **[BEFORE PILOT]** |
| 3 | Layer 3: Connector Activation | `docs/specs/integration-templates.md` | **Write new spec**: Connector catalog API (`GET /v1/admin/connectors`), activation API (`POST /v1/admin/connectors/activate`), event type config (`PUT /v1/admin/connectors/:source_system/config`), template registry (Canvas + I-Ready + Branching Minds), template versioning, webhook URL return. | Not yet written **[BEFORE PILOT]** |

### Connector Layer UX — Target Admin Flow

The spec for `integration-templates.md` must deliver this experience:

**Step 1 — Activate connector:**
```
POST /v1/admin/connectors/activate
{ "source_system": "canvas-lms" }

→ 201 Created
{
  "source_system": "canvas-lms",
  "status": "activated",
  "webhook_url": "https://api.8p3p.dev/v1/webhooks/canvas-lms",
  "default_event_types": ["submission_created", "grade_updated"],
  "setup_instructions": "Add the webhook URL above to Canvas → Admin → Developer Keys → Webhooks. Include your x-api-key header.",
  "template_id": "canvas-lms-v1",
  "template_version": "1.0.0"
}
```

**Step 2 — Configure event types (optional — defaults are pre-selected):**
```
PUT /v1/admin/connectors/canvas-lms/config
{ "event_types": ["submission_created", "grade_updated", "quiz_submitted"] }

→ 200 OK
```

**Step 3 — Admin adds webhook URL to Canvas.** Signals flow automatically. No custom code. No JSON mapping construction.

**Step 4 (power users only) — Override template defaults:**
```
PUT /v1/admin/mappings/springs/canvas-lms
{ ... custom mapping JSON ... }
```

### Other Spec Refinements

| File | Change | Priority | Rationale |
|---|---|---|---|
| `docs/specs/signal-ingestion.md` | Reserve `signal_type` as an optional field on `SignalEnvelope` (not required for v1.1; documented as "reserved for v1.2 event routing"). No validation, no pipeline behavior change — schema reservation only. | Medium | Prevents breaking the envelope contract later when event-type routing is needed |
| `docs/specs/policy-management-api.md` | Add `locked_at`, `lock_until`, `academic_year` attributes to PoliciesTable item shape. Add `POST .../lock` and `POST .../unlock` endpoints. Add `policy_locked` error code (409). | Phase 1 | Yearly policy lock requirement from huddle |

### New Specs to Write (Full List, Build Order)

| Order | File | Phase | Content Summary | Blocks |
|---|---|---|---|---|
| 1 | `docs/specs/integration-templates.md` | **[BEFORE PILOT]** | Connector catalog API, activation API, event type config API, Canvas + I-Ready + Branching Minds templates, template registry (DynamoDB or bundled JSON), template versioning, webhook URL + setup instructions in activation response | Pilot repeatability, onboarding, connector tax elimination |
| 2 | `docs/specs/policy-locking.md` | Phase 1 | Academic-year lock lifecycle, lock/unlock API, immutability enforcement, draft-alongside-locked workflow | Policy creation workflow |
| 3 | `docs/specs/policy-creation-workflow.md` | Phase 1 | Document upload (S3), parsing service (decoupled), AI policy generation, preview/edit/confirm UX flow, multi-policy output | US-POLICY-BUILDER-001 split |
| 4 | `docs/specs/ai-schema-mapping.md` | Phase 2 | Sample payload → AI mapping suggestion → confidence scores → user confirmation → saved as mapping config | US-SCHEMA-MAPPING-001 |

### Existing Plans — Impact Assessment

| Plan File | Impact | Action |
|---|---|---|
| `.cursor/plans/tenant-field-mappings.plan.md` | **TASK-008 (admin routes) needs one addition**: the `PUT` body schema should accept optional `template_id` / `template_version` metadata. All other 15 tasks unaffected. | Add a note to TASK-008; proceed with implementation |
| `.cursor/plans/policy-inspection-api.plan.md` | No impact — read-only endpoints are correct as-is | Proceed |

### Documentation Updates

| File | Change | Effort |
|---|---|---|
| `docs/foundation/terminology.md` | Add 5 terms: **Living Student Record** (composite of state + signals + decisions + trajectory), **Integration Template** (pre-built mapping config for a known platform), **Connector** (a configured integration between an LMS and 8P3P, activated from a template), **Policy Lock** (temporal immutability window), **Signal Type** (reserved — event category taxonomy) | Small |
| `docs/foundation/architecture.md` | Add 3-layer "Connector Layer" diagram (Transform Engine → Webhook Adapter → Connector Activation) before Signal Ingestion. Add "Living Student Record" as a cross-cutting concept spanning all stores. | Small |
| `docs/backlog/user-stories-v1.2.md` | Split US-POLICY-BUILDER-001 into three stories (US-POLICY-UPLOAD-001, US-POLICY-BUILDER-001 revised, US-POLICY-REVIEW-001). Add US-INTEGRATION-TEMPLATE-001, US-SCHEMA-MAPPING-001, US-SIGNAL-TYPE-001. | Medium |
| `internal-docs/foundation/roadmap.md` | Add integration templates + connector activation to Pre-Month 0 checklist. Update Phase 1/2/4 themes per roadmap table below. | Small |
| `docs/guides/pilot-integration-guide.md` | **Rewrite §8–§9**: replace "implement webhook receiver + field mapping in code" with "activate Canvas connector → add webhook URL to Canvas → signals flow." Remove manual `SignalEnvelope` construction from onboarding checklist. | Medium (after templates spec) |

### Roadmap Table Updates

| Section | Current | Updated |
|---|---|---|
| Pre-Month 0, row 10 | "Tenant field mappings (Canvas integration)" | "Tenant field mappings engine + Connector Layer (activation API + templates for Canvas, I-Ready, Branching Minds)" |
| Pre-Month 0 | — | Add row 17: "Connector Layer — pre-built connectors with activate → configure → webhook URL flow" |
| Phase 1 | "Repeatable deployments, refined decision layer..." | Add: "Policy creation workflow (preview/confirm/lock), event type routing" |
| Phase 2 | "Standardized data ingestion, reduced IT burden..." | Add: "AI-powered schema mapping, connector catalog expansion, raw event archival" |
| Phase 4 | "Developer SDK, partner embedding, B2B2C intelligence" | Expand: "Living student record portability, B2C learner access, partner SDK, signal type taxonomy" |

---

## What Does NOT Need to Change

The following are confirmed correct and should proceed to implementation without modification:

| Artifact | Status | Action |
|---|---|---|
| `tenant-field-mappings.plan.md` (16 tasks) | Correct — mapping engine is the foundation templates build on | **Proceed** |
| `policy-inspection-api.plan.md` | Correct — read-only policy viewing supports the preview workflow | **Proceed** |
| `docs/specs/webhook-adapters.md` | Correct — the ingestion pathway pre-configured integrations use | **Proceed** |
| `docs/specs/learner-trajectory-api.md` | Correct | **Proceed** |
| `docs/specs/learner-summary-api.md` | Correct — is (or can become) the Living Student Record endpoint | **Proceed** |
| `docs/specs/liu-usage-meter.md` | Correct — LIU metering is the billing foundation | **Proceed** |
| All v1 and v1.1 completed work | Complete and sound | **No changes** |

---

## Recommended Approval Items

The following decisions require partner alignment before work proceeds:

### Decision 1 — Promote Connector Layer (Integration Templates + Activation UX) to Pre-Month 0

**Recommendation:** Add the full Connector Layer (`docs/specs/integration-templates.md`) to the Pre-Month 0 checklist. This includes: connector catalog API, one-click activation, event type configuration, and pre-built templates for Canvas, I-Ready, and Branching Minds. Currently the Pre-Month 0 checklist item #10 covers the transform engine only — which is the internal machinery, not the product UX. Without the Connector Layer, every pilot requires the customer to build custom integration code or the 8P3P team to manually construct mapping JSON — making onboarding non-repeatable. The target experience is: admin activates connector → configures event types → receives webhook URL → adds URL to LMS → signals flow. No custom code required.

**Ask:** Approve adding the Connector Layer as a Pre-Month 0 deliverable.

---

### Decision 2 — Revise US-POLICY-BUILDER-001 Scope Before Spec Work

**Recommendation:** The existing backlog story describes a single text-input API call. Before writing a spec, align on the full workflow scope: document types supported (PDF? DOCX? URL?), who uploads (IT admin? principal?), how many policies are generated per upload, and the edit/confirm UX model.

**Ask:** Schedule a 30-minute working session to define the document upload → policy workflow before spec is written.

---

### Decision 3 — Policy Lock Granularity

**Recommendation:** Decide whether the lock is calendar-year (Jan–Dec), academic-year (Aug–Jul), or a configurable date range. This affects the data model. Academic-year is almost certainly correct for K-12, but needs explicit decision.

**Ask:** Confirm lock granularity = academic year (configurable start/end date per org).

---

### Decision 4 — "Living Student Record" as Public Product Language

**Recommendation:** Update all product-facing documentation to use "Living Student Record" consistently. This requires no engineering changes — it's a terminology alignment between product positioning and technical documentation.

**Ask:** Confirm this is the term we want in docs, guides, and API reference materials.

---

## Roadmap Updates Required

| Document | Section | Update |
|---|---|---|
| `internal-docs/foundation/roadmap.md` | Pre-Month 0 checklist | Add row: Integration Templates (Canvas, I-Ready, Branching Minds) |
| `internal-docs/foundation/roadmap.md` | Phase 1 theme | Add "Policy creation workflow (preview/confirm/lock)" |
| `internal-docs/foundation/roadmap.md` | Phase 2 theme | Add "AI-powered schema mapping / connector catalog" |
| `internal-docs/foundation/roadmap.md` | Phase 4 theme | Expand "Living student record portability, B2C learner access, partner SDK" |
| `docs/backlog/user-stories-v1.2.md` | US-POLICY-BUILDER-001 | Flag for split/revision; add US-INTEGRATION-TEMPLATE-001, US-SCHEMA-MAPPING-001 |
| `docs/foundation/terminology.md` | Add terms | Living Student Record, Integration Template, Policy Lock |

---

## New Specs to Write (Build Order)

| Order | Spec | Phase | Content | Blocks |
|---|---|---|---|---|
| 1 | `docs/specs/integration-templates.md` | Pre-Month 0 | Connector catalog, activation API, event type config, Canvas/I-Ready/Branching Minds templates, template versioning, webhook URL + setup instructions in response | Pilot repeatability, connector tax elimination |
| 2 | `docs/specs/policy-locking.md` | Phase 1 | Academic-year lock lifecycle, lock/unlock API, immutability enforcement, draft-alongside-locked workflow | Policy creation workflow |
| 3 | `docs/specs/policy-creation-workflow.md` | Phase 1 | Document upload (S3), parsing service (decoupled), AI policy generation, preview/edit/confirm UX, multi-policy output | US-POLICY-BUILDER-001 split |
| 4 | `docs/specs/ai-schema-mapping.md` | Phase 2 | Sample payload → AI mapping suggestion → confidence scores → user confirms → saved as mapping config | US-SCHEMA-MAPPING-001 |

---

## Implementation Impact

- **Zero rework** on existing v1.1 implementation plans — everything currently being built is correct
- **One timing risk**: the admin API shape for tenant field mappings (TASK-008 in `tenant-field-mappings.plan.md`) should add optional `template_id` / `template_version` metadata to the `PUT` body, ensuring forward-compatibility with template-sourced mappings
- **No new DynamoDB tables** required for integration templates — the existing `FieldMappingsTable` handles template-activated mappings
- Policy lock requires 3 new attributes on `PoliciesTable` (DynamoDB) — additive, no migration needed
- Event type filtering in webhook adapters is a small addition to the adapter route handler (check event type → skip or process)
- `signal_type` reservation on `SignalEnvelope` is schema-only — no pipeline behavior change until v1.2

### What NOT to Build (Avoiding Over-Engineering)

The following were evaluated and explicitly rejected for the current phase:

| Item | Phase to Revisit | Rationale |
|---|---|---|
| Kinesis / Kafka streaming bus | Phase 3 (if volume exceeds Lambda tolerance) | Synchronous pipeline handles pilot scale; streaming adds operational complexity |
| Separate Transform Lambda | Phase 3 | In-process transforms are faster and simpler; extraction adds latency |
| OAuth connector authentication | Phase 2 (if pulling data from LMS APIs, not receiving webhooks) | Webhook → API key auth is sufficient for pilot |
| DLQ / retry queues | Phase 2 | Idempotency + synchronous error codes handle all pilot failure modes |
| S3 raw event store | Phase 2 | Signal log provides immutable audit trail; pre-transform archival is additive |

---

## Summary of All Actions (Ordered)

### Blocking Pilot — Connector Layer + Foundation (Do Before Month 0)

Build order follows the dependency chain: specs → plans → docs.

| # | Action | File | Depends On |
|---|---|---|---|
| 1 | Refine spec: add `template_id` / `template_version` to DynamoDB item shape | `docs/specs/tenant-field-mappings.md` | — |
| 2 | Add `template_id` note to TASK-008 in implementation plan | `.cursor/plans/tenant-field-mappings.plan.md` | Action 1 |
| 3 | Refine spec: add event type filtering + S3 archive note | `docs/specs/webhook-adapters.md` | — |
| 4 | **Write new spec**: Connector Layer — catalog, activation, event type config, templates, webhook URL return | `docs/specs/integration-templates.md` | Actions 1, 3 (specs it layers on) |
| 5 | Update roadmap: add Connector Layer to Pre-Month 0 checklist | `internal-docs/foundation/roadmap.md` | Action 4 |
| 6 | Add new terms: Living Student Record, Integration Template, Connector, Policy Lock, Signal Type | `docs/foundation/terminology.md` | Decision 4 |
| 7 | Add Connector Layer diagram + Living Student Record concept | `docs/foundation/architecture.md` | Action 6 |
| 8 | Rewrite onboarding: "activate connector" replaces "build webhook receiver" | `docs/guides/pilot-integration-guide.md` | Action 4 |

### Phase 1 (0–6 Months) — Policy Workflow

| # | Action | File | Depends On |
|---|---|---|---|
| 9 | **Write new spec**: Policy locking (academic-year lock lifecycle) | `docs/specs/policy-locking.md` | Decision 3 |
| 10 | **Write new spec**: Policy creation workflow (upload → AI → preview → confirm) | `docs/specs/policy-creation-workflow.md` | Decision 2, Action 9 |
| 11 | Refine spec: add lock attributes + lock/unlock endpoints | `docs/specs/policy-management-api.md` | Action 9 |
| 12 | Split US-POLICY-BUILDER-001 into 3 stories; add US-INTEGRATION-TEMPLATE-001 | `docs/backlog/user-stories-v1.2.md` | Actions 4, 10 |

### Phase 2 (6–12 Months) — AI + Expansion

| # | Action | File | Depends On |
|---|---|---|---|
| 13 | **Write new spec**: AI-powered schema mapping | `docs/specs/ai-schema-mapping.md` | — |
| 14 | Reserve `signal_type` as optional field on SignalEnvelope | `docs/specs/signal-ingestion.md` | — |
| 15 | Add raw event archival (S3) to webhook adapters | `docs/specs/webhook-adapters.md` | — |
| 16 | Add US-SCHEMA-MAPPING-001 and US-SIGNAL-TYPE-001 to backlog | `docs/backlog/user-stories-v1.2.md` | Actions 13, 14 |

### Decision Dependencies

| Decision | Blocks Actions |
|---|---|
| **Decision 1** — Promote Connector Layer to Pre-Month 0 | Actions 1–8 (all pilot-blocking items) |
| **Decision 2** — Policy creation workflow scope | Actions 10, 12 |
| **Decision 3** — Policy lock granularity (academic year) | Actions 9, 11 |
| **Decision 4** — "Living Student Record" product language | Actions 6, 7 |

---

*Report prepared: 2026-04-06 (v3) | Based on: huddle notes 4/6/26, company positioning statements, external integration platform architecture review, Connector Layer UX analysis, `internal-docs/foundation/roadmap.md`, `docs/specs/`, `docs/backlog/user-stories-v1.2.md`, `.cursor/plans/` | Next action: partner review and Decision 1–4 approvals*
