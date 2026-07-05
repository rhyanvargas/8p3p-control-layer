---
name: mermaid-diagrams
description: Create, update, and sync Mermaid diagrams across docs, specs, and plans. Use when adding or editing architecture, data-flow, deployment, sequence, or UI layout diagrams; when ASCII box diagrams need conversion; or when diagram copies drift from the canonical source.
---

# Mermaid diagrams

All **architecture, data-flow, deployment, sequence, and page-layout** diagrams in this repo use [Mermaid](https://mermaid.js.org/). ASCII box art (`┌─┐`, `▼`) is legacy — convert on touch.

## Single sources of truth (SSoT)

| Diagram | Canonical file | Copy elsewhere? |
| ------- | -------------- | --------------- |
| Control-layer pipeline (Connector + lifecycle) | `docs/foundation/architecture.md` § System Architecture Diagram | `README.md` — keep identical block |
| Connector Layer stack (Layers 1–3 + foundation) | `docs/foundation/architecture.md` § Connector Layer | Specs link or duplicate with `← THIS SPEC` highlight only |
| AWS pilot deploy surfaces | `docs/guides/operators/aws-pilot-runbook.md` § Architecture | Do not duplicate |
| Doc IA / scenario routing | `docs/guides/scenarios/` + `docs/README.md` | Plans may reference, not re-draw |
| Overview D4 page layout | `docs/specs/overview-educator-activity-layout.md` | `dashboard-design-requirements.md` §8 links here |
| Dashboard ↔ API deployment | `docs/specs/decision-panel-ui.md` § Deployment Model | Runbooks link here |

When two files must show the same diagram, **paste the identical fenced block** and add a one-line pointer: `> Canonical: [architecture.md § …](…)`. Do not paraphrase node labels across copies.

## Diagram type selection

| Intent | Mermaid type | Example in repo |
| ------ | ------------ | --------------- |
| System / AWS topology | `architecture-beta` or `flowchart LR` | `architecture.md`, `aws-pilot-runbook.md` |
| Pipeline / evaluation steps | `flowchart TB` or `flowchart TD` | `decision-engine.md`, `state-engine.md` |
| API fan-out / request sequence | `sequenceDiagram` | `get-all-learner-decisions-from-org.md` |
| Program / doc track dependencies | `flowchart TB` with `subgraph` | `.cursor/plans/*.plan.md` |
| Dashboard page layout (regions) | `flowchart TB` with `subgraph` | `overview-educator-activity-layout.md`, `attention-review-ux.md` |

**Keep ASCII** for: directory trees (`├──`), code samples, and detailed UI mockups with literal field text (card copy examples in specs).

## Authoring rules

0. **Pinned renderer** — `mermaid@11.16.0` in root `package.json` devDependencies (`@mermaid-js/mermaid-cli` matches). `architecture-beta` requires Mermaid **≥ 11.1.0**. Run `npm run validate:diagrams` before merging diagram edits.
1. **Declare type first** — first line inside the fence is the diagram type (`flowchart TB`, `sequenceDiagram`, etc.).
2. **Node IDs** — camelCase or snake_case without spaces; use `["Display label<br/>second line"]` for wrapped text.
3. **Annotations** — put spec links and HTTP paths in node labels, not loose comments (Mermaid comments `%%` are ok for non-rendered notes).
4. **Sync on edit** — if you change the canonical diagram, update every copy listed in the SSoT table in the same PR.
5. **Plans** — execution graphs in `.cursor/plans/` use Mermaid; update node status labels when track status changes (✓ / deferred).
6. **No HTML entities** in labels — use literal characters (`–` en dash ok in prose; avoid `&amp;`).

## Workflow (add or sync a diagram)

```
Mermaid diagram task:
- [ ] 1. Classify — architecture / flow / sequence / layout / plan track
- [ ] 2. Locate SSoT — extend canonical file or create new SSoT if none exists
- [ ] 3. Author — pick type from table above; match existing node naming in related diagrams
- [ ] 4. Sync copies — README, specs, plans per SSoT table
- [ ] 5. Link — hub pages point to SSoT section, not duplicate long graphs
- [ ] 6. Verify — `npm run validate:diagrams`, or render in GitHub preview / Mermaid Live Editor if syntax is non-trivial
```

## Snippets (copy from SSoT, do not re-invent)

**Connector stack** — see `docs/foundation/architecture.md` § Connector Layer.

**Full pipeline** — see `docs/foundation/architecture.md` § System Architecture Diagram and § Data Flow Summary.

**Overview D4 layout** — see `docs/specs/overview-educator-activity-layout.md` § Page layout.

## Related

- `.cursor/rules/mermaid-diagrams.mdc` — applies when editing diagram-bearing markdown
- `.cursor/rules/analysis-consistency-checks.mdc` — disambiguate deploy/host tiers in diagram captions
- `.cursor/skills/diataxis-docs/SKILL.md` — explanation docs may contain diagrams; how-to docs link to them
