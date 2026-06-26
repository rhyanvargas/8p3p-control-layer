---
name: Learner Pending Review Bar
overview: "Make /learners/[ref] show the Action required review bar from summary plus feedback state, not only when reviewDecision is in the URL. Reuse pending queue rules, add roster drill-down URLs, and route post-action by from=attention."
todos:
  - id: TASK-001
    content: Add selectPendingDecisionForLearner and resolveEffectivePendingDecisionId
    status: pending
  - id: TASK-002
    content: Add learnerDetailReviewUrl to attention-review-url.ts
    status: pending
  - id: TASK-003
    content: Create use-pending-review-for-learner hook
    status: pending
  - id: TASK-004
    content: Wire data-driven review bar in learner-detail-view
    status: pending
  - id: TASK-005
    content: Update AttentionReviewBar routing and subcopy variant
    status: pending
  - id: TASK-006
    content: Conditional drill-down URL in LearnerDetailSheet
    status: pending
  - id: TASK-007
    content: Unit tests for attention-decisions (LPR-001 through LPR-006)
    status: pending
  - id: TASK-008
    content: Extend attention-review-url tests (LPR-007)
    status: pending
  - id: TASK-009
    content: Component test LearnerDetailView bar visibility (LPR-008)
    status: pending
  - id: TASK-010
    content: E2E tests roster and attention paths (LPR-009 through LPR-011)
    status: pending
  - id: TASK-011
    content: Audit learner detail tabs for duplicate Approve or Reject CTAs (LPR-F08)
    status: pending
isProject: false
---

# Learner Pending Review Bar

**Spec**: `docs/specs/learner-pending-review-bar.md`

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase.

### From spec § URL query parameters

| Param | Value | Required | Purpose |
|-------|-------|----------|---------|
| `reviewDecision` | decision UUID/string | no | Explicit decision to review; overrides auto-detect when valid |
| `from` | `attention` | no | Workflow context: back link + post-action redirect |
| `version` | integer | no | Unchanged — state tab version drill-down |

Param names MUST match `ATTENTION_REVIEW_DECISION_PARAM` and `ATTENTION_REVIEW_FROM_PARAM` in `dashboard/lib/attention-review-url.ts`.

### From spec § URL helpers

| Function | Output pattern |
|----------|----------------|
| `learnerAttentionReviewUrl(ref, id)` (existing) | `/learners/{encodedRef}?reviewDecision={id}&from=attention` |
| `learnerDetailReviewUrl(ref, id)` (**new**) | `/learners/{encodedRef}?reviewDecision={id}` |

### From spec § Pending decision selection (normative)

| Rule | Value |
|------|-------|
| Urgent types | `intervene`, `pause` |
| Priority | `intervene` → 1, `pause` → 2 (lower number = higher urgency) |
| Tie-break | `decided_at` descending (ISO 8601 string compare) |
| Review exclusion | `isReviewedLocally(decisionId)` OR `serverReviewedIds.has(decisionId)` |
| Summary fetch limit on learner detail | `recentDecisionsLimit: 10` (match existing `AttentionReviewBar` + overview tab) |

### From spec § UX Specification — Copy (review bar)

| Element | Text |
|---------|------|
| Region `aria-label` | `Attention review actions` |
| Heading | `Action required` |
| Subcopy (Attention-originated) | `Approve or reject this decision before returning to the queue.` |
| Subcopy (roster-originated, **new**) | `Approve or reject this recommendation for this learner.` |

When `from=attention`, use queue subcopy; otherwise use learner-focused subcopy (same bar component, prop `variant: 'queue' | 'learner'` or derive from `fromAttention`).

### From spec § UX Specification — Post-action routing

| `from` query | After successful Approve/Reject |
|--------------|--------------------------------|
| `attention` | `router.push('/attention')` |
| absent or other | `router.replace('/learners/{ref}')` + invalidate queries; strip `reviewDecision` from URL if present |

### From spec § Existing libraries (prefer over custom)

| Need | Library / module | Justification |
|------|------------------|---------------|
| Pending decision rules | `buildPendingAttentionQueue()` / extracted helper | **Less complex** — one source of truth; custom duplicate logic would drift |
| Server feedback state | `@tanstack/react-query` via `useFeedbackStatusForDecisionIds` | Already used on Attention queue and learner overview |
| Review actions | `executeReviewAction()` in `review-actions.ts` | Already handles toast, undo, API, queue invalidation |
| URL builders | Extend `attention-review-url.ts` | **Higher DX** — centralize query param names |
| Client validation | `zod` (feedback body) | Unchanged from Phase 2 |

No new npm dependencies.

### From spec § Error Codes — Existing (reuse)

| Code | Source | Educator-facing copy |
|------|--------|----------------------|
| `session_required` | `educator-feedback-api.md` | "Session expired. Sign in again to save your review." |
| `decision_not_found` | `educator-feedback-api.md` | "This decision is no longer available." |
| `dashboard_upstream_unavailable` | dashboard proxy | "Could not reach the control layer. Try again." + `request_id` |

### From spec § Contract Tests — LPR-001 through LPR-011

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

## Prerequisites

Before starting implementation:

- [ ] PREREQ-001 Attention review UX Phases 1–2 shipped (`AttentionReviewBar`, `executeReviewAction`, `buildPendingAttentionQueue`, feedback hooks) — already on branch
- [ ] PREREQ-002 Educator Feedback API and dashboard proxy session bridge operational — implemented per `educator-feedback-api.md`

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Add selectPendingDecisionForLearner and resolveEffectivePendingDecisionId
- **Files**: `dashboard/lib/attention-decisions.ts`
- **Action**: Modify
- **Details**:
  - Add exported pure helper `selectPendingDecisionForLearner(summary, serverReviewedIds): string | null` per **LPR-F09** — single source of truth scoped to one learner.
  - Apply normative rules verbatim from Spec Literals § Pending decision selection: urgent types `intervene`/`pause`; priority `intervene` → 1, `pause` → 2; tie-break `decided_at` descending; exclude when `isReviewedLocally(decisionId)` OR `serverReviewedIds.has(decisionId)`.
  - For multiple unreviewed urgent rows on one learner (**LPR-F07**), return the first after the same sort `buildPendingAttentionQueue()` uses for a single learner (priority asc, then `decided_at` desc).
  - Prefer delegating to existing `buildPendingAttentionQueue([summary], { serverReviewedIds })` and reading the first matching `decision_id` for this `learner_reference` — **Less complex** than duplicating sort logic.
  - Add `resolveEffectivePendingDecisionId({ summary, serverReviewedIds, urlReviewDecisionId? })` for **LPR-F03**: when `urlReviewDecisionId` is present, valid (exists in `summary.recent_decisions` as urgent type, not excluded), use it; when unknown or already-reviewed, fall back to `selectPendingDecisionForLearner`; when no pending remains, return `null`.
- **Depends on**: none
- **Verification**: Pure functions exported; manual spot-check matches `buildPendingAttentionQueue` output for single-learner fixtures

### TASK-002: Add learnerDetailReviewUrl to attention-review-url.ts
- **Files**: `dashboard/lib/attention-review-url.ts`
- **Action**: Modify
- **Details**:
  - Add `learnerDetailReviewUrl(learnerRef, decisionId)` returning `/learners/{encodedRef}?reviewDecision={id}` only (no `from` param) using `ATTENTION_REVIEW_DECISION_PARAM`.
  - Keep `learnerAttentionReviewUrl` unchanged.
- **Depends on**: none
- **Verification**: Output matches Spec Literals § URL helpers table

### TASK-003: Create use-pending-review-for-learner hook
- **Files**: `dashboard/hooks/use-pending-review-for-learner.ts`
- **Action**: Create
- **Details**:
  - Compose `useLearnerSummary(orgId, learnerRef, { recentDecisionsLimit: 10 })` and `useFeedbackStatusForDecisionIds` for urgent IDs from that summary (reuse `collectUrgentDecisionIds` pattern from `use-decision-feedback-status.ts`).
  - Derive `effectivePendingDecisionId` during render via `resolveEffectivePendingDecisionId` — do **not** store pending ID in separate state synced from props (spec Notes, vercel-react-best-practices §5.1).
  - Accept optional `urlReviewDecisionId` from page search params.
  - Return `{ effectivePendingDecisionId, isLoading, summaryQuery }` for `LearnerDetailView`.
- **Depends on**: TASK-001
- **Verification**: Hook returns `null` while summary loading; resolves ID after feedback queries settle

### TASK-004: Wire data-driven review bar in learner-detail-view
- **Files**: `dashboard/app/(dashboard)/learners/[ref]/_components/learner-detail-view.tsx`
- **Action**: Modify
- **Details**:
  - Replace `showReviewBar = reviewDecisionId != null` with hook-driven `effectivePendingDecisionId` (**LPR-F01**, **LPR-F02**).
  - Pass `decisionId={effectivePendingDecisionId}` to `AttentionReviewBar` when non-null.
  - Pass `fromAttention` through to `AttentionReviewBar` for subcopy and post-action routing.
  - Retain **LPR-F06**: back link label "Back to Attention" when `fromAttention`, "Back to roster" otherwise (already implemented — verify unchanged).
  - Keep bottom padding `pb-36 md:pb-40` when bar visible per spec § UX Specification.
- **Depends on**: TASK-003, TASK-005
- **Verification**: Opening `/learners/[ref]` without query params shows bar when summary has unreviewed urgent decision

### TASK-005: Update AttentionReviewBar routing and subcopy variant
- **Files**: `dashboard/app/(dashboard)/attention/_components/attention-review-bar.tsx`
- **Action**: Modify
- **Details**:
  - Add prop `fromAttention?: boolean` (default `false`).
  - Subcopy: when `fromAttention`, use `Approve or reject this decision before returning to the queue.`; otherwise use `Approve or reject this recommendation for this learner.` (Spec Literals § Copy).
  - Post-action routing per Spec Literals § Post-action routing (**LPR-F04**):
    - On successful Approve/Reject via `executeReviewAction` with `origin: 'bar'`, if `fromAttention` then `router.push('/attention')`.
    - Else `router.replace('/learners/{encodedRef}')` (strip `reviewDecision` from URL; preserve `version` if present) and invalidate `learner-summary` + decision feedback queries so bar hides when no pending decision remains.
  - Region `aria-label` stays `Attention review actions`.
- **Depends on**: none
- **Verification**: Existing Attention deep-link test path still redirects to `/attention`; roster path stays on learner page

### TASK-006: Conditional drill-down URL in LearnerDetailSheet
- **Files**: `dashboard/app/(dashboard)/learners/_components/learner-detail-sheet.tsx`
- **Action**: Modify
- **Details**:
  - Bump summary fetch for pending detection to `recentDecisionsLimit: 10` (Spec Literals § Pending decision selection) — may keep display slice at 3 for UI list if desired, but pending resolution must see up to 10 decisions.
  - Fetch feedback status for urgent decision IDs (same pattern as Attention queue).
  - Compute pending ID via `selectPendingDecisionForLearner`.
  - **LPR-F05**: footer `DrillDownLink` href = `learnerDetailReviewUrl(learnerRef, pendingId)` when pending exists; otherwise plain `/learners/{encodedRef}`.
  - Do not add `from=attention` unless educator entered from Attention (sheet is roster-only today — omit `from`).
- **Depends on**: TASK-001, TASK-002
- **Verification**: "Open full view" URL includes `reviewDecision=<pending-id>` for pending learners

### TASK-007: Unit tests for attention-decisions (LPR-001 through LPR-006)
- **Files**: `dashboard/lib/__tests__/attention-decisions.test.ts`
- **Action**: Create
- **Details**:
  - Implement **LPR-001** through **LPR-004** against `selectPendingDecisionForLearner`.
  - Implement **LPR-005** and **LPR-006** against `resolveEffectivePendingDecisionId`.
  - Mock `isReviewedLocally` where needed for **LPR-003**.
  - Use fixture summaries mirroring `LearnerSummaryResponse` shape with controlled `recent_decisions`.
- **Depends on**: TASK-001
- **Verification**: `npm test -- dashboard/lib/__tests__/attention-decisions.test.ts` passes all six cases

### TASK-008: Extend attention-review-url tests (LPR-007)
- **Files**: `dashboard/lib/__tests__/attention-review-url.test.ts`
- **Action**: Modify
- **Details**:
  - Add test for `learnerDetailReviewUrl`: output is `/learners/{ref}?reviewDecision={id}` only (no `from` param) per **LPR-007**.
  - Include encoded-ref case consistent with existing `learnerAttentionReviewUrl` tests.
- **Depends on**: TASK-002
- **Verification**: **LPR-007** passes

### TASK-009: Component test LearnerDetailView bar visibility (LPR-008)
- **Files**: `dashboard/app/(dashboard)/learners/[ref]/_components/__tests__/learner-detail-view.test.tsx`
- **Action**: Create
- **Details**:
  - Mock `use-pending-review-for-learner` (or underlying hooks) so summary is loaded and `effectivePendingDecisionId` is `null`.
  - Assert no region with `aria-label="Attention review actions"` (**LPR-008**).
  - Optional second case: pending ID set → region visible (smoke).
- **Depends on**: TASK-004
- **Verification**: **LPR-008** passes

### TASK-010: E2E tests roster and attention paths (LPR-009 through LPR-011)
- **Files**: `dashboard/e2e/decision-panel.spec.ts`
- **Action**: Modify
- **Details**:
  - **LPR-009**: Learners → row → sheet → "Open full view" for pending learner (`resetMockFeedbackState`, `ensureFeedbackSession`); expect review bar visible with Approve/Reject; URL includes `reviewDecision=`.
  - **LPR-010**: From roster path (no `from=attention`), approve from bar; URL stays `/learners/[ref]`; bar hides after success toast.
  - **LPR-011**: Regression — extend or preserve existing "learner profile link preserves review actions on L2" test (`from=attention` + approve → `/attention`).
  - Reuse fixtures: `ensureFeedbackSession`, `resetMockFeedbackState`, `clickSheetDrillDown`, `E2E_LEARNER_REF`, `E2E_DECISION_ID`.
- **Depends on**: TASK-004, TASK-005, TASK-006
- **Verification**: All three e2e cases pass in CI/local Playwright run

### TASK-011: Audit learner detail tabs for duplicate Approve or Reject CTAs (LPR-F08)
- **Files**: `dashboard/app/(dashboard)/learners/[ref]/_components/learner-overview-tab.tsx`, `learner-state-tab.tsx`, `learner-trajectory-tab.tsx`, `learner-struggles-tab.tsx`
- **Action**: Modify (only if violations found)
- **Details**:
  - **LPR-F08**: When review bar is visible, learner detail tabs MUST NOT add a second Approve/Reject primary action in tab content.
  - Audit all four tabs; remove or gate any duplicate write actions. Overview tab history chips remain read-only (spec Constraints).
  - Expected outcome: no code changes if audit passes (document in task completion note).
- **Depends on**: TASK-004
- **Verification**: Manual and component-level check — only `AttentionReviewBar` exposes Approve/Reject on learner L2

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `dashboard/hooks/use-pending-review-for-learner.ts` | TASK-003 | Summary + feedback → effective pending decision ID |
| `dashboard/lib/__tests__/attention-decisions.test.ts` | TASK-007 | LPR-001 through LPR-006 unit tests |
| `dashboard/app/(dashboard)/learners/[ref]/_components/__tests__/learner-detail-view.test.tsx` | TASK-009 | LPR-008 component test |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `dashboard/lib/attention-decisions.ts` | TASK-001 | `selectPendingDecisionForLearner`, `resolveEffectivePendingDecisionId` |
| `dashboard/lib/attention-review-url.ts` | TASK-002 | `learnerDetailReviewUrl` |
| `dashboard/app/(dashboard)/learners/[ref]/_components/learner-detail-view.tsx` | TASK-004 | Data-driven bar mount, pass `fromAttention` |
| `dashboard/app/(dashboard)/attention/_components/attention-review-bar.tsx` | TASK-005 | Subcopy variant, conditional post-action routing |
| `dashboard/app/(dashboard)/learners/_components/learner-detail-sheet.tsx` | TASK-006 | Conditional drill-down URL with pending ID |
| `dashboard/lib/__tests__/attention-review-url.test.ts` | TASK-008 | LPR-007 |
| `dashboard/e2e/decision-panel.spec.ts` | TASK-010 | LPR-009 through LPR-011 |

## Requirements Traceability

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| **LPR-F01** On `/learners/[ref]`, resolve effective pending decision using same rules as `buildPendingAttentionQueue()` scoped to learner summary | spec § Requirements | TASK-001, TASK-003, TASK-004 |
| **LPR-F02** When `effectivePendingDecisionId` non-null, render `AttentionReviewBar` with identical Approve/Reject UX (`executeReviewAction`, origin `'bar'`) | spec § Requirements | TASK-004, TASK-005 |
| **LPR-F03** URL override: valid `?reviewDecision=` wins; unknown/reviewed falls back to auto-detect or hide | spec § Requirements | TASK-001, TASK-003, TASK-004 |
| **LPR-F04** Post-action: `/attention` when `from=attention`; else stay on `/learners/[ref]` with query invalidation | spec § Requirements | TASK-005 |
| **LPR-F05** `LearnerDetailSheet` footer uses `learnerDetailReviewUrl` when pending exists | spec § Requirements | TASK-002, TASK-006 |
| **LPR-F06** Back link label unchanged by entry path | spec § Requirements | TASK-004 |
| **LPR-F07** Multiple pending: intervene before pause, then newest `decided_at`; URL may target specific row | spec § Requirements | TASK-001 |
| **LPR-F08** No duplicate Approve/Reject CTAs in tab content when bar visible | spec § Requirements | TASK-011 |
| **LPR-F09** Extract `selectPendingDecisionForLearner` as single source of truth | spec § Requirements | TASK-001 |
| AC: Malosi from roster (no params) → Action required bar visible within one summary fetch | spec § Acceptance Criteria | TASK-004, TASK-009, TASK-010 |
| AC: Approve from bar (not Attention) → toast, feedback persists, bar hides, URL stays `/learners/Malosi` | spec § Acceptance Criteria | TASK-005, TASK-010 |
| AC: `?reviewDecision=&from=attention` approve → redirect `/attention` | spec § Acceptance Criteria | TASK-005, TASK-010 |
| AC: Leilani all reviewed → no review bar | spec § Acceptance Criteria | TASK-001, TASK-004, TASK-009 |
| AC: Stale `?reviewDecision=` → fallback to auto-detected pending | spec § Acceptance Criteria | TASK-001, TASK-007 |
| AC: Sheet "Open full view" → URL includes `reviewDecision=` without `from=attention` | spec § Acceptance Criteria | TASK-006, TASK-010 |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| LPR-001 | unit | `selectPendingDecisionForLearner` — single unreviewed intervene | TASK-007 |
| LPR-002 | unit | Excludes server-reviewed | TASK-007 |
| LPR-003 | unit | Excludes locally reviewed | TASK-007 |
| LPR-004 | unit | Priority: intervene over pause | TASK-007 |
| LPR-005 | unit | URL override valid | TASK-007 |
| LPR-006 | unit | URL override stale | TASK-007 |
| LPR-007 | unit | `learnerDetailReviewUrl` | TASK-008 |
| LPR-008 | component | Bar hidden when no pending | TASK-009 |
| LPR-009 | e2e | Roster → full view shows bar | TASK-010 |
| LPR-010 | e2e | Roster approve stays on learner page | TASK-010 |
| LPR-011 | e2e | Attention path unchanged | TASK-010 |

## Deviations from Spec

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| § File Structure | `resolveEffectivePendingDecisionId` not named | Adds `resolveEffectivePendingDecisionId` in `attention-decisions.ts` for LPR-F03 and LPR-005/006 | Implementation detail — spec silent |
| § File Structure | `use-pending-review-for-learner.ts` optional | Plan includes dedicated hook (TASK-003) | Implementation detail — spec silent |
| § UX Specification | `variant: 'queue' \| 'learner'` or derive from `fromAttention` | Plan uses `fromAttention` boolean prop on bar | Implementation detail — spec silent |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `LearnerDetailSheet` previously fetched only 3 recent decisions | Medium — pending decision outside first 3 missed for drill-down URL | TASK-006 loads up to 10 decisions for pending resolution per Spec Literals |
| `AttentionReviewBar` currently always `router.push('/attention')` on success | High — breaks LPR-F04 until TASK-005 | TASK-005 is blocking for roster e2e |
| Race: bar flashes before feedback queries complete | Low — brief wrong bar state | Hook returns null while feedback queries loading for urgent IDs |
| Duplicate Approve/Reject in tab content | Medium — violates dashboard-design-requirements §2.1 | TASK-011 audit before ship |

## Verification Checklist

- [ ] All tasks completed
- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Playwright e2e passes for LPR-009 through LPR-011
- [ ] Matches spec requirements

## Implementation Order

```
TASK-001 ──┬── TASK-002
           │
           ├── TASK-003 ── TASK-004 ── TASK-009
           │                    │
           │                    └── TASK-011
           │
           ├── TASK-005 ────────┘
           │
           ├── TASK-006 ── TASK-010
           │
           ├── TASK-007
           └── TASK-008
```

Recommended sequence: TASK-001 → TASK-002 → TASK-003 → TASK-005 → TASK-004 → TASK-006 → TASK-007 → TASK-008 → TASK-009 → TASK-010 → TASK-011

## Next Steps

After generating the plan:

- Review task ordering and the LearnerDetailSheet fetch-limit change
- Run `/implement-spec .cursor/plans/learner-pending-review-bar.plan.md`
