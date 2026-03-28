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

## v1.1 (2–3 concurrent pilots) — spec’d

- [`tenant-provisioning.md`](tenant-provisioning.md) — API keys, usage plans, org enforcement, rate limits
- [`aws-deployment.md`](aws-deployment.md) — API Gateway + Lambda + DynamoDB deployment via **AWS CDK**
- [`policy-storage.md`](policy-storage.md) — DynamoDB `PoliciesTable`, resolution order, cache, soft `status` (active \| disabled)
- [`policy-inspection-api.md`](policy-inspection-api.md) — `GET /v1/policies` (tenant read-only policy inspection)
- [`policy-management-api.md`](policy-management-api.md) — Admin policy CRUD + `PATCH` status (soft enable/disable), `ADMIN_API_KEY`

---

- **API reference:** [`docs/api/openapi.yaml`](../api/openapi.yaml)
- **Architecture overview:** [`docs/foundation/architecture.md`](../foundation/architecture.md)
- **Terminology:** [`docs/foundation/terminology.md`](../foundation/terminology.md)

