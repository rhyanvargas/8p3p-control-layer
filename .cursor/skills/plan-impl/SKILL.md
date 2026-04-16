---
name: plan-impl
description: Create an implementation plan from a specification document. Use when the user runs /plan-impl.
disable-model-invocation: true
---

# /plan-impl

Create an implementation plan from a specification document.

## Usage

```
/plan-impl docs/specs/{feature-name}.md
```

Or reference a spec file:
```
/plan-impl @docs/specs/my-feature.md
```

## Behavior

1. **Read** - Parse the spec file
2. **Analyze** - Extract requirements, dependencies, and risks
3. **Decompose** - Produce sequenced tasks with verification steps
4. **Persist** - Write plan file and initialize todos

## Instructions

When the user invokes `/plan-impl`:

1. Read the referenced spec and extract:
   - Functional requirements (every `- [ ]` bullet in `## Requirements`)
   - Acceptance criteria (every `Given/When/Then` line)
   - Contract test IDs
   - Dependencies on other specs/components
2. **Extract spec literals verbatim** (prevents paraphrase-drift):
   - Copy every fenced code block (` ``` `) from the spec into a `## Spec Literals` section at the top of the plan, each quoted with its source section anchor (e.g. `> From spec § Cookie Value Structure`).
   - Copy every attribute/value table (e.g. `| Attribute | Value | Rationale |`, `| Variable | Required | Default |`) with its source section anchor.
   - Copy every HTTP status / redirect / content-type rule stated in the spec prose.
   - Rule: if a TASK detail refers to a wire format, cookie attribute, env var default, HTTP status code, or other spec literal, the TASK body **MUST quote the Spec Literal block verbatim**, not paraphrase it. Paraphrasing a wire format is how byte order and encoding get flipped.
3. **Check existing solutions** (per `.cursor/rules/prefer-existing-solutions/RULE.md`):
   - For each requirement that involves an external service or well-known pattern, query relevant MCP servers (AWS docs, DynamoDB modeling, IaC) for official recommended approaches.
   - Check `package.json` for installed libraries that already provide higher-level abstractions (e.g. `DynamoDBDocumentClient` over raw `DynamoDBClient`).
   - Plan tasks should prefer existing SDK/library APIs. If a task proposes custom code where a library solution exists, note the justification (cheaper, faster, less complex, or higher DX) in the task details.
4. Create ordered tasks (`TASK-001`, `TASK-002`, ...) where each task has:
   - explicit files
   - action (create/modify/delete)
   - verification criteria
   - dependency links
5. Add mandatory test tasks:
   - one task per spec-defined contract test set
   - direct tests for new public exports/DI surfaces
6. **Build the Requirements Traceability table** (mirrors the Test Plan table):
   - Every functional-requirement bullet from the spec → at least one TASK ID.
   - Every acceptance-criteria line from the spec → at least one TASK ID (often the same task that satisfies the related test ID, but must be listed separately so non-test requirements are visible).
   - If a spec bullet is intentionally unimplemented in this plan, add it with `TASK: DEFERRED` and a one-line reason.
7. **Deviations-from-spec pass** — before persisting, diff the draft plan against the Spec Literals block and the Concrete Values Checklist in the spec. For every divergence (different byte order, different cookie name, different default, added/removed env var, added public export not in spec, etc.), add a row to the plan's `## Deviations from Spec` section:
   - `Spec section | Spec says | Plan does | Resolution`
   - Resolution must be one of: `Update spec in same PR`, `Implementation detail — spec silent`, `Reverted — plan now matches spec`.
   - If no deviations exist, the section must explicitly say `None — plan is literal-compatible with spec.` Do not omit the section.
8. **Self-consistency diff** — scan the finished plan text for the key literals you decided on (cookie name, constant values, status codes, env var names). Each literal must appear identically in every task/section that mentions it. If TASK-002 decides `dp_session` then TASK-003 and the Test Plan must say `dp_session`, not `__Host-dp_session`.
9. Save plan to `.cursor/plans/{feature-name}.plan.md`.
10. Initialize `todos` for every task as `pending`.
11. Ensure every spec test ID maps to a task in the Test Plan table **and** every spec functional requirement / acceptance criterion maps to a task in the Requirements Traceability table.

> **Test task rule of thumb**: If the spec has a Contract Tests section, every test ID in that section must appear in the Test Plan table linked to a task. If a plan has no test tasks, it is incomplete.

> **Requirements traceability rule of thumb**: Every `- [ ]` bullet under `## Requirements` and every `Given/When/Then` under `## Acceptance Criteria` must appear in the Requirements Traceability table. An unmapped requirement is a planning defect, not an implementation-time surprise.

> **Parity rule of thumb**: If the plan and the spec disagree on any literal value, the disagreement belongs in the `Deviations from Spec` table **with a chosen resolution before coding starts**. A deviation hidden in a task body (JSDoc, risks, or rationale prose) is treated as a drift defect by `/review --spec`.

## Plan Template

```markdown
---
name: {Feature Name}
overview: {One paragraph summary of what will be implemented, including lifecycle stage and key requirements}
todos:
  - id: "TASK-001"
    content: {Step Title}
    status: "pending"
  - id: "TASK-002"
    content: {Step Title}
    status: "pending"
    #... etc
isProject: false
---

# {Feature Name}

**Spec**: `docs/specs/{feature-name}.md`

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase. Update this section only if the spec itself changes.

### From spec § {Section Name}

```
{literal block, e.g. wire format, cookie attributes, env var table}
```

## Prerequisites

Before starting implementation:
- [ ] {PREREQ-001} {Prerequisite task}

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: {Step Title}
- **Files**: `path/to/file.ts`
- **Action**: Create | Modify | Delete
- **Details**: {What specifically to do}
- **Depends on**: none | TASK-XXX
- **Verification**: {How to verify this step is complete}

### TASK-002: {Step Title}
- **Files**: `path/to/file.ts`
- **Action**: Create | Modify | Delete
- **Details**: {What specifically to do}
- **Depends on**: TASK-001
- **Verification**: {How to verify this step is complete}

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `path/to/new-file.ts` | TASK-001 | {purpose} |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `path/to/existing.ts` | TASK-002 | {what changes} |

## Requirements Traceability

> Every `- [ ]` bullet under the spec's `## Requirements` and every `Given/When/Then` under `## Acceptance Criteria` must map to at least one TASK here. Mirrors the Test Plan discipline for non-test requirements.

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| {FR-1 verbatim} | spec § Requirements | TASK-XXX |
| {AC-1 Given/When/Then} | spec § Acceptance Criteria | TASK-XXX |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| TEST-001 | contract | {description} | TASK-XXX |
| TEST-002 | unit | {description} | TASK-XXX |

## Deviations from Spec

> List every place the plan's literal values differ from the spec. An empty table is not allowed — state `None — plan is literal-compatible with spec.` if nothing differs. Deviations hidden in task bodies (JSDoc, risks, prose) are treated as drift defects by `/review --spec`.

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| {§ Cookie Specification} | `__Host-dp_session` | `dp_session` with `Path=/dashboard` | Update spec in same PR |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| {Risk description} | High/Medium/Low | {Mitigation strategy} |

## Verification Checklist

- [ ] All tasks completed
- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Matches spec requirements

## Implementation Order

```
{task-id} → {task-id} → {task-id}
         ↘ {task-id} ↗
```
```

## Next Steps

After generating the plan:
- Review and adjust task ordering/dependencies
- Run `/implement-spec .cursor/plans/{feature-name}.plan.md`
