# Build a feature (spec-driven)

**Type:** How-to (scenario path) — links only; authority lives in linked docs.

Implement a new capability using the repo's spec → plan → code workflow.

---

## Prerequisites

- Feature scoped in [roadmap](../../foundation/roadmap.md) or approved ad hoc
- Local dev environment — see [run-locally.md](run-locally.md)

---

## Path

1. [Documentation boundaries](../../foundation/documentation-boundaries.md) — tier model and agent reading order
2. [Roadmap](../../foundation/roadmap.md) — confirm priority and dependencies
3. [Definitive Workflow](../../foundation/definitive-workflow.md) — ownership model and delivery flow
4. [Specs index](../../specs/README.md) — pick or create Active spec
5. `.cursor/plans/{feature}.plan.md` — implementation sequencing (T4)
6. Implement in `src/` + `tests/`; keep contracts in sync
7. [Post-impl doc sync skill](../../../.cursor/skills/post-impl-doc-sync/SKILL.md) — update spec status, roadmap, and related docs after ship

---

## Gates / reference

- [Definitive Workflow — Source-of-Truth Pointers](../../foundation/definitive-workflow.md#source-of-truth-pointers)
- `npm run test:contracts` — spec-driven contract tests
- `npm run check` — full CI gate before merge

---

## Exit criteria

- Active spec reflects shipped behavior (status updated)
- Plan tasks marked complete
- Tests and contract validators pass; OpenAPI/spec cross-links accurate
