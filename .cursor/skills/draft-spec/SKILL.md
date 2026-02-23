---
name: draft-spec
description: Generate a specification document from a feature idea or brief description. Use when the user runs /draft-spec.
disable-model-invocation: true
---

# /draft-spec

Generate a specification document from a feature idea or brief description.

## Usage

```
/draft-spec "your feature idea or description"
```

## Behavior

1. **Clarify** - Resolve missing scope/acceptance criteria
2. **Research** - Check related specs/code for dependencies
3. **Draft** - Create `docs/specs/{feature-name}.md`
4. **Gate** - Confirm test IDs and dependency ownership

## Instructions

When the user invokes `/draft-spec`:

1. Parse the user request into: problem, user, expected outcomes.
2. If unclear, ask targeted clarifying questions before drafting.
3. Search related specs and code for reuse/dependencies.
4. Draft spec with these required sections:
   - Overview
   - Functional requirements + acceptance criteria
   - Constraints + out of scope
   - Dependencies (explicit source doc references)
   - Error codes (existing vs new)
   - Contract tests (explicit test IDs)
5. Enforce dependency ownership:
   - Reference cross-component functions/types in source specs
   - Do not define another component's interfaces inline
6. Save file at `docs/specs/{feature-name}.md`.
7. Recommend `/plan-impl docs/specs/{feature-name}.md`.

## Spec Template

```markdown
# {Feature Name}

## Overview
{One paragraph describing what this feature does and why}

## Requirements

### Functional
- [ ] {Requirement 1}
- [ ] {Requirement 2}

### Acceptance Criteria
- Given {context}, when {action}, then {result}

## Constraints
- {Technical or business constraint}

## Out of Scope
- {What this does NOT include}

## Dependencies

### Required from Other Specs
| Dependency | Source Document | Status |
|------------|-----------------|--------|
| `functionName()` | `docs/specs/source.md` | Defined ✓ / **GAP** |

### Provides to Other Specs
| Function | Used By |
|----------|---------|
| `myFunction()` | Decision Engine (Stage 4) |

## Error Codes

### Existing (reuse)
| Code | Source |
|------|--------|
| `error_code` | Signal Ingestion |

### New (add during implementation)
| Code | Description |
|------|-------------|
| `new_error_code` | {description} |

## Contract Tests

Define the tests that verify this component's contract. These become implementation requirements — `/plan-impl` must include tasks for each, and `/review` will verify they exist.

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| {PREFIX}-001 | {Happy path} | {Valid input} | {Expected output} |
| {PREFIX}-002 | {Validation failure} | {Invalid input} | rejected, `{error_code}` |

> **Test strategy note:** Distinguish tests that exercise the full flow end-to-end from tests that exercise validators/safety-nets directly. Document which strategy each test uses so implementers know where to place them.

## Notes
- {Any additional context}
```

## Next Steps

After generating the spec:
- Review requirements and test IDs with stakeholders
- Run `/plan-impl docs/specs/{feature-name}.md`

