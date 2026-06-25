---
description: "Source-grounded planning and execution - cite relevant Cursor rules, commands, skills, and official docs before substantive recommendations or implementation"
alwaysApply: true
---

# Source-Grounded Execution

For non-trivial planning, implementation, review, debugging, or architecture work, ground recommendations and implementation details in the relevant local sources before acting.

## Pre-Flight Source Selection

Before executing a substantive task, identify the applicable sources:

1. **Project rules**: Load `.cursor/rules/*/RULE.md` files whose scope constrains the task.
2. **Agent skills**: Read any relevant `SKILL.md` before using its workflow or domain guidance.
3. **Commands**: If the user invokes a `/command`, read the command file in `.cursor/commands/` and its declared source-of-truth skill.
4. **Official docs / MCP**: When the task depends on external platforms, libraries, AWS services, Cursor behavior, or public APIs, consult the relevant official docs or MCP server first.

Do not load every source unconditionally. Select by task domain, target files, and user intent.

## Citation Requirement

When giving recommendations, plans, implementation summaries, or review findings, cite the sources that materially shaped the answer:

- Local files: cite paths such as `.cursor/rules/document-traceability/RULE.md` or `.cursor/skills/implement-spec/SKILL.md`.
- Official docs: cite URLs when used.
- MCP docs: cite the returned documentation URL or resource name when available.
- If no specialized source applies, state the baseline project rules or repository evidence used.

For implementation work, include source grounding in the working plan or final summary alongside verification evidence.

## Repo-Specific Defaults

- Planning from specs: load `.cursor/skills/plan-impl/SKILL.md`, `.cursor/rules/document-traceability/RULE.md`, `.cursor/rules/prefer-existing-solutions/RULE.md`, and `.cursor/rules/control-layer-constraints/RULE.md`.
- Executing plans/specs: load `.cursor/skills/implement-spec/SKILL.md`, the referenced plan/spec, and applicable domain skills such as React/Next.js, Fastify, Swagger, TDD, or systematic debugging.
- Reviews: load `.cursor/skills/review/SKILL.md`; for spec-aware review, also load `.cursor/rules/document-traceability/RULE.md`.
- Cursor behavior questions: cite Cursor Rules, Commands, or Agent Skills docs and prefer current official documentation over memory.

## Evidence

This rule follows Cursor's documented model:

- Project rules live in `.cursor/rules` and provide persistent repository-scoped instructions.
- Commands live in `.cursor/commands` and are explicitly invoked with `/`.
- Agent Skills live in `.cursor/skills`, `~/.cursor/skills`, and compatible skill directories; agents decide when relevant unless `disable-model-invocation: true`.
