# Roadmap (Living Anchor)

This document is the **stable entry point** for planning and execution. It intentionally stays short and points to the current single sources of truth.

## Current Roadmap Snapshot (Auditable)

- [docs/reports/2026-02-23-ceo-scope-approval.md](../reports/2026-02-23-ceo-scope-approval.md) — **Latest:** CEO approval with 3 edits (demo anchors REINFORCE + INTERVENE, API key enforcement, Week 1 checkpoint)
- [docs/reports/2026-02-22-cto-response-ceo-scope-timeline.md](../reports/2026-02-22-cto-response-ceo-scope-timeline.md) — CTO response: auth scope, timeline compression, demo narrative (amended per CEO approval)
- [docs/reports/2026-02-20-pilot-readiness-v1-v1.1.md](../reports/2026-02-20-pilot-readiness-v1-v1.1.md) — v1/v1.1 definitions, artifacts, reliability requirements
- [docs/reports/2026-02-24-ceo-statement-fact-check.md](../reports/2026-02-24-ceo-statement-fact-check.md) — CEO statement fact-check; 4 recommended actions tracked in `.cursor/plans/ceo_fact-check_actions_ea724b30.plan.md`
- [docs/reports/2026-02-24-it-pilot-positioning-alignment.md](../reports/2026-02-24-it-pilot-positioning-alignment.md) — IT/cybersecurity positioning alignment + CEO directive: pseudonymous IDs, PII rejection, canonical receipts

## Current State (2026-02-24)

### v1 Artifacts — Status


| #   | Artifact                                            | Status                                                                                     |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Enriched Decision Trace                             | **Done**                                                                                   |
| 2   | Ingestion Log (queryable)                           | **Done**                                                                                   |
| 3   | State Query API                                     | **Done**                                                                                   |
| 4   | 4 Inspection Panels at `/inspect`                   | **Done**                                                                                   |
| 5   | Decision Repository Interface                       | **Done**                                                                                   |
| 6   | 437+ passing tests                                  | **Done**                                                                                   |
| 7   | Seeded demo dataset                                 | **Done** — `scripts/seed-demo.mjs`, `npm run seed:demo`, `docs/guides/demo-walkthrough.md` |
| 8   | API Key Middleware                                  | **Done**                                                                                   |
| 9   | Pilot Integration Guide                             | **Done**                                                                                   |
| 10  | PII Hardening (forbidden keys + canonical snapshot) | **Done** — DEF-DEC-007, DEF-DEC-008-PII implemented                                        |


### Remaining v1 Work

All v1 work is complete. Optional follow-ups: inspection panels QA sign-off (`docs/testing/qa-test-inspection-panels.md`), post–repository-extraction QA if desired.

### Next Phase: v1.1 (multi-tenant, AWS)

Defined in `[docs/reports/2026-02-20-pilot-readiness-v1-v1.1.md](../reports/2026-02-20-pilot-readiness-v1-v1.1.md)` §4. Key deliverables: per-tenant policy, AWS deployment, tenant provisioning.

## Active Execution Plans (Implementation Tasks)

All actionable implementation work should be driven by the Cursor plans in:

- `.cursor/plans/` (see `.cursor/plans/*.plan.md`)


| Plan                              | Status                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Decision Types + Policy Loader    | **Complete** — 4-type closed set, org-scoped policies, routing (`policies/{orgId}/routing.json`), Springs pilot configs |
| Idempotency Repository Extraction | **Complete** (2026-02-23)                                                                                          |
| Signal Log Repository Extraction  | **Complete** (2026-02-23)                                                                                          |
| State Repository Extraction       | **Complete** (2026-02-23)                                                                                          |
| Inspection Panels                 | **Complete** (2026-02-24) — QA signed off                                                                          |
| CEO Fact-Check Actions            | **Complete** — all four actions done (glossary, trace-required, tenant mappings, GET /v1/receipts)                 |
| Demo Seed Script                  | **Complete** — `scripts/seed-demo.mjs`, demo walkthrough, `npm run seed:demo`                                      |
| PII Hardening (CEO 2026-02-24)    | **Complete** — DEF-DEC-007 (canonical snapshot) + DEF-DEC-008-PII (PII forbidden keys) implemented                |


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

