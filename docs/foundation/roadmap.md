# Roadmap (Living Anchor)

This document is the **stable entry point** for planning and execution. It intentionally stays short and points to the current single sources of truth.

## Current Roadmap Snapshot (Auditable)

- [`docs/reports/2026-02-23-ceo-scope-approval.md`](../reports/2026-02-23-ceo-scope-approval.md) — **Latest:** CEO approval with 3 edits (demo anchors REINFORCE + INTERVENE, API key enforcement, Week 1 checkpoint)
- [`docs/reports/2026-02-22-cto-response-ceo-scope-timeline.md`](../reports/2026-02-22-cto-response-ceo-scope-timeline.md) — CTO response: auth scope, timeline compression, demo narrative (amended per CEO approval)
- [`docs/reports/2026-02-20-pilot-readiness-v1-v1.1.md`](../reports/2026-02-20-pilot-readiness-v1-v1.1.md) — v1/v1.1 definitions, artifacts, reliability requirements

## Active Execution Plans (Implementation Tasks)

All actionable implementation work should be driven by the Cursor plans in:

- `.cursor/plans/` (see `.cursor/plans/*.plan.md`)

**Repository extraction complete (2026-02-23):** All plans in `.cursor/plans/` (Idempotency, Signal Log, State) are executed. Next steps — QA execution, Week 1 checkpoint, and any new plans — are in [`docs/reports/2026-02-23-post-repository-extraction-next-steps.md`](../reports/2026-02-23-post-repository-extraction-next-steps.md).

## Planning Rules

When there is a conflict:

1. **Specs win** for requirements and interfaces: `docs/specs/`
2. **Plans win** for step-by-step implementation: `.cursor/plans/`
3. **Reports win** for timeline commitments and auditability: `docs/reports/`

## Execution Workflow

- Canonical workflow: `docs/foundation/definitive-workflow.md`
- Command entrypoints: `.cursor/commands/`
- Step-by-step execution logic: `.cursor/skills/`

## Versioning Policy

- Roadmaps are published as **dated snapshots** under `docs/reports/`.
- This file always links to the latest snapshot and should be updated when a new snapshot is added.

