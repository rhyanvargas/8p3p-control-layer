# Pilot Launch Checklist

Use this checklist immediately before granting a pilot customer access to the Decision Panel and live API. It extends [Deployment Checklist](deployment-checklist.md) § Wave 3.

**Master plan:** [`.cursor/plans/pilot-mvp-launch.plan.md`](../../.cursor/plans/pilot-mvp-launch.plan.md)

---

## Engineering gates (must be complete)

- [ ] `.cursor/plans/learner-summary-api-hygiene-mvp.plan.md` — all tasks `completed`
- [ ] `.cursor/plans/dashboard-summary-migration.plan.md` — all tasks `completed`
- [ ] `npm run check` green on the release commit/tag
- [ ] Deployed stack smoke report on disk: `internal-docs/reports/pilot-smoke-*.md`
- [ ] CloudWatch dashboard + summary-path alarms configured (W3-005)

---

## Security and access

- [ ] `API_KEY` and `API_KEY_ORG_ID` set on the deployment (see [deployment-checklist.md](deployment-checklist.md))
- [ ] `DASHBOARD_ACCESS_CODE` and `COOKIE_SECRET` (≥32 chars) set when serving `/dashboard`
- [ ] Access code shared with customer via **secure channel** (not email)
- [ ] Dashboard build uses `VITE_API_BASE_URL`, `VITE_API_KEY`, `VITE_ORG_ID` for the pilot tenant only
- [ ] Customer data-use / FERPA acknowledgment documented (see `internal-docs/pilot-operations/`)

---

## Functional smoke (deployed)

- [ ] `GET /health` → 200
- [ ] Passphrase login at `/dashboard/login` → four panels render
- [ ] `GET /v1/learners/{ref}/summary?org_id=...` with `x-api-key` returns all five sections
- [ ] Seeded demo learner shows expected educator_summary (e.g. advance → "Ready to move on")
- [ ] No PII keys in summary `current_state.fields` (URS projection)

---

## Operations

- [ ] On-call contact defined for pilot window
- [ ] Rollback path documented (previous CDK artifact; DynamoDB backup/PITR if enabled)
- [ ] API Gateway usage plan throttle understood (20 rps default in CDK)
- [ ] First-week monitoring plan from onboarding runbook scheduled

---

## Sign-off

| Role | Name | Date |
|------|------|------|
| Launch owner | | |
| Engineering | | |

Do not grant customer access until every Engineering gate and Functional smoke item is checked.
