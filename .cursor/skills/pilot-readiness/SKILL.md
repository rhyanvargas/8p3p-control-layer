---
name: pilot-readiness
description: Evaluate hosted charter pilot readiness using committed gate criteria, AWS/Amplify runbooks, and the active pilot plan. Use when the user runs /pilot-readiness or asks whether a pilot/customer environment is ready to onboard.
disable-model-invocation: true
---

# Pilot Readiness

## Sources

Read these before making a readiness call:

1. `docs/guides/pilot-readiness-gates.md`
2. `.cursor/plans/pilot-charter-onboarding.plan.md` unless the user supplies a different plan
3. `docs/guides/aws-pilot-runbook.md` for the AWS CDK + Amplify path
4. `docs/guides/pilot-host-deployment.md` only when evaluating a fallback host
5. `.cursor/rules/document-traceability/RULE.md` for Program Status Ledger updates

If the task involves AWS service behavior, consult the configured AWS documentation or IaC MCP server before recommending infrastructure changes.

## Instructions

1. Identify the pilot track: hosted charter pilot, controlled evaluation, or fallback host.
2. Apply the deploy-tier vocabulary from `docs/foundation/roadmap.md`: tier A is AWS backend, tier B is live LMS integration, tier C is dashboard hosting.
3. Read the active plan frontmatter `todos` and the Program Status Ledger row. Treat plan task state as the task-level source of truth and the ledger as the plan-level source of truth.
4. Evaluate gates from `docs/guides/pilot-readiness-gates.md` in these groups: 8P3P infrastructure, policy/configuration, integration path, Decision Panel proof surface, documentation readiness, and customer readiness.
5. Report one of: `Ready`, `Conditionally ready`, or `Blocked`.
6. For every blocker, name the owning file or runbook, the evidence missing, and the next task or command.
7. If readiness status changes a plan threshold, update `docs/foundation/roadmap.md` in the same change set per `document-traceability`.

## Output

Use this shape:

```markdown
## Readiness
Status: Ready | Conditionally ready | Blocked

## Evidence
- Gate: result, source path, proof observed or missing

## Blockers
- Owner / next action

## Ledger Impact
- No change, or exact roadmap/plan update required
```
