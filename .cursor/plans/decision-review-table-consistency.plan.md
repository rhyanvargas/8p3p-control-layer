---
name: Decision Review Table Consistency
overview: Phase A binds the learner review bar to the matching Overview row with shared educatorBodyCopy and queue Next; Phase B extends shared DataTable grammar; Phase C trails for facet/toolbar and Signals parity.
todos:
  - id: TASK-001
    content: Create pending-review-presentation helpers for queue index and next id
    status: completed
  - id: TASK-002
    content: Unit tests RTC-003 and RTC-004 for pending presentation helpers
    status: completed
  - id: TASK-003
    content: Add Reviewing chip to review-action-chip
    status: completed
  - id: TASK-004
    content: Add activeRowId highlight support to DataTable
    status: completed
  - id: TASK-005
    content: Update AttentionReviewBar identity copy time position and Next
    status: completed
  - id: TASK-006
    content: Wire Overview active row Reviewing chip and pass pending id
    status: completed
  - id: TASK-007
    content: Phase A component tests RTC-001 002 005 006 007 008
    status: completed
  - id: TASK-008
    content: E2E multi-pending identity RTC-011
    status: completed
  - id: TASK-009
    content: Extend DataTable with initialSorting toolbar and column visibility
    status: completed
  - id: TASK-010
    content: Add createRowActionsColumn helper and RTC-009 test
    status: completed
  - id: TASK-011
    content: Apply DataTable grammar defaults across Attention Decisions Learners Overview
    status: completed
  - id: TASK-012
    content: Phase B tests RTC-010 and Attention e2e RTC-012
    status: completed
  - id: TASK-013
    content: Move Decisions and Learners facet filters into DataTable toolbar
    status: completed
  - id: TASK-014
    content: Migrate Signals ingestion log onto shared DataTable
    status: completed
  - id: TASK-015
    content: Optional Overview Review CardInlineAction for non-active pending rows
    status: completed
isProject: false
---

# Decision Review Table Consistency

**Spec**: `docs/specs/decision-review-table-consistency.md`

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase. Update this section only if the spec itself changes.

### From spec § Copy / UI literals


| Element                       | Value                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------- |
| Bar region `aria-label`       | `Attention review actions` (unchanged)                                           |
| Bar heading                   | `Action required` (unchanged)                                                    |
| Queue subcopy                 | `Approve or reject this decision before returning to the queue.` (unchanged)     |
| Learner subcopy               | `Approve or reject this recommendation for this learner.` (unchanged)            |
| Queue position                | `{n} of {total} pending` — e.g. `1 of 2 pending`                                 |
| Next control label            | `Next`                                                                           |
| Active Your action chip label | `Reviewing`                                                                      |
| Optional row link (RTC-F14)   | `Review` — Next.js `Link` + `cardInlineActionVariants({ variant: 'underline' })` |
| Narrative clamp               | `line-clamp-2` on bar; Overview Summary already `line-clamp-2`                   |
| Body copy resolver            | `educatorBodyCopy` from `@/lib/panel-helpers` only                               |


### From spec § Active row presentation


| Token / cue   | Value                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Row attribute | `data-state="active"` when `row.id === activeRowId` (in addition to selected if ever used)                                |
| Visual        | Warning-muted background and/or `ring-1` using existing `surface.warning*` / semantic tokens from `@/lib/semantic-colors` |
| Non-color cue | **Reviewing** chip in Your action (RTC-F04)                                                                               |


### From spec § Pending ordering (reuse — do not redefine)


| Rule          | Value                                                |
| ------------- | ---------------------------------------------------- |
| Urgent types  | `intervene`, `pause`                                 |
| Priority      | intervene before pause; then `decided_at` descending |
| Exclusion     | local review store OR server `latest_action`         |
| Summary limit | `recentDecisionsLimit: 10`                           |


### From spec § URL query parameters (reuse)


| Param            | Value              | Notes                                                         |
| ---------------- | ------------------ | ------------------------------------------------------------- |
| `reviewDecision` | decision id string | Next updates this param                                       |
| `from`           | `attention`        | Preserved when advancing Next from Attention-originated entry |


### From spec § DataTable API literals (Phase B)


| Prop                   | Type / default                                                    |
| ---------------------- | ----------------------------------------------------------------- |
| `initialSorting`       | `SortingState`; default `[]` if omitted (callers set per RTC-F11) |
| `activeRowId`          | `string | undefined`                                              |
| `showColumnVisibility` | `boolean`; default `false`                                        |
| Page size options      | `[10, 20, 30, 50]` (unchanged pagination)                         |


### From spec § Default sorts (RTC-F11)


| Surface                          | `initialSorting`                                                                |
| -------------------------------- | ------------------------------------------------------------------------------- |
| Attention queue                  | `[{ id: 'urgency', desc: false }]` (priority ascending; tie-break via accessor) |
| Decisions stream                 | `[{ id: 'decided_at', desc: true }]`                                            |
| Overview recent / learner recent | `[{ id: 'decided_at', desc: true }]`                                            |
| Learners roster                  | `[{ id: 'updated_at', desc: true }]`                                            |


### From spec § Bar content (UX)


| Element     | Learner route (`fromAttention=false`)     | Attention-originated (`fromAttention=true`) |
| ----------- | ----------------------------------------- | ------------------------------------------- |
| Type        | `DecisionBadge`                           | `DecisionBadge`                             |
| Time        | `formatDecisionTime(decided_at)`          | `formatDecisionTime(decided_at)`            |
| Learner ref | **omit**                                  | show                                        |
| Narrative   | `educatorBodyCopy` `line-clamp-2`         | same                                        |
| Position    | `{n} of {total} pending` when `total > 1` | same                                        |
| Next        | when `total > 1`                          | when `total > 1`                            |


### From spec § Existing libraries (prefer over custom)


| Need                                         | Library / module                                                 | Justification                                                              |
| -------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Table state (sort, filter, page, visibility) | `@tanstack/react-table` ^8 (already in `dashboard/package.json`) | Official shadcn Data Table foundation — **higher DX** than a custom grid   |
| Columns / row-actions UI                     | Existing shadcn `DropdownMenu`, `Button`, `Checkbox`             | Compose, don’t reinvent — per `.agents/skills/shadcn`                      |
| Quiet secondary links                        | `CardInlineAction` / `cardInlineActionVariants` on `Link`        | Already established for card/list micro-actions                            |
| Body copy                                    | `educatorBodyCopy()`                                             | Single resolver — **less complex** than a new helper                       |
| Row-actions column factory                   | Thin `createRowActionsColumn` in-repo                            | **Less complex** than adding a third-party data-grid; wraps ColumnDef only |


No new npm dependencies. No new env vars, cookies, HTTP routes, or error codes. Dashboard-only (Tier C).

### From spec § Wire formats / HTTP / cookies / env vars

- **Wire formats:** N/A — no new signed payloads.
- **HTTP behavior:** N/A — no new routes or status codes; feedback POST unchanged.
- **Cookies:** N/A — no new cookies.
- **Env vars:** None new.

## Prerequisites

Before starting implementation:

- [ ] PREREQ-001 LPR shipped (`learner-pending-review-bar.plan.md`) — `usePendingReviewForLearner`, `selectPendingDecisionForLearner`, `AttentionReviewBar` on `/learners/[ref]` ✓
- [ ] PREREQ-002 `educatorBodyCopy` in `dashboard/lib/panel-helpers.ts` ✓
- [ ] PREREQ-003 Shared `DataTable` + `DataTableColumnHeader` + `@tanstack/react-table` ^8 in dashboard ✓

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.
>
> **Phase order**: A (TASK-001–008) before B (TASK-009–012); C (TASK-013–015) may trail.

### TASK-001: Create pending-review-presentation helpers

- **Files**: `dashboard/lib/pending-review-presentation.ts` (create)
- **Action**: Create
- **Details**:
  - Add helpers that reuse pending exclusion/order from `attention-decisions.ts` (do not redefine urgent types or priority). Per Spec Literals § Pending ordering: urgent types `intervene`, `pause`; priority intervene before pause then `decided_at` descending; exclusion local review store OR server `latest_action`.
  - Export at least:
    - `listPendingUrgentDecisionIds(summary, serverReviewedIds?)` — ordered decision ids for one learner (same rules as `buildPendingAttentionQueue`).
    - `pendingQueuePosition(orderedIds, currentId)` — returns `{ index, total }` with **1-based** `index`, or null if current not in list.
    - `nextPendingDecisionId(orderedIds, currentId, options?: { wrap?: boolean })` — next id in order; wrap to first when `wrap` true (default true per RTC-F06 wrap optional: wrap to first).
  - Prefer composing on `buildPendingAttentionQueue([summary], …)` filtered to the learner over duplicating sort logic (**less complex**).
- **Depends on**: none
- **Verification**: Module exports compile; no hardcoded intervene/pause copy strings.

### TASK-002: Unit tests RTC-003 and RTC-004

- **Files**: `dashboard/lib/__tests__/pending-review-presentation.test.ts` (create)
- **Action**: Create
- **Details**:
  - **RTC-003**: Two pending urgent IDs; effective = first → `{ index: 1, total: 2 }` from shared helper. Queue position copy shape `{n} of {total} pending` (e.g. `1 of 2 pending`) is consumed by the bar in TASK-005.
  - **RTC-004**: Ordered `[A, B]`; current A → Next B; from B → A if wrap enabled.
- **Depends on**: TASK-001
- **Verification**: `npm test -- pending-review-presentation` (or dashboard vitest path) passes RTC-003 and RTC-004.

### TASK-003: Add Reviewing chip

- **Files**: `dashboard/components/shared/review-action-chip.tsx`
- **Action**: Modify
- **Details**:
  - Extend chip API so the active pending row can show label `**Reviewing**` (Spec Literals § Copy / UI literals) without treating it as Approved/Rejected.
  - Prefer extending this module (adjacent export or union status) over a second chip component — keep badge tokens consistent with existing `badge.*` / warning semantic if needed.
  - Must not break existing `ReviewActionChip` callers that pass `approve` | `reject`.
- **Depends on**: none
- **Verification**: Typecheck; existing chip usages still render Approved/Rejected.

### TASK-004: Add activeRowId to DataTable (Phase A subset of RTC-F08)

- **Files**: `dashboard/components/data-table/data-table.tsx`
- **Action**: Modify
- **Details**:
  - Add optional `activeRowId?: string` (Spec Literals § DataTable API literals).
  - When `row.id === activeRowId`, set row attribute `data-state="active"` (Spec Literals § Active row presentation; in addition to selected if ever used).
  - Apply warning-muted background and/or `ring-1` using existing `surface.warning*` / semantic tokens from `@/lib/semantic-colors`.
  - Do not yet add toolbar / visibility / initialSorting (those land in TASK-009).
- **Depends on**: none
- **Verification**: Manual or component smoke: row with matching id has `data-state="active"` and warning visual; other rows do not.

### TASK-005: Update AttentionReviewBar identity fields

- **Files**:
  - `dashboard/app/(dashboard)/attention/_components/attention-review-bar.tsx`
  - Optionally extend props from `learner-detail-view.tsx` if bar needs `serverReviewedIds` / pending list (prefer deriving inside bar from existing summary + feedback hooks to avoid prop drilling — React §5.1 derive during render).
- **Action**: Modify
- **Details**:
  - **RTC-F01**: Resolve narrative via `educatorBodyCopy()` from `@/lib/panel-helpers` only. MUST NOT prefer raw `educator_summary` alone or hardcoded strings `Needs stronger support now` / `High decay risk — consider pausing` when explanation/summary/rationale available. Remove those hardcoded fallbacks.
  - **RTC-F02**: Show `DecisionBadge` (type), **time** via `formatDecisionTime(decided_at)`, narrative with `line-clamp-2`. Omit learner reference when `fromAttention=false`; when `fromAttention=true`, learner reference MAY remain visible.
  - Keep aria-label `Attention review actions`, heading `Action required`, and subcopy strings unchanged (Spec Literals § Copy / UI literals).
  - **RTC-F05**: When more than one unreviewed urgent decision, show `{n} of {total} pending` (e.g. `1 of 2 pending`).
  - **RTC-F06**: When `total > 1`, expose quiet `**Next`** control that advances via `learnerDetailReviewUrl` / `learnerAttentionReviewUrl` as appropriate, preserving `from=attention` when present (`reviewDecision` + `from` params from Spec Literals § URL query parameters).
  - Use TASK-001 helpers; derive queue position during render — do not mirror `effectivePendingDecisionId` into redundant local state.
- **Depends on**: TASK-001
- **Verification**: Bar with long `educator_explanation` shows same body as Overview Summary (clamp only); two pending shows `1 of 2 pending` + Next; learner route omits ref.

### TASK-006: Wire Overview active row and Reviewing chip

- **Files**:
  - `dashboard/app/(dashboard)/learners/[ref]/_components/learner-overview-tab.tsx`
  - `dashboard/app/(dashboard)/learners/[ref]/_components/learner-detail-view.tsx`
- **Action**: Modify
- **Details**:
  - Pass `effectivePendingDecisionId` into Overview (or re-resolve via same hook/rules) as `activeRowId` on `DataTable` with `getRowId` = `decision_id`.
  - **RTC-F03**: Highlight row whose `decision_id` equals `effectivePendingDecisionId`.
  - **RTC-F04**: For that active pending row, Your action shows `**Reviewing`** chip (not `—`, not Approved/Rejected). Non-color cue per Spec Literals § Active row presentation.
  - **RTC-F07**: Confirm Overview table has no Approve/Reject buttons; tabs do not add primary Approve/Reject when bar visible (reaffirm LPR-F08).
  - Default sort for this table: `[{ id: 'decided_at', desc: true }]` once TASK-009 lands; until then keep current order or pass sort if TASK-004/009 ordered together.
- **Depends on**: TASK-003, TASK-004
- **Verification**: Active pending row highlighted + Reviewing chip; no Approve/Reject in Overview.

### TASK-007: Phase A component tests (RTC-001, 002, 005, 006, 007, 008)

- **Files**:
  - `dashboard/app/(dashboard)/attention/_components/__tests__/attention-review-bar.test.tsx` (extend)
  - `dashboard/app/(dashboard)/learners/[ref]/_components/__tests__/` (extend or create overview / detail tests)
  - `dashboard/components/data-table/__tests__/` (create as needed for active row)
- **Action**: Create | Modify
- **Details**:
  - **RTC-001**: Decision with `educator_explanation` → rendered text equals `educatorBodyCopy(decision)`; not short summary alone.
  - **RTC-002**: Empty explanation; summary present → uses `educator_summary`; never hardcoded intervene/pause strings when summary exists.
  - **RTC-005**: `activeRowId` = decision A → row A has active/highlight marker; B does not.
  - **RTC-006**: Active pending row Your action shows Reviewing; not `—`.
  - **RTC-007**: Bar visible → no Approve/Reject in Overview tab (LPR-F08 regression).
  - **RTC-008**: Bar + `decided_at` → type badge + formatted time + narrative; no learner ref when `fromAttention=false`.
- **Depends on**: TASK-004, TASK-005, TASK-006
- **Verification**: Named tests RTC-001–002, 005–008 pass.

### TASK-008: E2E multi-pending identity (RTC-011)

- **Files**: `dashboard/e2e/decision-panel.spec.ts` (extend) and/or fixtures under `dashboard/e2e/`
- **Action**: Modify
- **Details**:
  - **RTC-011**: Learner with 2 pending urgent decisions → bar shows `1 of 2 pending`; Summary text matches highlighted row; Next updates bar + highlight.
- **Depends on**: TASK-005, TASK-006
- **Verification**: E2E path green against local/demo seed that has multi-pending (or fixture).

### TASK-009: Extend DataTable Phase B APIs

- **Files**: `dashboard/components/data-table/data-table.tsx`
- **Action**: Modify
- **Details**:
  - Add optional props per Spec Literals § DataTable API literals:
    - `initialSorting?: SortingState` — default `[]` if omitted (callers set per RTC-F11).
    - `toolbar?: ReactNode` — renders above the table; when set, default text filter still available unless `showFilter={false}`; consumers place facet filters in `toolbar` beside or instead of composing externally only.
    - `columnVisibility` controlled or uncontrolled `VisibilityState` + optional Columns dropdown (shadcn pattern).
    - `showColumnVisibility?: boolean` — default `false`.
  - Keep page size options `[10, 20, 30, 50]` unchanged on pagination.
  - Prefer `@tanstack/react-table` `SortingState` / `VisibilityState` and existing shadcn `DropdownMenu` / `Checkbox` (**higher DX** than custom grid).
- **Depends on**: TASK-004
- **Verification**: Props typed; Decisions one-off Columns menu can later call shared API (TASK-011).

### TASK-010: createRowActionsColumn helper

- **Files**:
  - `dashboard/components/data-table/create-row-actions-column.tsx` (create)
  - `dashboard/components/data-table/__tests__/create-row-actions-column.test.tsx` (create)
- **Action**: Create
- **Details**:
  - **RTC-F09**: `createRowActionsColumn<TData>(actions)` returns TanStack `ColumnDef` with `stopPropagation` on control clicks so row `onRowClick` does not fire.
  - Thin in-repo wrapper only — **less complex** than third-party data-grid.
  - **RTC-009**: Click Approve in actions cell → `onApprove` fires; `onRowClick` does not.
- **Depends on**: none
- **Verification**: RTC-009 test passes.

### TASK-011: Apply DataTable grammar across list surfaces

- **Files**:
  - `dashboard/app/(dashboard)/attention/_components/attention-queue-table.tsx`
  - `dashboard/app/(dashboard)/decisions/_components/decisions-stream.tsx`
  - `dashboard/app/(dashboard)/learners/_components/learners-roster.tsx`
  - `dashboard/app/(dashboard)/_components/recent-decisions-table.tsx`
  - `dashboard/app/(dashboard)/learners/[ref]/_components/learner-overview-tab.tsx`
  - `dashboard/app/(dashboard)/settings/_components/policies-table.tsx` (Access role / Version / Rules — ensure `DataTableColumnHeader` where sortable per RTC-F10)
- **Action**: Modify
- **Details**:
  - Attention: migrate Approve/Reject cells to `createRowActionsColumn` (behavior unchanged — toast/feedback/queue).
  - **RTC-F10**: Scannable sortable columns (Time, Learner/Reference, Urgency, Level, Last activity, Version, Rules count, Access role) MUST use `DataTableColumnHeader`. Non-sortable status/type/summary MAY use plain headers.
  - **RTC-F11**: Apply Spec Literals § Default sorts:
    - Attention: `[{ id: 'urgency', desc: false }]`
    - Decisions / Overview recent / learner recent: `[{ id: 'decided_at', desc: true }]`
    - Learners: `[{ id: 'updated_at', desc: true }]`
  - Decisions: replace one-off Columns menu with shared `showColumnVisibility` when enabling visibility.
- **Depends on**: TASK-009, TASK-010
- **Verification**: Attention Approve/Reject still work; default newest-first on Decisions; sort headers present on listed columns.

### TASK-012: Phase B tests RTC-010 and Attention e2e RTC-012

- **Files**:
  - `dashboard/components/data-table/__tests__/` (initialSorting)
  - Attention e2e path (extend existing attention / decision-panel fixtures)
- **Action**: Create | Modify
- **Details**:
  - **RTC-010**: DataTable with `decided_at` desc → first row is newest by `decided_at`.
  - **RTC-012**: Approve from Attention table → toast + queue update (existing Attention e2e path regression).
- **Depends on**: TASK-009, TASK-011
- **Verification**: RTC-010 and RTC-012 pass.

### TASK-013: Phase C — facet filters in DataTable toolbar (RTC-F12)

- **Files**:
  - `dashboard/app/(dashboard)/decisions/_components/decisions-stream.tsx`
  - `dashboard/app/(dashboard)/learners/_components/learners-roster.tsx`
- **Action**: Modify
- **Details**:
  - Move Decisions and Learners **facet** filters (time range, review status, trend, skill) into the `DataTable` `toolbar` slot so search + facets share one chrome band.
- **Depends on**: TASK-009
- **Verification**: Facets and search share one toolbar band; filter behavior unchanged.

### TASK-014: Phase C — Signals ingestion log on DataTable (RTC-F13)

- **Files**: `dashboard/app/(dashboard)/signals/_components/ingestion-log.tsx` (+ page wiring as needed)
- **Action**: Modify
- **Details**:
  - Migrate Signals **ingestion log** onto shared `DataTable` while preserving expandable rejection detail (inline expand). Sort/filter/pagination MUST match other list routes.
- **Depends on**: TASK-009
- **Verification**: Rejection expand still works; table uses shared DataTable APIs.

### TASK-015: Phase C optional — Review link on non-active pending rows (RTC-F14)

- **Files**: `dashboard/app/(dashboard)/learners/[ref]/_components/learner-overview-tab.tsx`
- **Action**: Modify
- **Details**:
  - Non-active pending rows MAY show ghost/underline `CardInlineAction` `**Review**` that sets `?reviewDecision=` only — never Approve/Reject.
  - Use existing `CardInlineAction` and `learnerDetailReviewUrl` / attention URL helper; preserve `from` only when already on Attention-originated flow if applicable.
- **Depends on**: TASK-006
- **Verification**: Review sets URL only; no Approve/Reject in row; active row still uses Reviewing chip + bar.

## Files Summary

### To Create


| File                                                                                   | Task                | Purpose                           |
| -------------------------------------------------------------------------------------- | ------------------- | --------------------------------- |
| `dashboard/lib/pending-review-presentation.ts`                                         | TASK-001            | Queue index/total + nextPendingId |
| `dashboard/lib/__tests__/pending-review-presentation.test.ts`                          | TASK-002            | RTC-003, RTC-004                  |
| `dashboard/components/data-table/create-row-actions-column.tsx`                        | TASK-010            | Row actions ColumnDef factory     |
| `dashboard/components/data-table/__tests__/create-row-actions-column.test.tsx`         | TASK-010            | RTC-009                           |
| `dashboard/components/data-table/__tests__/data-table-active-row.test.tsx` (or equiv.) | TASK-007 / TASK-012 | RTC-005, RTC-010                  |


### To Modify


| File                                                                                      | Task                         | Changes                                          |
| ----------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------ |
| `dashboard/components/shared/review-action-chip.tsx`                                      | TASK-003                     | Reviewing label/variant                          |
| `dashboard/components/data-table/data-table.tsx`                                          | TASK-004, TASK-009           | activeRowId; initialSorting; toolbar; visibility |
| `dashboard/app/(dashboard)/attention/_components/attention-review-bar.tsx`                | TASK-005                     | educatorBodyCopy, time, position, Next           |
| `dashboard/app/(dashboard)/learners/[ref]/_components/learner-overview-tab.tsx`           | TASK-006, TASK-011, TASK-015 | active row, Reviewing, sorts, optional Review    |
| `dashboard/app/(dashboard)/learners/[ref]/_components/learner-detail-view.tsx`            | TASK-006                     | Pass pending id into Overview as needed          |
| `dashboard/app/(dashboard)/attention/_components/attention-queue-table.tsx`               | TASK-011                     | createRowActionsColumn + initialSorting          |
| `dashboard/app/(dashboard)/decisions/_components/decisions-stream.tsx`                    | TASK-011, TASK-013           | Shared visibility/sort/toolbar                   |
| `dashboard/app/(dashboard)/learners/_components/learners-roster.tsx`                      | TASK-011, TASK-013           | Sort headers + toolbar facets                    |
| `dashboard/app/(dashboard)/_components/recent-decisions-table.tsx`                        | TASK-011                     | initialSorting decided_at desc                   |
| `dashboard/app/(dashboard)/signals/_components/ingestion-log.tsx`                         | TASK-014                     | Shared DataTable                                 |
| `dashboard/app/(dashboard)/attention/_components/__tests__/attention-review-bar.test.tsx` | TASK-007                     | RTC-001, 002, 008                                |
| `dashboard/e2e/decision-panel.spec.ts`                                                    | TASK-008, TASK-012           | RTC-011, RTC-012                                 |


## Requirements Traceability

> Every `- [ ]` bullet under the spec's `## Requirements` and every `Given/When/Then` under `## Acceptance Criteria` maps to at least one TASK here.


| Requirement (spec anchor)                                                                 | Source                      | Task                         |
| ----------------------------------------------------------------------------------------- | --------------------------- | ---------------------------- |
| RTC-F01 educatorBodyCopy on bar; no raw summary/hardcoded when explanation available      | spec § Requirements Phase A | TASK-005, TASK-007           |
| RTC-F02 DecisionBadge + formatDecisionTime + narrative; omit learner ref on learner route | spec § Requirements Phase A | TASK-005, TASK-007           |
| RTC-F03 Highlight Overview row matching effectivePendingDecisionId                        | spec § Requirements Phase A | TASK-004, TASK-006, TASK-007 |
| RTC-F04 Reviewing chip on active pending Your action                                      | spec § Requirements Phase A | TASK-003, TASK-006, TASK-007 |
| RTC-F05 `{n} of {total} pending` when multiple pending                                    | spec § Requirements Phase A | TASK-001, TASK-005, TASK-002 |
| RTC-F06 Next advances reviewDecision URL; preserve from=attention                         | spec § Requirements Phase A | TASK-001, TASK-005, TASK-008 |
| RTC-F07 No duplicate Approve/Reject when bar visible; Overview no Approve/Reject          | spec § Requirements Phase A | TASK-006, TASK-007           |
| RTC-F08 DataTable initialSorting, activeRowId, toolbar, columnVisibility                  | spec § Requirements Phase B | TASK-004, TASK-009           |
| RTC-F09 createRowActionsColumn; Attention migrate                                         | spec § Requirements Phase B | TASK-010, TASK-011           |
| RTC-F10 Sortable columns use DataTableColumnHeader                                        | spec § Requirements Phase B | TASK-011                     |
| RTC-F11 Default sorts per surface                                                         | spec § Requirements Phase B | TASK-011, TASK-012           |
| RTC-F12 Facet filters in DataTable toolbar                                                | spec § Requirements Phase C | TASK-013                     |
| RTC-F13 Signals ingestion log on DataTable                                                | spec § Requirements Phase C | TASK-014                     |
| RTC-F14 Optional Review CardInlineAction on non-active pending                            | spec § Requirements Phase C | TASK-015                     |
| AC: bar narrative matches table Summary (educatorBodyCopy, clamp only)                    | spec § Acceptance Criteria  | TASK-005, TASK-007, TASK-008 |
| AC: two pending shows 1 of 2 pending, Reviewing chip, Next advances                       | spec § Acceptance Criteria  | TASK-005, TASK-006, TASK-008 |
| AC: no second Approve/Reject primary CTA in tabs when bar visible                         | spec § Acceptance Criteria  | TASK-006, TASK-007           |
| AC: Attention Approve/Reject behavior + row click sheet unchanged                         | spec § Acceptance Criteria  | TASK-011, TASK-012           |
| AC: Decisions newest-first default; Columns from shared DataTable APIs                    | spec § Acceptance Criteria  | TASK-009, TASK-011, TASK-012 |


## Test Plan


| Test ID | Type           | Description                                      | Task     |
| ------- | -------------- | ------------------------------------------------ | -------- |
| RTC-001 | unit/component | Bar narrative uses educatorBodyCopy              | TASK-007 |
| RTC-002 | unit/component | Fallback chain; no hardcoded when summary exists | TASK-007 |
| RTC-003 | unit           | Pending queue position `{index: 1, total: 2}`    | TASK-002 |
| RTC-004 | unit           | Next pending id with wrap                        | TASK-002 |
| RTC-005 | component      | activeRowId highlight marker                     | TASK-007 |
| RTC-006 | component      | Reviewing chip on active pending                 | TASK-007 |
| RTC-007 | component      | No duplicate Approve/Reject (LPR-F08)            | TASK-007 |
| RTC-008 | component      | Bar fields on learner route                      | TASK-007 |
| RTC-009 | component      | createRowActionsColumn stopPropagation           | TASK-010 |
| RTC-010 | unit/component | initialSorting decided_at desc                   | TASK-012 |
| RTC-011 | e2e            | Multi-pending identity                           | TASK-008 |
| RTC-012 | e2e            | Attention actions regression                     | TASK-012 |


## Deviations from Spec

None — plan is literal-compatible with spec.

Notes (not deviations):

- `activeRowId` ships in TASK-004 ahead of the rest of RTC-F08 so Phase A Overview highlight can land before full Phase B toolbar/visibility (spec: implement A before B; F03 requires highlight).
- RTC-F14: Overview uses Next.js `Link` + `cardInlineActionVariants({ variant: 'underline' })` rather than the button `CardInlineAction` component so the control remains a navigational link (documented Link pattern on `card-inline-action.tsx`). Spec Concrete Values updated to match.
- RTC-F14 was optional; TASK-015 implemented it with Phase C.

## Risks


| Risk                                                                                         | Impact | Mitigation                                                                                              |
| -------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| Multi-pending seed missing in demo/e2e                                                       | Medium | Extend Springs seed or e2e fixture with two unreviewed urgent decisions for one learner before RTC-011  |
| Bar vs Overview copy still diverge if Overview passes different fields into educatorBodyCopy | High   | Both call `educatorBodyCopy(row/decision)` with same decision object fields; assert RTC-001/AC in tests |
| Attention stopPropagation regression when migrating to helper                                | High   | RTC-009 + RTC-012 before merge                                                                          |
| Column visibility controlled state fight with Decisions local menu                           | Medium | Remove one-off menu in same PR as shared `showColumnVisibility`                                         |
| Phase C scope slips into pilot path                                                          | Low    | Ship Phase A+B first; ledger Next action stays on TASK-001 until A complete                             |


## Verification Checklist

- [x] All tasks completed (or Phase C explicitly deferred in ledger Next action)
- [x] All tests pass (`npm test` / dashboard vitest + e2e as scoped)
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [x] Matches spec requirements (Phases A–C landed)
- [x] Post-ship: move spec to Shipped in `docs/specs/README.md`; amend LPR UX copy note for identity fields

## Implementation Order

```
TASK-001 → TASK-002
TASK-003 ──┐
TASK-004 ──┼→ TASK-005 → TASK-006 → TASK-007 → TASK-008
           └─────────────┘
TASK-009 → TASK-010 → TASK-011 → TASK-012
TASK-013 (after TASK-009)
TASK-014 (after TASK-009)
TASK-015 (after TASK-006; optional with Phase C)
```

## Prefer-existing check (summary)


| Need                      | Chosen approach                                             | Justification                                              |
| ------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| Table state               | `@tanstack/react-table` already in `dashboard/package.json` | Spec + higher DX vs custom grid                            |
| Columns UI                | shadcn DropdownMenu / Button / Checkbox                     | Already used on Decisions stream                           |
| Body copy                 | `educatorBodyCopy()`                                        | Single resolver; less complex than new helper              |
| Row actions               | Thin `createRowActionsColumn`                               | Less complex than third-party grid                         |
| Quiet Review link         | `Link` + `cardInlineActionVariants`                         | Same visual grammar as `CardInlineAction`; real navigation |
| AWS / DynamoDB / new APIs | None                                                        | Dashboard-only; no MCP IaC work                            |


## Next Steps

Post-impl doc sync complete (2026-07-11):

- Plan todos 15/15 completed; ledger row **Shipped**
- Spec + `docs/specs/README.md` marked shipped; LPR identity amend applied  
- Optional: `/doc-housekeeping` if hub indexes drift elsewhere

