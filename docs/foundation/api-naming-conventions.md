# API Naming Conventions

> Durable rule for naming API surfaces, code modules, and exported symbols across the 8P3P control layer. Established in `.cursor/plans/program-metrics.plan.md` § Naming Convention; promoted here as a foundation doc so future specs and plans reference one canonical source.

---

## The Durability Rule

**API surfaces and code modules are named after the domain resource they expose, never after the lifecycle stage that motivated them.** Lifecycle context (pilot / SBIR / GA / evaluation) belongs in documentation bodies, numeric targets, and report filenames — **not** in route paths, directory names, or exported symbols.

The rule applies to:

- REST route segments (`/v1/...`, `/v1/admin/...`)
- Module/directory paths (`src/<name>/`)
- Exported classes/functions (`FooService`, `computeFoo()`)
- OpenAPI `operationId` values
- CLI subcommand names (`scripts/<name>.mjs`)

The rule does **not** apply to:

- Report artifact filenames (`YYYY-MM-DD-springs-pilot-evidence.md`, `YYYY-MM-DD-sbir-phase-i-evidence.md`) — these *are* lifecycle-scoped by design.
- Phase-specific numeric targets in comparison tables inside specs.
- Internal doc folders that describe lifecycle operations (`internal-docs/pilot-operations/`).

## Why (evidence)

1. **Precedent in this repo.** Existing admin endpoints are already lifecycle-neutral: `/v1/admin/usage`, `/v1/admin/policies`, `/v1/admin/outcomes-summary`. None are phase-scoped.
2. **Metric IDs are already phase-neutral.** `MC-A01`..`MC-C07`, error codes (`metric_window_too_wide`, `metric_unavailable`), and the response shape `{value, numerator, denominator, window, computed_at}` never change across Phase 0 (Springs), Phase I (SBIR), and GA. Only the *numeric targets* in comparison tables change. Naming the endpoint after the phase would force a rename on every lifecycle step — without any change in semantics.
3. **"Program" matches the audience vocabulary.** "Program" is the K-12 term of art for a deployed initiative (intervention program, reading-fluency program). It maps cleanly to the unit these metrics describe (an org × policy deployment), matches ESSA/SBIR reviewer vocabulary, and does not collide with operational "metrics" (Prometheus-style `/health`).

## Applied name table

The first application of this rule is the `pilot-metrics` → `program-metrics` rename (PREP-001 in `.cursor/plans/pilot-evidence-prep.plan.md`, executed in lieu of `program-metrics.plan.md` TASK-001).

| Before | After | Why |
|---|---|---|
| `GET /v1/admin/pilot-metrics` | `GET /v1/admin/program-metrics` | Durability rule |
| `GET /v1/pilot-metrics` | `GET /v1/program-metrics` | Durability rule |
| `src/pilot-metrics/` (implicit) | `src/program-metrics/` | Durability rule |
| `PilotMetricsService` (implicit) | `ProgramMetricsService` | Durability rule |
| `docs/specs/pilot-success-metrics.md` | `docs/specs/program-metrics.md` | Spec filename follows endpoint identifier |
| `MC-A01..MC-C07` metric IDs | **unchanged** | Already phase-neutral |
| `metric_window_too_wide`, `metric_unavailable` error codes | **unchanged** | Already phase-neutral |
| Report filenames (`YYYY-MM-DD-springs-pilot-evidence.md`, etc.) | **unchanged** | Artifacts *are* lifecycle-scoped by design |

## Going-forward obligation

Any new spec or plan that adds a public surface MUST:

1. Read this rule before naming routes, modules, or exported symbols.
2. Flag phase-scoped identifiers in the spec-under-implementation as deviations in the plan's Deviations table.
3. Propose a domain-neutral replacement in the plan, and update the spec in the same PR that implements the plan (as PREP-001 did for `program-metrics.md`).

## Tenant-plan enum is not a public identifier

The `plan` field on tenant records (`{pilot, enterprise, internal}` — see `docs/specs/tenant-provisioning.md` § Usage Plans) is a configuration enum, not a public surface name. Adding a value (e.g. a future `evaluation` plan) is a spec edit, not a breaking rename, and is therefore out of scope for this rule. See `.cursor/plans/pilot-evidence-prep.plan.md` § Decisions D-001 for the specific deferral rationale.

---

*Created: 2026-04-21 (PREP-001). Source: `.cursor/plans/program-metrics.plan.md` § Naming Convention (Durability Rule).*
