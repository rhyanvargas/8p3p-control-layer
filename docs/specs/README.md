# Specs Index

Specifications in this folder are the **single source of truth for requirements and interfaces**. They are written to support contract-first development and regression safety.

## Implemented (POC v1 + v2)

- [`signal-ingestion.md`](signal-ingestion.md) — signal ingestion API + idempotency
- [`signal-log.md`](signal-log.md) — immutable signal log + query contract
- [`state-engine.md`](state-engine.md) — learner state computation + versioned persistence contracts
- [`decision-engine.md`](decision-engine.md) — deterministic policy evaluation + decision trace

## v1 (1-customer pilot-ready) — spec’d

- [`api-key-middleware.md`](api-key-middleware.md) — single key per deployment, org_id override, exempt routes (added 2026-02-22)
- [`inspection-api.md`](inspection-api.md) — ingestion outcome log, state query API, enriched decision receipts
- [`inspection-panels.md`](inspection-panels.md) — 4 read-only inspection panels at `/inspect`
- [`receipts-api.md`](receipts-api.md) — `GET /v1/receipts` compliance/audit query surface (spec only; plan + impl pending)
- [`tenant-field-mappings.md`](tenant-field-mappings.md) — Phase 2 per-tenant payload normalization (DEF-DEC-006; implemented)

## v1.1 (2–3 concurrent pilots) — spec’d

- [`tenant-provisioning.md`](tenant-provisioning.md) — API keys, usage plans, org enforcement, rate limits
- [`aws-deployment.md`](aws-deployment.md) — API Gateway + Lambda + DynamoDB deployment via SAM

> Roadmap entry point: [`docs/foundation/roadmap.md`](../foundation/roadmap.md)  
> Canonical delivery flow: [`docs/foundation/definitive-workflow.md`](../foundation/definitive-workflow.md)  
> Current snapshot: [`docs/reports/2026-02-20-pilot-readiness-v1-v1.1.md`](../reports/2026-02-20-pilot-readiness-v1-v1.1.md)

