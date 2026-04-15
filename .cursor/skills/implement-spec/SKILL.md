---
name: implement-spec
description: Generate code from a specification or implementation plan (spec-driven workflow). Use when the user runs /implement-spec.
disable-model-invocation: true
---

# /implement-spec

Generate code from a specification or implementation plan.

## Usage

From a spec:
```
/implement-spec docs/specs/{feature-name}.md
```

From a plan:
```
/implement-spec .cursor/plans/{feature-name}.plan.md
```

## Behavior

1. **Read** - Parse the spec or plan
2. **Implement** - Execute tasks in dependency order
3. **Verify** - Run required validation commands
4. **Report** - Summarize changes, evidence, and gaps

## Instructions

When the user invokes `/implement-spec`:

1. Read the referenced spec or plan file
2. If a plan exists, follow it step by step
3. If only a spec exists, derive an explicit task list before coding
4. For each task:
   - Implement the code change and required tests
   - Apply standards from `.cursor/rules/project-context/RULE.md` and `.cursor/rules/document-traceability/RULE.md`
   - If using a plan, update task status in the plan YAML frontmatter `todos` list (single source of truth). Do not add/maintain per-task status fields in the body because they drift from the frontmatter.
   - If the plan body already contains legacy per-task status lines (e.g. `- **Status**: pending/completed` under each `TASK-XXX`), remove them so the plan cannot contradict itself later.
5. Run validation in this order:
   - Targeted tests for touched modules
   - `npm test`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run validate:contracts` when schemas/contract docs changed
   - `npm run validate:api` when `docs/api/openapi.yaml` changed
6. Fix failures and re-run only failed stages until green
7. **Spec/plan parity pass** — Before the final report, diff literal requirements against code:
   - Constants (e.g. validation substitution values, limits like max sources) must match `docs/specs/{feature}.md` and the plan’s TASK details.
   - Public API surface (overload vs union, `ReadonlySet` vs `Set`) must match what the spec promises; update the spec Implementation Notes if the idiomatic TS shape differs from prose.
   - Update `.cursor/plans/*.plan.md` TASK bodies if they still describe superseded literals.
8. Report:
   - Implemented tasks and files changed
   - Commands run and pass/fail outcomes
   - Any deferred items with rationale (including any spec edits made for parity)

## Next Steps

After implementation:
- Run `/post-impl-doc-sync` on the same spec path if you touched validation constants or public exports
- Run `/review` for quality check
- Use `/review --spec {spec-path}` for requirement-by-requirement verification
