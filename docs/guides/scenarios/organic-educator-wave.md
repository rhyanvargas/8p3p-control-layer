# Organic educator wave (Zoom 50–100)

**Type:** How-to (scenario path) — links only; authority lives in linked docs.

Run an organic educator outreach session on the **hosted** pilot (tier **A** API + tier **C** dashboard). Teachers and compliance/admin staff use **different access codes** and **different demo paths** until persona enforcement ships ([`dashboard-persona-enforcement.plan.md`](../../../.cursor/plans/dashboard-persona-enforcement.plan.md)).

---

## Prerequisites

- Tier **A + C** green per [AWS Pilot Runbook § 4](../operators/aws-pilot-runbook.md#4-post-deploy-smoke-go--no-go) — see [deploy-aws-pilot.md](deploy-aws-pilot.md)
- **Dual access codes** configured (educator + compliance) — spec: [`dashboard-passphrase-gate.md`](../../specs/dashboard-passphrase-gate.md) § Dual access codes (impl: [PE-001](../../../.cursor/plans/dashboard-persona-enforcement.plan.md))
- Zoom host identified; codes distributed out-of-band (not in chat recording)

**Deploy-tier note:** Organic wave **requires** tier A + C; **defers** tier B (live LMS connectors). Upload/ingest path first.

---

## Path

1. [CEO Educator Wave Directives (2026-06-29)](../../reports/2026-06-29-ceo-educator-wave-directives.md) — why two personas and interim dual-code decision
2. [Dashboard design requirements § D5](../../specs/dashboard-design-requirements.md) — normative persona × route map
3. [Dashboard passphrase gate](../../specs/dashboard-passphrase-gate.md) — educator vs compliance codes and route allowlists
4. [Springs Pilot Demo — Two-path demo](../playbooks/springs-pilot-demo.md#two-path-demo-normative-for-hosted-pilot) — educator vs compliance walkthrough (hosted or local)
5. [Organic Educator Wave — Zoom runbook](../playbooks/organic-educator-wave-zoom.md) — host checklist, code distribution, interim mitigations
6. [Customer feedback loop](../../specs/customer-feedback-loop.md) — product feedback affordance; use category `roles_access` for persona confusion signal

---

## Gates / reference

- [Pilot Readiness Gates](../operators/pilot-readiness-gates.md) — organic wave launch gates (persona enforcement or interim mitigations)
- [Pilot Launch Checklist](../operators/pilot-launch-checklist.md) — sign-off before widening access
- [FAQ — teacher vs admin codes](../customers/faq.md) — customer-facing answers
- [Pilot-charter onboarding plan](../../../.cursor/plans/pilot-charter-onboarding.plan.md) — feedback loop (TASK-006+) and demo video (TASK-020) dependencies

---

## Exit criteria

**Authority:** [Zoom runbook § Exit criteria by persona](../playbooks/organic-educator-wave-zoom.md#exit-criteria-by-persona). Check off there for host sign-off; summary below.

### Educator (educator access code only)

Educators use the **educator passphrase** — not the compliance code. They do **not** receive signal-upload or audit-export capabilities in this wave.

- [ ] Logs in with **educator** passphrase; lands on Overview
- [ ] Reviews Attention queue and at least one learner **Struggles & progress** tab (not State/Trajectory)
- [ ] Completes Approve/Reject on one decision from Attention or learner view
- [ ] Submits product feedback when the app-shell affordance is available (optional but encouraged)

### Compliance / admin (compliance access code only)

District IT, data privacy, and admin observers use the **compliance passphrase** — separate browser profile or tab. Signal upload and audit export are **compliance-only** in this wave.

- [ ] Logs in with **compliance** passphrase (never shared with classroom educators in the main session)
- [ ] Opens Decisions stream, drills into trace, exports JSON
- [ ] Optional: signal upload wizard (`/signals`) and `/reports` export when enabled

### Session (host)

- [ ] Host followed [two-path demo](../playbooks/springs-pilot-demo.md#two-path-demo-normative-for-hosted-pilot) on the main educator screen — never `/decisions`, `/signals`, `/reports`, or State/Trajectory tabs
- [ ] Attendees were **not** told that educators can upload signals unless they hold the compliance code

---

*Created: 2026-06-29 | Plan: `.cursor/plans/ceo_educator_wave_docs_5f6ef773.plan.md` TASK-003*
