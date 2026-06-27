# /whats-next

Analyze the current repo state, roadmap ledger, active plans, recent changes, and product intent to recommend the next best action.

**Source of truth:** `.cursor/skills/whats-next/SKILL.md` (workflow is maintained there to avoid duplication).

## Usage

```
/whats-next
/whats-next after implementing D4
/whats-next focus on pilot launch
```

## Instructions

When the user invokes `/whats-next`, follow `.cursor/skills/whats-next/SKILL.md`.

Apply `.cursor/rules/document-traceability/RULE.md` § Program / Feature Status and treat `docs/foundation/roadmap.md` § Program Status Ledger as the single source of truth for plan-level status.
