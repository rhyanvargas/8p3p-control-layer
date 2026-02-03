# /draft-spec

Generate a specification document from a feature idea or brief description.

## Usage

```
/draft-spec "your feature idea or description"
```

## Behavior

1. **Clarify** - Ask clarifying questions if the idea is vague
2. **Research** - Scan the codebase for relevant context
3. **Generate** - Create a structured spec in `docs/specs/`
4. **Output** - Return the spec for review

## Spec Structure

The generated spec includes:

- **Overview**: What the feature does
- **Requirements**: Functional requirements with acceptance criteria
- **Constraints**: Technical or business constraints
- **Out of Scope**: What this spec does NOT cover
- **Dependencies**: Related systems or features (with explicit document references)
- **Error Codes**: Codes used by this component (existing vs new)

## Instructions

When the user invokes `/draft-spec`:

1. Parse the provided description
2. If the description is unclear or missing key details, ask 2-3 clarifying questions:
   - What problem does this solve?
   - Who is the user?
   - Are there existing patterns to follow?
3. Search the codebase for related code, patterns, or existing specs
4. **Identify dependencies on other specs:**
   - Check if required functions/types exist in other specs
   - If a dependency is missing from the source spec, note it as a gap
   - Do NOT define functions that belong in another spec
5. Generate a spec file at `docs/specs/{feature-name}.md`
6. Use the template below
7. **Suggest next step**: Tell the user to run `/plan-impl docs/specs/{feature-name}.md` to create an implementation plan

## Dependency Handling Rules

When a spec depends on functionality from another component:

1. **Check if the function exists** in the source spec (e.g., `signal-log.md`)
2. **If it exists**: Reference it with explicit path: `Requires getSignalsByIds() (see docs/specs/signal-log.md)`
3. **If it does NOT exist**: Flag this as a gap that must be resolved:
   - Option A: Update the source spec first, then reference it
   - Option B: Note the gap and require resolution before implementation
4. **Never define a function inline** that belongs in another component's spec

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

## Notes
- {Any additional context}
```

## Next Steps

After generating the spec:
- Review and refine the spec
- Run `/plan-impl docs/specs/{feature-name}.md` to create an implementation plan
