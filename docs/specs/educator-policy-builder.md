# Educator Policy Builder

> Dashboard surface for drafting and committing `PolicyDefinition` JSON from natural-language requirements. **MVP-1 is compliance-persona only** — policy writes require the compliance access code and server-side admin API key; educators triage decisions but do not author rules in the interim pilot.

## Overview

Today, operators tune policies via `PUT /v1/admin/policies/:org_id/:policy_key` ([`policy-management-api.md`](policy-management-api.md)) using hand-written JSON or CLI scripts. School administrators often describe intervention logic in plain language ("flag when stability drops below 40% for two signals") but cannot safely translate that into valid rule JSON.

The Educator Policy Builder adds a **guided draft → validate → commit** flow in the dashboard:

1. Operator or compliance admin enters a natural-language policy requirement.
2. The control-layer API delegates generation to the external [**Policy Generation Service**](policy-generation-service.md) (LLM-backed, decoupled).
3. The API validates the draft via `POST /v1/admin/policies/validate` before returning it.
4. The compliance user reviews the draft, edits if needed, and explicitly commits via `PUT /v1/admin/policies/:org_id/:policy_key`.

**What this is:** A compliance-gated dashboard workflow + admin API orchestration for AI-assisted policy drafting.

**What this is not:** Per-teacher self-service policy overlay (MVP-2), backend RBAC beyond persona gating, or embedded LLM calls inside the control-layer engine.

---

## Persona & auth dependencies (D5)

Policy builder UI and write paths depend on the **D5 persona model** ([`dashboard-design-requirements.md`](dashboard-design-requirements.md) §2.2) and **dual-passphrase gate** ([`dashboard-passphrase-gate.md`](dashboard-passphrase-gate.md) § Dual access codes):

| Capability | Educator code | Compliance code | Notes |
|------------|:-------------:|:---------------:|-------|
| View active policies (read-only summary) | No (MVP-1) | Yes | Optional MVP-1.1 — not required for organic wave |
| Generate policy draft (NL → JSON) | **No** | **Yes** | MVP-1 write surface |
| Validate draft | **No** | **Yes** | Server-side only |
| Commit policy (`PUT`) | **No** | **Yes** | Requires `x-admin-api-key` on API; dashboard proxy only for compliance sessions |

**Interim pilot:** Until persona middleware ships ([`dashboard-persona-enforcement.plan.md`](../../.cursor/plans/dashboard-persona-enforcement.plan.md) PE-001–PE-003), distribute the **compliance code only** to operators who may run policy builder — never share it in educator Zoom sessions.

---

## MVP scope

### MVP-1 — Compliance-only policy authoring (P1)

**User:** 8P3P operator or school compliance/admin staff with compliance access code.

**Flow:**

```
Compliance login → /policies/builder (proposed route)
  → Enter description + org_id + policy_key
  → POST /v1/admin/policies/generate (admin key, server-side)
       → Policy Generation Service (HTTP)
  → Review draft JSON + confidence + clarification prompts
  → POST /v1/admin/policies/validate
  → PUT /v1/admin/policies/:org_id/:policy_key (explicit commit)
```

**Requirements:**

- [ ] Route `/policies/builder` (or equivalent) visible only on **compliance persona** nav allowlist.
- [ ] `POST /v1/admin/policies/generate` accepts `{ "description": string, "org_id"?: string, "policy_key"?: string }`; returns `{ policy, confidence, clarification_needed[] }` per [`policy-generation-service.md`](policy-generation-service.md).
- [ ] Generated policy **must** pass `validatePolicyStructure` before the API returns success; otherwise `policy_generation_failed` with human-readable explanation.
- [ ] No auto-commit — operator must confirm `PUT`.
- [ ] All endpoints require `x-admin-api-key`; dashboard never exposes admin key to browser (proxy pattern unchanged).

**Non-goals (MVP-1):**

- Educator-visible policy UI
- Per-teacher rule overlays
- Version diff / rollback UI (use admin API + runbook)
- In-dashboard rule simulation against live learner state

### MVP-2 — Per-teacher policy overlay (future)

**User:** Individual teacher adjusts thresholds or adds classroom-specific rules on top of org baseline.

**Blockers (open questions):**

| Question | Why it blocks MVP-2 |
|----------|----------------------|
| Identity beyond dual passphrase | Dual codes are shared secrets — no per-teacher audit or scoping |
| Cognito/SSO timeline | Phase 2 auth replaces codes; overlay must bind to user id |
| Policy merge semantics | How teacher overlay composes with org `learner.json` without fork drift |
| Backend RBAC | `PUT /v1/admin/policies/*` is org-scoped admin today — needs teacher-scoped write model or namespaced policy keys |

**Status:** **Pending** — flag in product backlog; do not schedule until Phase 2 auth decision lands. See [`2026-06-29-ceo-educator-wave-directives.md`](../reports/2026-06-29-ceo-educator-wave-directives.md) §5.

---

## API surface (control layer)

New admin endpoint on the existing policy management API (extends [`policy-management-api.md`](policy-management-api.md)):

### `POST /v1/admin/policies/generate`

| Header | Required | Description |
|--------|----------|-------------|
| `x-admin-api-key` | Yes | Admin API key |

**Request body:**

```json
{
  "description": "Flag a student for intervention when stability has been declining for two consecutive signals and falls below 40%.",
  "org_id": "southwest-charter",
  "policy_key": "learner"
}
```

**Response (200):**

```json
{
  "policy": { "policy_id": "...", "rules": [ "..."] },
  "confidence": 0.82,
  "clarification_needed": []
}
```

**Errors:**

| Code | When |
|------|------|
| `policy_generation_failed` | LLM service exhausted retries or output failed validation |
| `policy_generation_unavailable` | Generation service unreachable |
| `validation_error` | Malformed request body |

Implementation delegates HTTP to Policy Generation Service; see [`policy-generation-service.md`](policy-generation-service.md) and backlog [`US-POLICY-BUILDER-001`](../backlog/user-stories-v1.2.md).

---

## Dashboard UX (normative sketch)

Compliance-only nav item **Policies → Build** (exact label TBD at impl):

| Section | Contents |
|---------|----------|
| Description | Multiline NL input; character limit 4000 |
| Target | `org_id` + `policy_key` selectors (pilot: single org pre-filled) |
| Generate | Primary CTA → loading state → draft panel |
| Draft review | Syntax-highlighted JSON (`JsonViewer`); confidence badge; clarification prompts as inline alerts |
| Actions | **Validate** (secondary), **Commit policy** (primary, confirm dialog) |

Educator persona: route **not in nav**; middleware redirect if URL guessed (PE-003 pattern).

---

## Dependencies

| Dependency | Document | Status |
|------------|----------|--------|
| Policy validate + PUT | [`policy-management-api.md`](policy-management-api.md) | Shipped |
| External LLM generation | [`policy-generation-service.md`](policy-generation-service.md) | Spec'd (this plan TASK-008) |
| Compliance persona gating | [`dashboard-design-requirements.md`](dashboard-design-requirements.md) §2.2 D5 | **Normative** (2026-06-29) |
| Dual-passphrase auth | [`dashboard-passphrase-gate.md`](dashboard-passphrase-gate.md) § Dual access codes | **Normative** (2026-06-29) |
| Persona middleware impl | [`dashboard-persona-enforcement.plan.md`](../../.cursor/plans/dashboard-persona-enforcement.plan.md) | **Active** — PE-001 dual-code login |

---

## Customer feedback taxonomy

Policy-builder confusion or threshold requests may arrive via product feedback category `policy_config` ([`customer-feedback-loop.md`](customer-feedback-loop.md)). Role/access confusion uses `roles_access`.

---

## Out of scope

| Item | Rationale |
|------|-----------|
| P0 promotion for organic wave | Zoom 50–100 does not require policy self-service |
| LLM inside control-layer Lambda | Vendor neutrality; see generation service spec |
| Educator policy writes in MVP-1 | CEO directive: teachers see classroom-relevant data, not rule authoring |
| Cognito user binding | Phase 2 |

---

## Implementation plan

Companion scaffold: [`.cursor/plans/educator-policy-builder.plan.md`](../../.cursor/plans/educator-policy-builder.plan.md) (P1, all tasks pending).

---

*Spec created: 2026-06-29 | Plan: `.cursor/plans/ceo_educator_wave_docs_5f6ef773.plan.md` TASK-007, TASK-020*
