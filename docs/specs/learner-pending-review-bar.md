# Learner Pending Review Bar

> Extends learner detail (`/learners/[ref]`) so the **Action required** review bar appears whenever the learner has an unreviewed urgent decision — not only when the educator arrives from `/attention` with `?reviewDecision=` in the URL.

## Overview

Educators can reach a learner profile from two primary paths: **Attention** (triage queue) and **Learners** (roster browse). Today, the sticky `AttentionReviewBar` on `/learners/[ref]` renders only when the URL carries `reviewDecision=<decision_id>` (set by `learnerAttentionReviewUrl()` from the Attention review sheet). Drilling down from the Learners roster (`LearnerDetailSheet` → "Open full view") navigates to `/learners/[ref]` with **no** query params, so pending approve/reject work is invisible even though the same learner would show in the Attention queue.

The domain rule already exists in `dashboard/lib/attention-decisions.ts` (`buildPendingAttentionQueue()`): an **intervene** or **pause** decision is pending when it is not excluded by `isReviewedLocally()` or server `latest_action` (P2-F08 in `attention-review-ux.md`). This spec makes learner detail **data-driven**: derive the effective pending decision from learner summary + feedback status, reuse the shared queue helper, and show the existing review bar and approve/reject flow without requiring Attention as the entry path.

**Design authority:** `docs/specs/dashboard-design-requirements.md` §2 (educator journey, L1→L2 drill-down), §8 (Attention + learner detail), and `docs/specs/attention-review-ux.md` (review bar, toast, feedback persistence). Visual/interaction patterns for the bar itself are unchanged — this spec only changes **when** it mounts.

---

## Requirements

### Functional

- [x] **LPR-F01** On `/learners/[ref]`, resolve the learner's **effective pending decision** using the same rules as `buildPendingAttentionQueue()` scoped to that learner's summary (urgent type, not locally reviewed, not server-reviewed via `latest_action`).
- [x] **LPR-F02** When `effectivePendingDecisionId` is non-null, render `AttentionReviewBar` with that decision ID — identical Approve/Reject/reject-reason UX as the Attention-originated path (reuse `executeReviewAction`, origin `'bar'`).
- [x] **LPR-F03** **URL override:** when `?reviewDecision=<id>` is present and valid for this learner's recent decisions, use that ID as `effectivePendingDecisionId` even if queue ordering would pick a different ID. When the param references an unknown or already-reviewed decision, fall back to auto-detected pending (LPR-F01) or hide the bar if none.
- [x] **LPR-F04** **Post-action navigation:** after successful Approve/Reject from the bar, route to `/attention` when `from=attention`; otherwise **stay on** `/learners/[ref]` (refresh/invalidate summary + feedback queries; bar hides when no pending decision remains). Do not force Attention return for roster-originated reviews.
- [x] **LPR-F05** **Learner L1 drill-down:** when `LearnerDetailSheet` footer links to L2, if the learner has a pending urgent decision, use `learnerDetailReviewUrl(learnerRef, decisionId)` (see § URL helpers) so the deep link is shareable; omit `from=attention` unless the educator entered from Attention.
- [x] **LPR-F06** **Back link label:** retain current behavior — "Back to Attention" when `from=attention`, "Back to roster" otherwise (`learner-detail-view.tsx`).
- [x] **LPR-F07** **Multiple pending decisions:** when a learner has more than one unreviewed urgent decision in `recent_decisions`, pick the same ordering as `buildPendingAttentionQueue()` for that single learner (priority: intervene before pause; then newest `decided_at`). URL `reviewDecision` may target a specific row when educator deep-links.
- [x] **LPR-F08** **No duplicate CTAs:** when the review bar is visible, learner detail tabs MUST NOT add a second Approve/Reject primary action in tab content (bar remains the sole focal write action per dashboard-design-requirements §2.1).
- [x] **LPR-F09** Extract a shared pure helper `selectPendingDecisionForLearner(summary, serverReviewedIds)` in `dashboard/lib/attention-decisions.ts` (or re-export from queue builder) — **single source of truth**; no duplicated pending logic in components.

### Acceptance Criteria

- Given learner `Malosi` has an unreviewed **intervene** decision in summary `recent_decisions`, when the educator opens `/learners/Malosi` from the Learners roster (no query params), then the sticky **Action required** region with Approve and Reject is visible within one summary fetch cycle.
- Given the same learner and pending decision, when the educator approves from the bar (not from Attention), then a success toast appears, feedback persists via `POST .../feedback`, the bar hides, and the URL remains `/learners/Malosi` (no redirect to `/attention`).
- Given the educator opens `/learners/Malosi?reviewDecision=D1&from=attention` from the Attention sheet, when they approve, then they are redirected to `/attention` (unchanged P1-F09 behavior).
- Given learner `Leilani` has no unreviewed urgent decisions (all reviewed server-side or locally), when opening `/learners/Leilani` from the roster, then no review bar is shown.
- Given `?reviewDecision=<already-reviewed-id>`, when the learner still has another pending urgent decision, then the bar shows the auto-detected pending decision (fallback), not the reviewed ID.
- Given `LearnerDetailSheet` open for a learner with pending review, when the educator clicks **Open full view**, then the URL includes `reviewDecision=<pending-id>` (without `from=attention` unless applicable).

---

## Constraints

- **Dashboard-only:** No new backend endpoints, error codes, or DynamoDB changes. Consumes existing `GET /v1/learners/:ref/summary` and `GET /v1/decisions/:id/feedback`.
- **Anti-clutter:** One primary write action on learner detail viewport (review bar); history chips on Overview tab remain read-only (P3-F04).
- **Shared passphrase pilot:** Pending detection remains session/browser scoped for local review store; server `latest_action` authoritative on refresh (P2-F08).
- **Amend, don't fork:** Extends `attention-review-ux.md` P1-F09 — Attention-originated deep links remain valid; this spec adds roster-originated parity.

## Out of Scope

| Item | Rationale |
|------|-----------|
| Pending badge on Learners roster table rows | Valuable follow-up; separate discoverability spec |
| Auto-opening Attention sheet from learner detail | Attention remains the triage queue; learner detail only surfaces the bar |
| Review bar on Overview `/` or Decisions `/decisions` | Single learner context only |
| New `GET /v1/learners/:ref/pending-review` API | Client derives from summary + feedback; avoids API proliferation |
| Changing Attention queue ordering rules | Reuse existing `buildPendingAttentionQueue()` semantics |
| Approve/Reject on non-urgent decision types (`reinforce`, `advance`) | Unchanged — urgent types only |

---

## Dependencies

### Required from other specs

| Dependency | Source document | Status |
|------------|-----------------|--------|
| `buildPendingAttentionQueue()`, `decisionTypePriority()` | `dashboard/lib/attention-decisions.ts` | Defined ✓ — `selectPendingDecisionForLearner()`, `resolveEffectivePendingDecisionId()` |
| `AttentionReviewBar`, `executeReviewAction()` | `dashboard/app/(dashboard)/attention/_components/attention-review-bar.tsx`, `dashboard/lib/review-actions.ts` | Defined ✓ — `fromAttention` subcopy + post-action routing |
| `learnerAttentionReviewUrl()`, `learnerDetailReviewUrl()` | `dashboard/lib/attention-review-url.ts` | Defined ✓ |
| `usePendingReviewForLearner()` | `dashboard/hooks/use-pending-review-for-learner.ts` | Defined ✓ — summary + feedback → effective ID |
| `useLearnerSummary()`, `useFeedbackStatusForDecisionIds()` | `dashboard/hooks/use-learner-summary.ts`, `dashboard/hooks/use-decision-feedback-status.ts` | Defined ✓ |
| Educator Feedback API | `docs/specs/educator-feedback-api.md` | Implemented ✓ |
| Attention review UX (Phases 1–3) | `docs/specs/attention-review-ux.md` | Shipped ✓ — P1-F09 baseline |
| Learner summary API | `docs/specs/learner-summary-api.md` | Shipped ✓ |
| L1→L2 drill-down pattern | `docs/specs/dashboard-design-requirements.md` §2, §8 | Defined ✓ |

### Provides to other specs

| Capability | Used by |
|------------|---------|
| Consistent pending-review affordance on learner L2 | Educator journey in `dashboard-design-requirements.md` |
| Shareable learner URLs with optional `reviewDecision` | Pilot runbooks, `docs/guides/operators/aws-pilot-runbook.md` educator flows |

### Existing libraries (prefer over custom)

| Need | Library / module | Justification |
|------|------------------|---------------|
| Pending decision rules | `buildPendingAttentionQueue()` / extracted helper | **Less complex** — one source of truth; custom duplicate logic would drift |
| Server feedback state | `@tanstack/react-query` via `useFeedbackStatusForDecisionIds` | Already used on Attention queue and learner overview |
| Review actions | `executeReviewAction()` in `review-actions.ts` | Already handles toast, undo, API, queue invalidation |
| URL builders | Extend `attention-review-url.ts` | **Higher DX** — centralize query param names |
| Client validation | `zod` (feedback body) | Unchanged from Phase 2 |

No new npm dependencies.

---

## Error Codes

### Existing (reuse)

| Code | Source | Educator-facing copy |
|------|--------|----------------------|
| `session_required` | `educator-feedback-api.md` | “Session expired. Sign in again to save your review.” |
| `decision_not_found` | `educator-feedback-api.md` | “This decision is no longer available.” |
| `dashboard_upstream_unavailable` | dashboard proxy | “Could not reach the control layer. Try again.” + `request_id` |

### New

None — client-only feature; no new API or proxy error codes.

---

## Contract Tests

| Test ID | Type | Description | Input | Expected |
|---------|------|-------------|-------|----------|
| LPR-001 | unit | `selectPendingDecisionForLearner` — single unreviewed intervene | summary with 1 intervene, empty `serverReviewedIds` | returns that `decision_id` |
| LPR-002 | unit | Excludes server-reviewed | `latest_action` present for ID | returns `null` or next pending |
| LPR-003 | unit | Excludes locally reviewed | `isReviewedLocally(id)` true | returns `null` or next pending |
| LPR-004 | unit | Priority: intervene over pause | both unreviewed | returns intervene ID |
| LPR-005 | unit | URL override valid | param matches pending ID in summary | effective ID = param |
| LPR-006 | unit | URL override stale | param reviewed; another pending exists | effective ID = auto-detected pending |
| LPR-007 | unit | `learnerDetailReviewUrl` | learner + decisionId | `/learners/{ref}?reviewDecision={id}` only (no `from`) |
| LPR-008 | component | Bar hidden when no pending | summary loaded, all reviewed | no `Attention review actions` region |
| LPR-009 | e2e | Roster → full view shows bar | Learners → sheet → Open full view, pending learner | review bar visible; Approve/Reject work |
| LPR-010 | e2e | Roster approve stays on learner page | approve from bar without `from=attention` | URL stays `/learners/[ref]`; bar hides |
| LPR-011 | e2e | Attention path unchanged | `from=attention` + approve | redirect `/attention` (regression P1-F09) |

> **Test strategy:** LPR-001–007 are pure unit tests in `dashboard/lib/__tests__/attention-decisions.test.ts` (new) and `attention-review-url.test.ts` (extend). LPR-008 is a component test on `LearnerDetailView` with mocked hooks. LPR-009–011 extend `dashboard/e2e/decision-panel.spec.ts` using existing fixtures (`ensureFeedbackSession`, `resetMockFeedbackState`, `clickSheetDrillDown`).

---

## UX Specification

### Learner detail layout (when pending)

Unchanged from `attention-review-ux.md` P1-F09 — fixed bottom `AttentionReviewBar`, page bottom padding `pb-36 md:pb-40` when bar visible.

### Copy (review bar — unchanged)

| Element | Text |
|---------|------|
| Region `aria-label` | `Attention review actions` |
| Heading | `Action required` |
| Subcopy (Attention-originated) | `Approve or reject this decision before returning to the queue.` |
| Subcopy (roster-originated, **new**) | `Approve or reject this recommendation for this learner.` |

When `from=attention`, use queue subcopy; otherwise use learner-focused subcopy (same bar component, prop `variant: 'queue' | 'learner'` or derive from `fromAttention`).

### Post-action routing

| `from` query | After successful Approve/Reject |
|--------------|--------------------------------|
| `attention` | `router.push('/attention')` |
| absent or other | `router.replace('/learners/{ref}')` + invalidate queries; strip `reviewDecision` from URL if present |

---

## Concrete Values Checklist

### URL query parameters

| Param | Value | Required | Purpose |
|-------|-------|----------|---------|
| `reviewDecision` | decision UUID/string | no | Explicit decision to review; overrides auto-detect when valid |
| `from` | `attention` | no | Workflow context: back link + post-action redirect |
| `version` | integer | no | Unchanged — state tab version drill-down |

Param names MUST match `ATTENTION_REVIEW_DECISION_PARAM` and `ATTENTION_REVIEW_FROM_PARAM` in `dashboard/lib/attention-review-url.ts`.

### URL helpers

| Function | Output pattern |
|----------|----------------|
| `learnerAttentionReviewUrl(ref, id)` (existing) | `/learners/{encodedRef}?reviewDecision={id}&from=attention` |
| `learnerDetailReviewUrl(ref, id)` (**new**) | `/learners/{encodedRef}?reviewDecision={id}` |

### Pending decision selection (normative)

Reuse literals from `attention-decisions.ts`:

| Rule | Value |
|------|-------|
| Urgent types | `intervene`, `pause` |
| Priority | `intervene` → 1, `pause` → 2 (lower number = higher urgency) |
| Tie-break | `decided_at` descending (ISO 8601 string compare) |
| Review exclusion | `isReviewedLocally(decisionId)` OR `serverReviewedIds.has(decisionId)` |
| Summary fetch limit on learner detail | `recentDecisionsLimit: 10` (match existing `AttentionReviewBar` + overview tab) |

### HTTP behavior

N/A — no new routes or status codes. Existing feedback POST/GET behavior unchanged (`attention-review-ux.md` § HTTP behavior).

### Cookies / env vars

No new cookies or env vars. Reuse Phase 2 table from `attention-review-ux.md`.

### Routes touched (dashboard only)

| Method | Path | Change |
|--------|------|--------|
| GET | `/learners/[ref]` | Auto-mount review bar from data |
| — | `LearnerDetailSheet` footer href | Conditional `learnerDetailReviewUrl` |

---

## Production Correctness Notes

- **Proxy / `trustProxy`:** N/A — no new server routes; client fetches via existing `/api/control/*` proxy.
- **CORS:** N/A — same-origin dashboard.
- **CSP / security headers:** N/A — inherit Next.js/Amplify defaults.
- **Cookie prefix vs Path scoping:** N/A — unchanged from `attention-review-ux.md` Phase 2.
- **Content-type parsing:** N/A — no new POST bodies.
- **Body size limits:** N/A — feedback body limits unchanged.
- **Rate-limit storage scope:** N/A — review writes unrate-limited per `educator-feedback-api.md`.
- **Error-code surface:** Educators see existing friendly copy + `request_id`; never stack traces.

---

## File Structure (implementation hint)

```
dashboard/
├── lib/
│   ├── attention-decisions.ts       # selectPendingDecisionForLearner(), resolveEffectivePendingDecisionId()
│   ├── attention-review-url.ts      # learnerDetailReviewUrl()
│   └── __tests__/
│       ├── attention-decisions.test.ts   # LPR-001–006
│       └── attention-review-url.test.ts  # LPR-007
├── hooks/
│   └── use-pending-review-for-learner.ts   # summary + feedback → effective ID
├── app/(dashboard)/learners/
│   ├── [ref]/_components/learner-detail-view.tsx   # hook-driven review bar mount
│   └── _components/learner-detail-sheet.tsx        # conditional drill-down URL
├── app/(dashboard)/attention/_components/
│   └── attention-review-bar.tsx     # fromAttention subcopy + post-action routing
└── e2e/decision-panel.spec.ts       # LPR-009–011
```

---

## Notes

- **Implementation note:** `AttentionReviewBar` exposes `fromAttention?: boolean` (not a `variant` enum) to select queue vs learner subcopy and post-action routing — equivalent to UX § Copy table.
- **Supersedes partial behavior of** `attention-review-ux.md` P1-F09: that requirement stated the bar appears when navigating from Attention with query params; this spec **adds** roster-originated and direct-URL auto-detection without removing Attention deep links.
- **Analysis consistency:** Tier C (dashboard hosting) only; no AWS control-layer (Tier A) or LMS integration (Tier B) deployment required.
- **React best practice:** Derive `effectivePendingDecisionId` during render from fetched summary + feedback queries (`vercel-react-best-practices` §5.1 — do not store pending ID in separate state synced from props).
- **Gap closed in design doc:** `dashboard-design-requirements.md` §8 L2 now states roster-originated pending review mounts `AttentionReviewBar` (shipped 2026-07-04).
- **Post-ship doc sync:** Spec marked shipped in [`docs/specs/README.md`](README.md) (2026-07-04).

---

*Spec created: 2026-06-26 | **Shipped:** 2026-07-04 | Phase: v1 dashboard educator UX | Depends on: `attention-review-ux.md`, `dashboard-design-requirements.md`, `learner-summary-api.md`, `educator-feedback-api.md` | Amends: P1-F09 behavior scope*
