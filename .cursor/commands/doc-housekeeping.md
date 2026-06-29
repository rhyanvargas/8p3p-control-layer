# /doc-housekeeping

Light **documentation IA cleanup** after a guides reorg, scenario-path change, or when plan todos drift from landed work. Fixes navigation — not spec↔code literals.

**Source of truth:** `.cursor/skills/diataxis-docs/SKILL.md` (Step 6 — Doc IA housekeeping pass)

**Not this command:** `/post-impl-doc-sync` (spec/plan/code parity) · `/update-readme` (root README evidence)

## Usage

Full repo pass (default):

```
/doc-housekeeping
```

Scope to a path or plan:

```
/doc-housekeeping docs/guides/scenarios/
/doc-housekeeping .cursor/plans/docs_scenario_routing_cc01d0df.plan.md
```

## Instructions

When the user invokes `/doc-housekeeping`:

1. Read `.cursor/skills/diataxis-docs/SKILL.md` Step 6 and `.cursor/rules/diataxis-docs.mdc`.
2. Load `.cursor/rules/document-traceability/RULE.md` if plan YAML todos may need updating.
3. Load `.cursor/rules/analysis-consistency-checks.mdc` if any doc claims involve deploy/host/live.

Execute the **housekeeping checklist** (fix issues found; minimal diff):

- [ ] `docs/README.md` and `docs/guides/README.md` list current scenario paths and subfolders (`customers/`, `operators/`, `playbooks/`)
- [ ] No committed hrefs to **retired flat paths** at `docs/guides/{name}.md` when the file lives under a subfolder — grep for stale patterns; prefer full paths or correct relative links
- [ ] Cross-repo refs (`README.md`, specs, plans, scripts, `.cursor/`) use `guides/operators/`, `guides/customers/`, or `guides/playbooks/` where files actually live
- [ ] Plan YAML `todos` match landed work when a plan is in scope (document-traceability § Program / Feature Status)
- [ ] Run `npm run test:contracts -- tests/contracts/documentation-boundary.test.ts` (DOC-001..005)

**Do not:** duplicate runbook commands into scenario paths · add requirements to hub/index pages · link to `internal-docs/` with relative hrefs.

Report: files changed, stale links fixed, plan todo updates, test result, anything needing `/doc-reorganize` instead.
