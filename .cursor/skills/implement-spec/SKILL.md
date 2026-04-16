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

1. Read the referenced spec or plan file.
2. If a plan exists, follow it step by step.
3. If only a spec exists, derive an explicit task list before coding (prefer running `/plan-impl` first — deriving a plan inline skips the parity guarantees documented in `.cursor/skills/plan-impl/SKILL.md`).
4. **Pre-code parity pass** (do this BEFORE writing the first line of code):
   - Read the plan's `## Spec Literals` section. If the plan was produced by a pre-parity-era `/plan-impl` and has no such section, extract spec literals now (wire formats, cookie attribute tables, env var tables, HTTP status rules) and reconcile against the TASK details. Flag every mismatch you find.
   - Read the plan's `## Deviations from Spec` section. For each row with resolution `Update spec in same PR`, open the spec file and confirm the PR will include that edit. For resolution `Reverted — plan now matches spec`, confirm the TASK details no longer describe the deviation.
   - Read the plan's `## Requirements Traceability` table. If any spec functional requirement or acceptance criterion has no TASK mapping, stop and request a plan update (`/plan-impl` with the updated spec) — do not silently implement an unmapped requirement.
   - Grep the plan for the key literals (cookie name, status codes, env var names, constants). Each literal must appear identically everywhere. If TASK-002 says `dp_session` and TASK-008 tests for `__Host-dp_session`, stop and reconcile before coding.
   - If any pre-code parity check fails, report the divergences and ask whether to (a) update the plan, (b) update the spec, or (c) proceed with a documented deviation. Do not paper over drift.
5. For each task:
   - Implement the code change and required tests.
   - Apply standards from `.cursor/rules/project-context/RULE.md` and `.cursor/rules/document-traceability/RULE.md` (including § **Spec ↔ Plan ↔ Implementation parity**).
   - If using a plan, update task status in the plan YAML frontmatter `todos` list (single source of truth). Do not add/maintain per-task status fields in the body because they drift from the frontmatter.
   - If the plan body already contains legacy per-task status lines (e.g. `- **Status**: pending/completed` under each `TASK-XXX`), remove them so the plan cannot contradict itself later.
6. Run validation in this order:
   - Targeted tests for touched modules
   - `npm test`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run validate:contracts` when schemas/contract docs changed
   - `npm run validate:api` when `docs/api/openapi.yaml` changed
7. Fix failures and re-run only failed stages until green.
8. **Post-code parity pass** — diff literal details between `docs/specs/`, `.cursor/plans/`, and `src/`:
   - Constants (validation substitution values, limits, timeouts) must match `docs/specs/{feature}.md` and the plan's TASK details.
   - Public API surface (overload vs union, `ReadonlySet` vs `Set`, new exports not in spec) must match what the spec promises; update the spec Dependencies/Provides or Implementation Notes if the idiomatic TS shape differs from prose, and round-trip plan-introduced exports into the spec if they are externally visible.
   - Update `.cursor/plans/*.plan.md` TASK bodies if they still describe superseded literals; add "superseded by spec § X" notes where appropriate.
   - For every row in the plan's `Deviations from Spec` table with resolution `Update spec in same PR`, confirm the spec edit is in the diff.
9. Report:
   - Implemented tasks and files changed
   - Commands run and pass/fail outcomes
   - Parity diff results (both pre-code and post-code passes)
   - Any deferred items with rationale (including any spec edits made for parity)

## Next Steps

After implementation:
- Run `/post-impl-doc-sync` on the same spec path if you touched validation constants or public exports
- Run `/review` for quality check
- Use `/review --spec {spec-path}` for requirement-by-requirement verification
