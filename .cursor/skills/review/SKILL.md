---
name: review
description: Perform a post-implementation quality review, optionally against a spec. Use when the user runs /review.
disable-model-invocation: true
---

# /review

Perform a post-implementation quality review.

## Usage

Review recent changes:
```
/review
```

Review specific files:
```
/review path/to/file.ts
```

Review against a spec:
```
/review --spec docs/specs/{feature-name}.md
```

## Behavior

1. **Scan** - Identify changed or specified files
2. **Analyze** - Prioritize bugs/regressions first
3. **Trace** - Identify root cause and owning document/layer
4. **Report** - Severity-ranked findings with remediation

## Instructions

When the user invokes `/review`:

1. Identify the scope:
   - If no arguments, review recent changes (git diff)
   - If file path provided, review that file
   - If --spec provided, verify against spec requirements
2. Evaluate each item against:
   - `.cursor/rules/project-context/RULE.md`
   - `.cursor/rules/document-traceability/RULE.md` (including § **Spec ↔ implementation parity** — literal constants, public API shape, immutability of shared exports)
   - `.cursor/rules/contract-enforcement/RULE.md` (when contracts are in scope)
3. For each issue, capture:
   - Severity (`error`, `warning`, `info`)
   - Impact/risk
   - Root cause location (spec/plan/implementation/test)
   - Exact remediation location
4. If contract files changed, run `npm run validate:contracts` and include result
5. Produce output in this order:
   - Findings by severity
   - Open questions/assumptions
   - Short change summary
6. If user requests fixes, apply only to owning documents/files

## Next Steps

After review:
- If findings exist: fix highest severity first, then re-run `/review`
- If no findings: implementation is ready for commit/PR
