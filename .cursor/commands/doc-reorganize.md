# /doc-reorganize

**Full Diátaxis documentation reorganization** — classify content modes, consolidate duplicates, add or reshape scenario paths, update hubs. Use when docs are overloaded, mixed-mode, or need a new navigation structure.

**Source of truth:** `.cursor/skills/diataxis-docs/SKILL.md` (full workflow, Steps 1–7)

**Not this command:** `/doc-housekeeping` (link/plan sync only) · `/post-impl-doc-sync` (spec literals vs code)

## Usage

Describe the goal in the same message:

```
/doc-reorganize add a scenario path for first AWS pilot deploy
/doc-reorganize split mixed-mode content in docs/guides/operators/aws-pilot-runbook.md
/doc-reorganize audit docs/guides/ for Diátaxis violations
```

Optional scope path:

```
/doc-reorganize docs/guides/
```

## Instructions

When the user invokes `/doc-reorganize`:

1. Read `.cursor/skills/diataxis-docs/SKILL.md` (full workflow) and `.cursor/rules/diataxis-docs.mdc`.
2. Read `docs/foundation/documentation-boundaries.md` — preserve T1–T5 tiers; scenarios stay thin routers inside T3.
3. Load `.cursor/rules/document-traceability/RULE.md` and `.cursor/rules/analysis-consistency-checks.mdc`.

Follow the skill checklist **Steps 1–7**:

1. **Scope** — audience (operator vs customer integrator) and task; start from `docs/README.md` intent
2. **Classify** — one primary Diátaxis mode per page/section
3. **Violations** — mixed modes, duplicate SSoT, tier/T6 boundary issues
4. **Plan moves** — link vs split vs new scenario router; **prefer linking over copying**
5. **Execute** — minimal diff; scenario paths are prerequisites + numbered links + exit criteria only
6. **Update hubs** — `docs/README.md`, `docs/guides/README.md`, `documentation-boundaries.md` if IA changed
7. **Verify** — run DOC-001..005; finish with `/doc-housekeeping` if link sweep remains

**Hard rules:**

- Runbooks/checklists/specs remain SSoT — do not paste their commands into scenario files
- Indexes route; authorities teach
- No relative hrefs to gitignored `internal-docs/`

Report per skill Step 7: files created/moved/retired, mode classification, SSoT map, follow-ups.
