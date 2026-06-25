# Attention Review UX

> Closes the educator trust gap when triaging urgent decisions on `/attention`. **Phases 1–3 shipped on dashboard branch (2026-06-25):** Sonner toasts with undo, versioned review store, Recently reviewed band, Educator Feedback API persistence via BFF proxy, and cross-route discoverability on Overview and Decisions.

## Overview

Educators use **Attention** (`/attention`) and the legacy **What Should Happen Next** panel to review `intervene` and `pause` decisions. The dashboard implements a **versioned client review log** (`8p3p-review-log:v1`) in `dashboard/lib/decision-review.ts`, shared approve/reject actions in `dashboard/lib/review-actions.ts`, and persists feedback via `POST /v1/decisions/:id/feedback` through the Next.js control proxy.

The backend **Educator Feedback API** (`docs/specs/educator-feedback-api.md`) is implemented in `src/feedback/` and **consumed by the dashboard** (Phases 2–3). This spec defines dashboard-side behavior in **three ordered phases** — all three are shipped on branch.

**Design authority:** Visual and interaction patterns MUST follow:
- `docs/specs/dashboard-design-requirements.md` — educator journey, three-tier drill-down, single focal action, anti-clutter doctrine (§2, §8).
- `.agents/skills/frontend-design/SKILL.md` — intentional motion (completion micro-interactions over decoration), spatial hierarchy (primary pending queue vs secondary history band), semantic color on badges only, restrained typography carrying structure.
- `.agents/skills/vercel-react-best-practices/SKILL.md` — derive queue state during render; event-handler side effects (not effect-modeled actions); `useTransition` for non-urgent history band updates where applicable.

---

## Delivery Phases (normative order)

Implement **in sequence**. Do not ship Phase 2 before Phase 1 acceptance criteria pass; do not ship Phase 3 before Phase 2.

| Phase | Goal | Backend changes | Primary surfaces |
|-------|------|-----------------|------------------|
| **1 — Closure** | Educator knows an action succeeded, can undo, sees where items went | None | `/attention`, `WhatToDo` panel |
| **2 — Persistence** | Approve/Reject mean what they say; feedback reaches program metrics | Proxy + login cookie gap only (see § Proxy / session) | `/attention`, `WhatToDo` |
| **3 — Discoverability** | “Where did it go?” answered from Overview and Decisions | None (client/session aggregation) | `/`, `/decisions`, learner detail |

---

## Requirements

### Phase 1 — Closure (client-only)

#### Functional

- [x] **P1-F01** On Approve or Reject (table row or review sheet), show a **Sonner toast** with: learner reference, `DecisionBadge` type label, action taken, **Undo** action, and **View decision** link to `/decisions/[decision_id]`.
- [x] **P1-F02** **Undo** within the undo window restores the item to the pending queue (remove from reviewed store, re-open sheet if action originated from sheet).
- [x] **P1-F03** Replace bare-ID `localStorage` with a **versioned review record** (see § Client review store) capturing `decisionId`, `action`, `learnerReference`, `decisionType`, `reviewedAt` (ISO RFC3339), and optional `educatorSummary` snippet for history display.
- [x] **P1-F04** Below the pending queue on `/attention`, render a collapsible **Recently reviewed** band (default expanded when ≥1 review in session, collapsed when empty) showing the last N reviews (newest first) with learner, type badge, action chip, relative time, and row click → read-only review sheet.
- [x] **P1-F05** **Auto-advance:** when the educator acts from the review sheet, open the **next pending row** in queue order if one exists; otherwise close the sheet.
- [x] **P1-F06** **Context-aware empty state** on `/attention`: if pending queue is empty and session review count > 0, message MUST include reviewed count (e.g. “Queue clear — you reviewed 4 decisions today.”); if no reviews, use “No urgent decisions right now.”
- [x] **P1-F07** Page header badge area shows **`{pending} awaiting · {reviewedToday} reviewed today`** when either count > 0.
- [x] **P1-F08** Apply the same toast + store behavior to `dashboard/components/panels/WhatToDo.tsx` (Overview panel).
- [x] **P1-F09** **L2 review continuity:** navigating to learner detail from Attention (`View learner profile`) MUST carry `reviewDecision` + `from=attention` query params and render a sticky **Attention review bar** with Approve, Reject, and Back to Attention on `/learners/[ref]`.
- [x] **P1-F10** **Attention L1 footer hierarchy:** Approve/Reject are equal-width primary footer actions; learner context drill-down is a secondary link (`View learner profile`), not a full-width primary `DrillDownLink`.

#### Acceptance Criteria

- Given a pending intervene decision for learner `Malosi`, when the educator clicks **Approve**, then a toast appears within 100 ms with “Malosi”, “Intervene”, and an Undo control; the row leaves the pending table; `Malosi` appears in Recently reviewed with action **Approved**.
- Given the educator clicks **Undo** on that toast within 8 s, then `Malosi` reappears in the pending queue and is removed from Recently reviewed.
- Given 3 pending items and the educator approves from the review sheet, then the sheet opens the next pending item without manual row click.
- Given the educator reviewed 2 items and the queue is now empty, then empty copy mentions “2” reviewed (not “All caught up” alone).
- Given Approve and Reject on the same decision, then Recently reviewed shows distinct action chips (**Approved** vs **Rejected**).
- Given the educator clicks **View learner profile** from the Attention review sheet, when the learner detail route loads, then a sticky review bar shows Approve, Reject, and Back to Attention; acting from the bar returns to `/attention` and removes the decision from the pending queue.

---

### Phase 2 — Persistence (Educator Feedback API)

#### Functional

- [x] **P2-F01** On Approve, `POST /v1/decisions/:decision_id/feedback` with body `{ "action": "approve" }` (optional `reason_category` deferred to post-MVP chips).
- [x] **P2-F02** On Reject, open an **inline reason step** in the review sheet (not a blocking modal): required `reason_category` chip selection from the reject closed set in `educator-feedback-api.md`; optional `reason_text` (≤ 2000 chars); when `reason_category === "wrong_decision_type"`, show required `suggested_decision_type` select (`reinforce` | `advance` | `intervene` | `pause`).
- [x] **P2-F03** **Optimistic UI:** remove from pending queue immediately; on API failure, restore row, show error toast with copyable `request_id`, and remove optimistic Recently reviewed entry.
- [x] **P2-F04** **Login mints `fb_session`** sibling cookie per `dashboard-passphrase-gate.md` § Sibling cookie; **logout clears both**.
- [x] **P2-F05** **Proxy session bridge:** for upstream paths matching `v1/decisions/*/feedback` and `v1/decisions/*/view`, the dashboard proxy injects `Cookie: fb_session=<signed>` when the incoming request carries a valid `dp_session` / `__Host-dp_session` (same signed payload value). Justification: split-origin Next.js proxy uses `/api/control/…`; browser `fb_session` with `Path=/v1/decisions` is not sent to that path — BFF injection preserves API isolation without widening `dp_session` scope.
- [x] **P2-F06** On review sheet open, fire `POST /v1/decisions/:decision_id/view` once per open (dedup handled server-side).
- [x] **P2-F07** After successful feedback write, persist API `feedback_id` and `created_at` on the client review record; Recently reviewed shows server timestamp when present.
- [x] **P2-F08** Deprecate “reviewed = hidden forever” as the sole source of truth: pending queue excludes decisions where **latest feedback exists for this browser session** OR `isReviewedLocally(decisionId)` during offline/failure fallback. When `GET .../feedback` returns `latest_action != null`, treat as reviewed even if local store was cleared.

#### Acceptance Criteria

- Given a valid dashboard session and decision `D`, when the educator approves, then `POST .../feedback` returns 201 and `GET .../feedback` shows `latest_action: "approve"`.
- Given reject with `reason_category: "not_at_risk"`, when submitted, then feedback row persists and toast shows **Rejected**.
- Given upstream returns 401 `session_required`, when the educator rejects, then the row is restored and error toast explains session expired with link to `/login`.
- Given the educator opens a decision sheet, when they close and re-open within 60 s, then at most one view log row exists server-side (dedup).
- Given API success after local optimistic remove, when the educator refreshes the page, then the decision does not reappear in pending (server `latest_action` authoritative).

---

### Phase 3 — Discoverability

#### Functional

- [x] **P3-F01** **`/decisions` filter bar:** add **Review status** select: `All` | `Pending review` | `Reviewed by me (session)`. “Reviewed by me” filters to decision IDs present in the client review store for the current session (Phase 3 v1 — no new list endpoint).
- [x] **P3-F02** Decisions table adds optional column (column picker, off by default): **Your action** — `Approved` / `Rejected` chip from session store or `GET .../feedback` `latest_action` when row is expanded or sheet opens.
- [x] **P3-F03** **Overview KPI** (optional fifth card only if slot available without breaking ≤4 KPI rule): repurpose **Pending decisions** card drill-down subtitle to include “N reviewed today” from session store when > 0; do **not** add a fifth KPI card (honors §2.1 anti-clutter). Preferred: extend existing **Pending decisions** StatCard tooltip/footer line.
- [x] **P3-F04** **Learner detail** (`/learners/[ref]`) recent decisions list: show educator action chip when feedback exists (fetch on tab mount, cache with TanStack Query).
- [x] **P3-F05** Toast **View decision** link remains the primary “where did it go” path; Phase 3 adds filter prefill via query `?reviewed=session` when navigating from toast optional enhancement.

#### Acceptance Criteria

- Given 2 decisions reviewed this session, when the educator sets Review status to “Reviewed by me”, then the table shows exactly those 2 rows.
- Given a decision with `latest_action: "reject"` on learner detail, when the Overview tab loads, then the recent decision row shows a **Rejected** chip.
- Given Overview Pending decisions KPI with 0 pending and 3 reviewed today, then tooltip or secondary line mentions “3 reviewed today”.

---

## UX & Visual Specification

> Grounded in `.agents/skills/frontend-design/SKILL.md` (restraint, hierarchy, purposeful motion) and `dashboard-design-requirements.md` §8 Attention layout.

### `/attention` layout (Phase 1+)

```
┌─ PageHeader ─────────────────────────────────────────────┐
│  Attention          [3 awaiting · 2 reviewed today]      │
├──────────────────────────────────────────────────────────┤
│  Action type filter          Showing 3 of 3 in queue       │
│  ┌ PENDING QUEUE (primary, full width) ────────────────┐ │
│  │ DataTable — learner · type · summary · actions      │ │
│  └─────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────┤
│  ▼ Recently reviewed (2)          muted section label    │
│  · Malosi · Intervene · Approved · 3m ago    [View →]    │
│  · Leilani · Pause · Rejected · 12m ago      [View →]    │
└──────────────────────────────────────────────────────────┘
```

- **Primary vs secondary:** Pending queue uses default foreground density; Recently reviewed uses `text-muted-foreground` section label, `border-t`, and `gap-4` — never competes with pending rows (frontend-design: spatial hierarchy).
- **Motion:** Row exit uses CSS `opacity` + `height` transition ≤ 200 ms OR Sonner-only feedback without row animation — pick one, not both (avoid scattered micro-interactions).
- **Reject reason step:** Expands inside existing `DetailSheet` body with chip group (`Button variant="outline"` toggles); no second sheet.

### Toast pattern (reuse Sonner)

| Field | Value |
|-------|-------|
| Library | `sonner` (^2.0.7, already in `dashboard/package.json`) |
| Success title | `{actionPastTense} · {learnerReference}` |
| Description | `{DecisionBadge label}` — e.g. “Intervene” |
| Actions | `Undo` (button), `View decision` (link button → `/decisions/{id}`) |
| Error title | `Could not save review` |
| Error description | Friendly message + monospace `request_id` when present |

Reference implementation pattern: `dashboard/app/(dashboard)/signals/upload/_components/step-review.tsx` (commit toast).

### Reject reason categories (labels for educators)

| `reason_category` (wire) | Educator-facing chip label |
|--------------------------|----------------------------|
| `not_at_risk` | Not at risk |
| `wrong_skill` | Wrong skill |
| `wrong_timing` | Wrong timing |
| `wrong_decision_type` | Wrong action type |
| `data_stale` | Data is stale |
| `other` | Other |

---

## Client review store

Replaces `dashboard/lib/decision-review.ts` bare Set.

### localStorage key migration

| Key | Status |
|-----|--------|
| `8p3p-reviewed-decisions` | **Legacy** — array of decision ID strings |
| `8p3p-review-log:v1` | **Current** — JSON array of review records |

On read, migrate legacy IDs to `{ decisionId, action: "approve", learnerReference: "", decisionType: "intervene", reviewedAt: <migration timestamp>, source: "legacy" }` and rewrite to v1 key.

### Review record shape (TypeScript)

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

### Store API (dashboard lib)

| Function | Behavior |
|----------|----------|
| `recordReview(record)` | Append; dedupe by `decisionId` (latest wins) |
| `undoReview(decisionId)` | Remove record; used by toast Undo |
| `listRecentReviews(limit)` | Newest first, default limit 10 |
| `countReviewedToday()` | Records where `reviewedAt` date = local today |
| `isReviewedLocally(decisionId)` | Membership check for queue filter |

---

## Constraints

- **Educator-first L0 density:** Recently reviewed is a secondary band, not a second full table (dashboard-design-requirements §2.1 anti-clutter).
- **No fifth Overview KPI card** without amending design-requirements; Phase 3 augments copy on existing cards only.
- **Append-only feedback:** Educators cannot delete server feedback; Undo in Phase 2+ removes local queue suppression only — does **not** DELETE API rows.
- **Shared passphrase pilot:** Session history is browser/session scoped, not per-named-educator (consistent with `educator-feedback-api.md` § Constraints).
- **Phase 2 requires proxy change** — feedback writes fail until `fb_session` bridge ships.

## Out of Scope

| Item | Rationale | Revisit |
|------|-----------|---------|
| `GET /v1/decisions/feedback/recent` list endpoint | Phase 3 uses client store + per-decision GET on drill-down | Post-pilot if cross-device history required |
| Approve reason chips (`agree_primary`, etc.) | Optional; one-click approve sufficient for MVP | Phase 2.1 |
| Email/push reminders for unreviewed | educator-feedback-api.md out of scope | Post-pilot |
| Hard-gating dashboard on pending count | Soft nudge only | Never for pilot |
| DynamoDB `GET .../feedback/pending` 501 workaround | Not surfaced on Attention page in Phase 2 | feedback-pending-counter plan |
| Replacing DataTable with LearnerCard list on Attention | Design-requirements §8 mentions cards; current table acceptable if scannable | Separate IA plan |

---

## Dependencies

### Required from other specs

| Dependency | Source document | Status |
|------------|-----------------|--------|
| Attention queue builder `buildPendingAttentionQueue()` | `dashboard/lib/attention-decisions.ts` | Defined ✓ |
| Educator Feedback API (`POST/GET .../feedback`, `POST .../view`) | `docs/specs/educator-feedback-api.md` | Implemented ✓ (backend) |
| Session cookies `dp_session`, `fb_session` | `docs/specs/dashboard-passphrase-gate.md` § Sibling cookie | Defined ✓ — login/logout mint/clear `fb_session` (Phase 2) |
| Proxy `/api/control/*` | `docs/specs/nextjs-amplify-dashboard-migration.md` | Defined ✓ — `fb_session` injected on feedback/view POST (Phase 2) |
| `DetailSheet`, `DecisionBadge`, `PageHeader`, `EmptyState` | `docs/specs/dashboard-design-requirements.md` §9 | Defined ✓ |
| Sonner toaster | `dashboard/app/layout.tsx` | Defined ✓ |
| Reject/approve closed sets | `docs/specs/educator-feedback-api.md` § Data Model | Defined ✓ |
| Program metrics consumption | `docs/specs/program-metrics.md` | Downstream of Phase 2 writes |

### Provides to other specs

| Capability | Used by |
|------------|---------|
| Dashboard feedback write integration | `program-metrics.md` (MC-B*), `pilot-research-export.md` |
| Session review history UX | `decision-panel-ui.md` — supersedes § Approve/Reject Flow “localStorage only” pilot note for dashboard implementation |

### Existing libraries (prefer over custom)

| Need | Library | Justification |
|------|---------|---------------|
| Toasts | `sonner` | Already installed and used; no custom toast stack |
| Server state / retry | `@tanstack/react-query` | Already used for learner summaries; invalidate on feedback success |
| Client payload validation | `zod` | Already in dashboard; validate feedback body before POST |
| Relative time | `Intl.RelativeTimeFormat` or small inline helper | Avoid adding `date-fns` for one surface |
| Review store | Extend `decision-review.ts` | Less complex than IndexedDB for ≤10 session rows |

---

## Error Codes

### Existing (reuse via API proxy)

| Code | Source | Educator-facing copy |
|------|--------|----------------------|
| `session_required` | `educator-feedback-api.md` | “Session expired. Sign in again to save your review.” |
| `decision_not_found` | `educator-feedback-api.md` | “This decision is no longer available.” |
| `invalid_reason_category` | `educator-feedback-api.md` | “Choose a reason before submitting.” |
| `suggested_decision_type_required` | `educator-feedback-api.md` | “Select the action type you expected.” |
| `dashboard_upstream_unavailable` | dashboard proxy | “Could not reach the control layer. Try again.” + `request_id` |

### New (client-only)

| Code | Description |
|------|-------------|
| `review_undo_expired` | Undo clicked after undo window elapsed — toast info “Undo expired” |
| `review_store_quota` | localStorage write failed — toast warning; queue filter falls back to in-memory session |

---

## Contract Tests

| Test ID | Phase | Type | Description | Expected |
|---------|-------|------|-------------|----------|
| REVIEW-UX-001 | 1 | unit | `recordReview` + `isReviewedLocally` | Queue filter excludes reviewed ID |
| REVIEW-UX-002 | 1 | unit | Legacy key migration | v1 key populated; legacy removed |
| REVIEW-UX-003 | 1 | unit | `undoReview` within window | ID restored to pending set |
| REVIEW-UX-004 | 1 | unit | `countReviewedToday` timezone boundary | Count matches local calendar day |
| REVIEW-UX-005 | 1 | component | Toast payload shape | Title includes learner + action |
| REVIEW-UX-006 | 1 | e2e | Approve removes row + shows toast | Row gone; toast visible; Undo restores |
| REVIEW-UX-007 | 1 | e2e | Reject distinct from approve in history | Action chips differ |
| REVIEW-UX-008 | 1 | e2e | Auto-advance in sheet | Next row opens after approve |
| REVIEW-UX-009 | 1 | e2e | Empty state copy with reviews | Mentions review count |
| REVIEW-UX-010 | 2 | unit | Proxy injects `fb_session` when `dp_session` valid | Upstream receives Cookie header on feedback POST |
| REVIEW-UX-011 | 2 | integration | Approve POST body | `{ action: "approve" }` → 201 |
| REVIEW-UX-012 | 2 | integration | Reject POST with `not_at_risk` | 201; reason round-trips |
| REVIEW-UX-013 | 2 | integration | Reject `wrong_decision_type` without suggested type | 400 before optimistic commit |
| REVIEW-UX-014 | 2 | e2e | API failure restores row | Row reappears; error toast |
| REVIEW-UX-015 | 2 | e2e | Login sets dual cookies | `dp_session` + `fb_session` present |
| REVIEW-UX-016 | 3 | e2e | Decisions filter “Reviewed by me” | Only session-reviewed IDs shown |
| REVIEW-UX-017 | 3 | component | Learner detail action chip | Renders when `latest_action` set |

> **Test strategy:** Phase 1 unit tests target `dashboard/lib/decision-review.ts` (jsdom localStorage). Phase 2 integration tests use mock upstream with feedback routes (`dashboard/e2e/mock-upstream.mjs`). Phase 2 proxy unit tests extend `dashboard/app/api/control/__tests__/route.test.ts`.
>
> **Test ID note:** `REVIEW-UX-010` in this table is the **proxy unit test** (`route.test.ts`). The e2e file `decision-panel.spec.ts` reuses the label `REVIEW-UX-010` for a **Phase 1 header-badge regression** — different test; do not conflate IDs across types.

### Phase 2 verification commands

**Unit + integration (REVIEW-UX-010–013):**

```bash
cd dashboard
npm test -- --run route.test.ts decision-feedback.test.ts
```

**E2e (REVIEW-UX-006–009, 014; Phase 1 regression in same file):**

```bash
cd dashboard
npx next build --no-lint   # required before playwright webServer starts `next start`
npm run test:e2e -- decision-panel.spec.ts
```

**E2e isolation helpers** (in `dashboard/e2e/fixtures.ts`):

| Helper | Purpose |
|--------|---------|
| `ensureFeedbackSession(page)` | Sets `dp_session` so the proxy injects `fb_session` on feedback POST |
| `resetMockFeedbackState()` | `POST /__e2e__/reset-feedback` on mock upstream — clears server `latest_action` between tests |
| `rejectFromTableWithReason(page, learnerRef)` | Phase 2 table reject → sheet reason step → submit |
| `interceptFeedbackPostFailure(page, …)` | Route intercept for REVIEW-UX-014 rollback cases |
| `clickSheetDrillDown(page, label)` | Clicks footer drill-down (`DrillDownLink` is `role=button`, not link) |

**REVIEW-UX-015 (skipped by default):** Playwright skips when `DASHBOARD_ACCESS_CODE` is unset (gate off in default e2e env). To run:

```bash
cd dashboard
export DASHBOARD_ACCESS_CODE='your-test-passphrase'
export COOKIE_SECRET="$(openssl rand -hex 32)"   # min 32 chars when gate on
npx next build --no-lint
npm run test:e2e -- decision-panel.spec.ts -g "REVIEW-UX-015"
```

Expect: after login at `/login` (Access Code + **Continue**), browser cookies include `dp_session` (or `__Host-dp_session` in production) and `fb_session` with **identical values**.

**Known unrelated e2e failures (NXMIG-014/015):** Learner/decision sheet drill-down tests previously used `getByRole('link')` but `DrillDownLink` renders as a button — fixed via `clickSheetDrillDown`.

---

## Concrete Values Checklist

### Client constants

| Constant | Value |
|----------|-------|
| Undo window | `8000` ms (toast `duration`) |
| Recently reviewed max rows | `10` |
| Review log localStorage key | `8p3p-review-log:v1` |
| Legacy localStorage key | `8p3p-reviewed-decisions` |
| Row exit transition | `200` ms max (optional) |
| Reject `reason_text` max | `2000` chars (mirror API) |
| View log trigger | Once per sheet open (`open === true` edge) |

### Toast copy (exact strings)

| Event | Title template |
|-------|----------------|
| Approve success | `Approved · {learnerReference}` |
| Reject success | `Rejected · {learnerReference}` |
| Undo success | `Restored · {learnerReference}` |
| Undo expired | `Undo expired` |

### HTTP behavior (Phase 2 — dashboard proxy → upstream)

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

### Cookies (Phase 2 — login/logout)

| Name | HttpOnly | Secure | SameSite | Path | Max-Age |
|------|----------|--------|----------|------|---------|
| `dp_session` or `__Host-dp_session` | true | true (prod) | Strict | `/` | `DASHBOARD_SESSION_TTL_HOURS` × 3600 (default 28800) |
| `fb_session` | true | true (prod) | Strict | `/` (dashboard host; proxy reads and forwards) | Same as `dp_session` |
| Value | Identical signed string from single `signSession()` call | | | | |

> **Note:** `fb_session` Path=`/v1/decisions` from `dashboard-passphrase-gate.md` applies to **direct browser→API-host** calls. On the Next.js dashboard host, Phase 2 sets Path=`/` so the proxy can read the cookie and forward it upstream. The upstream API validates the cookie value, not the browser path.

### Env vars (no new vars)

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `COOKIE_SECRET` | yes (gate on) | — | string | Signs both session cookies |
| `DASHBOARD_SESSION_TTL_HOURS` | no | `8` | number | Cookie Max-Age |
| `CONTROL_LAYER_API_KEY` | yes | — | string | Proxy upstream auth |
| `CONTROL_LAYER_API_BASE_URL` | yes | — | string | Upstream base URL |
| `CONTROL_LAYER_ORG_ID` | yes | — | string | Injected org scope |

### Routes touched (dashboard only)

| Method | Path | Auth exempt? |
|--------|------|--------------|
| GET/POST | `/attention` | no (middleware) |
| POST | `/api/control/v1/decisions/:id/feedback` | no |
| POST | `/api/control/v1/decisions/:id/view` | no |
| GET | `/api/control/v1/decisions/:id/feedback` | no |

---

## Production Correctness Notes

- **Proxy / `trustProxy`:** N/A — Next.js Route Handlers; client IP used only for login rate limit (`dashboard/lib/login-rate-limiter.ts`), not for review writes.
- **CORS:** N/A — same-origin dashboard calls `/api/control/*` only.
- **CSP / security headers:** N/A — inherit Amplify/Next defaults; toast links are same-origin relative paths.
- **Cookie prefix vs Path scoping:** Production uses `__Host-dp_session` with Path=`/`; `fb_session` without `__Host-` prefix (narrower forward semantics via proxy injection).
- **Content-type parsing:** Feedback POST bodies are `application/json`; parsed by proxy `prepareRequestBody`.
- **Body size limits:** Feedback body ≪ 1 KB typical; bounded by `reason_text` 2000 chars — N/A special limit.
- **Rate-limit storage scope:** Login rate limit remains in-process Map; review writes unrate-limited per educator-feedback-api.md.
- **Error-code surface:** Educators see friendly copy + `request_id`; never stack traces or SQL errors.

---

## File Structure (implementation hint)

```
dashboard/
├── lib/
│   ├── decision-review.ts          # extend: review log v1 + migration
│   ├── decision-feedback.ts        # Phase 2: apiFetch wrappers + zod schemas
│   └── attention-decisions.ts      # queue filter: local + latest_action
├── app/(dashboard)/attention/_components/
│   ├── attention-queue.tsx         # wire toast, history, header counts
│   ├── attention-review-sheet.tsx  # reject reason step, auto-advance
│   ├── attention-queue-table.tsx
│   └── recently-reviewed.tsx       # Phase 1: new secondary band
├── components/panels/WhatToDo.tsx
├── app/(auth)/login/route.ts       # Phase 2: mint fb_session
├── app/(auth)/logout/route.ts      # Phase 2: clear fb_session
└── app/api/control/[...path]/route.ts  # Phase 2: cookie injection
```

---

## Notes

- **Supersedes** `decision-panel-ui.md` § “Approve/Reject Flow” localStorage-only pilot language for the Next.js dashboard; backend contract remains `educator-feedback-api.md`, not a new `POST .../review` endpoint.
- **Ingestion log precedent:** `dashboard/app/(dashboard)/signals/_components/ingestion-log.tsx` demonstrates primary log + expandable detail — Recently reviewed follows the same information-scent pattern at lower density.
- **Analysis consistency (Tier C):** This spec improves dashboard hosting UX only; no AWS control-layer (Tier A) or LMS integration (Tier B) deployment required.

---

*Spec created: 2026-06-23 | Updated: 2026-06-25 (Phases 1–3 requirement checkboxes reconciled with dashboard branch) | Phase: v1.2 dashboard educator UX | Depends on: `educator-feedback-api.md`, `dashboard-design-requirements.md`, `dashboard-passphrase-gate.md`, `decision-panel-ui.md` | Feeds: `program-metrics.md`, `pilot-research-export.md`*
