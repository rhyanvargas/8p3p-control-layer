# Customer Feedback Loop

> A holistic, product-level customer feedback system for the pilot dashboard: an always-on in-product feedback affordance plus a transactional CSAT microsurvey, unified with the existing decision-level feedback and the manual pilot-feedback-log into one closed-loop triage taxonomy. This is the **product-feedback** layer; it is distinct from (and complements) `docs/specs/educator-feedback-api.md`, which captures *per-decision* Approve/Reject/Ignore.

## Overview

The control layer already captures **decision-level** feedback — educator Approve/Reject/Ignore on each surfaced decision (`docs/specs/educator-feedback-api.md`, implemented in `src/feedback/`; dashboard write path wired via [`attention-review-ux.md`](attention-review-ux.md) Phases 1–3, 2026-06-25). It does **not** capture **product-level** feedback: how the customer feels about the product, problems they hit, features they want, or praise — the signal a continuous-discovery loop runs on (`.agents/skills/inspired-product/SKILL.md` §6 "ship, measure, learn, adjust").

Two gaps motivate this spec:

1. **The "gives feedback at any time" principle is unbacked for product signal.** [`docs/foundation/roadmap.md`](../foundation/roadmap.md) §Current Direction states the dashboard is "the customer-facing portal… where the pilot customer admin views decisions/data, **gives feedback at any time**." Per-decision Approve/Reject/Ignore is wired (`attention-review-ux.md`), but there is no always-on, non-decision-scoped product-feedback affordance.
2. **The closed-loop ritual is documented but not instantiated.** `roadmap.md` §"Pilot Feedback Intake" defines a CS-mediated loop that appends to `internal-docs/reports/pilot-feedback-log.md`, but that log file does not exist yet, and no in-product source feeds it.

This spec adds:

1. A **product-feedback write endpoint** — `POST /v1/feedback` (type + message + page context; not tied to a `decision_id`).
2. A **transactional CSAT microsurvey** — `POST /v1/feedback/csat` (single 1–5 satisfaction question fired after a key task, frequency-capped).
3. An **admin read/triage surface** — `GET /v1/admin/feedback` (list + filter for the CS lead to triage into the pilot-feedback-log).
4. An **always-on in-product UX** — a dismissible "Send feedback" affordance in the dashboard app shell, plus the post-task CSAT prompt, both built to UX best practices (low friction, throttled, accessible, never block a critical task).
5. A **closed-loop taxonomy** — one status lifecycle and category set that unifies product-feedback, decision-level feedback, and out-of-product (interview/email) items in `pilot-feedback-log.md`.

All writes are **append-only**, mirroring the signal log and `decision_feedback` immutability.

## Best-Practice Grounding (cited)

| Decision | Source | Rationale |
|----------|--------|-----------|
| **CSAT (1–5), not NPS** | `.agents/skills/designing-surveys/SKILL.md` §"NPS is scientifically flawed" | "CSAT… has better data properties, it is more precise, it is more correlated to business outcomes." We do not collect NPS. |
| **One variable per question** | designing-surveys §"Avoid double-barreled questions" | The CSAT prompt asks satisfaction only; the optional comment is free-text, not a second scored axis. |
| **Force prioritization for feature asks** | designing-surveys §"Force prioritization with constraints" | When a customer submits multiple ideas, the triage taxonomy caps `proposed-roadmap-phase` to a single phase per item; MaxDiff/ranking is deferred (Out of Scope). |
| **Right respondent, right time (3–6 mo)** | designing-surveys §"Survey your best customers at the right time" | The periodic relational survey (deferred) targets customers 3–6 months in; the controlled-eval pilot is too early for it, so P0 ships only always-on + transactional capture. |
| **Closed loop / instrument every release** | `.agents/skills/inspired-product/SKILL.md` §1, §6 | Triage lifecycle ends in `shipped`→`closed` (tell the customer); every in-product source is instrumented to feed discovery. |
| **Low-friction, dismissible, throttled, a11y UX** | `.agents/skills/frontend-design/SKILL.md`; `.agents/skills/vercel-react-best-practices` §4.4, §5.13, §6.5 | Feedback must never interrupt a critical task; surveys are frequency-capped; persistence is versioned + SSR-safe. |

## Goals / Non-Goals

**Goals**
- Give the pilot customer a way to send product feedback *at any time*, from anywhere in the dashboard.
- Capture one transactional satisfaction signal (CSAT) at a meaningful moment, without nagging.
- Unify all feedback sources into one triage lifecycle that feeds the roadmap (`pilot-feedback-log.md`).

**Non-Goals (this spec)**
- NPS (explicitly rejected — see grounding table).
- A periodic relational survey cadence + analytics dashboard (Phase 1; deferred).
- Replacing the decision-level Approve/Reject/Ignore loop (it stays; this complements it).
- Live customer interviews tooling (out of product).

## Scope

| In scope | Out of scope |
|----------|--------------|
| `POST /v1/feedback` (product feedback: idea / problem / praise / question) | NPS surveys (rejected by best practice) |
| `POST /v1/feedback/csat` (transactional CSAT 1–5 + optional comment, frequency-capped) | Periodic relational survey cadence + scheduling (Phase 1) |
| `GET /v1/admin/feedback` (admin list/filter for triage) | In-app feedback **analytics dashboard** (Phase 1) |
| Always-on in-product "Send feedback" affordance + post-task CSAT prompt | MaxDiff / ranked feature prioritization surveys (Post-pilot) |
| Closed-loop triage taxonomy + `pilot-feedback-log.md` instantiation | Email/push follow-up automation; auto-notify on `shipped` (Post-pilot) |
| Append-only storage reusing the `src/feedback/` repository pattern | Per-educator identity (shared-passphrase pilot; same limitation as decision feedback) |

---

## Feedback Taxonomy (unifies all sources)

A single category + lifecycle applied across in-product feedback, the CSAT comment, decision-level feedback themes, and out-of-product (interview/email) items logged by the CS lead.

**`feedback_type` (closed set)** — what kind of signal:

| Value | Meaning |
|-------|---------|
| `idea` | Feature request / improvement |
| `problem` | Something is broken, confusing, or missing |
| `praise` | Positive signal (what to preserve) |
| `question` | Customer needs help / clarity (also a docs signal) |

**`category` (closed set)** — product area, for triage routing:

| Value | Maps to |
|-------|---------|
| `decisions` | Decision Panel / explanations ([`ai-educator-explanations.md`](ai-educator-explanations.md) backend + panel body copy shipped 2026-06-25; [`decision-panel-ui.md`](decision-panel-ui.md)) |
| `data_ingestion` | Upload / connectors / mappings |
| `dashboard_ux` | Navigation, layout, performance, a11y |
| `trust_privacy` | Data-leakage posture, auditability, FERPA |
| `other` | Uncategorized at capture time; CS lead refines at triage |

**`status` lifecycle (closed-loop):** `new` → `triaged` → (`planned` | `declined`) → `shipped` → `closed`. `declined` and `closed` require a one-line rationale in the log (mirrors the roadmap ritual's `status` column).

---

## Data Model

### `product_feedback` table

| Column | Type | Description |
|--------|------|-------------|
| `feedback_id` | string (UUID) | PK |
| `org_id` | string | Tenant scope |
| `session_id` | string (opaque) | Derived from the `pf_session` cookie (sibling of `dp_session`/`fb_session`; see Auth). Not an educator identity — shared-passphrase pilot. |
| `kind` | string | `general` (from `POST /v1/feedback`) or `csat` (from `POST /v1/feedback/csat`). Closed set. |
| `feedback_type` | string or null | One of `idea`, `problem`, `praise`, `question`. Required when `kind == "general"`; null for `csat`. |
| `category` | string or null | Closed set above. Optional; defaults to `other`. |
| `csat_score` | integer or null | 1–5. **Required** when `kind == "csat"`; **must be omitted** when `kind == "general"`. |
| `message` | string or null | Free text (≤ 4000 chars). Required (non-empty) for `kind == "general"`; optional comment for `csat`. Never PII by policy; no enforcement (same posture as `decision_feedback.reason_text`). |
| `page_context` | string or null | Pseudonymous route the feedback was sent from (e.g. `/decisions`, `/learners`), for triage. ≤ 256 chars. No query strings (stripped client-side). |
| `app_version` | string or null | Dashboard build/version, for "instrument every release" correlation. ≤ 64 chars. |
| `created_at` | string (RFC3339) | Server-assigned |

### Storage

- **SQLite (local / pilot host):** one `product_feedback` table with an `(org_id, created_at)` index.
- **DynamoDB (AWS path):** reuse the existing `FeedbackTable` with a **kind-prefix** SK (`product#<timestamp>#<uuid>`), extending the pattern `decision_feedback`/`decision_view_log` already use (`educator-feedback-api.md` § Storage). No new table.
- **Repository pattern:** extend the existing `FeedbackRepository` interface (`src/feedback/repository.ts`) with `insertProductFeedback` / `listProductFeedback`, implemented in both `SqliteFeedbackRepository` and `DynamoDbFeedbackRepository`. No new wiring module.

---

## Endpoints

### `POST /v1/feedback`

**Auth:** `x-api-key` (tenant) **AND** valid `pf_session` cookie (see Auth). Server-to-server cannot submit product feedback.

**Body:**
```json
{
  "feedback_type": "idea | problem | praise | question",
  "category": "dashboard_ux",
  "message": "It would help to filter decisions by skill on the overview.",
  "page_context": "/decisions",
  "app_version": "2026.06.23"
}
```

**Validation:**
- `feedback_type` required, in the closed set.
- `message` required, non-empty, ≤ 4000 chars.
- `category` optional; if present, in the closed set; absent ⇒ `other`.
- `page_context` ≤ 256 chars, query string stripped; `app_version` ≤ 64 chars.
- `csat_score` **must be omitted** (else `csat_score_forbidden`).

**Response (201):**
```json
{ "feedback_id": "uuid", "kind": "general", "feedback_type": "idea", "category": "dashboard_ux", "created_at": "2026-06-23T21:12:04Z" }
```

### `POST /v1/feedback/csat`

**Auth:** `x-api-key` (tenant) **AND** valid `pf_session` cookie.

**Body:**
```json
{ "csat_score": 4, "message": "Decisions are clear; upload was confusing.", "page_context": "/decisions", "app_version": "2026.06.23" }
```

**Validation:**
- `csat_score` required integer 1–5 (else `invalid_csat_score`).
- `message` optional, ≤ 4000 chars.
- `feedback_type` / `category` **must be omitted** (a CSAT measures one variable — designing-surveys §"Avoid double-barreled questions"); presence ⇒ `invalid_request_body`.

**Response (201):**
```json
{ "feedback_id": "uuid", "kind": "csat", "csat_score": 4, "created_at": "2026-06-23T21:12:04Z" }
```

### `GET /v1/admin/feedback`

**Auth:** `ADMIN_API_KEY` (admin scope), consistent with other `/v1/admin/*` routes. No `pf_session` (this is the CS-lead triage read, not an educator submission).

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `kind` | No | `general` \| `csat` filter |
| `feedback_type` | No | Closed-set filter |
| `category` | No | Closed-set filter |
| `since` | No | RFC3339 lower bound on `created_at` |
| `limit` | No | Default 100, max 500 |

**Response (200):** `{ "org_id": "...", "items": [ <rows> ], "csat_summary": { "count": 12, "mean": 4.1, "distribution": { "1":0, "2":1, "3":2, "4":4, "5":5 } } }`. `csat_summary` is computed over the `csat` rows in the filtered window (mean is informational, not a North Star).

---

## In-Product UX (dashboard, `dashboard/`)

Built per `.agents/skills/frontend-design/SKILL.md` and `vercel-react-best-practices`. All client state versioned + SSR-safe (§6.5); non-urgent updates via `startTransition` (§5.13).

**Reuse shipped patterns.** Decision-level feedback already persists via the Next.js control proxy with sibling-cookie injection (`fb_session` on `POST /v1/decisions/:id/feedback`; see [`attention-review-ux.md`](attention-review-ux.md) § Proxy / session and `dashboard/app/api/control/`). Product feedback should follow the same BFF shape: dashboard route handler injects `pf_session` server-side; the browser never sees the API key.

**1. Always-on "Send feedback" affordance.**
- A persistent, low-emphasis trigger in the app shell (e.g. a footer/sidebar "Send feedback" button — *not* a floating widget that occludes content). Available on **every** authenticated page.
- Opens a `Sheet`/`Dialog` (shadcn) with: `feedback_type` segmented control, a single `Textarea` (`message`), and an auto-filled, read-only `page_context`. One submit button. No more than the minimum fields.
- Dismissible with `Esc`/overlay click; focus-trapped; labeled for screen readers. Never blocks the underlying task (modal is user-invoked, never auto-popped).
- Optimistic success toast; failure degrades to "couldn't send — try again" without losing the typed text.

**2. Post-task CSAT microsurvey (frequency-capped).**
- Fires **once** after a meaningful task completes (default: after the customer reviews ≥ N decisions in a session, or completes a flat-file upload). A single 1–5 satisfaction scale + optional comment.
- **Frequency cap:** at most once per `CSAT_MIN_INTERVAL_DAYS` (default 7) per browser, persisted to `localStorage` under a versioned key (`feedback:csat:v1`); dismissal counts as "asked" (no nagging — designing-surveys §"Wrong timing").
- **Mobile:** all five scale options visible without scrolling (designing-surveys §"Hidden scale options").
- Dismissible, accessible, respects `prefers-reduced-motion`.

> **Pilot scope note:** P0 ships affordance **(1)**; the CSAT prompt **(2)** is in-scope but flag-gated (`NEXT_PUBLIC_FEEDBACK_CSAT`, default OFF for the controlled evaluation) so the controlled eval stays distraction-free until a live pilot warrants it.

---

## Closed Loop (triage → roadmap)

1. In-product submissions land in `product_feedback` (append-only).
2. The CS lead reviews `GET /v1/admin/feedback` at the weekly cadence (Internal onboarding runbook (local `internal-docs/`, not in public repo) Phase 4) and appends triaged items — **plus** out-of-product items (interviews, email) and recurring decision-feedback themes — to `internal-docs/reports/pilot-feedback-log.md` using its schema `{date, customer, summary, category, feedback_type, proposed-roadmap-phase, status}`.
3. `proposed-roadmap-phase: Phase 1` items are triaged at the Monday roadmap sync; `Phase 2+` at the monthly review (unchanged ritual).
4. Accepted items become specs/spec-amendments; `declined`/`closed` items carry a one-line rationale — and the loop is closed back to the customer (inspired-product §6).

This spec **instantiates** `pilot-feedback-log.md` (previously referenced but missing) and makes the in-product endpoints its primary feeder.

---

## Requirements

### Functional
- [ ] `POST /v1/feedback` persists a `kind=general` row and returns it; `feedback_type` + non-empty `message` required.
- [ ] `POST /v1/feedback/csat` persists a `kind=csat` row with `csat_score` 1–5; rejects `feedback_type`/`category`.
- [ ] `GET /v1/admin/feedback` returns filtered rows + a `csat_summary` matching a direct query (SQLite path).
- [ ] All product feedback is strictly org-scoped — no cross-org read/write.
- [ ] Write endpoints require the `pf_session` cookie; API-key-only writes return 401 `session_required`.
- [ ] Dashboard renders an always-on, accessible, dismissible "Send feedback" affordance on every authenticated page that never auto-interrupts a task.
- [ ] The CSAT prompt (when its flag is ON) fires at most once per `CSAT_MIN_INTERVAL_DAYS` per browser and shows all 5 options without horizontal scroll on mobile.
- [ ] `internal-docs/reports/pilot-feedback-log.md` exists with the documented schema and is the closed-loop sink.

### Acceptance Criteria
- Given a gated customer on `/decisions`, when they submit `{feedback_type:"idea", message:"…"}`, then a `product_feedback` row persists with `page_context="/decisions"` and `GET /v1/admin/feedback` (admin key) returns it.
- Given a `csat` submission `{csat_score:5}`, then a row persists and `csat_summary.mean` reflects it; given `{csat_score:6}`, then 400 `invalid_csat_score`.
- Given `POST /v1/feedback/csat` with a `feedback_type` field, then 400 `invalid_request_body` (single-variable rule).
- Given an API-key-only `POST /v1/feedback` (no `pf_session`), then 401 `session_required`.
- Given 3 items for `org_A` and 2 for `org_B`, when `GET /v1/admin/feedback` runs scoped to `org_A`, then only `org_A` rows return.
- Given the CSAT was shown/dismissed today, when the task completes again within `CSAT_MIN_INTERVAL_DAYS`, then it is **not** shown again.
- Given the "Send feedback" Sheet is open, when the user presses `Esc`, then it closes and focus returns to the trigger; the underlying page state is unchanged.

---

## Constraints
- **Append-only writes.** No `UPDATE`/`DELETE` on feedback rows; status lifecycle lives in `pilot-feedback-log.md`, not on the row.
- **No NPS.** Explicitly excluded per designing-surveys; CSAT is the only score collected.
- **No PII validation.** `message` is free-form; pilot training + de-identification at export (`pilot-research-export.md`) are the defense — identical posture to `decision_feedback.reason_text`.
- **Session cookie is the "customer" proxy.** Shared-passphrase pilot; we cannot identify *which* user submitted. Phase II add (per-user auth), same as decision feedback.
- **UX must not interrupt.** The always-on affordance is user-invoked; the CSAT prompt is frequency-capped and flag-gated (default OFF for controlled eval).
- **No new env secrets.** Reuses `COOKIE_SECRET` + `ADMIN_API_KEY`.

---

## Auth — `pf_session` sibling cookie

Per `docs/specs/dashboard-passphrase-gate.md` § "Sibling cookie: `fb_session`" — *"New `/v1/*` namespaces that need dashboard-gated auth must mint their own sibling cookie following this same pattern rather than widening `dp_session`."*

`/login` mints **`pf_session`** alongside `dp_session`/`fb_session`; `/logout` clears it. It follows the `fb_session` pattern exactly except **`Path=/v1/feedback`** (so it reaches `/v1/feedback` and `/v1/feedback/csat` but not `/v1/decisions/*` or other namespaces). Same `COOKIE_SECRET`, same value/Max-Age/SameSite=`Strict`/host-only as `fb_session`.

> **Alternative considered:** widen `fb_session` to `Path=/v1`. **Rejected** — violates the documented isolation rule (each namespace mints its own sibling); a `/v1`-wide cookie would also be sent to `/v1/signals`, `/v1/state`, etc.

---

## Out of Scope

| Item | Rationale | Revisit |
|------|-----------|---------|
| NPS | Scientifically flawed vs. CSAT (designing-surveys) | Never |
| Periodic relational survey + scheduler | Pilot is < 3 months in; wrong timing for relational survey (designing-surveys) | Phase 1 (live pilot, customers 3–6 mo in) |
| In-app feedback **analytics dashboard** | Admin `GET` + the log are enough for the pilot | Phase 1 |
| MaxDiff / ranked feature prioritization | Heavier survey instrument; single-phase tagging suffices now | Post-pilot |
| Auto-notify customer on `shipped` (close-the-loop automation) | Manual close-loop is fine at pilot scale | Post-pilot |
| Per-user identity | Shared passphrase (same as decision feedback) | Phase II |
| Screenshot/attachment capture | Minimal-viable; `page_context` + `app_version` suffice | Post-pilot if asked |

---

## Phasing

| Phase | Deliverable |
|-------|-------------|
| **P0 (controlled eval)** | `POST /v1/feedback` + `GET /v1/admin/feedback` + always-on "Send feedback" affordance + instantiate `pilot-feedback-log.md`. CSAT endpoint shipped but its UI flag default OFF. |
| **Phase 1 (live pilot)** | Enable CSAT prompt; add periodic relational survey + analytics view; close-loop notifications. |

---

## Dependencies

### Required from other specs

| Dependency | Source | Status |
|------------|--------|--------|
| `FeedbackRepository` interface + SQLite/DynamoDB impls + `FeedbackTable` kind-prefix pattern (`feedback#…` / `view#…`; extend with `product#…`) | `src/feedback/*`, [`educator-feedback-api.md`](educator-feedback-api.md) | **Complete (extend)** |
| Decision-level feedback BFF proxy + sibling-cookie injection pattern | [`attention-review-ux.md`](attention-review-ux.md), `dashboard/app/api/control/` | **Complete (mirror for `pf_session`)** |
| Session cookie model + sibling-cookie pattern (`pf_session`) | [`dashboard-passphrase-gate.md`](dashboard-passphrase-gate.md) § "Sibling cookie: `fb_session`" | **Spec'd here; not yet in passphrase-gate doc (additive)** |
| API key + org scoping; `ADMIN_API_KEY` for admin read | `docs/specs/api-key-middleware.md`, `docs/specs/policy-management-api.md` | **Complete** |
| App-shell layout + shadcn `Sheet`/`Dialog`/`RadioGroup` | `docs/specs/dashboard-design-requirements.md`, `dashboard/` | **Complete (compose)** |

### Provides to other specs

| Capability | Used by |
|------------|---------|
| `product_feedback` rows + `csat_summary` | `internal-docs/reports/pilot-feedback-log.md` (triage); future Phase-1 feedback analytics |
| Always-on feedback UX | [`docs/foundation/roadmap.md`](../foundation/roadmap.md) §Current Direction "gives feedback at any time" principle |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `api_key_required` / `api_key_invalid` | `api-key-middleware.md` |
| `org_scope_required` | Shared |
| `invalid_request_body` | Shared (also: CSAT body carrying `feedback_type`/`category`) |
| `session_required` | `educator-feedback-api.md` (reused for missing/invalid `pf_session`) |

### New

| Code | HTTP | Description |
|------|------|-------------|
| `feedback_type_required` | 400 | `kind=general` without a valid `feedback_type` |
| `message_required` | 400 | `kind=general` with empty/missing `message` |
| `message_too_long` | 400 | `message` > 4000 chars |
| `invalid_category` | 400 | `category` not in the closed set |
| `invalid_csat_score` | 400 | `csat_score` missing/not an integer 1–5 on the CSAT route |
| `csat_score_forbidden` | 400 | `csat_score` present on `POST /v1/feedback` |

---

## Contract Tests

| Test ID | Type | Description | Expected |
|---------|------|-------------|----------|
| PFEED-001 | integration | Happy path `general` submit with session + key | 201; row persisted; admin GET shows it |
| PFEED-002 | integration | CSAT submit `{csat_score:4, message}` | 201; `csat_summary.mean` reflects it |
| PFEED-003 | contract | No `pf_session` cookie → 401 `session_required` | 401 |
| PFEED-004 | contract | `general` without `feedback_type` → 400 `feedback_type_required` | 400 |
| PFEED-005 | contract | `general` with empty `message` → 400 `message_required` | 400 |
| PFEED-006 | contract | `message` > 4000 chars → 400 `message_too_long` | 400 |
| PFEED-007 | contract | CSAT `csat_score=6` → 400 `invalid_csat_score` | 400 |
| PFEED-008 | contract | CSAT body with `feedback_type` → 400 `invalid_request_body` | 400 |
| PFEED-009 | contract | `general` with `csat_score` → 400 `csat_score_forbidden` | 400 |
| PFEED-010 | integration | Cross-org isolation on `GET /v1/admin/feedback` | only caller-org rows |
| PFEED-011 | unit | Append-only: no update/delete route exists | 404/405 |
| PFEED-012 | component | "Send feedback" Sheet opens/closes via `Esc`, focus returns, page state intact | pass |
| PFEED-013 | component | CSAT frequency cap: not shown again within `CSAT_MIN_INTERVAL_DAYS` | pass |
| PFEED-014 | e2e | CSAT mobile viewport shows all 5 options without horizontal scroll | pass |

---

## Concrete Values Checklist

### Cookies

| Name | Path | Notes |
|------|------|-------|
| `pf_session` | `/v1/feedback` | Sibling of `fb_session`; same `COOKIE_SECRET`, value, Max-Age, `SameSite=Strict`, host-only. Minted at `/login`, cleared at `/logout`. |

### localStorage

| Key | Value | Notes |
|-----|-------|-------|
| `feedback:csat:v1` | `{ lastShownAt: <RFC3339> }` | CSAT frequency cap; try/catch; absence ⇒ eligible. Versioned per vercel-react-best-practices §4.4. |

### Env vars

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `CSAT_MIN_INTERVAL_DAYS` | No | `7` | int | Min days between CSAT prompts per browser. |
| `FEEDBACK_TASK_DECISION_THRESHOLD` | No | `5` | int | Decisions reviewed in a session before the post-task CSAT is eligible. |
| `NEXT_PUBLIC_FEEDBACK_CSAT` | No | `false` | bool | Client flag gating the CSAT prompt UI. OFF for the controlled evaluation. |
| `COOKIE_SECRET` | Yes (gate active) | — | string | Reused; signs `pf_session`. |

### Routes registered

| Method | Path | Auth |
|--------|------|------|
| POST | `/v1/feedback` | `x-api-key` + `pf_session` |
| POST | `/v1/feedback/csat` | `x-api-key` + `pf_session` |
| GET | `/v1/admin/feedback` | `ADMIN_API_KEY` |

---

## Production Correctness Notes
- **PII:** `message`/`page_context` are free-form/pseudonymous; query strings stripped from `page_context` client-side before send. Same no-enforcement posture + export-time de-identification as `decision_feedback`.
- **SSR / hydration:** the CSAT eligibility read must not cause a hydration mismatch — render "not shown" on the server, reconcile after mount (mounted-guard, vercel-react-best-practices §6.5).
- **Cookie scoping:** `pf_session` is `Path=/v1/feedback` only — it must not be sent to `/v1/decisions/*`, `/v1/signals`, `/v1/state`, or `/v1/admin/*`.
- **Body size limits:** `message` capped at 4000 chars server-side regardless of client validation.
- **Append-only:** no mutate routes; status changes live in the log file, not the row.

---

## File Structure

```
src/feedback/
├── repository.ts            # + insertProductFeedback / listProductFeedback
├── sqlite-repository.ts     # + product_feedback table + queries
├── dynamodb-repository.ts   # + product#<ts>#<uuid> SK on FeedbackTable
├── product-handler-core.ts  # NEW — validation + csat_summary (framework-agnostic)
├── product-handler.ts       # NEW — Fastify handlers for /v1/feedback*
└── routes.ts                # + register POST /v1/feedback, /v1/feedback/csat, GET /v1/admin/feedback

dashboard/
├── components/feedback/send-feedback-sheet.tsx   # NEW — always-on affordance
├── components/feedback/csat-prompt.tsx           # NEW — flag-gated CSAT
└── app/api/control/feedback/route.ts             # NEW — server proxy to /v1/feedback*

internal-docs/reports/pilot-feedback-log.md       # NEW — instantiated closed-loop sink
```

---

*Spec created: 2026-06-23 | Updated: 2026-06-25 (synced with educator-feedback dashboard wiring + attention-review-ux BFF pattern + ai-educator-explanations panel body copy) | Phase: v1.1 / pilot portal — customer feedback loop | Depends on: `educator-feedback-api.md`, `attention-review-ux.md`, `dashboard-passphrase-gate.md`, `api-key-middleware.md`, `dashboard-design-requirements.md` | Feeds: `internal-docs/reports/pilot-feedback-log.md` | Grounding: `.agents/skills/designing-surveys`, `.agents/skills/inspired-product`, `.agents/skills/frontend-design`. Recommended next: `/plan-impl docs/specs/customer-feedback-loop.md`.*
