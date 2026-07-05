# Pilot Demo Video — Capture Checklist

**Audience:** GTM, CS, solutions, leadership  
**Purpose:** Record shareable demo videos against the **hosted** pilot dashboard (tier **C**) for board/principal review and Southwest charter stakeholders.  
**Plan anchor:** [`.cursor/plans/pilot-charter-onboarding.plan.md`](../../.cursor/plans/pilot-charter-onboarding.plan.md) TASK-020  
**Narrative authority:** [Springs Pilot Demo — Two-path demo](playbooks/springs-pilot-demo.md#two-path-demo-normative-for-hosted-pilot)

> **Not a code deliverable.** Output is MP4 or hosted links stored in the pilot vault (not git). Unblocks board/principal review per charter onboarding meeting action items.

---

## Prerequisites

Complete before recording:

- [ ] **Hosted env live** — Amplify dashboard URL + CDK API URL in vault per [AWS Pilot Runbook § 0](operators/aws-pilot-runbook.md#0-pre-flight-local-before-any-aws-spend) pilot environment record (TASK-004)
- [ ] **Smoke green** — [AWS Pilot Runbook § 4.2](operators/aws-pilot-runbook.md#42-dashboard-gate) dashboard gate passes (login, Attention, upload, Approve/Reject, Send feedback)
- [ ] **Demo data present** — customer upload or seed via [§ 4.3](operators/aws-pilot-runbook.md#43-seed-demo-data-optional); empty Attention queue kills the narrative
- [ ] **AI explanations ON** — pilot Lambda `AI_EXPLANATIONS_ENABLED=true`; Panels 2 & 3 show plain-language copy (TASK-005)
- [ ] **Persona gate satisfied** — **either** [dashboard persona enforcement PE-001–PE-006](../../.cursor/plans/dashboard-persona-enforcement.plan.md) shipped **or** interim: dual educator/compliance passphrases + host enforces [two-path demo](playbooks/springs-pilot-demo.md#two-path-demo-normative-for-hosted-pilot) manually
- [ ] **Passphrases out of frame** — never type access codes on camera; pre-login in a clean browser profile
- [ ] **Recording setup** — 1920×1080 minimum, system audio off (narrate live or dub), hide bookmarks/extensions, disable OS notifications

**URLs (from vault — do not commit):**

| Surface | Template |
|---------|----------|
| Dashboard | `https://<amplify-host>/login` |
| API (admin curl only) | `https://<api-id>.execute-api.<region>.amazonaws.com/pilot` |

---

## Deliverables

Record **two videos** (or one combined ~20 min with chapter markers):

| Video | Target length | Audience | Primary goal |
|-------|---------------|----------|--------------|
| **A — Product overview** | ~5 min | Superintendent, principal, teacher coaches | "Who needs help, where is the gap, did we act on it?" |
| **B — Admin / backend trust** | ~12–15 min | IT director, compliance, CS/engineering | Upload, preflight, policies, audit trail, feedback triage |

Store finished files + share links in vault under `pilot-demo-videos/` with date stamp. Share educator-facing cut (Video A) with Southwest teachers/principal; keep Video B internal unless IT asks.

---

## Video A — Product overview (~5 min)

**Login:** Educator access code (or single passphrase if persona enforcement not yet shipped — stay on educator path only).

**Opening line (15 s):**

> "Your district runs multiple systems. This dashboard shows who needs attention, which skill is gaping, and whether support worked — in under a minute per student."

### Beat checklist

| # | Route | Action | Say (short) |
|---|-------|--------|-------------|
| 1 | `/login` → `/` | Enter passphrase; land on Overview | One landing page — counts from the same policy engine as production |
| 2 | `/` | Point at KPI cards (learners needing attention, pending decisions) | Program-level visibility without another data warehouse |
| 3 | `/attention` | Open one high-urgency row (intervene); show problem area / skill gap text | Cross-system gaps — **where**, not just how low |
| 4 | `/attention` | Approve or Reject from review sheet; show toast | Educator confirms high-stakes calls; reasons persist |
| 5 | `/learners/[ref]` | **Struggles & progress** tab — plain-language gap narrative | Confidence in **learning**, not a black-box grade |
| 6 | App shell | Open **Send feedback** → submit idea or problem → success toast | Product feedback anytime — we triage into roadmap |

**Never show on Video A (educator path):** `/decisions`, `/signals`, `/reports`, Learner **State** / **Trajectory** tabs.

**Optional 30 s cut if over time:** Skip Send feedback beat; keep Attention + Struggles.

---

## Video B — Admin / backend trust (~12–15 min)

**Login:** Compliance access code (separate browser profile from Video A).

### Beat checklist

| # | Surface | Action | Say (short) |
|---|---------|--------|-------------|
| 1 | `/signals/upload` | Walk upload wizard: file select → field mapping preview → preflight results → commit | Customer or 8P3P can ingest without custom ETL per vendor |
| 2 | `/attention` | Confirm new decisions appeared after upload | Signals → policy engine → actionable queue |
| 3 | `/decisions` | Open intervene row → L1 trace sheet → **Export JSON** | Receipt-backed — rule id, thresholds, frozen state |
| 4 | `/signals` | Show ingestion log (recent rows) | Audit trail for IT — what landed when |
| 5 | API (terminal, off-screen prep) | `GET /v1/admin/feedback` — show row from Video A Send feedback | Product signal reaches CS triage without PII in message body |
| 6 | API or Settings | Mention policies at `policies/<org_id>/` — thresholds tuned at onboarding | Policy is config, not a rewrite — TEKS/STAAR is same pattern if contract closes ([`pilot-data-requirements.md`](pilot-data-requirements.md) § TEKS) |
| 7 | Optional | `POST /v1/admin/ingestion/preflight` on sample CSV (curl) | IT can validate a raw export before first production upload |

### Admin curl reference (record terminal separately or B-roll)

```bash
export API_URL="https://<api-id>.execute-api.us-east-1.amazonaws.com/pilot"
export ADMIN_API_KEY="<from-vault>"
export ORG_ID="southwest-charter"

# Product feedback triage (row from Send feedback in Video A)
curl -sS "${API_URL}/v1/admin/feedback?org_id=${ORG_ID}&limit=10" \
  -H "x-admin-api-key: ${ADMIN_API_KEY}" | jq .

# Optional: preflight dry-run on customer sample
curl -sS -X POST "${API_URL}/v1/admin/ingestion/preflight?org_id=${ORG_ID}" \
  -H "content-type: application/json" \
  -H "x-admin-api-key: ${ADMIN_API_KEY}" \
  -d @sample-export.json | jq .
```

Full hosted dry-run: `npm run pilot:dry-run` — [AWS Pilot Runbook § 4.2](operators/aws-pilot-runbook.md#42-dashboard-gate).

---

## Pre-recording rehearsal (15 min)

- [ ] Run Video A beats end-to-end on hosted URL — target ≤ 6 min with narration
- [ ] Run Video B beats — confirm upload wizard has a clean sample file ready
- [ ] Verify at least one learner shows AI explanation text in Struggles tab (not null/template-only)
- [ ] Confirm Send feedback returns 201 (`dashboard/e2e/product-feedback.spec.ts` green locally)
- [ ] If using interim two-path script: rehearse host handoff ("now I'll switch to the compliance view IT would use")

---

## Post-recording

- [ ] Export MP4 (H.264); name `pilot-demo-educator-YYYY-MM-DD.mp4` and `pilot-demo-admin-YYYY-MM-DD.mp4`
- [ ] Upload to vault; add share links to onboarding ticket
- [ ] Send educator cut to charter stakeholders; note TEKS/STAAR is **not shown** — Phase 2+ if deal closes
- [ ] Log any product feedback themes surfaced during recording in `internal-docs/reports/pilot-feedback-log.md` ([schema](pilot-feedback-log-schema.md))

---

## Verification (TASK-020 exit criteria)

- [ ] Video A covers: login, Overview KPIs, Attention triage, learner gaps, Approve/Reject, Send feedback
- [ ] Video B covers: upload wizard, preflight, policies mention, admin feedback GET
- [ ] Recorded against hosted dashboard URL (not localhost)
- [ ] MP4/links stored in vault and shareable with Southwest teachers/principal

---

## Related

- [Springs Pilot Demo](playbooks/springs-pilot-demo.md) — full narrative script (local or hosted)
- [Organic Educator Wave — Zoom runbook](playbooks/organic-educator-wave-zoom.md) — live session host checklist
- [Pilot Launch Checklist](operators/pilot-launch-checklist.md) — engineering gates before widening access
- [Customer feedback loop](../specs/customer-feedback-loop.md) — Send feedback spec

*Created: 2026-07-04 | Plan: pilot-charter-onboarding TASK-020*
