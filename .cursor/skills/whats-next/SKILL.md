---
name: whats-next
description: Analyze current repo state, product intent, roadmap ledger, plan todos, diffs, and test signals to recommend the next best action. Use when the user asks "what's next?", "what should I do next?", "what plan should I execute?", or invokes /whats-next.
disable-model-invocation: true
---

# /whats-next

Give a holistic product + engineering recommendation for the next best action. This is a read-only planning command: do **not** edit files, implement code, commit, or deploy.

## Usage

```
/whats-next
/whats-next after implementing D4
/whats-next focus on pilot launch
```

Anything after the command is treated as additional context, not as an instruction to modify files.

## Required Inputs

Read these sources in order:

1. `docs/foundation/roadmap.md`
   - Treat § Program Status Ledger as the single source of truth for plan-level status and execution order.
2. Git working tree state
   - `git status --short`
   - `git diff --stat`
   - `git diff --name-only`
   - Include staged changes if present.
3. Active plan frontmatter
   - Read YAML `todos` for any plan named in the ledger's Active / next group and for any plan whose files changed.
4. Relevant specs/docs
   - Read only specs/guides referenced by the active ledger row or directly touched in the diff.
5. Runtime/test evidence
   - Inspect terminal status when relevant.
   - Prefer recent command outputs, test failures, lint errors, and validation results over assumptions.

## Analysis Checklist

Before recommending, answer:

- What is the current product/business objective?
- Which ledger row is first in Active / next?
- Did recent changes complete, partially complete, or conflict with that row?
- Are there uncommitted shipped-on-branch changes that should be stabilized before starting new work?
- Is there roadmap/spec/plan drift? If yes, name the owning doc to update.
- Are multiple planned changes touching the same files or UX surfaces?
- What verification evidence exists, and what is missing?
- What should be deferred because it is not on the pilot-critical path?

## Output Format

Use this structure:

```markdown
## Current State
[2-4 bullets: objective, active ledger row, working-tree status, verification signal]

## Recommendation
[One clear next action. Include why it beats plausible alternatives.]

## Execution Order
1. [Immediate stabilization or verification step]
2. [Next plan/task]
3. [Follow-on step]

## Risks / Guardrails
- [Overlap, stale-doc, unverified-test, or UX debt risk]
- [What not to touch yet]

## Evidence
- `docs/foundation/roadmap.md`: [ledger row or rule]
- `.cursor/plans/...`: [task/todo status]
- Changed files / commands: [specific evidence]
```

Keep the recommendation concise and decisive. If evidence is missing, say exactly what to inspect or run next instead of guessing.

## Decision Rules

- The ledger's **Active / next** order wins unless the working tree has unverified or conflicting changes that must be stabilized first.
- If a plan's YAML `todos` and the roadmap ledger disagree, recommend `/post-impl-doc-sync` or a ledger update before implementation.
- If shipped-on-branch work is uncommitted, recommend stabilization and verification before starting another overlapping design plan.
- If two plans touch the same surface, sequence the one that owns the substrate/layout first, then the feature-specific plan.
- If the user asks for implementation during `/whats-next`, stop after the recommendation and ask them to invoke the specific execution command (usually `/implement-spec ...`) or explicitly approve edits.

## Non-Goals

- Do not run broad test suites unless the user explicitly asks; this command is for situational analysis.
- Do not rewrite the roadmap or plans. Report drift and recommend the owning sync command.
- Do not create PRs or commits.
