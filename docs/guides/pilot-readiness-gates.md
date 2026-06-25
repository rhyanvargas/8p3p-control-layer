# Pilot Readiness Gates

**Audience:** Engineers, customer success, solutions  
**Purpose:** Committed normative gate tables for pilot onboarding — the conditions that must be true before a prospect pilot customer is invited into the environment.

The full onboarding narrative (onboarding call agenda, first-week monitoring, pilot close procedures) lives in internal-only runbooks (local `internal-docs/`, not in public repo). This document is the **gate criteria SSoT** for committed specs and checklists.

---

## What "Pilot Ready" Means

A pilot customer is **ready to onboard** when both sides meet their gates. If either side has open items, onboarding will stall and time-to-first-value increases.

---

## 8P3P Readiness (our side)

Everything below must be true before we invite a customer into the environment.

### Infrastructure

| Gate | How to verify | Owner |
|------|---------------|-------|
| Pilot environment deployed and accessible | `GET /health` returns `200` from the customer-facing URL | Engineering |
| API key provisioned for the customer's org | `provision-tenant.ts` run; key recorded in secure vault | Engineering |
| `API_KEY` and `API_KEY_ORG_ID` set in deployment env | Deployment checklist passed (`docs/guides/deployment-checklist.md`) | Engineering |
| Swagger UI accessible at `/docs` | Browse `https://<host>/docs` | Engineering |

### Policy & Configuration

| Gate | How to verify | Owner |
|------|---------------|-------|
| Org-specific policy file exists | `policies/<org_id>/learner.json` (or equivalent) is deployed | Engineering / Solutions |
| Policy routing configured (if multi-source) | `policies/<org_id>/routing.json` maps their `source_system` values | Engineering / Solutions |
| Policy rules cover the customer's expected state ranges (no unintended no-match outcomes) | Exercise seed personas end-to-end; confirm each produces a matched decision (no `matched: false` silently) — per internal pilot runbook (local only, not in public repo) § Policy rule | Solutions |
| Customer can verify policy via `GET /v1/policies` | Curl the endpoint with their key; confirm rules and thresholds | Engineering |

### Integration (cadence-agnostic; 3 paths)

**Strategy (2026-05-15 CEO direction).** 8P3P streams data on its side; the customer keeps whatever cadence they already support (hourly / daily / weekly). Every new feed passes `POST /v1/admin/ingestion/preflight` against a raw sample **before** the live feed is enabled. Pick exactly one path per source system:

| Path | When to pick | Customer effort | Pilot status |
|------|--------------|-----------------|--------------|
| **A. Integration template (preferred)** | LMS is one of our pre-built templates (Canvas, I-Ready, Branching Minds) | Configure webhook in their LMS admin UI; paste our URL + API key header | Pre-Month 0 — see [integration-templates.md](../specs/integration-templates.md) |
| **B. Generic webhook + tenant mapping** | Vendor supports webhooks but no template exists yet | Send raw payload to `POST /v1/webhooks/:source_system`; we register a tenant field mapping | Pre-Month 0 — see [webhook-adapters.md](../specs/webhook-adapters.md) + [tenant-field-mappings.md](../specs/tenant-field-mappings.md) |
| **C. SFTP/S3 drop + signal-streamer** | Vendor cannot push; customer can only drop files | Customer drops files on their cadence; we run a watcher that converts rows → `POST /v1/signals` | Pre-Month 0; streamer is a thin script — same idempotency + preflight gate |
| **D. Direct API (custom integration)** | Customer has engineering capacity and wants full control | Their integration code constructs and sends `SignalEnvelope` per event | Always supported; not the default |

| Gate | How to verify | Owner |
|------|---------------|-------|
| **Preflight passes on raw sample** (BLOCKING) | `POST /v1/admin/ingestion/preflight` returns `forbidden_pii: []` AND `forbidden_semantic_after_mapping: []` (or `forbidden_semantic_raw: []` if no mapping needed); `verdict ∈ {"clean", "semantic_resolvable_by_mapping"}` | Engineering / Solutions |
| Integration path selected (A / B / C / D above) | Choice recorded in onboarding ticket | CS / Solutions |
| Field mappings registered for their source system (paths A–C if mapping required) | `PUT /v1/admin/mappings/<org_id>/<source_system>` uploaded; rerun preflight → `verdict: "clean"` | Engineering / Solutions |
| End-to-end test passes | Send sample signal via the chosen path → verify state update → verify decision output → verify it appears in `/dashboard` | Engineering |
| **Reporting cadence is independent of ingestion cadence** | Confirm with CS: weekly evidence rollup (`GET /v1/admin/program-metrics`) is decoupled from how often the customer sends data; MC-A04 and MC-B05 latency budgets assume continuous ingestion (see [program-metrics.md](../specs/program-metrics.md) § Measurement Windows) | CS / Solutions |

> **Note:** Weekly flat-file batch (treating "the file" as the unit of ingestion) is **demoted to a fallback** for customers with no other option. Even in that case, the file-streamer converts rows to per-event signals so MC-A04 / MC-B05 latency, idempotency, and replay all work correctly. The customer's drop cadence is independent of 8P3P's processing cadence.

- [ ] Raw sample payload preflight passes (no unresolved `forbidden_semantic` hits after mapping). (See [`docs/specs/ingestion-preflight.md`](../specs/ingestion-preflight.md), `POST /v1/admin/ingestion/preflight`.)

### Decision Panel (Proof Surface)

| Gate | How to verify | Owner |
|------|---------------|-------|
| Decision Panel built and deployed at `/dashboard` | Browse `https://<host>/dashboard`; four panels render | Engineering |
| Panel configured with customer's API key | `VITE_API_KEY` set at build time or first-visit prompt works | Engineering |
| Passphrase gate enabled (`DASHBOARD_ACCESS_CODE` + `COOKIE_SECRET` set) | Navigate to `/dashboard` without cookie → redirects to `/dashboard/login` | Engineering |
| Access code generated and stored in vault | Human-memorable passphrase (e.g. `springfield-math-2026`) ready to share with IT admin | Engineering |
| Seed data produces visible decisions (for demo/training) | Run `npm run seed:springs-demo`; panels populate | Engineering |

### Documentation Ready

| Gate | How to verify | Owner |
|------|---------------|-------|
| Customer Onboarding Quick Start accurate for this deployment | Walk through it yourself against the live environment | CS / Solutions |
| Pilot Integration Guide accurate (connector or direct path) | Section references match deployed endpoints | CS / Solutions |
| FAQ covers their likely questions | Review against what you know about their LMS and use case | CS / Solutions |

> **Pilot vs production readiness.** Every gate above is scoped to a **pilot** deployment — hosted Fastify on Fly.io or Render per [`docs/guides/pilot-host-deployment.md`](pilot-host-deployment.md). **Persistence ladder (2026-05-15):** ephemeral SQLite is **dry-run-only**; any customer pilot exceeding 1 week MUST use the persistence recipe in [`pilot-host-deployment.md`](pilot-host-deployment.md) § Pilot persistence (3–6 month) — Fly Volume at `/app/data` + nightly off-host backup. **Production readiness is a separate ladder** tracked in [`docs/specs/aws-deployment.md`](../specs/aws-deployment.md) (API Gateway + Lambda + DynamoDB via AWS CDK) and [`docs/specs/ci-cd-pipeline.md`](../specs/ci-cd-pipeline.md) § Deploy → Prod. Treating pilot and prod as the same checklist has bitten us before; do not collapse the two ladders in this document.

---

## Customer Readiness (their side)

These are the prerequisites the customer must meet. Communicate them during the sales handoff.

### Technical

| Gate | Who on their side | Notes |
|------|-------------------|-------|
| Identified their LMS platform(s) | IT admin | Canvas, I-Ready, Branching Minds, or custom |
| Have admin access to configure webhooks (connector path) | IT admin / LMS admin | Needed to add our webhook URL + API key header |
| OR: Have engineering capacity to build direct integration | Integration engineer | For custom LMS / direct API path |
| Decided on `learner_reference` strategy | IT admin + data team | SIS student ID is recommended; must be stable across systems |
| Can trigger test events in their LMS | IT admin / teacher | Needed to verify signals flow end-to-end |
| **Export retrospective depth ≥ 3 months** (required if MC-C01..C03 efficacy metrics are in scope) | Data team | 21-day outcome windows (per [`decision-outcomes.md`](../specs/decision-outcomes.md) default `window_days=21`) must fit inside the dataset; shorter exports mean Group C returns descriptive-only / `pending`. |
| **Primary policy field identified and present in export** | Solutions + their data team | Derived per [`decision-outcomes.md`](../specs/decision-outcomes.md) § "Primary policy field" from the matched rule's first scalar condition. Without it, MC-A03 (policy-rule coverage) trends toward zero and decisions won't fire. |
| **Raw sample payload preflight clean** (no unresolved `forbidden_semantic` hits after mapping registration) | Engineering | Run `POST /v1/admin/ingestion/preflight` per [`ingestion-preflight.md`](../specs/ingestion-preflight.md). `forbidden_pii` hits MUST be zero (non-negotiable); `forbidden_semantic_after_mapping` MUST be zero after the tenant field-mapping is registered (see [`tenant-field-mappings.md`](../specs/tenant-field-mappings.md)). |

### Organizational

| Gate | Who on their side | Notes |
|------|-------------------|-------|
| Named a **technical point of contact** | Their project lead | One person who owns the integration and can unblock issues |
| Named an **educator champion** | Their project lead | One teacher/principal who will use the Decision Panel and give feedback |
| Agreed on pilot scope | Leadership + our CS | Which learners, which subjects, which timeframe |
| Understood that decisions are advisory (not automated actions) | Leadership | We emit decisions; we do not enforce workflows in their LMS |

---

*Gate tables extracted from internal pilot readiness definition. Full onboarding narrative: internal-only (local `internal-docs/`, not in public repo).*
