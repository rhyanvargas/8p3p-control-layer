# Specs Index

Specifications in this folder are the **single source of truth for requirements and interfaces**. They are written to support contract-first development and regression safety. Pipeline and term definitions (e.g. signal, receipt, trace): [`docs/foundation/terminology.md`](../foundation/terminology.md).

## Implemented (POC v1 + v2)

- [`signal-ingestion.md`](signal-ingestion.md) — signal ingestion API + idempotency
- [`signal-log.md`](signal-log.md) — immutable signal log + query contract
- [`state-engine.md`](state-engine.md) — learner state computation + versioned persistence contracts
- [`decision-engine.md`](decision-engine.md) — deterministic policy evaluation + decision trace

## v1 (1-customer pilot-ready) — spec’d

- [`api-key-middleware.md`](api-key-middleware.md) — single key per deployment, org_id override, exempt routes (added 2026-02-22)
- [`inspection-api.md`](inspection-api.md) — ingestion outcome log, state query API, enriched decision receipts
- [`inspection-panels.md`](inspection-panels.md) — 4 read-only inspection panels at `/inspect`
- [`receipts-api.md`](receipts-api.md) — `GET /v1/receipts` compliance/audit query surface (implemented)
- [`tenant-field-mappings.md`](tenant-field-mappings.md) — Phase 2 per-tenant payload normalization (DEF-DEC-006; implemented). **v1.1 extension:** computed transforms, DynamoDB-backed config, Canvas mapper — see same spec.
- **Configuration templates (repo artifacts):** [`../templates/literacy-field-mappings.json`](../templates/literacy-field-mappings.json) — optional literacy onboarding template applied via `npm run apply-template` (see `.cursor/plans/literacy-pilot.plan.md`).

## v1.1 (2–3 concurrent pilots) — spec’d

- [`tenant-provisioning.md`](tenant-provisioning.md) — API keys, usage plans, org enforcement, rate limits
- [`aws-deployment.md`](aws-deployment.md) — API Gateway + Lambda + DynamoDB deployment via **AWS CDK**
- [`policy-storage.md`](policy-storage.md) — DynamoDB `PoliciesTable`, resolution order, cache, soft `status` (active \| disabled)
- [`policy-inspection-api.md`](policy-inspection-api.md) — `GET /v1/policies` (tenant read-only policy inspection)
- [`policy-management-api.md`](policy-management-api.md) — Admin policy CRUD + `PATCH` status (soft enable/disable), `ADMIN_API_KEY`
- [`state-delta-detection.md`](state-delta-detection.md) — Automatic `_delta` / `_direction` companion fields per numeric state field; enables decay detection in policy rules
- [`skill-level-tracking.md`](skill-level-tracking.md) — Dot-path policy eval, nested delta detection, skill/assessment query filters
- [`multi-source-transforms.md`](multi-source-transforms.md) — Expression grammar extension (`score / total` from multiple payload fields)
- [`decision-panel-ui.md`](decision-panel-ui.md) — 4-panel read-only proof surface (React 19+, shadcn/ui, Tailwind CSS); served at `/dashboard`
- [`dashboard-design-requirements.md`](dashboard-design-requirements.md) — **Design source of truth** for the redesigned dashboard (shadcn `dashboard-01` baseline): app shell, IA/navigation, page hierarchy, component catalog, states, responsive, visual language. Execution: `nextjs-amplify-dashboard-migration.md`.
- [`nextjs-amplify-dashboard-migration.md`](nextjs-amplify-dashboard-migration.md) — Migrate dashboard → Next.js 15 on AWS Amplify Hosting (frontend-only; API stays on Fastify/CDK). References the design doc. **AWS provisioning blocked pending startup credits.**
- [`overview-cross-filter-sync.md`](overview-cross-filter-sync.md) — **Spec'd (2026-06-23)** — Overview opt-in "Sync filters" toggle (default OFF) for 2-way linked filtering across KPI cards ↔ trend chart ↔ recent-decisions table; client-only, no refetch, reuses `OverviewData`. Implements directive D2 of `dashboard-design-requirements.md` §2.1/§8.
- [`dashboard-passphrase-gate.md`](dashboard-passphrase-gate.md) — FERPA-safe access control for Decision Panel; shared passphrase → session cookie
- [`customer-feedback-loop.md`](customer-feedback-loop.md) — **Spec'd (2026-06-23)** — holistic product-level feedback loop: always-on in-product "Send feedback" affordance + transactional CSAT microsurvey (CSAT over NPS per survey-science best practice) + admin triage read (`GET /v1/admin/feedback`), unified into the closed-loop `internal-docs/reports/pilot-feedback-log.md`. Complements (does not replace) the decision-level `educator-feedback-api.md`; reuses the `src/feedback/` repository pattern + a `pf_session` sibling cookie.
- [`webhook-adapters.md`](webhook-adapters.md) — `POST /v1/webhooks/:source_system`; raw LMS webhook ingestion — no client-side `SignalEnvelope` construction required
- [`integration-templates.md`](integration-templates.md) — Connector Layer: catalog, activation, event type config, pre-built templates (Canvas, I-Ready, Branching Minds)
- [`learner-trajectory-api.md`](learner-trajectory-api.md) — `GET /v1/state/trajectory`; version-range field trend view (**depends on state-delta-detection**)
- [`learner-summary-api.md`](learner-summary-api.md) — `GET /v1/learners/:ref/summary`; educator-readable aggregated view (**depends on trajectory**)
- [`urs-aggregation.md`](urs-aggregation.md) — **Implemented (2026-06-05)** — skill→subject→overall mastery hierarchy, learning gaps, and gifted-interest flag; exposed via `current_state.mastery_breakdown` on the summary endpoint. Constants centralized in `src/state/aggregation-constants.ts`.
- [`tenant-config.md`](tenant-config.md) — **Spec'd; plan staged (2026-06-05)** — per-org overridable business rules (`aggregation.*`, `features.*`, `subjects`, `routing`) + admin API, with a three-plane security boundary keeping secrets/infra out of tenant-editable data. Wraps URS aggregation constants as defaults.
- [`liu-usage-meter.md`](liu-usage-meter.md) — `GET /v1/admin/usage` + `GET /v1/usage`; per-org monthly LIU metering (**promoted to pre-Month 0 as SBIR evidence denominator**)

### Execution plans (Wave 3 — pilot MVP launch)

| Plan | Purpose |
|------|---------|
| [`.cursor/plans/pilot-mvp-launch.plan.md`](../../.cursor/plans/pilot-mvp-launch.plan.md) | Master coordinator — deploy smoke, runbook, observability, launch gate |
| [`.cursor/plans/learner-summary-api-hygiene-mvp.plan.md`](../../.cursor/plans/learner-summary-api-hygiene-mvp.plan.md) | Contract hygiene subset (URL, schema closure, policy_key enum) |
| [`.cursor/plans/dashboard-summary-migration.plan.md`](../../.cursor/plans/dashboard-summary-migration.plan.md) | Decision Panel reads summary endpoint |
| [`.cursor/plans/learner-summary-api-hygiene.plan.md`](../../.cursor/plans/learner-summary-api-hygiene.plan.md) | Full SDK hygiene backlog (ETag, by_source — post-pilot) |

## SBIR Evidence Layer (2026-04-20) — spec'd

- [`program-metrics.md`](program-metrics.md) — MC-A*/B*/C* catalog + `GET /v1/admin/program-metrics`; answers the three DOE questions with data (phase-neutral identifiers per [`internal-docs/foundation/api-naming-conventions.md`](../../internal-docs/foundation/api-naming-conventions.md))
- [`educator-feedback-api.md`](educator-feedback-api.md) — `POST /v1/decisions/:id/feedback`; view log; soft-prompt count; feeds MC-B* + MC-C*
- [`decision-outcomes.md`](decision-outcomes.md) — derived view joining decisions → subsequent state deltas; feeds MC-C*
- [`pilot-research-export.md`](pilot-research-export.md) — FERPA-safe de-identified bulk export for DOE/IES reviewers
- [`ingestion-preflight.md`](ingestion-preflight.md) — PII/semantic-key categorization + `POST /v1/admin/ingestion/preflight` dry-run endpoint for pilot intake

## Infrastructure — spec'd

- [`ci-cd-pipeline.md`](ci-cd-pipeline.md) — GitHub Actions: merge-gate CI + Deploy→Pilot (Fly.io) + Deploy→Prod (AWS CDK); source of truth for what runs where

## Forward-looking (enterprise posture, cross-vertical) — spec'd, not scheduled

These specs describe **future, separable** work surfaced during posture analysis. They are deliberately domain-neutral and are not on the current milestone plan. See [`internal-docs/compliance-security-posture-and-migration-path.md`](../../internal-docs/compliance-security-posture-and-migration-path.md) for how they fit the phased path.

- [`tiered-data-classification.md`](tiered-data-classification.md) — tenant-configurable per-field classification policy (`allow | tokenize | encrypt | reject`) that evolves the current blanket PII rejection into an auditable tiered posture. Includes an Options section evaluating Presidio / AWS Comprehend.

> **Parked pending prerequisite:** [`document-extraction-service.md`](document-extraction-service.md) is drafted but depends on `tiered-data-classification.md` for per-field classification. It is not surfaced in this list until the classification spec has a scheduled plan.

---

- **API reference:** [`docs/api/openapi.yaml`](../api/openapi.yaml)
- **Architecture overview:** [`docs/foundation/architecture.md`](../foundation/architecture.md)
- **Terminology:** [`docs/foundation/terminology.md`](../foundation/terminology.md)
- **API naming conventions:** [`internal-docs/foundation/api-naming-conventions.md`](../../internal-docs/foundation/api-naming-conventions.md) — durability rule for route/module names (MUST-read before adding a new public surface)

