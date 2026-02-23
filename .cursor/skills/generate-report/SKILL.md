---
name: generate-report
description: Generate an executive-level changelog report based on what actually changed. Use when the user runs /generate-report.
disable-model-invocation: true
---

# /generate-report

Generate an executive-level changelog report. Adapts to what actually changed — API routes, policy rules, schema updates, bug fixes, or infrastructure. Not every report needs screenshots; not every report needs curl output. The report reflects reality.

## Usage

```
/generate-report                              # auto-detect changes since last report or tag
/generate-report since v1.0.0                 # changes since a specific tag/commit
/generate-report policy update — added escalate rule
/generate-report milestone: POC v1 complete   # full milestone summary (includes API evidence)
```

## Behavior

1. **Detect** - Determine change baseline and affected files
2. **Classify** - API, policy, schema, tests, docs, infra, bugfix
3. **Verify** - Gather only evidence needed for detected change types
4. **Compose** - Write concise business-facing report
5. **Deliver** - Save to `docs/reports/{YYYY-MM-DD}-{slug}.md`

## Instructions

1. Determine baseline using:
   - user-provided ref, else latest report date, else `HEAD~10`
2. Build change inventory:
   - `git log {baseline}..HEAD --oneline`
   - `git diff {baseline}..HEAD --name-status`
3. Decide required evidence:
   - Always: `npm test`
   - If schema/API contracts changed: `npm run validate:contracts`
   - If OpenAPI changed: `npm run validate:api`
   - If API behavior changed: include `curl` evidence for changed endpoints
4. Write report sections:
   - Summary (2-4 sentences, non-technical audience)
   - What changed (grouped by change type)
   - Verification (tests/validators run and outcome)
   - Impact
   - What's next (only if useful)
5. Keep report scoped to actual changes; skip irrelevant sections
6. Return report path and 2-sentence recap

## Output Template

```markdown
# {Project Name} — {Title}

**Date:** {today}
**Baseline:** {baseline}

## Summary
{2-4 sentence executive summary}

## What Changed
### {Change Type}
{what changed + why it matters}

## Verification
- `npm test`: {result}
- `npm run validate:contracts`: {result or N/A}
- `npm run validate:api`: {result or N/A}

## Impact
- {business/product impact}
```

