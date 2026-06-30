# Organic Educator Wave — Zoom Runbook

**Audience:** Host (8P3P CS/solutions), co-host (engineering standby)  
**Scale:** 50–100 educators + optional compliance observers  
**Duration:** 45–60 minutes (30 min demo + Q&A)  
**Prerequisites:** Hosted pilot tier **A** (API) + tier **C** (Amplify dashboard) green per [AWS Pilot Runbook § 4](../operators/aws-pilot-runbook.md#4-post-deploy-smoke-go--no-go)

> **Scenario path:** [`../scenarios/organic-educator-wave.md`](../scenarios/organic-educator-wave.md) — thin router linking this runbook, persona specs, and exit criteria.

---

## Deploy-tier vocabulary

| Tier | Required for this session? |
|------|----------------------------|
| **A** — CDK API (Lambda + API Gateway + DynamoDB) | **Yes** |
| **C** — Amplify-hosted dashboard | **Yes** |
| **B** — Live LMS connectors | **No** — upload/ingest path only |
| **Persona gating** (middleware allowlists) | **Preferred** — interim mitigations below if not shipped |

---

## Pre-session checklist (host)

### Infrastructure (T-24h)

- [ ] [AWS Pilot Runbook § 4](../operators/aws-pilot-runbook.md#4-post-deploy-smoke-go--no-go) smoke green on production pilot URL
- [ ] Dashboard loads; single legacy code **or** dual codes configured (see [Dual-code distribution](#dual-code-distribution))
- [ ] Springs or customer org has seed/decisions visible in Attention queue
- [ ] AI explanations enabled if demoing plain-language *why* ([`ai-educator-explanations.md`](../../specs/ai-educator-explanations.md))
- [ ] Engineering on standby for API/dashboard incidents (Slack channel named in host brief)

### Access codes (T-48h)

- [ ] **Educator code** generated — human-memorable, e.g. `district-educators-2026`
- [ ] **Compliance code** generated — distinct from educator code; for IT/admin observers only
- [ ] Codes stored in vault; **not** in Zoom chat, recording, or shared slides
- [ ] IT contact at district briefed on code distribution method (email, LMS announcement, etc.)

### Demo script (T-24h)

- [ ] Host rehearsed [Two-path demo](../playbooks/springs-pilot-demo.md#two-path-demo-normative-for-hosted-pilot) — **educator path only** for main session
- [ ] Compliance path reserved for optional IT breakout or follow-up
- [ ] Persona quick-reference slide: educators never guided to `/decisions`, `/signals`, `/reports`, State/Trajectory tabs

### Zoom logistics (T-1h)

- [ ] Registration cap aligned with capacity (50–100)
- [ ] Co-host assigned (chat moderation, breakout if needed)
- [ ] Screen share: 1920×1080, browser zoom 100%, hide bookmarks bar
- [ ] Two browser profiles ready: **Profile A** = educator code, **Profile B** = compliance code
- [ ] Backup: local Springs demo ([`springs-pilot-demo.md`](../playbooks/springs-pilot-demo.md) setup) if hosted URL fails

---

## Dual-code distribution

| Code | Env var (when persona plan ships) | Who receives it | Session use |
|------|-----------------------------------|-----------------|-------------|
| Educator | `DASHBOARD_ACCESS_CODE_EDUCATOR` | Teachers, coaches, principals in main Zoom | Main demo path |
| Compliance | `DASHBOARD_ACCESS_CODE_COMPLIANCE` | District IT, data privacy, admin observers | Optional audit breakout |

**Distribution method (normative):**

1. Host sends educator code via district IT **24h before** session (email/LMS — not Zoom chat).
2. Compliance code to named IT/admin contacts only.
3. During Zoom: say *"Use the code your IT admin sent"* — never read codes aloud on recording.

**Legacy single code:** If only `DASHBOARD_ACCESS_CODE` is set, **all attendees see full nav**. Host MUST enforce [two-path script](../playbooks/springs-pilot-demo.md#two-path-demo-normative-for-hosted-pilot) manually — never navigate to compliance routes on shared screen.

Spec: [`dashboard-passphrase-gate.md`](../../specs/dashboard-passphrase-gate.md) § Dual access codes.

---

## Session agenda

| Time | Segment | Host actions |
|------|---------|--------------|
| 0:00–0:05 | Welcome + problem frame | Use opening from [Springs demo](../playbooks/springs-pilot-demo.md#what-problem-this-demo-solves-open-with-this) |
| 0:05–0:10 | Login | Attendees log in with **educator code** on own devices (optional) or watch host screen |
| 0:10–0:25 | **Educator path demo** | `/` → `/attention` → `/learners/[ref]` Struggles & progress → Approve/Reject |
| 0:25–0:35 | Q&A | Encourage product feedback ([`customer-feedback-loop.md`](../../specs/customer-feedback-loop.md)); category `roles_access` if persona confusion |
| 0:35–0:45 | Optional IT breakout | Compliance code holders: `/decisions` → trace → Export JSON |
| 0:45–0:60 | Wrap + next steps | Link FAQ when available; charter pilot follow-up |

**Never on main educator screen:** `/decisions`, `/signals`, `/reports`, Learner State/Trajectory tabs, rule ids at L0.

---

## Known limitations

| Limitation | Impact | Workaround |
|------------|--------|------------|
| **No per-teacher policy self-service** | Educators cannot edit org policy rules in the dashboard | Policy changes go through compliance/admin + engineering; see [`educator-policy-builder.md`](../../specs/educator-policy-builder.md) (P1 scaffold) |
| **Persona gating not yet enforced in UI** (until PE-001–PE-006 ship) | Educator code may still show full sidebar if only legacy `DASHBOARD_ACCESS_CODE` is set | Distribute **two distinct codes** anyway; host **never** demos compliance routes on the shared educator screen; follow [two-path script](../playbooks/springs-pilot-demo.md#two-path-demo-normative-for-hosted-pilot) |
| **No Cognito / SSO** (Phase 2) | Passphrase codes are shared secrets, not per-user identity | Rotate codes if leaked; compliance code limited to named IT contacts |
| **Signal upload is compliance-only** | Classroom educators in the main Zoom should not upload files | Reserve `/signals` for compliance breakout or IT follow-up — do not imply educators can upload in the main session |

When persona enforcement ships ([`dashboard-persona-enforcement.plan.md`](../../../.cursor/plans/dashboard-persona-enforcement.plan.md)), educator sessions will be route-gated automatically; until then, **dual codes + two-path script** are the required interim mitigation.

---

## Interim mitigations (persona plan not shipped)

When [`dashboard-persona-enforcement.plan.md`](../../../.cursor/plans/dashboard-persona-enforcement.plan.md) PE-001–PE-006 are **not** yet deployed:

| Risk | Mitigation |
|------|------------|
| Educator code still shows full sidebar (legacy single code) | Distribute **two codes** anyway; tell educators which code to use; host never demos compliance routes on shared screen |
| Attendee navigates to `/decisions` via URL | Accept for pilot; remind FERPA — compliance code is for admin staff only; log feedback as `roles_access` |
| Wrong code shared in chat | Rotate compliance code post-session; document in vault |

**GTM gate:** [`pilot-charter-onboarding.plan.md`](../../../.cursor/plans/pilot-charter-onboarding.plan.md) TASK-020 demo video requires persona plan PE-001–006 **or** documented two-path-script-only interim — this runbook satisfies the latter.

---

## Exit criteria (by persona)

Use this section for host sign-off. Scenario path summary: [`../scenarios/organic-educator-wave.md`](../scenarios/organic-educator-wave.md#exit-criteria).

### Educator (educator access code only)

Educators authenticate with the **educator passphrase** distributed to teachers and coaches. They do **not** use the compliance code or upload signals in the main session.

- [ ] Logged in with **educator** passphrase; lands on Overview
- [ ] Viewed Attention queue and at least one learner **Struggles & progress** tab (not State/Trajectory)
- [ ] Completed Approve/Reject on one decision (host demo or attendee try-it)
- [ ] Knows how to send product feedback (app shell affordance when shipped)

### Compliance / admin (compliance access code only)

IT, data privacy, and admin staff authenticate with the **compliance passphrase** — separate browser profile or optional breakout. Signal upload and audit export are **compliance-only**.

- [ ] Logged in with **compliance** passphrase (not shared with main-session educators)
- [ ] Opened Decisions stream, drilled into trace, exported JSON
- [ ] Optional: signal upload wizard (`/signals`) and `/reports` export when enabled

### Session (host sign-off)

- [ ] Tier A + C remained healthy through session
- [ ] [Two-path script](../playbooks/springs-pilot-demo.md#two-path-demo-normative-for-hosted-pilot) followed on main screen — educators never guided to audit/upload routes
- [ ] Attendees were **not** told educators can upload signals unless they hold the compliance code
- [ ] Attendee questions captured (feedback API or host notes); tag `roles_access` if persona confusion

---

## Post-session

- [ ] Debrief with engineering — incidents, latency, confusion themes
- [ ] Tag product feedback `roles_access` / `learning_gaps` / `policy_config` as appropriate
- [ ] Update pilot feedback log per [`customer-feedback-loop.md`](../../specs/customer-feedback-loop.md)
- [ ] If compliance code leaked: rotate code + `COOKIE_SECRET` if needed ([`dashboard-passphrase-gate.md`](../../specs/dashboard-passphrase-gate.md) § Key Lifecycle)

---

## Related gates

- [Pilot Readiness Gates](../operators/pilot-readiness-gates.md) — organic wave launch (persona enforcement or interim mitigations)
- [Pilot Launch Checklist](../operators/pilot-launch-checklist.md) — sign-off before widening access
- [CEO Educator Wave Directives (2026-06-29)](../../reports/2026-06-29-ceo-educator-wave-directives.md) — persona IA provenance

---

*Created: 2026-06-29 | Plan: `.cursor/plans/ceo_educator_wave_docs_5f6ef773.plan.md` TASK-010*
