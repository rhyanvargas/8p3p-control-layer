---
name: pilot-feedback-intake
description: Run the weekly pilot feedback intake ritual, reconcile in-product feedback with the customer feedback loop spec, and identify roadmap triage items. Use when the user runs /pilot-feedback-intake or asks to process pilot feedback.
disable-model-invocation: true
---

# Pilot Feedback Intake

## Sources

Read these before processing feedback:

1. `docs/specs/customer-feedback-loop.md`
2. `docs/foundation/roadmap.md` § Pilot Feedback Intake and Program Status Ledger
3. `.cursor/plans/pilot-charter-onboarding.plan.md` for active feedback-loop tasks
4. `.cursor/rules/document-traceability/RULE.md` for status ownership

The append-only pilot feedback log is internal-only. Do not create committed named-customer logs unless the user explicitly asks for a public template.

## Instructions

1. Confirm the feedback source: in-product `GET /v1/admin/feedback`, CSAT, decision-level feedback themes, interview notes, or email.
2. Normalize each item to `{date, customer, summary, category, proposed-roadmap-phase, status}`.
3. Use the category and lifecycle values from `docs/specs/customer-feedback-loop.md`; do not invent a second taxonomy.
4. Route `Phase 1` items to Monday roadmap sync and `Phase 2+` items to monthly review.
5. If an item changes committed scope, update the owning spec or plan first, then update the Program Status Ledger only when plan-level status changes.
6. Keep customer-specific details in the internal log. Committed docs may mention the ritual and schema, but must not link into `internal-docs/`.

## Output

Use this shape:

```markdown
## Intake Summary
- Source and date range
- Items processed

## Triage Items
- `{date, customer, summary, category, proposed-roadmap-phase, status}`

## Roadmap Impact
- No change, or exact spec/plan/ledger update required
```
