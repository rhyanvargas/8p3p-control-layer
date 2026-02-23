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
   - If using a plan, update task status in both frontmatter and task body
5. Run validation in this order:
   - Targeted tests for touched modules
   - `npm test`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run validate:contracts` when schemas/contract docs changed
   - `npm run validate:api` when `docs/api/openapi.yaml` changed
6. Fix failures and re-run only failed stages until green
7. Report:
   - Implemented tasks and files changed
   - Commands run and pass/fail outcomes
   - Any deferred items with rationale

## Next Steps

After implementation:
- Run `/review` for quality check
- Use `/review --spec {spec-path}` for requirement-by-requirement verification
