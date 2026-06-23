# Specs Index

Specifications in this folder are the **single source of truth for requirements and interfaces**, written to support contract-first development and regression safety. Pipeline and term definitions (signal, receipt, trace): [`docs/foundation/terminology.md`](../foundation/terminology.md).

Specs are organized by **lifecycle status** so the active pilot path is obvious:

- **Active** — on the current controlled-evaluation critical path or staged with a plan in `.cursor/plans/`.
- **Shipped** — implemented and in the codebase; kept as the interface source of truth for regression/contract safety.
- **Deferred / forward-looking** — drafted but not scheduled.

Roadmap and sequencing: [`internal-docs/foundation/roadmap.md`](../../internal-docs/foundation/roadmap.md).

---

## Active (controlled-evaluation path + staged)

| Spec | Role | Status |
|------|------|--------|
| [`ai-educator-explanations.md`](ai-educator-explanations.md) | **P0** — plain-language "why" for learning decay; confidence-not-grade; auditable (Bedrock Converse → template fallback, PII-safe) | Spec'd + plan staged (2026-06-23); impl pending |
| [`overview-cross-filter-sync.md`](overview-cross-filter-sync.md) | Decision Panel D2 — opt-in 2-way linked filtering (default OFF); client-only | Spec'd (2026-06-23) |
| [`dashboard-design-requirements.md`](dashboard-design-requirements.md) | **Design source of truth** for the redesigned dashboard (shadcn `dashboard-01` baseline) | Active |
| [`customer-feedback-loop.md`](customer-feedback-loop.md) | Product-level feedback: always-on "Send feedback" + CSAT microsurvey + `GET /v1/admin/feedback` | Spec'd (2026-06-23); plan pending |
| [`program-metrics.md`](program-metrics.md) | MC-A*/B*/C* catalog + `GET /v1/admin/program-metrics` (SBIR evidence) | Spec'd; plan committed, impl pending |
| [`educator-feedback-api.md`](educator-feedback-api.md) | `POST /v1/decisions/:id/feedback` + view log; feeds MC-B*/MC-C* | Spec'd + plan staged |
| [`decision-outcomes.md`](decision-outcomes.md) | Derived view joining decisions → state deltas; feeds MC-C* | Spec'd + plan staged |
| [`pilot-research-export.md`](pilot-research-export.md) | FERPA-safe de-identified bundle for DOE/IES reviewers | Spec'd + plan staged |
| [`liu-usage-meter.md`](liu-usage-meter.md) | `GET /v1/admin/usage` + `GET /v1/usage`; SBIR volume denominator | Spec'd; plan committed, impl pending |
| [`tenant-config.md`](tenant-config.md) | Per-org overridable business rules + admin API; not pilot-blocking | Spec'd + plan staged |
| [`ci-cd-pipeline.md`](ci-cd-pipeline.md) | GitHub Actions: merge-gate CI + Deploy→Pilot (Fly.io) + Deploy→Prod (AWS CDK) | Spec'd + plan staged |

> **Per-skill trajectory (P1, A3):** scope-only extension of the shipped [`learner-trajectory-api.md`](learner-trajectory-api.md) (§v1.2 `US-SKILL-001`); flat-field trajectory already ships.

## Shipped (implemented — interface source of truth)

**Core pipeline (POC v1 + v2):**
- [`signal-ingestion.md`](signal-ingestion.md) — signal ingestion API + idempotency
- [`signal-log.md`](signal-log.md) — immutable signal log + query contract
- [`state-engine.md`](state-engine.md) — learner state computation + versioned persistence
- [`decision-engine.md`](decision-engine.md) — deterministic policy evaluation + decision trace
- [`state-delta-detection.md`](state-delta-detection.md) — automatic `_delta`/`_direction` companion fields (decay detection)
- [`skill-level-tracking.md`](skill-level-tracking.md) — dot-path policy eval, nested deltas, skill/assessment query filters
- [`multi-source-transforms.md`](multi-source-transforms.md) — expression grammar extension (`score / total`)
- [`urs-aggregation.md`](urs-aggregation.md) — skill→subject→overall mastery, learning gaps, gifted-interest flag (2026-06-05)

**APIs & access:**
- [`api-key-middleware.md`](api-key-middleware.md) — single key per deployment, org_id override, exempt routes
- [`inspection-api.md`](inspection-api.md) — ingestion log, state query API, enriched decision receipts
- [`inspection-panels.md`](inspection-panels.md) — 4 read-only inspection panels (migrated to Next.js dashboard)
- [`receipts-api.md`](receipts-api.md) — `GET /v1/receipts` compliance/audit query
- [`policy-storage.md`](policy-storage.md) — DynamoDB `PoliciesTable`, resolution order, soft `status`
- [`policy-inspection-api.md`](policy-inspection-api.md) — `GET /v1/policies` (tenant read-only)
- [`policy-management-api.md`](policy-management-api.md) — admin policy CRUD + soft enable/disable
- [`learner-trajectory-api.md`](learner-trajectory-api.md) — `GET /v1/state/trajectory` (flat fields)
- [`learner-summary-api.md`](learner-summary-api.md) — `GET /v1/learners/:ref/summary` (educator-readable)
- [`ingestion-preflight.md`](ingestion-preflight.md) — `POST /v1/admin/ingestion/preflight` dry-run PII/semantic gate
- [`seed-preflight-policy-check.md`](seed-preflight-policy-check.md) — seed-time policy/preflight consistency check

**Ingestion & connectors:**
- [`tenant-field-mappings.md`](tenant-field-mappings.md) — per-tenant payload normalization (computed transforms, Canvas mapper)
- [`webhook-adapters.md`](webhook-adapters.md) — `POST /v1/webhooks/:source_system`; raw LMS ingestion
- [`integration-templates.md`](integration-templates.md) — Connector Layer (Canvas / I-Ready / Branching Minds templates)

**Dashboard & infrastructure:**
- [`decision-panel-ui.md`](decision-panel-ui.md) — 4-panel proof surface (React 19+, shadcn/ui, Tailwind)
- [`dashboard-passphrase-gate.md`](dashboard-passphrase-gate.md) — FERPA-safe session access control
- [`nextjs-amplify-dashboard-migration.md`](nextjs-amplify-dashboard-migration.md) — dashboard → Next.js (local complete; **Amplify deploy deferred pending startup credits**)
- [`tenant-provisioning.md`](tenant-provisioning.md) — API keys, usage plans, org enforcement
- [`aws-deployment.md`](aws-deployment.md) — API Gateway + Lambda + DynamoDB via AWS CDK

## Deferred / forward-looking (not scheduled)

- [`multi-school-architecture.md`](multi-school-architecture.md) — `school_id` in signal metadata (post-pilot; customer TBD)
- [`tiered-data-classification.md`](tiered-data-classification.md) — per-field `allow | tokenize | encrypt | reject` policy; evaluates Presidio / AWS Comprehend
- [`document-extraction-service.md`](document-extraction-service.md) — **parked**; PDF/image → SignalEnvelope; depends on `tiered-data-classification.md`

See [`internal-docs/compliance-security-posture-and-migration-path.md`](../../internal-docs/compliance-security-posture-and-migration-path.md) for how forward-looking specs fit the phased path.

---

- **API reference:** [`docs/api/openapi.yaml`](../api/openapi.yaml)
- **Architecture overview:** [`docs/foundation/architecture.md`](../foundation/architecture.md)
- **Terminology:** [`docs/foundation/terminology.md`](../foundation/terminology.md)
- **API naming conventions:** [`internal-docs/foundation/api-naming-conventions.md`](../../internal-docs/foundation/api-naming-conventions.md) — durability rule for route/module names (MUST-read before adding a new public surface)
