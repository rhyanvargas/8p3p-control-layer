---
name: quick-start
description: Initialize the spec-driven workflow for a project (detect stack, configure rules, and guide next steps). Use when the user runs /quick-start.
disable-model-invocation: true
---

# /quick-start

Initialize the spec-driven workflow for a project.

## Usage

```
/quick-start
```

## Behavior

1. **Detect** - Analyze project structure and tech stack
2. **Contextualize** - Update project context rule with verified stack/commands
3. **Guide** - Recommend workflow entrypoint (greenfield vs brownfield)

## Instructions

When the user invokes `/quick-start`:

1. Scan the project root for configuration files
2. Detect the tech stack:
   ```
   Language: {detected}
   Framework: {detected}
   Package Manager: {detected}
   Test Framework: {detected}
   Linter: {detected}
   ```
3. Read existing configs for conventions
4. Update `.cursor/rules/project-context/RULE.md` with:
   - Project overview
   - Tech stack summary
   - Key commands (build, test, run)
   - Coding standards
5. Recommend next command:
   - Greenfield: `/draft-spec`
   - Brownfield: `/extract-spec`
6. Reference canonical workflow doc: `docs/foundation/definitive-workflow.md`

