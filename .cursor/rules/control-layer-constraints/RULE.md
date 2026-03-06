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
- All inputs and outputs MUST conform to JSON Schemas in `internal-docs/foundation/poc-playbooks/Component Interface Contracts.md` (and to the canonical schemas in `src/contracts/schemas/`)
- Enforce the validation ruleset from `internal-docs/foundation/poc-playbooks/Interface Validation Ruleset.md`, including forbidden semantic key blocking at any depth for `payload`, `state`, `decision_context`
- Implement contract tests from `internal-docs/foundation/poc-playbooks/Contract Test Matrix.md` **before** adding features

## Behavioral Guarantees

- **Determinism is mandatory**: Same inputs yield same outputs (timestamps excluded)
- **Idempotency is mandatory**: Duplicate `signal_id` in same `org_id` returns `duplicate` status, never accepted twice

## Discovery Guidelines

Before implementing features, read:
- `internal-docs/foundation/poc-playbooks/Component Interface Contracts.md` (schemas)
- `internal-docs/foundation/poc-playbooks/Contract Test Matrix.md` (test requirements)
- `internal-docs/foundation/poc-playbooks/Interface Validation Ruleset.md` (validation rules)
