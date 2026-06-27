---
description: "Pre-flight context loading for /commands — when any .cursor/commands/ command is invoked, load relevant skills, rules, and MCP documentation before execution"
alwaysApply: true
---

# Command Context Loading

Before executing **any** `.cursor/commands/` command, the agent MUST perform a pre-flight context-loading step. This guarantees that relevant skills, rules, and official documentation are selected and read **before** the first action.

## Pre-Flight Protocol

When a `/command` is invoked:

### Step 1 — Load the command's own skill

Every command declares a `Source of truth` skill in its `.md` file. Read that skill first (this is already the baseline behavior).

### Step 2 — Load applicable rules

Read every rule whose scope overlaps the command's task:

| If the command touches… | Also load rule |
|-------------------------|---------------|
| Specs, plans, or implementation (`/draft-spec`, `/plan-impl`, `/implement-spec`, `/extract-spec`) | @document-traceability, @control-layer-constraints, @prefer-existing-solutions |
| Contracts or schemas (`/sync-contracts`, `/implement-spec`) | @contract-enforcement |
| Reviews (`/review`, `/post-impl-doc-sync`) | @document-traceability (§ Spec ↔ implementation parity) |
| Roadmap / next-action analysis (`/whats-next`) | @document-traceability (§ Program / Feature Status), @project-context, @source-grounded-execution |
| Pilot readiness or feedback (`/pilot-readiness`, `/pilot-feedback-intake`) | @document-traceability, @project-context |
| Git commits (`/commit`) | @no-cursor-git-coauthor |
| Any code generation or modification | @control-layer-constraints (scope boundaries), @prefer-existing-solutions |
| README or reports (`/update-readme`, `/generate-report`) | @project-context (tech stack, architecture, commands) |

### Step 3 — Load related agent skills

Select skills that match the **domain** of the work, not just the command name:

| Domain signal | Skill to load |
|---------------|--------------|
| Backend / Fastify routes, plugins, hooks, validation | `.agents/skills/fastify-best-practices/SKILL.md` |
| Frontend / React / Next.js components or pages | `.agents/skills/vercel-react-best-practices/SKILL.md` |
| UI design, styling, layout, CSS | `.agents/skills/frontend-design/SKILL.md` |
| Swagger / OpenAPI docs appearance | `.cursor/skills/swagger-design/SKILL.md` |
| Hosted pilot readiness / deployment gates | `.cursor/skills/pilot-readiness/SKILL.md` |
| Pilot feedback triage / weekly intake | `.cursor/skills/pilot-feedback-intake/SKILL.md` |
| Writing new code, bug fixes, or contract tests (`/implement-spec`, `/plan-impl`) | `~/.agents/skills/test-driven-development/SKILL.md` |
| Investigating failures, test regressions, or unexpected behavior (`/review`, bug triage) | `~/.agents/skills/systematic-debugging/SKILL.md` |

Only load a domain skill when the command's target files or spec content clearly falls within that domain. Do not load all skills unconditionally.

### Step 4 — Consult official documentation (MCP tools)

When the command involves an **external service or AWS resource**, query the relevant MCP server **before** generating code or specs:

| Integration area | MCP server | Tool to use |
|-----------------|------------|-------------|
| AWS service patterns / best practices | `user-awslabs.aws-documentation-mcp-server` | `search_documentation`, `read_sections` |
| DynamoDB table design / modeling | `user-awslabs-dynamodb-mcp-server` | `dynamodb_data_modeling` |
| CDK / CloudFormation IaC | `user-awslabs.aws-iac-mcp-server` | `search_cdk_documentation`, `cdk_best_practices` |
| Hosted pilot deployment (`/pilot-readiness` when AWS path is in scope) | `user-awslabs.aws-documentation-mcp-server` or `user-awslabs.aws-iac-mcp-server` | AWS docs search/read or CDK/IaC guidance |

Skip this step when the task is purely local (SQLite, in-process logic, test-only changes).

## Decision Criteria

The agent should answer these questions **before** starting execution:

1. **Which rules constrain this task?** — Load them.
2. **Does the target code fall within a domain skill?** — Load the skill.
3. **Does the task involve an external integration?** — Query MCP docs first.
4. **Has any loaded rule or skill been updated since I last read it?** — Re-read if uncertain.
5. **Does the spec contain normative literal blocks?** — When `/plan-impl` or `/implement-spec` runs on a spec that includes wire-format / signed-token / cookie-attribute / env-var / HTTP-status tables or code fences, the agent MUST extract those literal blocks into the plan's `## Spec Literals` section (or the implementation's working context) **before** generating task details or code. Paraphrasing a normative literal is the primary source of spec↔plan drift and is prohibited — quote verbatim with a section anchor.
6. **Does this change add/complete a plan task, add a plan, or ship/defer a feature?** — If so, the change MUST also update the **Program Status Ledger** in `docs/foundation/roadmap.md` in the same change set, per @document-traceability § "Program / Feature Status". The ledger is the single place plan-level status lives; never record status in a second roadmap or per-track plan.

## Non-Goals

- Do **not** load every skill and rule unconditionally — context windows are finite.
- Do **not** duplicate workflow steps from skills into this rule. This rule only governs **what to load**, not **how to execute**.
- Do **not** block execution if an MCP server is unavailable; log the gap and proceed.
