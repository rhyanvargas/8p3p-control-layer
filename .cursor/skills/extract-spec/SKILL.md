---
name: extract-spec
description: Reverse-engineer a specification from existing code (brownfield documentation). Use when the user runs /extract-spec.
disable-model-invocation: true
---

# /extract-spec

Reverse-engineer a specification from existing code (brownfield documentation).

## Usage

Extract spec for a module:
```
/extract-spec src/auth/
```

Extract spec for a feature:
```
/extract-spec "user authentication"
```

Extract spec for specific files:
```
/extract-spec src/services/UserService.ts
```

## Behavior

1. **Scope** - Resolve target module/feature
2. **Analyze** - Read interfaces, flows, tests, dependencies
3. **Document** - Capture current behavior (not desired future state)
4. **Publish** - Save to `docs/specs/{module-name}-existing.md`

## Instructions

When the user invokes `/extract-spec`:

1. Parse the target (path, module name, or description)
2. Search the codebase:
   - Use rg for exact matches
   - Use semantic search for concepts
   - Explore related files and dependencies
3. Analyze the code:
   - Identify public interfaces
   - Trace data flow
   - Note dependencies
   - Find tests for behavior clues
4. Generate a spec that documents current state:
   - What the code does (behavior)
   - How it's used (interfaces)
   - What it depends on (dependencies)
5. Save to `docs/specs/{module-name}-existing.md`
6. Recommend:
   - `/draft-spec` for enhancements/new capabilities
   - `/plan-impl` if immediate implementation planning is needed

## Output Template

```markdown
# {Module/Feature Name} (Existing)

> Auto-generated spec from existing code. Review and refine as needed.

## Overview
{What this code does based on analysis}

## Current Behavior

### Public Interface
- `functionName(params)` - {description}
- `ClassName.method()` - {description}

### Data Flow
1. {Step 1}
2. {Step 2}

## Dependencies
- `{dependency}` - {how it's used}

## Integration Points
- {Where this code connects to other systems}

## Tests
- {Summary of existing test coverage}

## Observations
- {Patterns noticed}
- {Potential issues}
- {Missing documentation}

## Suggested Improvements
- {Refactoring opportunities}
- {Missing tests}
- {Documentation gaps}
```

## Next Steps

After extracting specs:
- Review and refine inferred behavior with maintainers
- Use as baseline for `/draft-spec` or `/plan-impl`
