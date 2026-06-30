# Documentation

**Start here:** Pick a scenario below — each path is a numbered link chain to the authoritative runbooks, checklists, and specs. Do not skip straight to a long runbook unless you already know which one you need.

---

## Scenario paths

| I want to… | Scenario path | Exit criteria |
| ---------- | ------------- | ------------- |
| Run locally | [guides/scenarios/run-locally.md](guides/scenarios/run-locally.md) | `/health` OK, dashboard Overview loads |
| Deploy AWS charter pilot | [guides/scenarios/deploy-aws-pilot.md](guides/scenarios/deploy-aws-pilot.md) | Runbook §4 smoke green |
| Launch a pilot customer | [guides/scenarios/launch-pilot-customer.md](guides/scenarios/launch-pilot-customer.md) | Launch checklist signed |
| Integrate a customer LMS | [guides/scenarios/integrate-customer-lms.md](guides/scenarios/integrate-customer-lms.md) | First signal → decision |
| Operate / ship pilot updates | [guides/scenarios/operate-pilot-updates.md](guides/scenarios/operate-pilot-updates.md) | CI + deploy / Amplify green |
| Run organic educator wave (Zoom 50–100) | [guides/scenarios/organic-educator-wave.md](guides/scenarios/organic-educator-wave.md) | Persona exit criteria met per [Zoom runbook](guides/playbooks/organic-educator-wave-zoom.md#exit-criteria-by-persona) |
| Build a feature (spec-driven) | [guides/scenarios/build-a-feature.md](guides/scenarios/build-a-feature.md) | Spec → plan → impl synced |
| Fly fallback deploy (optional) | [guides/scenarios/deploy-fly-fallback.md](guides/scenarios/deploy-fly-fallback.md) | TLS `/health` on Fly/Render |
| Look up API / requirements | [specs/README.md](specs/README.md) · [api/openapi.yaml](api/openapi.yaml) | — |

Full catalog of guides (customer + operator): [guides/README.md](guides/README.md).

---

## Audience

| Audience | Start with | Avoid starting at |
| -------- | ---------- | ----------------- |
| **8P3P engineer / operator** | Scenario path for your task (deploy, launch, operate) | Customer quickstart alone when you need AWS |
| **Customer integrator** | [guides/scenarios/integrate-customer-lms.md](guides/scenarios/integrate-customer-lms.md) or [guides/customers/customer-onboarding-quickstart.md](guides/customers/customer-onboarding-quickstart.md) | [guides/operators/aws-pilot-runbook.md](guides/operators/aws-pilot-runbook.md) — internal deploy only |

---

## Documentation tiers (T1–T5)

Normative model: [foundation/documentation-boundaries.md](foundation/documentation-boundaries.md).

| Tier | Path | Role |
| ---- | ---- | ---- |
| **T1 — Foundation** | [foundation/](foundation/) | Architecture, terminology, roadmap, local setup |
| **T2 — Specs** | [specs/](specs/) | Requirements and interface source of truth |
| **T3 — Guides** | [guides/](guides/) | Integration and launch procedures; [guides/scenarios/](guides/scenarios/) routers; [customers/](guides/customers/) · [operators/](guides/operators/) · [playbooks/](guides/playbooks/) |
| **T4 — Plans** | `.cursor/plans/` | Implementation sequencing |
| **T5 — Contracts** | [api/](api/), `src/contracts/schemas/` | Machine-verifiable truth (OpenAPI, JSON Schema) |

Tier T6 (`internal-docs/`) is gitignored ops material — committed docs must not link to it with relative hrefs.

---

## Diátaxis mapping (existing folders)

This repo applies [Diátaxis](https://diataxis.fr/) without adding a new tier. Scenario paths are thin **how-to routers** inside T3; authoritative content stays in runbooks, checklists, and specs.

| Diátaxis mode | Where it lives here |
| ------------- | ------------------- |
| **Tutorial** | [foundation/setup.md](foundation/setup.md) — first-time local setup |
| **How-to** | [guides/scenarios/](guides/scenarios/) — ordered paths; [guides/customers/](guides/customers/) · [guides/operators/](guides/operators/) · [guides/playbooks/](guides/playbooks/) |
| **Reference** | [api/openapi.yaml](api/openapi.yaml), [specs/](specs/), `src/contracts/schemas/` |
| **Explanation** | [foundation/architecture.md](foundation/architecture.md), [foundation/terminology.md](foundation/terminology.md), [reports/](reports/) |

---

## Related entry points

- **Roadmap:** [foundation/roadmap.md](foundation/roadmap.md)
- **Architecture:** [foundation/architecture.md](foundation/architecture.md)
- **Agent workflow:** [foundation/definitive-workflow.md](foundation/definitive-workflow.md)
- **Doc maintenance (Cursor):** `/doc-housekeeping` (link/plan sync) · `/doc-reorganize` (full IA) · `/post-impl-doc-sync` (spec↔code)
- **Root README:** [../README.md](../README.md)
