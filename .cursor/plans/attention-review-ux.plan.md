---
name: Attention Review UX Phase 1
overview: Closes the educator trust gap on /attention and WhatToDo by replacing bare-ID localStorage with a versioned review log, Sonner toasts with 8s undo, a Recently reviewed band, auto-advance in the review sheet, and distinct Approve/Reject actions. Client-only; no Educator Feedback API calls (Phase 2 deferred).
todos:
  - id: TASK-001
    content: Replace decision-review.ts with v1 review log store and legacy migration
    status: completed
  - id: TASK-002
    content: Update attention-decisions.ts and WhatToDo filter to isReviewedLocally
    status: completed
  - id: TASK-003
    content: Create lib/review-actions.ts with toast, undo, and queue tick helper
    status: completed
  - id: TASK-004
    content: Create recently-reviewed.tsx secondary band component
    status: completed
  - id: TASK-005
    content: Wire attention-queue.tsx header counts, empty state, and review flow
    status: completed
  - id: TASK-006
    content: Update attention-review-sheet.tsx for auto-advance and action typing
    status: completed
  - id: TASK-007
    content: Fix attention-review-bar.tsx distinct Approve and Reject handlers
    status: completed
  - id: TASK-008
    content: Wire WhatToDo.tsx with shared review-actions
    status: completed
  - id: TASK-009
    content: Unit tests for review store REVIEW-UX-001 through 004
    status: completed
  - id: TASK-010
    content: Component test for toast payload REVIEW-UX-005
    status: completed
  - id: TASK-011
    content: E2e tests for review UX REVIEW-UX-006 through 009
    status: completed
isProject: false
---

# Attention Review UX — Phase 1 (Closure)

**Spec**: `docs/specs/attention-review-ux.md` (Phase 1 only; Phases 2–3 deferred)

## Current baseline (branch)

| Area | Status |
|------|--------|
| Attention table + review sheet scaffold | Shipped |
| URL params `reviewDecision` + `from=attention` | Shipped (`attention-review-url.ts`, `page-url-state.ts`) |
| Learner detail sticky review bar shell | Shipped; **bug:** Approve and Reject both call `markReviewed(decisionId)` with no action distinction |
| Sheet footer hierarchy (equal Approve/Reject, link drill-down) | Shipped (P1-F10) |
| Review log v1, toasts, undo, Recently reviewed band | **Not started** |

---

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase.

### From spec § Client review store — localStorage key migration

| Key | Status |
|-----|--------|
| `8p3p-reviewed-decisions` | **Legacy** — array of decision ID strings |
| `8p3p-review-log:v1` | **Current** — JSON array of review records |

On read, migrate legacy IDs to `{ decisionId, action: "approve", learnerReference: "", decisionType: "intervene", reviewedAt: <migration timestamp>, source: "legacy" }` and rewrite to v1 key.

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

### From spec § Client review store — Store API (dashboard lib)

| Function | Behavior |
|----------|----------|
| `recordReview(record)` | Append; dedupe by `decisionId` (latest wins) |
| `undoReview(decisionId)` | Remove record; used by toast Undo |
| `listRecentReviews(limit)` | Newest first, default limit 10 |
| `countReviewedToday()` | Records where `reviewedAt` date = local today |
| `isReviewedLocally(decisionId)` | Membership check for queue filter |

### From spec § UX & Visual Specification — Toast pattern (reuse Sonner)

| Field | Value |
|-------|-------|
| Library | `sonner` (^2.0.7, already in `dashboard/package.json`) |
| Success title | `{actionPastTense} · {learnerReference}` |
| Description | `{DecisionBadge label}` — e.g. "Intervene" |
| Actions | `Undo` (button), `View decision` (link button → `/decisions/{id}`) |
| Error title | `Could not save review` |
| Error description | Friendly message + monospace `request_id` when present |

Reference implementation pattern: `dashboard/app/(dashboard)/signals/upload/_components/step-review.tsx` (commit toast).

### From spec § Concrete Values Checklist — Client constants

| Constant | Value |
|----------|-------|
| Undo window | `8000` ms (toast `duration`) |
| Recently reviewed max rows | `10` |
| Review log localStorage key | `8p3p-review-log:v1` |
| Legacy localStorage key | `8p3p-reviewed-decisions` |
| Row exit transition | `200` ms max (optional) |

### From spec § Concrete Values Checklist — Toast copy (exact strings)

| Event | Title template |
|-------|----------------|
| Approve success | `Approved · {learnerReference}` |
| Reject success | `Rejected · {learnerReference}` |
| Undo success | `Restored · {learnerReference}` |
| Undo expired | `Undo expired` |

### From spec § UX & Visual Specification — `/attention` layout (Phase 1+)

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

- **Primary vs secondary:** Pending queue uses default foreground density; Recently reviewed uses `text-muted-foreground` section label, `border-t`, and `gap-4` — never competes with pending rows.
- **Motion:** Row exit uses CSS `opacity` + `height` transition ≤ 200 ms OR Sonner-only feedback without row animation — pick one, not both.

---

## Prerequisites

Before starting implementation:

- [ ] PREREQ-001 Branch includes Attention scaffold (`attention-queue.tsx`, `attention-review-sheet.tsx`, `attention-review-bar.tsx`, `attention-review-url.ts`) — already on branch
- [ ] PREREQ-002 Sonner toaster mounted in `dashboard/app/layout.tsx` — confirmed installed
- [ ] PREREQ-003 No Phase 2 API/proxy work in this plan — feedback POST deferred

---

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list. Do not duplicate per-task status inside task bodies.

### TASK-001: Replace decision-review.ts with v1 review log store and legacy migration

- **Files**: `dashboard/lib/decision-review.ts`
- **Action**: Modify
- **Details**:
  - Replace `markReviewed` / `isReviewed` / bare Set with the Store API from Spec Literals (`recordReview`, `undoReview`, `listRecentReviews`, `countReviewedToday`, `isReviewedLocally`).
  - Persist to key `8p3p-review-log:v1`; on first read migrate legacy key `8p3p-reviewed-decisions` per migration rule (action `"approve"`, empty `learnerReference`, `decisionType: "intervene"`, `source: "legacy"`, `reviewedAt` = migration ISO timestamp).
  - Export `ReviewAction`, `DecisionReviewRecord` types.
  - Remove or deprecate `markReviewed` / `isReviewed` exports (update call sites in TASK-002+).
  - Handle `review_store_quota` per spec: wrap `localStorage.setItem` in try/catch; on failure toast warning and fall back to in-memory session Set for queue filter only.
- **Depends on**: none
- **Verification**: `recordReview` + `isReviewedLocally` exclude ID from pending set; legacy key migration rewrites to v1; `undoReview` removes record

### TASK-002: Update attention-decisions.ts and WhatToDo filter to isReviewedLocally

- **Files**: `dashboard/lib/attention-decisions.ts`, `dashboard/components/panels/WhatToDo.tsx` (import only)
- **Action**: Modify
- **Details**:
  - Change `buildPendingAttentionQueue` filter from `isReviewed(decision.decision_id)` to `isReviewedLocally(decision.decision_id)`.
  - Update WhatToDo import to `isReviewedLocally` (full wiring in TASK-008).
- **Depends on**: TASK-001
- **Verification**: Queue builder excludes locally reviewed IDs; no references to removed `isReviewed` export remain in lib

### TASK-003: Create lib/review-actions.ts with toast, undo, and queue tick helper

- **Files**: `dashboard/lib/review-actions.ts` (new)
- **Action**: Create
- **Details**:
  - Export `executeReviewAction(params)` accepting `{ action: ReviewAction, decisionId, learnerReference, decisionType, educatorSummary?, origin: 'table' | 'sheet' | 'bar' | 'what-to-do', onQueueChange: () => void, onSheetReopen?: (decisionId: string) => void }`.
  - Flow: `recordReview(...)` → `onQueueChange()` (review tick) → Sonner toast per Toast pattern with `duration: 8000`.
  - Success title: `Approved · {learnerReference}` or `Rejected · {learnerReference}` (exact strings from Toast copy table).
  - Description: DecisionBadge label ("Intervene" / "Pause").
  - Actions: **Undo** button calls `undoReview(decisionId)`, `onQueueChange()`, toast `Restored · {learnerReference}`; if `origin === 'sheet'`, call `onSheetReopen(decisionId)`.
  - **View decision** link button → `/decisions/{decisionId}`.
  - Undo after window: show info toast `Undo expired` (`review_undo_expired`).
  - Map `decisionType` to badge label via existing `DecisionBadge` label helper or inline closed set (`intervene` → "Intervene", `pause` → "Pause").
- **Depends on**: TASK-001
- **Verification**: Manual approve shows toast within 100 ms; Undo within 8 s restores pending; View decision href is correct

### TASK-004: Create recently-reviewed.tsx secondary band component

- **Files**: `dashboard/app/(dashboard)/attention/_components/recently-reviewed.tsx` (new)
- **Action**: Create
- **Details**:
  - Collapsible section below pending queue: default **expanded** when ≥1 review in session, collapsed when empty (use `listRecentReviews()` length).
  - Section label: `Recently reviewed ({count})` with `text-muted-foreground`, `border-t`, `gap-4`.
  - Render up to `10` rows (default `listRecentReviews(10)`): learner reference, `DecisionBadge`, action chip (**Approved** / **Rejected**), relative time via `Intl.RelativeTimeFormat` or small inline helper (no new date-fns dep).
  - Row click opens read-only review sheet (reuse `AttentionReviewSheet` in read-only mode or pass `readOnly` prop — show context, hide Approve/Reject footer).
  - Optional trailing View link per wireframe `[View →]`.
  - Subscribe to parent `reviewTick` prop to re-render after review/undo.
- **Depends on**: TASK-001
- **Verification**: After approve, row appears newest-first with correct action chip; undo removes row

### TASK-005: Wire attention-queue.tsx header counts, empty state, and review flow

- **Files**: `dashboard/app/(dashboard)/attention/_components/attention-queue.tsx`
- **Action**: Modify
- **Details**:
  - Replace `handleReviewed(decisionId)` with distinct `handleApprove(item)` / `handleReject(item)` calling `executeReviewAction` from TASK-003.
  - **P1-F07** PageHeader badges: `{pending} awaiting · {reviewedToday} reviewed today` when either `queue.length` or `countReviewedToday()` > 0 (replace single "N awaiting review" badge).
  - **P1-F06** Empty state: if `queue.length === 0` and `countReviewedToday() > 0`, message e.g. "Queue clear — you reviewed {n} decisions today."; else "No urgent decisions right now." (not "All caught up" alone when reviews exist).
  - Mount `<RecentlyReviewed reviewTick={reviewTick} onRowClick={...} />` below pending section.
  - Pass `reviewTick` so queue and history recompute on review/undo.
  - Pick **Sonner-only** feedback (no row CSS exit animation) per spec motion rule.
- **Depends on**: TASK-002, TASK-003, TASK-004
- **Verification**: Header shows dual counts; empty copy includes review count; table approve/reject show distinct history chips

### TASK-006: Update attention-review-sheet.tsx for auto-advance and action typing

- **Files**: `dashboard/app/(dashboard)/attention/_components/attention-review-sheet.tsx`
- **Action**: Modify
- **Details**:
  - Change props: `onApprove` / `onReject` receive full `PendingAttentionItem` (or callback returns next item) instead of bare `decisionId`.
  - **P1-F05 Auto-advance:** after approve/reject from sheet, if another pending row exists in `filteredQueue` order, set `selected` to next item instead of closing; otherwise close sheet.
  - Wire `executeReviewAction` with `origin: 'sheet'` and `onSheetReopen` to re-open same item on undo.
  - **P1-F10** footer hierarchy already correct — verify equal-width Approve/Reject remain primary; `View learner profile` stays link variant.
  - Support optional `readOnly` mode for Recently reviewed band row clicks (no footer actions).
- **Depends on**: TASK-003, TASK-005
- **Verification**: With 3 pending items, approving from sheet opens next row without manual click; undo from toast reopens sheet for same decision

### TASK-007: Fix attention-review-bar.tsx distinct Approve and Reject handlers

- **Files**: `dashboard/app/(dashboard)/attention/_components/attention-review-bar.tsx`
- **Action**: Modify
- **Details**:
  - Replace shared `completeReview()` with `handleApprove` / `handleReject` calling `executeReviewAction` with `action: 'approve' | 'reject'`, learner/decision metadata from summary query, `origin: 'bar'`.
  - After action, `router.push(attentionQueueUrl())` (preserve existing navigation).
  - **P1-F09:** Back to Attention already lives in `learner-detail-view.tsx` PageHeader when `fromAttention`; keep that pattern (see Deviations). Bar shows Approve + Reject only.
- **Depends on**: TASK-003
- **Verification**: Reject from bar records `action: 'reject'` in store; Recently reviewed shows **Rejected** chip; e2e "learner profile link preserves review actions on L2" still passes

### TASK-008: Wire WhatToDo.tsx with shared review-actions

- **Files**: `dashboard/components/panels/WhatToDo.tsx`
- **Action**: Modify
- **Details**:
  - Replace `markReviewed(decision.decision_id)` in `onReviewed` with `executeReviewAction` for both Approve and Reject buttons (pass learner ref, decision type, summary).
  - Use `origin: 'what-to-do'`; `onQueueChange` invalidates `queryClient` learner-summary queries (existing behavior).
  - Same toast + undo as Attention page (**P1-F08**).
- **Depends on**: TASK-002, TASK-003
- **Verification**: Overview panel approve shows Sonner toast with undo; decision leaves next-action candidate list

### TASK-009: Unit tests for review store REVIEW-UX-001 through 004

- **Files**: `dashboard/lib/__tests__/decision-review.test.ts` (new)
- **Action**: Create
- **Details**:
  - **REVIEW-UX-001:** `recordReview` + `isReviewedLocally` excludes ID from membership.
  - **REVIEW-UX-002:** Legacy key `8p3p-reviewed-decisions` migrates to `8p3p-review-log:v1`; legacy key removed.
  - **REVIEW-UX-003:** `undoReview` removes record; ID no longer reviewed.
  - **REVIEW-UX-004:** `countReviewedToday` respects local calendar day boundary (mock `reviewedAt` timestamps).
  - jsdom localStorage; reset between tests.
- **Depends on**: TASK-001
- **Verification**: `cd dashboard && npm test -- --run decision-review.test.ts` passes

### TASK-010: Component test for toast payload REVIEW-UX-005

- **Files**: `dashboard/lib/__tests__/review-actions.test.ts` (new)
- **Action**: Create
- **Details**:
  - Mock `sonner` toast; call `executeReviewAction` with fixture item.
  - Assert success title includes learner reference + action (`Approved · Malosi` pattern).
  - Assert description includes decision type label ("Intervene").
  - Assert action buttons include Undo and View decision with href `/decisions/{id}`.
- **Depends on**: TASK-003
- **Verification**: `npm test -- --run review-actions.test.ts` passes

### TASK-011: E2e tests for review UX REVIEW-UX-006 through 009

- **Files**: `dashboard/e2e/decision-panel.spec.ts`
- **Action**: Modify
- **Details**:
  - **REVIEW-UX-006:** Approve from Attention table removes row, toast visible with Undo; Undo restores row.
  - **REVIEW-UX-007:** Reject shows **Rejected** chip in Recently reviewed; differs from Approve chip.
  - **REVIEW-UX-008:** Approve from review sheet auto-opens next pending row (requires mock data with multiple pending decisions — extend `mock-upstream.mjs` if needed).
  - **REVIEW-UX-009:** After reviewing items until queue empty, empty copy mentions review count.
  - Preserve existing Attention review sheet footer and L2 navigation tests.
- **Depends on**: TASK-005, TASK-006, TASK-007
- **Verification**: `cd dashboard && npm run test:e2e -- decision-panel.spec.ts` passes

---

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| `dashboard/lib/review-actions.ts` | TASK-003 | Central approve/reject + Sonner toast + undo |
| `dashboard/app/(dashboard)/attention/_components/recently-reviewed.tsx` | TASK-004 | Secondary Recently reviewed band |
| `dashboard/lib/__tests__/decision-review.test.ts` | TASK-009 | Store + migration unit tests |
| `dashboard/lib/__tests__/review-actions.test.ts` | TASK-010 | Toast payload component test |

### To Modify

| File | Task | Changes |
|------|------|---------|
| `dashboard/lib/decision-review.ts` | TASK-001 | v1 review log API + migration |
| `dashboard/lib/attention-decisions.ts` | TASK-002 | `isReviewedLocally` filter |
| `dashboard/app/(dashboard)/attention/_components/attention-queue.tsx` | TASK-005 | Header badges, empty state, history band, review-actions |
| `dashboard/app/(dashboard)/attention/_components/attention-review-sheet.tsx` | TASK-006 | Auto-advance, action typing, readOnly mode |
| `dashboard/app/(dashboard)/attention/_components/attention-review-bar.tsx` | TASK-007 | Distinct Approve/Reject (critical bug fix) |
| `dashboard/components/panels/WhatToDo.tsx` | TASK-008 | Shared toast + store |
| `dashboard/e2e/decision-panel.spec.ts` | TASK-011 | REVIEW-UX-006 through 009 |
| `dashboard/e2e/mock-upstream.mjs` | TASK-011 | Optional second pending decision for auto-advance |

---

## Requirements Traceability

> Phase 1 functional requirements and acceptance criteria only. Phase 2/3 marked DEFERRED.

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| P1-F01 Sonner toast with learner, badge label, action, Undo, View decision | spec § Phase 1 Functional | TASK-003, TASK-005, TASK-008 |
| P1-F02 Undo restores pending queue; re-open sheet if from sheet | spec § Phase 1 Functional | TASK-003, TASK-006 |
| P1-F03 Versioned review record in localStorage | spec § Phase 1 Functional | TASK-001 |
| P1-F04 Recently reviewed collapsible band | spec § Phase 1 Functional | TASK-004, TASK-005 |
| P1-F05 Auto-advance to next pending row from sheet | spec § Phase 1 Functional | TASK-006 |
| P1-F06 Context-aware empty state with review count | spec § Phase 1 Functional | TASK-005 |
| P1-F07 Header `{pending} awaiting · {reviewedToday} reviewed today` | spec § Phase 1 Functional | TASK-005 |
| P1-F08 WhatToDo same toast + store | spec § Phase 1 Functional | TASK-008 |
| P1-F09 L2 review continuity with review bar | spec § Phase 1 Functional | TASK-007 (partial: URL + bar shell pre-exist) |
| P1-F10 Sheet footer hierarchy | spec § Phase 1 Functional | TASK-006 (verify only — already shipped) |
| AC: Approve toast within 100 ms; row leaves; Recently reviewed Approved | spec § Acceptance Criteria | TASK-003, TASK-005, TASK-011 |
| AC: Undo within 8 s restores pending and removes from Recently reviewed | spec § Acceptance Criteria | TASK-003, TASK-011 |
| AC: 3 pending approve from sheet opens next without manual click | spec § Acceptance Criteria | TASK-006, TASK-011 |
| AC: Empty copy mentions review count when queue empty | spec § Acceptance Criteria | TASK-005, TASK-011 |
| AC: Approve vs Reject distinct action chips in Recently reviewed | spec § Acceptance Criteria | TASK-001, TASK-007, TASK-011 |
| AC: View learner profile → review bar → act → return to /attention | spec § Acceptance Criteria | TASK-007, TASK-011 |
| P2-F01 through P2-F08 | spec § Phase 2 | DEFERRED — Phase 2 plan extension |
| P3-F01 through P3-F05 | spec § Phase 3 | DEFERRED — Phase 3 plan extension |

---

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| REVIEW-UX-001 | unit | `recordReview` + `isReviewedLocally` excludes reviewed ID | TASK-009 |
| REVIEW-UX-002 | unit | Legacy key migration to v1 | TASK-009 |
| REVIEW-UX-003 | unit | `undoReview` restores pending membership | TASK-009 |
| REVIEW-UX-004 | unit | `countReviewedToday` local timezone boundary | TASK-009 |
| REVIEW-UX-005 | component | Toast title includes learner + action | TASK-010 |
| REVIEW-UX-006 | e2e | Approve removes row + toast; Undo restores | TASK-011 |
| REVIEW-UX-007 | e2e | Reject distinct from approve in history | TASK-011 |
| REVIEW-UX-008 | e2e | Auto-advance in sheet after approve | TASK-011 |
| REVIEW-UX-009 | e2e | Empty state copy mentions review count | TASK-011 |
| REVIEW-UX-010 | unit | Proxy injects `fb_session` | DEFERRED — Phase 2 |
| REVIEW-UX-011 | integration | Approve POST body | DEFERRED — Phase 2 |
| REVIEW-UX-012 | integration | Reject POST with `not_at_risk` | DEFERRED — Phase 2 |
| REVIEW-UX-013 | integration | Reject `wrong_decision_type` validation | DEFERRED — Phase 2 |
| REVIEW-UX-014 | e2e | API failure restores row | DEFERRED — Phase 2 |
| REVIEW-UX-015 | e2e | Login sets dual cookies | DEFERRED — Phase 2 |
| REVIEW-UX-016 | e2e | Decisions filter Reviewed by me | DEFERRED — Phase 3 |
| REVIEW-UX-017 | component | Learner detail action chip | DEFERRED — Phase 3 |

---

## Deviations from Spec

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| P1-F09 L2 review bar | Sticky bar includes Approve, Reject, **and Back to Attention** | Back to Attention remains in `learner-detail-view.tsx` PageHeader (existing e2e); bar has Approve/Reject only | Implementation detail — spec silent on bar vs header placement; existing e2e expects header link. Revisit if product wants bar-local link. |
| Motion (§ UX layout) | Row exit CSS transition ≤ 200 ms **OR** Sonner-only — pick one | Plan picks Sonner-only (no row animation) | Implementation detail — spec silent on which option |
| File structure hint | `recently-reviewed.tsx` under attention `_components` | Matches plan | None |
| Phase 2+ store fields | `feedbackId`, `source: 'api'` | Not written in Phase 1 (optional fields omitted on record) | Implementation detail — spec marks Phase 2+ |

None beyond the rows above — plan is literal-compatible with Phase 1 spec constants (`8000` ms, `8p3p-review-log:v1`, toast title templates).

---

## Existing libraries (prefer over custom)

| Need | Library | Justification |
|------|---------|---------------|
| Toasts | `sonner` | Already installed (`dashboard/package.json`); used in `step-review.tsx` |
| Relative time | `Intl.RelativeTimeFormat` | Spec recommends inline helper; avoids `date-fns` for one surface |
| Review store | Extend `decision-review.ts` | Spec: less complex than IndexedDB for ≤10 session rows |
| Queue state tick | React `useState` review counter | Derive queue during render per vercel-react-best-practices |

No AWS/MCP research required — Phase 1 is client-only localStorage + Sonner.

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Approve/Reject bug ships without fix | High — pilot trust | TASK-007 early in implementation order after store foundation |
| E2E auto-advance needs multiple pending rows | Medium | Extend mock upstream with second intervene decision in TASK-011 |
| localStorage quota in private browsing | Low | try/catch + in-memory fallback per spec `review_store_quota` |
| Undo + auto-advance race (sheet opens next while undo targets previous) | Medium | Pass `decisionId` to undo handler; reopen only if still relevant |

---

## Verification Checklist

- [ ] All TASK-001 through TASK-011 completed
- [ ] `cd dashboard && npm test -- --run` passes
- [ ] `cd dashboard && npm run test:e2e -- decision-panel.spec.ts` passes
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] All six Phase 1 acceptance criteria manually verified on `/attention`
- [ ] No `markReviewed` / bare-ID store calls remain in dashboard

---

## Implementation Order

```
TASK-001 → TASK-002 ─┐
         ↘ TASK-003 ──┼→ TASK-005 → TASK-006 ─┐
         ↘ TASK-004 ──┘         ↘ TASK-007 ───┼→ TASK-011
                              TASK-008 ────────┘
         TASK-009 (after TASK-001)
         TASK-010 (after TASK-003)
```

Parallel after TASK-001: TASK-009 (tests). After TASK-003: TASK-010 (tests). UI tasks TASK-005–008 converge before TASK-011 e2e.

---

## Next Steps

After Phase 1 lands and acceptance criteria pass:

- Run `/plan-impl docs/specs/attention-review-ux.md` scoped to **Phase 2** (or extend this plan) for Educator Feedback API wiring, proxy `fb_session` bridge, and reject reason step.
- Run `/post-impl-doc-sync` on `docs/specs/attention-review-ux.md` to check off Phase 1 requirements.
