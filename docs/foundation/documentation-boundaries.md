# Documentation Boundaries

This repository uses a **six-tier documentation model**. Tiers T1–T5 are committed to git and are the authority for agents, engineers, CI, and integrators. Tier T6 is gitignored and holds customer-specific operations material.

## Documentation tier model (normative)

| Tier | Path | Git status | Audience | Authority |
|------|------|------------|----------|-----------|
| **T1 — Foundation** | `docs/foundation/` | Committed | Agents, engineers, integrators | Engineering rules, terminology, architecture, roadmap |
| **T2 — Specs** | `docs/specs/` | Committed | Agents, engineers | Requirements + interface SSoT |
| **T3 — Guides** | `docs/guides/` | Committed | Customers + operators | Integration and launch procedures |
| **T4 — Plans** | `.cursor/plans/` | Committed | Agents, engineers | Implementation sequencing |
| **T5 — Contracts** | `src/contracts/schemas/`, `docs/api/` | Committed | Agents, CI | Machine-verifiable truth |
| **T6 — Internal ops** | `internal-docs/` | **Gitignored** | CS, solutions, leadership | Named-customer runbooks, investor PDFs, demo scripts, append-only logs |

**Hard rule:** T1–T5 MUST NOT link to T6 with a relative markdown href. T6 MAY link to T1–T5.

## What stays in T6

Tier T6 is a private ops vault. It is not required for implementation, CI, or fresh clones. Typical contents:

- Named-customer onboarding and pilot runbooks
- Controlled-evaluation engagement procedures with per-customer scope fields
- Investor PDFs and unsigned proposal documents
- Demo scripts tied to specific customer datasets
- Append-only CS logs (for example pilot feedback intake ledgers)
- Internal strategy reports with partner names, pricing, or competitive analysis

Committed docs MAY mention that T6 exists and list internal doc titles in prose (see [`docs/guides/internal-operations-stub.md`](../guides/internal-operations-stub.md) when available). They MUST NOT use relative markdown hrefs into `internal-docs/`.

## Agent reading order (post-migration)

```
docs/foundation/documentation-boundaries.md
  → docs/foundation/roadmap.md
  → docs/specs/README.md (pick Active spec)
  → docs/specs/{feature}.md
  → .cursor/plans/{feature}.plan.md
  → src/ + tests/
```

## Navigation

| Tier | Index |
|------|-------|
| T1 — Foundation | This folder (`docs/foundation/`) — start with [`roadmap.md`](roadmap.md) |
| T2 — Specs | [`docs/specs/README.md`](../specs/README.md) |
| T3 — Guides | [`docs/guides/README.md`](../guides/README.md) |
| T4 — Plans | `.cursor/plans/` |
| T5 — Contracts | `src/contracts/schemas/`, `docs/api/openapi.yaml` |

Migration spec and enforcement: [`docs/specs/documentation-boundary-migration.md`](../specs/documentation-boundary-migration.md).
