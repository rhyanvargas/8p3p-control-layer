---
description: "Hard constraints for 8P3P Control Layer - lifecycle boundaries, contract enforcement, determinism requirements"
alwaysApply: true
---

# Control Layer Constraints

These constraints are non-negotiable. Violating them breaks the system's design.

## Scope Boundaries

- Implement ONLY the control layer lifecycle: Signal Ingestion → Signal Log → STATE Update → Decision → Output
- **No UI** - This is a headless backend service
- **No workflow ownership** - External systems orchestrate workflows
- **No domain semantics** - Treat payload content as opaque JSON
- **No platform abstractions** - No AWS/cloud provider code; local-only first

## Contract Enforcement

- **Machine-readable contracts first**: REST API MUST align with `docs/api/openapi.yaml` (OpenAPI 3.1). Event contracts MUST align with `docs/api/asyncapi.yaml` when present. Validate with `npm run validate:api`.
- All inputs and outputs MUST conform to JSON Schemas in `src/contracts/schemas/` (schema SSoT)
- Enforce forbidden semantic key blocking at any depth for `payload`, `state`, `decision_context` (see `docs/specs/signal-ingestion.md` and validators in `src/`)
- Implement contract tests in `tests/contracts/` **before** adding features

## Behavioral Guarantees

- **Determinism is mandatory**: Same inputs yield same outputs (timestamps excluded)
- **Idempotency is mandatory**: Duplicate `signal_id` in same `org_id` returns `duplicate` status, never accepted twice

## Discovery Guidelines

Before implementing features, read:
- `src/contracts/schemas/` (JSON schemas — schema SSoT)
- `tests/contracts/` (required contract tests)
- `docs/api/openapi.yaml` (REST API alignment)
