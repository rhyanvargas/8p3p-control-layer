# 8P3P Control Layer — Product Strategy Gap Analysis

**Date:** 2026-04-06
**Prepared by:** Rhyan (CTO)
**For:** Al Ware (CEO / Partner) — Approval Requested
**Source inputs:** Huddle notes 4/6/26, company positioning statements, current roadmap, specs (`docs/specs/`), and implementation plans (`.cursor/plans/`)

---

## Summary

The 4/6/26 huddle produced four major product requirements — document-based policy creation, pre-configured platform integrations (Canvas, I-Ready, Branching Minds), AI-powered schema mapping, and a yearly policy lock — that are not fully represented in the current roadmap, specs, or implementation plans. The existing v1.1 engineering work is sound and should continue without interruption; these new requirements layer *on top of* what is already being built. This report identifies exactly where the gaps are, what needs to be written before implementation begins, and what can proceed as-is. No existing specs need to be torn down — four new specs need to be written and two existing stories need to be revised.

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

### Gap 2 — Pre-Configured Integration Templates (Major)

**What exists:** The webhook adapter and tenant field mappings engine is fully generic — every tenant must upload their own mapping JSON via admin API. This is correct engineering but creates a high onboarding burden.

**What the huddle requires:** Canvas, I-Ready, and Branching Minds should work out of the box. A school's IT director should be able to activate an integration in minutes, not days.

**What needs to change:**
- A new spec is required: `docs/specs/integration-templates.md`
  - Template registry: pre-built `envelope` + `transform` configurations for Canvas, I-Ready, Branching Minds
  - Activation API: `POST /v1/admin/integrations/activate` copies a template into the tenant's mapping configuration
  - Template versioning: when a platform changes its webhook schema, 8P3P updates the template
- This is a **Pre-Month 0 requirement** — the pilot with Springs needs this to reduce IT burden. Add to roadmap checklist.
- The existing mapping engine (`tenant-field-mappings.plan.md`) does not need to change — templates feed into it.

**Risk if skipped:** Without templates, every pilot requires custom mapping configuration work by the 8P3P team, making onboarding non-repeatable. Repeatability is explicitly cited in the Phase 1 roadmap goal.

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

### Decision 1 — Promote Integration Templates to Pre-Month 0

**Recommendation:** Add `docs/specs/integration-templates.md` to the Pre-Month 0 checklist (currently item #10 is "Tenant field mappings" which covers the engine, not the templates). Without ready-made Canvas/I-Ready connectors, every pilot requires manual mapping setup — which defeats the repeatability goal.

**Ask:** Approve adding integration templates as a Pre-Month 0 deliverable.

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

## New Specs to Write (Prioritized)

| Priority | Spec | Phase | Blocks |
|---|---|---|---|
| 1 | `docs/specs/integration-templates.md` | Pre-Month 0 | Pilot repeatability, onboarding |
| 2 | `docs/specs/policy-locking.md` | Phase 1 | Policy creation workflow |
| 3 | `docs/specs/policy-creation-workflow.md` | Phase 1 | US-POLICY-BUILDER-001 split |
| 4 | `docs/specs/ai-schema-mapping.md` | Phase 2 | US-SCHEMA-MAPPING-001 |

---

## Implementation Impact

- **Zero rework** on existing v1.1 implementation plans — everything currently being built is correct
- **One timing risk**: the admin API shape for tenant field mappings (TASK-008 in `tenant-field-mappings.plan.md`) should be reviewed against the integration templates spec before routes are finalized, to ensure the `PUT` body is forward-compatible with template-sourced mappings
- **No new DynamoDB tables** required for integration templates — the existing `FieldMappingsTable` handles template-activated mappings
- Policy lock requires one new attribute on `PoliciesTable` (DynamoDB) — a minor additive change

---

*Report prepared: 2026-04-06 | Based on: huddle notes 4/6/26, company positioning statements (image), `internal-docs/foundation/roadmap.md`, `docs/specs/`, `docs/backlog/user-stories-v1.2.md`, `.cursor/plans/` | Next action: partner review and Decision 1–4 approvals*
