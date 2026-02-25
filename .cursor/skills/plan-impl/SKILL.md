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
   - Functional requirements
   - Contract test IDs
   - Dependencies on other specs/components
2. Create ordered tasks (`TASK-001`, `TASK-002`, ...) where each task has:
   - explicit files
   - action (create/modify/delete)
   - verification criteria
   - dependency links
3. Add mandatory test tasks:
   - one task per spec-defined contract test set
   - direct tests for new public exports/DI surfaces
4. Save plan to `.cursor/plans/{feature-name}.plan.md`
5. Initialize `todos` for every task as `pending`
6. Ensure every spec test ID maps to a task in the Test Plan table

> **Test task rule of thumb**: If the spec has a Contract Tests section, every test ID in that section must appear in the Test Plan table linked to a task. If a plan has no test tasks, it is incomplete.

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

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| TEST-001 | contract | {description} | TASK-XXX |
| TEST-002 | unit | {description} | TASK-XXX |

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
