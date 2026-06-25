---
name: Attention Review UX Phase 2
overview: Wires Approve and Reject to the Educator Feedback API via fb_session login and proxy injection, adds inline reject reason step, optimistic UI with rollback, view logging, and server-authoritative queue filtering. Phase 2 only; Phase 3 deferred.
todos:
  - id: TASK-001
    content: Add fb_session cookie constants and session read helpers
    status: completed
  - id: TASK-002
    content: Mint fb_session on login and clear on logout
    status: completed
  - id: TASK-003
    content: Proxy injects fb_session on feedback and view paths
    status: completed
  - id: TASK-004
    content: Create decision-feedback.ts with zod schemas and apiFetch wrappers
    status: completed
  - id: TASK-005
    content: Add feedback and view routes to mock-upstream.mjs
    status: completed
  - id: TASK-006
    content: Build reject reason step UI in attention-review-sheet
    status: completed
  - id: TASK-007
    content: Refactor review-actions for async API with optimistic UI
    status: completed
  - id: TASK-008
    content: Fire view log once per review sheet open
    status: completed
  - id: TASK-009
    content: Server latest_action queue filter with TanStack Query
    status: completed
  - id: TASK-010
    content: Wire attention-queue table reject to sheet reason step
    status: completed
  - id: TASK-011
    content: Wire WhatToDo and attention-review-bar to async review flow
    status: completed
  - id: TASK-012
    content: Recently reviewed shows server created_at when present
    status: completed
  - id: TASK-013
    content: Proxy unit test REVIEW-UX-010 fb_session injection
    status: completed
  - id: TASK-014
    content: Integration tests REVIEW-UX-011 through 013
    status: completed
  - id: TASK-015
    content: E2e tests REVIEW-UX-014 and 015
    status: completed
isProject: false
---

# Attention Review UX — Phase 2 (Persistence)

**Spec**: `docs/specs/attention-review-ux.md` (Phase 2 only; Phase 3 deferred)

**Depends on**: Phase 1 plan complete (`attention-review-ux.plan.md`), backend Educator Feedback API (`docs/specs/educator-feedback-api.md`)

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase.

### From spec § Phase 2 — Functional (P2-F01, P2-F02)

- **P2-F01** On Approve, `POST /v1/decisions/:decision_id/feedback` with body `{ "action": "approve" }` (optional `reason_category` deferred to post-MVP chips).
- **P2-F02** On Reject, open an **inline reason step** in the review sheet (not a blocking modal): required `reason_category` chip selection from the reject closed set in `educator-feedback-api.md`; optional `reason_text` (≤ 2000 chars); when `reason_category === "wrong_decision_type"`, show required `suggested_decision_type` select (`reinforce` | `advance` | `intervene` | `pause`).

### From spec § Phase 2 — Functional (P2-F03 through P2-F08)

- **P2-F03** **Optimistic UI:** remove from pending queue immediately; on API failure, restore row, show error toast with copyable `request_id`, and remove optimistic Recently reviewed entry.
- **P2-F04** **Login mints `fb_session`** sibling cookie per `dashboard-passphrase-gate.md` § Sibling cookie; **logout clears both**.
- **P2-F05** **Proxy session bridge:** for upstream paths matching `v1/decisions/*/feedback` and `v1/decisions/*/view`, the dashboard proxy injects `Cookie: fb_session=<signed>` when the incoming request carries a valid `dp_session` / `__Host-dp_session` (same signed payload value).
- **P2-F06** On review sheet open, fire `POST /v1/decisions/:decision_id/view` once per open (dedup handled server-side).
- **P2-F07** After successful feedback write, persist API `feedback_id` and `created_at` on the client review record; Recently reviewed shows server timestamp when present.
- **P2-F08** Deprecate "reviewed = hidden forever" as the sole source of truth: pending queue excludes decisions where **latest feedback exists for this browser session** OR `isReviewedLocally(decisionId)` during offline/failure fallback. When `GET .../feedback` returns `latest_action != null`, treat as reviewed even if local store was cleared.

### From spec § UX — Reject reason categories (labels for educators)

| `reason_category` (wire) | Educator-facing chip label |
|--------------------------|----------------------------|
| `not_at_risk` | Not at risk |
| `wrong_skill` | Wrong skill |
| `wrong_timing` | Wrong timing |
| `wrong_decision_type` | Wrong action type |
| `data_stale` | Data is stale |
| `other` | Other |

### From spec § UX — Toast pattern (reuse Sonner)

| Field | Value |
|-------|-------|
| Library | `sonner` (^2.0.7, already in `dashboard/package.json`) |
| Success title | `{actionPastTense} · {learnerReference}` |
| Description | `{DecisionBadge label}` — e.g. "Intervene" |
| Actions | `Undo` (button), `View decision` (link button → `/decisions/{id}`) |
| Error title | `Could not save review` |
| Error description | Friendly message + monospace `request_id` when present |

### From spec § Error Codes — Existing (reuse via API proxy)

| Code | Source | Educator-facing copy |
|------|--------|----------------------|
| `session_required` | `educator-feedback-api.md` | "Session expired. Sign in again to save your review." |
| `decision_not_found` | `educator-feedback-api.md` | "This decision is no longer available." |
| `invalid_reason_category` | `educator-feedback-api.md` | "Choose a reason before submitting." |
| `suggested_decision_type_required` | `educator-feedback-api.md` | "Select the action type you expected." |
| `dashboard_upstream_unavailable` | dashboard proxy | "Could not reach the control layer. Try again." + `request_id` |

### From spec § Client review store — Review record shape (TypeScript)

```typescript
type ReviewAction = 'approve' | 'reject';

interface DecisionReviewRecord {
  decisionId: string;
  action: ReviewAction;
  learnerReference: string;
  decisionType: 'intervene' | 'pause';
  educatorSummary?: string;
  reviewedAt: string; // RFC3339
  feedbackId?: string; // Phase 2+, from API 201
  source: 'local' | 'api' | 'legacy';
}
```

### From spec § Concrete Values Checklist — Client constants

| Constant | Value |
|----------|-------|
| Undo window | `8000` ms (toast `duration`) |
| Recently reviewed max rows | `10` |
| Review log localStorage key | `8p3p-review-log:v1` |
| Reject `reason_text` max | `2000` chars (mirror API) |
| View log trigger | Once per sheet open (`open === true` edge) |

### From spec § Concrete Values Checklist — HTTP behavior (Phase 2)

| Client call | Method | Proxy path | Upstream path | Auth |
|-------------|--------|------------|---------------|------|
| Submit feedback | POST | `/api/control/v1/decisions/{id}/feedback` | `{CONTROL_LAYER_API_BASE_URL}/v1/decisions/{id}/feedback` | `x-api-key` + injected `Cookie: fb_session=…` |
| Record view | POST | `/api/control/v1/decisions/{id}/view` | same pattern | same |
| Read feedback | GET | `/api/control/v1/decisions/{id}/feedback` | same | `x-api-key` only |

| Transition | Status | Content-Type |
|------------|--------|--------------|
| Feedback created | 201 | `application/json` |
| Proxy upstream down | 502 | `application/json` (`dashboard_upstream_unavailable`) |
| Missing session on write | 401 | `application/json` (`session_required`) |

### From spec § Concrete Values Checklist — Cookies (Phase 2 — login/logout)

| Name | HttpOnly | Secure | SameSite | Path | Max-Age |
|------|----------|--------|----------|------|---------|
| `dp_session` or `__Host-dp_session` | true | true (prod) | Strict | `/` | `DASHBOARD_SESSION_TTL_HOURS` × 3600 (default 28800) |
| `fb_session` | true | true (prod) | Strict | `/` (dashboard host; proxy reads and forwards) | Same as `dp_session` |
| Value | Identical signed string from single `signSession()` call | | | | |

> **Note:** `fb_session` Path=`/v1/decisions` from `dashboard-passphrase-gate.md` applies to **direct browser→API-host** calls. On the Next.js dashboard host, Phase 2 sets Path=`/` so the proxy can read the cookie and forward it upstream. The upstream API validates the cookie value, not the browser path.

### From spec § Concrete Values Checklist — Env vars (no new vars)

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `COOKIE_SECRET` | yes (gate on) | — | string | Signs both session cookies |
| `DASHBOARD_SESSION_TTL_HOURS` | no | `8` | number | Cookie Max-Age |
| `CONTROL_LAYER_API_KEY` | yes | — | string | Proxy upstream auth |
| `CONTROL_LAYER_API_BASE_URL` | yes | — | string | Upstream base URL |
| `CONTROL_LAYER_ORG_ID` | yes | — | string | Injected org scope |

---

## Prerequisites

Before starting implementation:

- [ ] PREREQ-001 Phase 1 complete: v1 review log, toasts, undo, Recently reviewed, auto-advance (`attention-review-ux.plan.md` tasks done)
- [ ] PREREQ-002 Educator Feedback API routes live in control layer (`docs/specs/educator-feedback-api.md`)
- [ ] PREREQ-003 `COOKIE_SECRET`, `CONTROL_LAYER_API_KEY`, `CONTROL_LAYER_API_BASE_URL`, `CONTROL_LAYER_ORG_ID` set for local/e2e
- [ ] PREREQ-004 No Phase 3 discoverability work in this plan

---

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list. Do not duplicate per-task status inside task bodies.

### TASK-001: Add fb_session cookie constants and session read helpers

- **Files**: `dashboard/lib/session-cookie-edge.ts`
- **Action**: Modify
- **Details**:
  - Export `FB_SESSION_COOKIE_NAME = 'fb_session'`.
  - Add `readDashboardSessionCookieValue(request: Request, secure?: boolean): string` that reads `__Host-dp_session` or `dp_session` using the same primary/alternate fallback as `readSessionCookieValue`.
  - Add `isFeedbackProxyPath(pathSegments: string[]): boolean` matching `v1/decisions/*/feedback` and `v1/decisions/*/view` (exact segment pattern: `['v1','decisions', decisionId, 'feedback'|'view']`).
- **Depends on**: none
- **Verification**: Unit tests or inline test in TASK-013 confirm path matcher; helper returns signed value from mock Request cookies

### TASK-002: Mint fb_session on login and clear on logout

- **Files**: `dashboard/app/(auth)/login/route.ts`, `dashboard/app/(auth)/logout/route.ts`
- **Action**: Modify
- **Details**:
  - **P2-F04 login:** After `signSession(cookieSecret, maxAgeSeconds)`, set **both** cookies with **identical** signed value per Cookies table: primary session via `getSessionCookieName(secure)` and sibling `fb_session` with same `buildSetCookieAttributes` (`Path=/`, HttpOnly, Secure, SameSite=Strict, Max-Age).
  - **P2-F04 logout:** Extend `clearSessionCookies` to also clear `fb_session` with `maxAge: 0` and `Path=/`.
- **Depends on**: TASK-001
- **Verification**: Manual login response `Set-Cookie` includes `fb_session`; logout clears it; REVIEW-UX-015 e2e (TASK-015)

### TASK-003: Proxy injects fb_session on feedback and view paths

- **Files**: `dashboard/app/api/control/[...path]/route.ts`
- **Action**: Modify
- **Details**:
  - **P2-F05:** When `isFeedbackProxyPath(pathSegments)` and method is POST (feedback write or view log), read dashboard session cookie via `readDashboardSessionCookieValue(request)`.
  - If present and non-empty, set upstream header `Cookie: fb_session=<same signed value>`.
  - Do **not** inject on GET feedback reads (auth table: `x-api-key` only).
  - Do **not** forward browser `Cookie` header wholesale; only inject `fb_session` for matched write paths.
- **Depends on**: TASK-001
- **Verification**: REVIEW-UX-010 unit test; upstream mock receives Cookie on POST feedback/view

### TASK-004: Create decision-feedback.ts with zod schemas and apiFetch wrappers

- **Files**: `dashboard/lib/decision-feedback.ts` (new)
- **Action**: Create
- **Details**:
  - Use existing `apiFetch` from `@/lib/api/client` and `zod` (^4.4.3 in `dashboard/package.json`) per spec Existing libraries table.
  - Export zod schemas and types for:
    - Approve body: `{ action: "approve" }`
    - Reject body: `{ action: "reject", reason_category, reason_text?, suggested_decision_type? }` with client-side guard: `suggested_decision_type` required iff `reason_category === "wrong_decision_type"`, omitted otherwise (mirror `educator-feedback-api.md` validation).
    - 201 response: `{ feedback_id, decision_id, action, reason_category?, created_at }`
    - GET response: `{ decision_id, feedback[], latest_action }`
  - Export `submitDecisionFeedback(decisionId, body)`, `recordDecisionView(decisionId)`, `getDecisionFeedback(decisionId)`.
  - Map paths: `/v1/decisions/{id}/feedback` and `/v1/decisions/{id}/view` (proxy prefix handled by `apiFetch`).
- **Depends on**: none
- **Verification**: REVIEW-UX-011 through 013 integration tests pass against mock upstream

### TASK-005: Add feedback and view routes to mock-upstream.mjs

- **Files**: `dashboard/e2e/mock-upstream.mjs`
- **Action**: Modify
- **Details**:
  - Implement in-memory store per decision: feedback rows + view log with 60s dedup.
  - `POST /v1/decisions/:id/feedback`: require `Cookie: fb_session=…`; validate body; return 201 with `feedback_id` + `created_at`; return 401 `{ error: "session_required" }` when cookie missing.
  - `GET /v1/decisions/:id/feedback`: return `{ decision_id, feedback, latest_action }`.
  - `POST /v1/decisions/:id/view`: require `fb_session`; dedup within 60s.
  - Seed at least one pending intervene decision for existing e2e learners; preserve Phase 1 fixtures.
- **Depends on**: none
- **Verification**: Manual curl against mock upstream; integration/e2e tests in TASK-014/015

### TASK-006: Build reject reason step UI in attention-review-sheet

- **Files**: `dashboard/app/(dashboard)/attention/_components/attention-review-sheet.tsx`, optionally `dashboard/app/(dashboard)/attention/_components/reject-reason-step.tsx` (new)
- **Action**: Modify / Create
- **Details**:
  - **P2-F02:** Add sheet mode `rejectReason` toggled when educator clicks Reject (not on Approve).
  - Inline expansion inside `DetailSheet` body: chip group (`Button variant="outline"` toggles) using Reject reason categories table labels; optional `reason_text` textarea max `2000` chars; when `reason_category === "wrong_decision_type"`, show required `suggested_decision_type` select (`reinforce` | `advance` | `intervene` | `pause`).
  - Footer in reject mode: **Submit rejection** (primary) + **Back** (returns to review context without submitting).
  - Approve remains one-click from default footer (no reason step).
  - Export callback `onRejectSubmit(item, payload)` with validated reject body instead of immediate `onReject`.
  - Support prop `initialMode?: 'review' | 'rejectReason'` so table reject can open sheet directly in reason step (TASK-010).
- **Depends on**: TASK-004 (types for reject payload)
- **Verification**: Manual reject from sheet requires chip before submit; wrong_decision_type shows select; no second sheet/modal

### TASK-007: Refactor review-actions for async API with optimistic UI

- **Files**: `dashboard/lib/review-actions.ts`, `dashboard/lib/decision-review.ts`
- **Action**: Modify
- **Details**:
  - Change `executeReviewAction` to `async` (or return Promise); accept optional `rejectPayload` for reject actions.
  - **P2-F01 approve:** POST `{ "action": "approve" }` via `submitDecisionFeedback`.
  - **P2-F03 optimistic flow:** `recordReview` with `source: 'local'` immediately, `onQueueChange()`, show success toast with Undo per Toast pattern (`duration: 8000`).
  - On API success (**P2-F07**): update record with `feedbackId`, `reviewedAt: created_at` from 201, `source: 'api'`.
  - On API failure (**P2-F03**): `undoReview(decisionId)`, `onQueueChange()`, dismiss success toast if still open, show error toast: title `Could not save review`, description from Error Codes table + monospace `request_id` via `getErrorRequestId`; for `session_required` include link action to `/login`.
  - **Phase 2 Undo constraint:** Undo removes local queue suppression only; does **not** DELETE API rows (spec § Constraints append-only).
  - Approve reason chips deferred (P2-F01 parenthetical).
- **Depends on**: TASK-003, TASK-004
- **Verification**: Approve hits POST and persists; simulated 401 restores row; error toast shows request_id

### TASK-008: Fire view log once per review sheet open

- **Files**: `dashboard/app/(dashboard)/attention/_components/attention-review-sheet.tsx`
- **Action**: Modify
- **Details**:
  - **P2-F06:** On `open === true` edge (item becomes non-null, not read-only), call `recordDecisionView(decisionId)` once via `decision-feedback.ts`.
  - Use `useRef` to track last viewed decisionId for current open cycle; reset when sheet closes.
  - Fire-and-forget: view log failure must not block sheet render (no error toast unless debugging).
  - View log trigger constant: Once per sheet open (`open === true` edge).
- **Depends on**: TASK-004, TASK-003
- **Verification**: Mock upstream shows one view row per open; re-open within 60s dedups server-side

### TASK-009: Server latest_action queue filter with TanStack Query

- **Files**: `dashboard/hooks/use-decision-feedback-status.ts` (new), `dashboard/lib/attention-decisions.ts`, `dashboard/app/(dashboard)/attention/_components/attention-queue.tsx`
- **Action**: Create / Modify
- **Details**:
  - **P2-F08:** Add hook using `@tanstack/react-query` `useQueries` (already in project per spec) to GET feedback for urgent decision IDs derived from summaries.
  - Build `Set<string>` of decision IDs where `latest_action != null`.
  - Extend `buildPendingAttentionQueue(summaries, options?)` to accept optional `serverReviewedIds: Set<string>`; exclude when ID in set **or** `isReviewedLocally(decisionId)`.
  - `attention-queue.tsx` passes server-reviewed set into queue builder; invalidate feedback queries on successful review (TASK-007 callback or queryClient invalidation).
  - On GET failure for a decision, fall back to local store only for that ID (offline/failure fallback per P2-F08).
- **Depends on**: TASK-004
- **Verification**: After approve + refresh, decision stays out of pending even if localStorage cleared; GET shows `latest_action: "approve"`

### TASK-010: Wire attention-queue table reject to sheet reason step

- **Files**: `dashboard/app/(dashboard)/attention/_components/attention-queue.tsx`, `dashboard/app/(dashboard)/attention/_components/attention-queue-table.tsx`
- **Action**: Modify
- **Details**:
  - Table **Approve:** call async `executeReviewAction` directly (unchanged one-click).
  - Table **Reject:** open review sheet with `initialMode: 'rejectReason'` instead of immediate reject (P2-F02 requires reason before POST).
  - Sheet **Approve/Reject** handlers: approve one-click async; reject submits from reason step via `onRejectSubmit`.
  - Preserve auto-advance after successful approve/reject from sheet.
  - Pass `rejectPayload` from sheet into `executeReviewAction`.
- **Depends on**: TASK-006, TASK-007, TASK-009
- **Verification**: Table reject opens sheet reason step; cannot submit without chip; approve from table still one-click

### TASK-011: Wire WhatToDo and attention-review-bar to async review flow

- **Files**: `dashboard/components/panels/WhatToDo.tsx`, `dashboard/app/(dashboard)/attention/_components/attention-review-bar.tsx`
- **Action**: Modify
- **Details**:
  - **WhatToDo approve:** async `executeReviewAction` with `{ action: "approve" }` POST.
  - **WhatToDo reject:** reuse `RejectReasonStep` inline below action buttons (compact variant) or expand panel section — must collect required `reason_category` before POST; no silent reject without reason.
  - **Review bar:** approve one-click async; reject opens inline reason step in bar (reuse shared component) before POST; after success navigate to `/attention` as today.
  - Invalidate learner-summary queries on success (existing WhatToDo behavior).
- **Depends on**: TASK-006, TASK-007
- **Verification**: Reject from Overview panel and L2 bar requires reason chip; approve still one-click; API receives correct bodies

### TASK-012: Recently reviewed shows server created_at when present

- **Files**: `dashboard/app/(dashboard)/attention/_components/recently-reviewed.tsx`, `dashboard/lib/decision-review.ts`
- **Action**: Modify
- **Details**:
  - **P2-F07:** When `DecisionReviewRecord.reviewedAt` comes from API `created_at` (`source: 'api'`), display relative time from that timestamp.
  - Ensure `recordReview` update path merges `feedbackId` + server timestamp without losing other fields.
- **Depends on**: TASK-007
- **Verification**: After successful reject, Recently reviewed relative time matches API `created_at` (not optimistic local clock)

### TASK-013: Proxy unit test REVIEW-UX-010 fb_session injection

- **Files**: `dashboard/app/api/control/__tests__/route.test.ts`
- **Action**: Modify
- **Details**:
  - **REVIEW-UX-010:** POST to `v1/decisions/d1/feedback` with request cookie `dp_session=<signed>` (or `__Host-dp_session`); assert upstream `fetch` receives `Cookie: fb_session=<same value>`.
  - Assert GET feedback does **not** inject Cookie.
  - Assert POST without session cookie does not inject (upstream returns 401 from mock).
- **Depends on**: TASK-003
- **Verification**: `npm test -- --run route.test.ts` passes

### TASK-014: Integration tests REVIEW-UX-011 through 013

- **Files**: `dashboard/lib/__tests__/decision-feedback.test.ts` (new)
- **Action**: Create
- **Details**:
  - **REVIEW-UX-011:** Approve POST body `{ action: "approve" }` returns 201 (mock fetch or vitest against decision-feedback module).
  - **REVIEW-UX-012:** Reject POST with `reason_category: "not_at_risk"` returns 201; reason round-trips in GET `latest_action: "reject"`.
  - **REVIEW-UX-013:** Client zod/validation rejects `wrong_decision_type` without `suggested_decision_type` before network call (400-equivalent guard).
- **Depends on**: TASK-004, TASK-005
- **Verification**: `npm test -- --run decision-feedback.test.ts` passes

### TASK-015: E2e tests REVIEW-UX-014 and 015

- **Files**: `dashboard/e2e/decision-panel.spec.ts`, `dashboard/e2e/fixtures.ts` (if login helper needed)
- **Action**: Modify
- **Details**:
  - **REVIEW-UX-014:** Configure mock upstream to fail feedback POST (502 or 401); approve from Attention; assert row reappears and error toast `Could not save review` visible; for 401 assert session copy mentions sign in.
  - **REVIEW-UX-015:** When gate enabled in e2e env, login via form; assert browser context cookies include `fb_session` and session cookie with same value prefix. Skip or document when gate disabled.
  - Extend reject e2e (REVIEW-UX-007 path): select reason chip before submit; assert POST in network or row stays removed after refresh.
  - Preserve Phase 1 e2e (undo, auto-advance, Recently reviewed).
- **Depends on**: TASK-005, TASK-010, TASK-002
- **Verification**: `npm run test:e2e -- decision-panel.spec.ts` passes

---

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| `dashboard/lib/decision-feedback.ts` | TASK-004 | zod schemas + apiFetch wrappers for feedback/view GET |
| `dashboard/hooks/use-decision-feedback-status.ts` | TASK-009 | TanStack Query parallel GET for latest_action |
| `dashboard/app/(dashboard)/attention/_components/reject-reason-step.tsx` | TASK-006 | Shared inline reject reason chips (optional extract) |
| `dashboard/lib/__tests__/decision-feedback.test.ts` | TASK-014 | Integration tests REVIEW-UX-011 through 013 |

### To Modify

| File | Task | Changes |
|------|------|---------|
| `dashboard/lib/session-cookie-edge.ts` | TASK-001 | fb_session constant, path matcher, cookie read helper |
| `dashboard/app/(auth)/login/route.ts` | TASK-002 | Mint fb_session sibling cookie |
| `dashboard/app/(auth)/logout/route.ts` | TASK-002 | Clear fb_session |
| `dashboard/app/api/control/[...path]/route.ts` | TASK-003 | Inject fb_session on feedback/view POST |
| `dashboard/e2e/mock-upstream.mjs` | TASK-005 | Feedback + view mock routes |
| `dashboard/app/(dashboard)/attention/_components/attention-review-sheet.tsx` | TASK-006, TASK-008 | Reject reason step, view log on open |
| `dashboard/lib/review-actions.ts` | TASK-007 | Async API, optimistic UI, error toasts |
| `dashboard/lib/decision-review.ts` | TASK-007, TASK-012 | Merge API fields on record update |
| `dashboard/lib/attention-decisions.ts` | TASK-009 | serverReviewedIds filter |
| `dashboard/app/(dashboard)/attention/_components/attention-queue.tsx` | TASK-009, TASK-010 | Feedback hook, table reject opens sheet |
| `dashboard/app/(dashboard)/attention/_components/attention-queue-table.tsx` | TASK-010 | Reject opens sheet (if handler signature changes) |
| `dashboard/components/panels/WhatToDo.tsx` | TASK-011 | Async approve, reject reason UI |
| `dashboard/app/(dashboard)/attention/_components/attention-review-bar.tsx` | TASK-011 | Async approve, inline reject reason |
| `dashboard/app/(dashboard)/attention/_components/recently-reviewed.tsx` | TASK-012 | Server timestamp display |
| `dashboard/app/api/control/__tests__/route.test.ts` | TASK-013 | REVIEW-UX-010 |
| `dashboard/e2e/decision-panel.spec.ts` | TASK-015 | REVIEW-UX-014, 015 |

---

## Requirements Traceability

> Phase 2 functional requirements and acceptance criteria only. Phase 3 marked DEFERRED.

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| P2-F01 Approve POST `{ action: "approve" }` | spec § Phase 2 Functional | TASK-004, TASK-007 |
| P2-F02 Inline reject reason step with chips, reason_text, suggested_decision_type | spec § Phase 2 Functional | TASK-006, TASK-010, TASK-011 |
| P2-F03 Optimistic UI with rollback and error toast | spec § Phase 2 Functional | TASK-007 |
| P2-F04 Login mints fb_session, logout clears both | spec § Phase 2 Functional | TASK-002 |
| P2-F05 Proxy injects fb_session on feedback/view POST | spec § Phase 2 Functional | TASK-003 |
| P2-F06 View log once per sheet open | spec § Phase 2 Functional | TASK-008 |
| P2-F07 Persist feedbackId and created_at on record | spec § Phase 2 Functional | TASK-007, TASK-012 |
| P2-F08 Queue excludes server latest_action or local fallback | spec § Phase 2 Functional | TASK-009 |
| AC: Approve POST 201 and GET latest_action approve | spec § Phase 2 Acceptance | TASK-007, TASK-009, TASK-014 |
| AC: Reject not_at_risk persists and toast Rejected | spec § Phase 2 Acceptance | TASK-006, TASK-007, TASK-015 |
| AC: 401 session_required restores row and login link | spec § Phase 2 Acceptance | TASK-007, TASK-015 |
| AC: Sheet re-open within 60s at most one view row | spec § Phase 2 Acceptance | TASK-008, TASK-005 |
| AC: Refresh after success decision not in pending | spec § Phase 2 Acceptance | TASK-009, TASK-015 |
| P3-F01 through P3-F05 | spec § Phase 3 | DEFERRED — Phase 3 plan |
| Approve reason chips (agree_primary, etc.) | spec § Out of Scope | DEFERRED — Phase 2.1 |
| GET feedback/pending nudge on Attention | spec § Out of Scope | DEFERRED — feedback-pending-counter plan |

---

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| REVIEW-UX-010 | unit | Proxy injects fb_session when dp_session valid | TASK-013 |
| REVIEW-UX-011 | integration | Approve POST `{ action: "approve" }` to 201 | TASK-014 |
| REVIEW-UX-012 | integration | Reject POST with not_at_risk to 201 | TASK-014 |
| REVIEW-UX-013 | integration | wrong_decision_type without suggested type blocked client-side | TASK-014 |
| REVIEW-UX-014 | e2e | API failure restores row and error toast | TASK-015 |
| REVIEW-UX-015 | e2e | Login sets dp_session and fb_session | TASK-015 |
| REVIEW-UX-001 through 009 | unit/e2e | Phase 1 regression | TASK-015 (preserve) |

---

## Deviations from Spec

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| dashboard-passphrase-gate § Sibling cookie | `fb_session` Path=`/v1/decisions` | Login sets `fb_session` Path=`/` on Next.js dashboard host | Implementation detail — attention-review-ux.md § Cookies note explicitly overrides for BFF proxy |
| P2-F02 reject reason step | "in the review sheet" | Table and bar reject use shared `RejectReasonStep` inline (sheet or compact panel) before POST | Implementation detail — spec silent on table/bar entry; reason collection required before any reject POST |
| P2-F02 reject from WhatToDo | Primary surface WhatToDo listed in Phase 2 table | Compact inline reason UI in WhatToDo panel, not full DetailSheet | Implementation detail — same fields and validation as sheet step |
| Undo behavior Phase 2 | Undo removes local suppression only | Plan keeps Undo calling undoReview without API DELETE | Matches spec § Constraints append-only — no deviation |

None beyond the rows above — plan is literal-compatible with spec Phase 2 constants (`8000` ms undo, `2000` char reason_text, cookie names `fb_session` / `dp_session` / `__Host-dp_session`).

---

## Existing libraries (prefer over custom)

| Need | Library | Justification |
|------|---------|---------------|
| HTTP client | `apiFetch` (`dashboard/lib/api/client.ts`) | Same-origin proxy already used across dashboard |
| Payload validation | `zod` | Spec requirement; already in package.json |
| Server state / cache | `@tanstack/react-query` | Spec requirement for feedback GET caching (P2-F08) |
| Toasts | `sonner` | Phase 1 pattern; error title `Could not save review` |
| Session signing | `signSession` (`dashboard/lib/session-cookie.ts`) | Reuse single sign call for dual cookies |
| Cookie attributes | `buildSetCookieAttributes` | Reuse existing HttpOnly/Secure/SameSite helper |

No new npm dependencies required.

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| N parallel GET feedback calls on Attention load | Medium latency with large queues | useQueries with staleTime; only fetch IDs in urgent recent_decisions |
| Gate disabled in e2e skips REVIEW-UX-015 | Low | Document skip; optional e2e profile with gate on |
| Optimistic Undo after API success leaves orphan feedback row | Low | Expected per append-only spec; Undo only restores local queue |
| Table reject UX change (opens sheet) | Medium | Brief product note; matches required reason collection |
| Proxy cookie injection without valid session | High | Upstream 401 triggers P2-F03 rollback + session_required copy |

---

## Verification Checklist

- [x] All TASK-001 through TASK-015 completed
- [ ] `cd dashboard && npm test -- --run` passes
- [ ] `cd dashboard && npm run test:e2e -- decision-panel.spec.ts` passes
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] All five Phase 2 acceptance criteria manually verified on `/attention`
- [ ] Approve and reject rows reach mock upstream feedback store
- [ ] Refresh after approve keeps decision out of pending queue

### Test runbook (post-impl)

| Test | Status | How to run / fix |
|------|--------|------------------|
| REVIEW-UX-010–013 | unit/integration | `npm test -- --run route.test.ts decision-feedback.test.ts` |
| REVIEW-UX-006–009, 014 | e2e | `npx next build --no-lint && npm run test:e2e -- decision-panel.spec.ts -g "REVIEW-UX"` |
| REVIEW-UX-015 | **skipped** when gate off | Set `DASHBOARD_ACCESS_CODE` + `COOKIE_SECRET` (≥32 chars), rebuild, run `-g "REVIEW-UX-015"` — see spec § Contract Tests |
| NXMIG-014/015 | was failing (`link` vs `button`) | Fixed: use `clickSheetDrillDown` in `fixtures.ts` |

See `docs/specs/attention-review-ux.md` § Contract Tests → Phase 2 verification commands for full steps.

---

## Implementation Order

```
TASK-001 → TASK-002 ─┐
         → TASK-003 ─┼→ TASK-007 → TASK-010 → TASK-015
TASK-004 → TASK-005 ─┤         ↗ TASK-011 ──┘
         → TASK-006 ──┘         ↘ TASK-012
         → TASK-008
         → TASK-009 → TASK-010
TASK-001 → TASK-013 (after TASK-003)
TASK-004 → TASK-014 (after TASK-005)
```

Critical path: cookie + proxy (TASK-001 through 003) before any feedback POST from UI (TASK-007). Mock upstream (TASK-005) before integration/e2e. Reject UI (TASK-006) before wiring queue (TASK-010).

---

## Next Steps

After Phase 2 lands and acceptance criteria pass:

- Run `/post-impl-doc-sync` on `docs/specs/attention-review-ux.md` to check off Phase 2 requirements (P2-F01 through P2-F08).
- Run `/plan-impl docs/specs/attention-review-ux.md` scoped to **Phase 3** for Decisions filter, Overview KPI copy, and learner detail action chips.
