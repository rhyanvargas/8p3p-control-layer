---
name: Educator Policy Builder
overview: "P1 scaffold: compliance-gated dashboard policy builder + POST /v1/admin/policies/generate orchestration via external Policy Generation Service. MVP-1 requires compliance persona; MVP-2 per-teacher overlay blocked on Phase 2 auth. Not promoted to P0."
todos:
  - id: EPB-001
    content: "Add POST /v1/admin/policies/generate handler — HTTP delegate to PGS + validatePolicyStructure gate"
    status: pending
  - id: EPB-002
    content: "Deploy Policy Generation Service (separate stack/repo) with POST /generate + Bedrock path"
    status: pending
  - id: EPB-003
    content: "OpenAPI + contract tests PGS-001..005 and admin generate endpoint"
    status: pending
  - id: EPB-004
    content: "Dashboard /policies/builder route — compliance persona nav + middleware guard (depends on PE-003)"
    status: pending
  - id: EPB-005
    content: "Builder UI — NL input, draft JsonViewer, validate + commit PUT flow"
    status: pending
  - id: EPB-006
    content: "Wire admin proxy for generate/validate/PUT — server-side x-admin-api-key only"
    status: pending
  - id: EPB-007
    content: "E2E smoke — compliance login → generate draft → validate → commit (staging org)"
    status: pending
  - id: EPB-008
    content: "Runbook note — PGS env vars + compliance-only code distribution in aws-pilot-runbook"
    status: pending
isProject: false
---

# Educator Policy Builder

**Specs:**
- [`docs/specs/educator-policy-builder.md`](../../docs/specs/educator-policy-builder.md) (MVP-1 compliance-only writes; MVP-2 open questions)
- [`docs/specs/policy-generation-service.md`](../../docs/specs/policy-generation-service.md) (external LLM service)
- [`docs/specs/policy-management-api.md`](../../docs/specs/policy-management-api.md) (validate + PUT)

**Persona dependency:** [`dashboard-persona-enforcement.plan.md`](dashboard-persona-enforcement.plan.md) PE-003 (compliance route allowlist) before EPB-004 ships to production educators.

**Role model (D5 — normative):**

- **MVP-1:** Policy writes require **compliance persona** (compliance access code + server-side `x-admin-api-key`). Educators triage decisions only — no policy UI.
- **MVP-2:** Per-teacher policy overlay requires **auth beyond dual passphrase** (Cognito/per-user identity). Open questions: identity binding, merge semantics, teacher-scoped write model — see spec § MVP-2.

---

## Non-goals

- **P0 promotion** — organic educator wave (Zoom 50–100) does not require policy self-service
- **Backend RBAC** beyond existing `x-admin-api-key` + dashboard persona gating
- **MVP-2 per-teacher overlay** — requires Cognito/per-user auth (Phase 2)
- **Embedded LLM in control-layer Lambda** — all generation via PGS HTTP

---

## MVP-1 sequencing

```
EPB-002 (PGS deploy)
     ↓
EPB-001 + EPB-003 (API generate + tests)
     ↓
PE-003 persona route guards (parallel track)
     ↓
EPB-004..EPB-006 (dashboard builder)
     ↓
EPB-007 + EPB-008 (E2E + runbook)
```

---

## Role model (from D5)

| MVP | Who writes policies | Auth |
|-----|---------------------|------|
| MVP-1 | Compliance/admin code holders + 8P3P operator | Dual passphrase (compliance) + admin API key server-side |
| MVP-2 | Individual teachers (overlay) | **Pending** — auth beyond dual passphrase; see educator-policy-builder.md § MVP-2 |

---

## Ledger

| Plan | Group | Status |
|------|-------|--------|
| `educator-policy-builder.plan.md` | Staged (backlog) | 0/8 — EPB-001 after PGS deploy |

Persona enforcement track: [`dashboard-persona-enforcement.plan.md`](dashboard-persona-enforcement.plan.md) is **Active** (PE-001). Roadmap ledger updated in ceo_educator_wave TASK-015 close-out.

---

*Created: 2026-06-29 | Parent: `.cursor/plans/ceo_educator_wave_docs_5f6ef773.plan.md` TASK-009*
