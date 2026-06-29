---
name: diataxis-docs
description: Organize, consolidate, and restructure documentation using Diátaxis (tutorials, how-to, reference, explanation) and this repo's T1–T5 tier model. Use when the user asks to update, consolidate, organize, restructure, or clean up docs; improve documentation IA; apply Diátaxis; create scenario paths; or rewrite doc indexes and hubs.
---

# Diátaxis documentation organization

Apply [Diátaxis](https://diataxis.fr/) when updating, consolidating, or organizing documentation. Preserve this repo's **six-tier model** (`docs/foundation/documentation-boundaries.md`) — Diátaxis describes **content mode**, not a replacement for T1–T5.

## When to use

- User invokes **`/doc-housekeeping`** or **`/doc-reorganize`**
- User asks to **update / consolidate / organize / restructure / clean up** docs
- Adding or reshaping **scenario paths**, guide indexes, or `docs/README.md`
- Splitting an overloaded doc that mixes procedures with architecture or API tables
- Auditing whether a new page belongs in guides vs specs vs foundation

Also read `.cursor/rules/diataxis-docs.mdc` (applies when editing `docs/**/*.md`).

## The compass (classify first)

Ask: **Is the reader learning, doing, looking up, or understanding?**

| Mode | Orientation | Question it answers | This repo |
| ---- | ----------- | ------------------- | --------- |
| **Tutorial** | Learning | "Teach me" | `docs/foundation/setup.md` |
| **How-to** | Doing | "Help me do X" | `docs/guides/scenarios/*.md`, task guides in `docs/guides/` |
| **Reference** | Information | "What is X?" | `docs/specs/`, `docs/api/openapi.yaml`, JSON Schema |
| **Explanation** | Understanding | "Why / how does it work?" | `docs/foundation/architecture.md`, `docs/reports/` |

Use the compass when unsure — see [reference.md](reference.md) for mode-specific quality checks and anti-patterns.

## Workflow

Copy this checklist and track progress:

```
Diátaxis doc task:
- [ ] 1. Scope — list files affected; note user goal (navigate vs learn vs lookup)
- [ ] 2. Classify — tag each doc/section with one primary mode
- [ ] 3. Find violations — mixed modes, duplicate SSoT, broken tier rules
- [ ] 4. Plan moves — link vs split vs new scenario router (minimal diff)
- [ ] 5. Execute — one mode per page; link to authority; no runbook duplication
- [ ] 6. Update hubs — docs/README.md, guides/README.md, documentation-boundaries if IA changed
- [ ] 7. Traceability — document-traceability rules if specs/plans touched
- [ ] 8. Verify — links resolve; `npm run test:contracts -- tests/contracts/documentation-boundary.test.ts` (DOC-001..005)
- [ ] 9. Housekeeping (after reorg) — plan todos, stale `docs/guides/*.md` paths, hub sync (see Step 6 below)
```

### Step 1 — Scope

Identify **audience** (8P3P operator vs customer integrator) and **task** (deploy, integrate, build feature, understand architecture). Start navigation from `docs/README.md`, not a flat guide list.

### Step 2 — Classify existing content

For each file or major section, assign **one primary mode**. Secondary content becomes a link:

- Procedure blocks in architecture docs → move to how-to or scenario path
- Field/error tables in guides → link to spec or OpenAPI
- "Why we chose X" in runbooks → link to foundation or report

### Step 3 — Consolidation rules

**Prefer linking over copying.** When two docs cover the same task:

1. Pick the **authoritative** doc (runbook, checklist, or spec per traceability rules)
2. Demote the other to a **router** (scenario path) or merge into an index row
3. Delete duplicated commands/prose only after links point to authority

**Scenario path template** (thin how-to router):

```markdown
# [Task title]

**Type:** How-to (scenario path) — links only; authority lives in linked docs.

## Prerequisites
- …

## Path
1. [Authoritative doc § anchor](…) — one-line why
2. …

## Exit criteria
- Measurable done state (not "read the doc")
```

Hard rule: scenario files do **not** duplicate long command blocks from [`docs/guides/operators/aws-pilot-runbook.md`](../../../docs/guides/operators/aws-pilot-runbook.md) or similar SSoT runbooks.

### Step 4 — Index / hub updates

When reorganizing, update in the same change set:

| Hub | Role |
| --- | ---- |
| `docs/README.md` | Primary entry — scenario table, audience split, Diátaxis + tier legend |
| `docs/guides/README.md` | Scenarios first, then customer/operator catalog |
| `docs/foundation/documentation-boundaries.md` | Tier definitions and agent reading order when IA changes |

Indexes are **navigation only** — no new procedures or requirements in hub pages.

### Step 5 — Cross-cutting checks

- **Analysis consistency** (`.cursor/rules/analysis-consistency-checks.mdc`): split deploy/host/integrate into Tier A/B/C; flag capability vs infrastructure gaps
- **Document traceability** (`.cursor/rules/document-traceability/RULE.md`): specs own requirements; guides link to specs; no orphaned definitions
- **T6 boundary**: no relative hrefs to gitignored `internal-docs/`

### Step 6 — Doc IA housekeeping pass

Run after a guides reorg, scenario-path addition, or when plan todos drift from reality. Invoke **`/doc-housekeeping`** (or follow the checklist below after **`/doc-reorganize`**).

```
Housekeeping checklist:
- [ ] docs/README.md and docs/guides/README.md list current scenario paths
- [ ] No committed hrefs to retired flat paths (docs/guides/{runbook}.md at guides root)
- [ ] Cross-repo refs use operators/ · customers/ · playbooks/ subfolders where files live
- [ ] Plan YAML todos match landed work (document-traceability § Program / Feature Status)
- [ ] npm run test:contracts -- tests/contracts/documentation-boundary.test.ts (DOC-001..005)
```

**Not this pass:** `/post-impl-doc-sync` reconciles spec literals with code — not navigation IA.

### Step 7 — Report

Summarize for the user:

- Files created/moved/retired
- Mode classification for key pages
- What remains authoritative (SSoT)
- Any unresolved mixed-mode pages worth a follow-up split

## Mode cheat sheet (writing)

| Mode | DO | DON'T |
| ---- | -- | ----- |
| Tutorial | Linear path; safe defaults; "you will learn" | Assume prod credentials; dump reference tables |
| How-to | Goal in title; prerequisites; numbered steps/links; exit criteria | Teach system design; exhaustive option lists |
| Reference | Complete, structured, neutral tone | Narrative walkthrough; opinions |
| Explanation | Context, history, trade-offs, links to reference | Step-by-step deploy commands |

## Related commands and skills

- **`/doc-housekeeping`** — light IA pass: stale guide paths, hub sync, plan todos, DOC-001..005
- **`/doc-reorganize`** — full Diátaxis reorg (classify, split, scenario paths, hub updates)
- **`/post-impl-doc-sync`** — literal spec/plan/code parity after features ship (not IA)
- **`/update-readme`** — root README evidence sync (not Diátaxis structure)

## Additional resources

- [reference.md](reference.md) — Diátaxis quality criteria and common fixes
- [Diátaxis site](https://diataxis.fr/) — tutorials vs how-to, reference vs explanation
