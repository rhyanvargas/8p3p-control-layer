# /generate-report

Generate an executive-level changelog report. Adapts to what actually changed — API routes, policy rules, schema updates, bug fixes, or infrastructure. Not every report needs screenshots; not every report needs curl output. The report reflects reality.

**Source of truth:** `.cursor/skills/generate-report/SKILL.md` (workflow is maintained there to avoid duplication).

## Usage

```
/generate-report                              # auto-detect changes since last report or tag
/generate-report since v1.0.0                 # changes since a specific tag/commit
/generate-report policy update — added escalate rule
/generate-report milestone: POC v1 complete   # full milestone summary (includes API evidence)
```

## Instructions

When the user invokes `/generate-report`, follow `.cursor/skills/generate-report/SKILL.md`.
