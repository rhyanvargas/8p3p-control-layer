# Roadmap (Living Anchor)

This document is the **stable entry point** for planning and execution. It intentionally stays short and points to the current single sources of truth.

## Current Roadmap Snapshot (Auditable)

- [`docs/reports/2026-02-23-ceo-scope-approval.md`](../reports/2026-02-23-ceo-scope-approval.md) — **Latest:** CEO approval with 3 edits (demo anchors REINFORCE + INTERVENE, API key enforcement, Week 1 checkpoint)
- [`docs/reports/2026-02-22-cto-response-ceo-scope-timeline.md`](../reports/2026-02-22-cto-response-ceo-scope-timeline.md) — CTO response: auth scope, timeline compression, demo narrative (amended per CEO approval)
- [`docs/reports/2026-02-20-pilot-readiness-v1-v1.1.md`](../reports/2026-02-20-pilot-readiness-v1-v1.1.md) — v1/v1.1 definitions, artifacts, reliability requirements
- [`docs/reports/2026-02-24-ceo-statement-fact-check.md`](../reports/2026-02-24-ceo-statement-fact-check.md) — CEO statement fact-check; 4 recommended actions tracked in `.cursor/plans/ceo_fact-check_actions_ea724b30.plan.md`

## Current State (2026-02-24)

### v1 Artifacts — Status

| # | Artifact | Status |
|---|----------|--------|
| 1 | Enriched Decision Trace | **Done** |
| 2 | Ingestion Log (queryable) | **Done** |
| 3 | State Query API | **Done** |
| 4 | 4 Inspection Panels at `/inspect` | **Done** |
| 5 | Decision Repository Interface | **Done** |
| 6 | 343+ passing tests | **Done** |
| 7 | Seeded demo dataset | **Not built** — plan: `.cursor/plans/demo-seed-script.plan.md` |
| 8 | API Key Middleware | **Done** |
| 9 | Pilot Integration Guide | **Done** |

### Remaining v1 Work

1. **QA sign-off** — `docs/testing/qa-test-inspection-panels.md` and `docs/testing/qa-test-post-repository-extraction.md`
2. **Demo seed script** — pre-loaded learners with reinforce + intervene narrative (plan pending)
3. **CEO fact-check actions** — terminology glossary (done), trace fields required, `/v1/receipts` endpoint (plans pending)

### Next Phase: v1.1 (multi-tenant, AWS)

Defined in [`docs/reports/2026-02-20-pilot-readiness-v1-v1.1.md`](../reports/2026-02-20-pilot-readiness-v1-v1.1.md) §4. Key deliverables: per-tenant policy, AWS deployment, tenant provisioning.

## Active Execution Plans (Implementation Tasks)

All actionable implementation work should be driven by the Cursor plans in:

- `.cursor/plans/` (see `.cursor/plans/*.plan.md`)

| Plan | Status |
|------|--------|
| Idempotency Repository Extraction | **Complete** (2026-02-23) |
| Signal Log Repository Extraction | **Complete** (2026-02-23) |
| State Repository Extraction | **Complete** (2026-02-23) |
| Inspection Panels | **Complete** (2026-02-24) — QA pending |
| CEO Fact-Check Actions | **In progress** — glossary done; 3 items pending |
| Demo Seed Script | **Pending** — plan to be created |

## Planning Rules

When there is a conflict:

1. **Specs win** for requirements and interfaces: `docs/specs/`
2. **Plans win** for step-by-step implementation: `.cursor/plans/`
3. **Reports win** for timeline commitments and auditability: `docs/reports/`

## Execution Workflow

- Canonical workflow: `docs/foundation/definitive-workflow.md`
- Command entrypoints: `.cursor/commands/`
- Step-by-step execution logic: `.cursor/skills/`

## Foundation References

- Architecture: `docs/foundation/architecture.md`
- Terminology: `docs/foundation/terminology.md`
- IP defensibility: `docs/foundation/ip-defensibility-and-value-proposition.md`
- Documentation experience (Stripe/Plaid-quality): `docs/foundation/documentation-experience.md`

## Versioning Policy

- Roadmaps are published as **dated snapshots** under `docs/reports/`.
- This file always links to the latest snapshot and should be updated when a new snapshot is added.

