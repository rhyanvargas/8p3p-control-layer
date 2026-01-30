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

- All inputs and outputs MUST conform to JSON Schemas in `docs/foundation/[POC Playbook] 8P3P Learning Intelligence Control Layer-Component Interface Contracts.md`
- Enforce the validation ruleset from `docs/foundation/[POC Playbook] 8P3P Learning Intelligence Control Layer-Interface Validation Ruleset.md`, including forbidden semantic key blocking at any depth for `payload`, `state`, `decision_context`
- Implement contract tests from `docs/foundation/[POC Playbook] 8P3P Learning Intelligence Control Layer-Contract Test Matrix.md` **before** adding features

## Behavioral Guarantees

- **Determinism is mandatory**: Same inputs yield same outputs (timestamps excluded)
- **Idempotency is mandatory**: Duplicate `signal_id` in same `org_id` returns `duplicate` status, never accepted twice

## Discovery Guidelines

Before implementing features, read:
- `docs/foundation/[POC Playbook] 8P3P Learning Intelligence Control Layer-Component Interface Contracts.md` (schemas)
- `docs/foundation/[POC Playbook] 8P3P Learning Intelligence Control Layer-Contract Test Matrix.md` (test requirements)
- `docs/foundation/[POC Playbook] 8P3P Learning Intelligence Control Layer-Interface Validation Ruleset.md` (validation rules)
