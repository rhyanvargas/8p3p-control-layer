---
name: update-readme
description: Synchronize README.md with current codebase state (evidence-based). Use when the user runs /update-readme.
disable-model-invocation: true
---

# /update-readme

Synchronize README.md with current codebase state.

## Usage

Update README based on current repo:
```
/update-readme
```

Update specific sections:
```
/update-readme --section tech-stack
/update-readme --section structure
/update-readme --section status
```

## Behavior

1. **Scan** - Analyze codebase for current state
2. **Compare** - Identify discrepancies with README
3. **Update** - Apply changes to keep README accurate
4. **Verify** - Confirm all references are valid

## Instructions

When the user invokes `/update-readme`:

1. Gather evidence from:
   - dependency manifest (`package.json`, etc.)
   - source directories (`src/`)
   - tests (`tests/`)
   - docs (`docs/`)
2. Update only sections with drift:
   - tech stack (manifest-backed)
   - project structure
   - documentation links
   - project status/progress
3. Use references instead of duplication:
   - link to source/config/spec files
   - avoid hardcoded versions and copied code blocks
4. Validate before finishing:
   - all links resolve
   - claims are evidence-backed
   - no planned work labeled as complete
5. Return concise summary:
   - sections changed
   - evidence files used
   - unresolved gaps (if any)

## Next Steps

After update:
- Run `/review README.md` for a final doc quality pass (optional)

