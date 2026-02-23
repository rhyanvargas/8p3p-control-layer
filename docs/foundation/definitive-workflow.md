# Definitive Workflow (Canonical)

This document is the canonical workflow for spec-driven delivery in this repository.

## Ownership Model (No Redundancy)

- **Rules** (`.cursor/rules/`): persistent constraints, standards, and policy.
- **Commands** (`.cursor/commands/`): concise entrypoints and usage examples.
- **Skills** (`.cursor/skills/`): step-by-step execution instructions.

Detailed workflow logic must live in skills, not commands or rules.

## Core Delivery Flow

1. **Draft requirement spec**  
   Command: `/draft-spec "feature description"`  
   Output: `docs/specs/{feature-name}.md`

2. **Create implementation plan**  
   Command: `/plan-impl docs/specs/{feature-name}.md`  
   Output: `.cursor/plans/{feature-name}.plan.md` with task/todo mapping

3. **Implement and validate**  
   Command: `/implement-spec .cursor/plans/{feature-name}.plan.md`  
   Required checks: tests, lint, typecheck, and contract/API validation when applicable

4. **Synchronize contracts (when touched)**  
   Command: `/sync-contracts`  
   Scope: `src/contracts/schemas/`, `docs/api/openapi.yaml`, `docs/api/asyncapi.yaml`

5. **Review quality and traceability gate**  
   Command: `/review` or `/review --spec docs/specs/{feature-name}.md`  
   Output: severity-ordered findings, root cause, remediation location

## Brownfield Discovery Path

For undocumented legacy surfaces, run `/extract-spec` first, then continue with steps 1-5.

## Source-of-Truth Pointers

- Workflow execution details: `.cursor/skills/*/SKILL.md`
- Contract sync policy: `.cursor/rules/contract-enforcement/RULE.md`
- Project standards/context: `.cursor/rules/project-context/RULE.md`
- Traceability constraints: `.cursor/rules/document-traceability/RULE.md`
- Planning anchor: `docs/foundation/roadmap.md`
