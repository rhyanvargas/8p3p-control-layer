# Decision Review Identity & DataTable Consistency

## Overview

Educators reviewing decisions on `/learners/[ref]` cannot reliably tell **which** pending decision the sticky **Action required** bar will Approve or Reject when multiple urgent items exist — and the bar’s summary text often disagrees with the Overview **Recent decisions** table (short `educator_summary` / hardcoded fallback vs `educatorBodyCopy()` narrative). Separately, dashboard list surfaces share a TanStack `DataTable` shell but diverge on sort headers, toolbar placement, column visibility, and row-action patterns, so the product does not feel like one table system.

This spec closes both gaps without changing the write model: keep the sticky bar as the **sole** Approve/Reject surface on learner detail (LPR-F08 / §2.1 single focal CTA), bind it visually and textually to the matching table row, then extend the shared `DataTable` so Attention / Learners / Decisions / Overview / Signals reuse one interaction grammar with view-specific data and action configs.

**Design authorities:** [`dashboard-design-requirements.md`](dashboard-design-requirements.md) §2.1 / §8; [`learner-pending-review-bar.md`](learner-pending-review-bar.md); [`attention-review-ux.md`](attention-review-ux.md). UX patterns: [shadcn Data Table](https://ui.shadcn.com/docs/components/base/data-table) (TanStack composition); [Pencil & Paper enterprise table patterns](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables) (action vs info table types).

**Phases:** A (review identity — P0) → B (shared `DataTable` grammar — P1) → C (surface parity — P2). **Shipped 2026-07-11** (Phases A–C via [`.cursor/plans/decision-review-table-consistency.plan.md`](../../.cursor/plans/decision-review-table-consistency.plan.md)).

---

## Requirements

### Functional

#### Phase A — Review identity (learner detail)

- [x] **RTC-F01** `AttentionReviewBar` MUST resolve display narrative via `educatorBodyCopy()` (same resolver as Overview Summary / Attention sheets). MUST NOT prefer raw `educator_summary` alone or hardcoded strings (`Needs stronger support now` / `High decay risk — consider pausing`) when `educator_explanation`, `educator_summary`, or `rationale` is available.
- [x] **RTC-F02** When the bar is mounted on `/learners/[ref]`, it MUST show: `DecisionBadge` (type), **time** via `formatDecisionTime(decided_at)`, and the narrative from RTC-F01 (`line-clamp-2`). Learner reference MUST be omitted on the learner detail route (already in page context). When `fromAttention` is true, learner reference MAY remain visible (queue → profile continuity).
- [x] **RTC-F03** Overview **Recent decisions** `DataTable` MUST highlight the row whose `decision_id` equals `effectivePendingDecisionId` (active row). Highlight MUST use semantic warning tokens (not color alone — include a non-color cue per §2 #9).
- [x] **RTC-F04** For the active pending row, **Your action** MUST show a distinct **Reviewing** chip (not `—` and not Approved/Rejected).
- [x] **RTC-F05** When the learner has **more than one** unreviewed urgent decision (`intervene` | `pause`, same exclusion rules as `buildPendingAttentionQueue`), the bar MUST show queue position copy: `{index} of {total} pending` (1-based index in pending order).
- [x] **RTC-F06** When `total > 1`, the bar MUST expose a quiet **Next** control that advances to the next pending decision in queue order (wrap optional: wrap to first). Next MUST update URL `reviewDecision` via `learnerDetailReviewUrl` / Attention URL helper as appropriate, preserving `from=attention` when present.
- [x] **RTC-F07** Tabs MUST NOT add Approve/Reject primary CTAs when the bar is visible (**reaffirm LPR-F08**). Overview table MUST NOT render Approve/Reject buttons.

#### Phase B — Shared DataTable grammar

- [x] **RTC-F08** Extend `dashboard/components/data-table/data-table.tsx` with optional:
  - `initialSorting?: SortingState`
  - `activeRowId?: string` (compare to `getRowId` / row id; applies `data-state` / class for highlight)
  - `toolbar?: ReactNode` (renders above the table; when set, default text filter still available unless `showFilter={false}` — consumers place facet filters in `toolbar` **beside** or **instead of** composing externally only)
  - `columnVisibility?:` controlled or uncontrolled `VisibilityState` + optional Columns dropdown via `showColumnVisibility` (default `false`; shadcn pattern)
- [x] **RTC-F09** Add `createRowActionsColumn<TData>(actions)` helper that returns a TanStack `ColumnDef` with `stopPropagation` on control clicks so row `onRowClick` does not fire. Attention queue MUST migrate Approve/Reject cells to this helper (behavior unchanged).
- [x] **RTC-F10** Scannable columns that support sort (Time, Learner/Reference, Urgency, Level, Last activity, Version, Rules count, Access role) MUST use `DataTableColumnHeader`. Non-sortable status/type/summary columns MAY use plain headers.
- [x] **RTC-F11** Default sorts (when no user override): Attention urgency ascending (priority) then newest; Decisions / Overview recent / learner recent by `decided_at` desc; Learners by `updated_at` desc.

#### Phase C — Surface parity (follow-on)

- [x] **RTC-F12** Move Decisions and Learners **facet** filters (time range, review status, trend, skill) into the `DataTable` `toolbar` slot so search + facets share one chrome band.
- [x] **RTC-F13** Migrate Signals **ingestion log** onto shared `DataTable` while preserving expandable rejection detail (inline expand — Pencil & Paper pattern). Sort/filter/pagination MUST match other list routes.
- [x] **RTC-F14** (Optional) Non-active pending rows on learner Overview MAY show a ghost/underline **Review** control (Next.js `Link` + `cardInlineActionVariants({ variant: 'underline' })` — same visual grammar as `CardInlineAction`) that sets `?reviewDecision=` only — never Approve/Reject.

### Acceptance Criteria

- Given learner Overview shows an Intervene row with a long `educator_explanation`, when the review bar is visible for that `decision_id`, then the bar narrative matches the table Summary cell text (same `educatorBodyCopy` output, allowing `line-clamp` truncation only).
- Given two unreviewed urgent decisions for one learner, when the bar mounts, then it shows `1 of 2 pending`, the matching table row is highlighted with a **Reviewing** chip, and **Next** advances highlight + bar content to the second decision.
- Given the bar is visible, when the educator inspects Overview / Skills / other tabs, then no second Approve/Reject primary CTA appears in tab content.
- Given Attention queue, when Approve/Reject is clicked in the actions column, then behavior matches pre-change (toast, feedback, queue update) and row click still opens the sheet when not clicking actions.
- Given Decisions stream, when the page loads, then Time sorts newest-first by default and the Columns control (if enabled) comes from shared `DataTable` APIs rather than a one-off menu (Phase B/C as scoped).

---

## Constraints

- **Dashboard-only:** No new control-layer API endpoints, error codes, or DynamoDB changes. Consumes existing learner summary + decision feedback contracts.
- **Write model unchanged:** Learner detail sole write surface remains `AttentionReviewBar` (LPR-F08). Attention remains the only **table** with primary Approve/Reject.
- **Amend, don’t fork:** Extends LPR + Attention review UX; do not introduce a second body-copy helper.
- **Anti-clutter:** One emphasized write CTA per learner viewport; quiet Next / Review links are secondary.
- **Libraries:** Prefer existing `@tanstack/react-table` (`SortingState`, `VisibilityState`), shadcn `DropdownMenu` / `Button` / `Checkbox`, `educatorBodyCopy`, `formatDecisionTime`, `CardInlineAction`, `DecisionBadge`, `ReviewActionChip`.

## Out of Scope

| Item | Rationale |
|------|-----------|
| Approve/Reject inside learner Overview table rows | Violates LPR-F08 / §2.1 |
| Multi-select / bulk Approve/Reject | No bulk workflow in pilot |
| Row density controls / column freeze / sticky header | Deferred polish |
| Changing urgent types or queue priority rules | Owned by `attention-decisions.ts` / LPR |
| New feedback API fields | Copy already on decision/summary payload |
| Replacing TanStack with another grid library | Already installed; shadcn baseline |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|-----------------|--------|
| `educatorBodyCopy()` | `dashboard/lib/panel-helpers.ts`; LSX-F02 in `learner-status-explanation-ux.md`; `ai-educator-explanations.md` | Defined ✓ |
| `effectivePendingDecisionId` / `selectPendingDecisionForLearner` / queue order | `learner-pending-review-bar.md` LPR-F01/F07/F09; `attention-decisions.ts` | Defined ✓ |
| Sticky bar sole write CTA | `learner-pending-review-bar.md` LPR-F08; `dashboard-design-requirements.md` §2.1 / §8 | Defined ✓ |
| `AttentionReviewBar`, `executeReviewAction` | `attention-review-ux.md` P1-F09; `review-actions.ts` | Defined ✓ |
| `formatDecisionTime` | `dashboard/lib/overview-metrics.ts` | Defined ✓ |
| `ReviewActionChip` / Your action column | Overview + Decisions streams | Defined ✓ |
| `DataTable` + `DataTableColumnHeader` | `dashboard-design-requirements.md` §4 | Defined ✓ — **extend** |
| `CardInlineAction` | `dashboard/components/shared/card-inline-action.tsx` | Defined ✓ (RTC-F14) |
| URL helpers `reviewDecision` / `from` | `attention-review-url.ts`; LPR Concrete Values | Defined ✓ |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| Active-row + copy-parity review identity | Pilot demos, educator journey in `dashboard-design-requirements.md` |
| Shared `DataTable` toolbar / actions / visibility APIs | Future list surfaces; Signals migration (RTC-F13) |

### Existing libraries (prefer over custom)

| Need | Library / module | Justification |
|------|------------------|---------------|
| Table state (sort, filter, page, visibility) | `@tanstack/react-table` ^8 (already in `dashboard/package.json`) | Official shadcn Data Table foundation — **higher DX** than a custom grid |
| Columns / row-actions UI | Existing shadcn `DropdownMenu`, `Button`, `Checkbox` | Compose, don’t reinvent — per `.agents/skills/shadcn` |
| Quiet secondary links | `CardInlineAction` / `cardInlineActionVariants` on `Link` | Already established for card/list micro-actions; Link pattern documented on the component |
| Body copy | `educatorBodyCopy()` | Single resolver — **less complex** than a new helper |
| Row-actions column factory | Thin `createRowActionsColumn` in-repo | **Less complex** than adding a third-party data-grid; wraps ColumnDef only |

No new npm dependencies required for Phases A–B. Phase C Signals migration likewise stays on TanStack.

---

## Error Codes

### Existing (reuse)

| Code | Source | Educator-facing copy |
|------|--------|----------------------|
| `session_required` | `educator-feedback-api.md` | Unchanged |
| `decision_not_found` | `educator-feedback-api.md` | Unchanged |
| `dashboard_upstream_unavailable` | dashboard proxy | Unchanged |

### New

None — UI consistency only; no new API or proxy error codes.

---

## Contract Tests

| Test ID | Type | Description | Input | Expected |
|---------|------|-------------|-------|----------|
| RTC-001 | unit | Bar narrative uses `educatorBodyCopy` | Decision with `educator_explanation` set | Rendered text equals `educatorBodyCopy(decision)`; not short summary alone |
| RTC-002 | unit | Fallback chain | Empty explanation; summary present | Uses `educator_summary`; never hardcoded intervene/pause strings when summary exists |
| RTC-003 | unit | Pending queue position | Two pending urgent IDs; effective = first | `{index: 1, total: 2}` from shared helper |
| RTC-004 | unit | Next pending id | Ordered `[A, B]`; current A | Next → B; from B → A if wrap enabled |
| RTC-005 | component | Active row highlight | `activeRowId` = decision A | Row A has active/highlight marker; B does not |
| RTC-006 | component | Reviewing chip | Active pending row | Your action shows Reviewing; not `—` |
| RTC-007 | component | No duplicate CTAs | Bar visible on learner detail | No Approve/Reject in Overview tab (LPR-F08 regression) |
| RTC-008 | component | Bar fields on learner route | Bar + decision with `decided_at` | Shows type badge + formatted time + narrative; no learner ref when `fromAttention=false` |
| RTC-009 | component | `createRowActionsColumn` stopPropagation | Click Approve in Attention actions cell | `onApprove` fires; `onRowClick` does not |
| RTC-010 | unit/component | `initialSorting` | DataTable with `decided_at` desc | First row is newest by `decided_at` |
| RTC-011 | e2e | Multi-pending identity | Learner with 2 pending urgent decisions | Bar shows `1 of 2 pending`; Summary text matches highlighted row; Next updates both |
| RTC-012 | e2e | Attention actions regression | Approve from Attention table | Toast + queue update (existing Attention e2e path) |

> **Test strategy:** RTC-001–004 pure helpers (extend `panel-helpers` / new `pending-review-presentation` tests). RTC-005–010 component tests co-located under `data-table/` and learner/attention `__tests__`. RTC-011–012 extend `dashboard/e2e/decision-panel.spec.ts` / attention e2e fixtures.

---

## Concrete Values Checklist

### Copy / UI literals

| Element | Value |
|---------|-------|
| Bar region `aria-label` | `Attention review actions` (unchanged) |
| Bar heading | `Action required` (unchanged) |
| Queue subcopy | `Approve or reject this decision before returning to the queue.` (unchanged) |
| Learner subcopy | `Approve or reject this recommendation for this learner.` (unchanged) |
| Queue position | `{n} of {total} pending` — e.g. `1 of 2 pending` |
| Next control label | `Next` |
| Active Your action chip label | `Reviewing` |
| Optional row link (RTC-F14) | `Review` — Next.js `Link` + `cardInlineActionVariants({ variant: 'underline' })` |
| Narrative clamp | `line-clamp-2` on bar; Overview Summary already `line-clamp-2` |
| Body copy resolver | `educatorBodyCopy` from `@/lib/panel-helpers` only |

### Active row presentation

| Token / cue | Value |
|-------------|-------|
| Row attribute | `data-state="active"` when `row.id === activeRowId` (in addition to selected if ever used) |
| Visual | Warning-muted background and/or `ring-1` using existing `surface.warning*` / semantic tokens from `@/lib/semantic-colors` |
| Non-color cue | **Reviewing** chip in Your action (RTC-F04) |

### Pending ordering (reuse — do not redefine)

| Rule | Value |
|------|-------|
| Urgent types | `intervene`, `pause` |
| Priority | intervene before pause; then `decided_at` descending |
| Exclusion | local review store OR server `latest_action` |
| Summary limit | `recentDecisionsLimit: 10` |

### URL query parameters (reuse)

| Param | Value | Notes |
|-------|-------|-------|
| `reviewDecision` | decision id string | Next updates this param |
| `from` | `attention` | Preserved when advancing Next from Attention-originated entry |

### DataTable API literals (Phase B)

| Prop | Type / default |
|------|----------------|
| `initialSorting` | `SortingState`; default `[]` if omitted (callers set per RTC-F11) |
| `activeRowId` | `string \| undefined` |
| `showColumnVisibility` | `boolean`; default `false` |
| Page size options | `[10, 20, 30, 50]` (unchanged pagination) |

### Default sorts (RTC-F11)

| Surface | `initialSorting` |
|---------|------------------|
| Attention queue | `[{ id: 'urgency', desc: false }]` (priority ascending; tie-break via accessor) |
| Decisions stream | `[{ id: 'decided_at', desc: true }]` |
| Overview recent / learner recent | `[{ id: 'decided_at', desc: true }]` |
| Learners roster | `[{ id: 'updated_at', desc: true }]` |

### Wire formats / HTTP / cookies / env vars

- **Wire formats:** N/A — no new signed payloads.
- **HTTP behavior:** N/A — no new routes or status codes; feedback POST unchanged.
- **Cookies:** N/A — no new cookies.
- **Env vars:** None new.

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| — | — | — | — | No new env vars |

### Routes touched (dashboard only)

| Method | Path | Change |
|--------|------|--------|
| GET | `/learners/[ref]` | Bar copy/fields; Overview active row; Next URL updates |
| GET | `/attention` | Row-actions helper migration only |
| GET | `/decisions`, `/learners`, `/signals` | Phase B/C toolbar / DataTable adoption (**shipped**) |

### Constants / limits

- Narrative display: `line-clamp-2` (bar + table Summary).
- No new rate limits or body size limits.

---

## Production Correctness Notes

- **Proxy / `trustProxy`:** N/A — no new server routes; client via existing `/api/control/*` proxy.
- **CORS:** N/A — same-origin dashboard.
- **CSP / security headers:** N/A — inherit Next.js/Amplify defaults.
- **Cookie prefix vs Path scoping:** N/A — unchanged feedback/session cookies from `attention-review-ux.md`.
- **Content-type parsing:** N/A — no new POST bodies.
- **Body size limits:** N/A — feedback body limits unchanged.
- **Rate-limit storage scope:** N/A — no new rate-limited endpoints.
- **Error-code surface:** Educators see existing friendly feedback errors + `request_id`; UI must not surface stack traces or internal field paths in the bar.

---

## UX Specification

### Table type map (normative)

| Surface | Type | Primary write | Row click |
|---------|------|---------------|-----------|
| `/attention` pending | Action | Approve/Reject in row actions column | Open review sheet |
| `/learners/[ref]` Overview recent | Info (+ sticky bar) | Bar only | Optional peek / no write |
| Overview `/` recent decisions | Info | None | L1 DetailSheet |
| `/learners` roster | Action + info | None (navigate) | L1 learner sheet |
| `/decisions` | Action + info | None (status chip) | L1 DetailSheet |
| `/signals` ingestion | Info | None | Expand rejection (shipped Phase C) |

### Bar content (amends LPR “Copy unchanged” for identity fields)

| Element | Learner route (`fromAttention=false`) | Attention-originated (`fromAttention=true`) |
|---------|----------------------------------------|-----------------------------------------------|
| Type | `DecisionBadge` | `DecisionBadge` |
| Time | `formatDecisionTime(decided_at)` | `formatDecisionTime(decided_at)` |
| Learner ref | **omit** | show |
| Narrative | `educatorBodyCopy` `line-clamp-2` | same |
| Position | `{n} of {total} pending` when `total > 1` | same |
| Next | when `total > 1` | when `total > 1` |

### Amends

- **Amends** [`learner-pending-review-bar.md`](learner-pending-review-bar.md) § UX heading/subcopy table — identity fields (summary/time/position/Next) owned here; heading/subcopy strings stay as specified there (**applied 2026-07-11**).
- **Does not amend** LPR-F08 (no duplicate Approve/Reject) or pending selection rules.

---

## File Structure (implementation hint)

```
dashboard/
├── lib/
│   ├── panel-helpers.ts                 # educatorBodyCopy (reuse)
│   ├── attention-decisions.ts           # pending order (reuse)
│   ├── pending-review-presentation.ts   # NEW: queue index/total, nextPendingId
│   └── __tests__/pending-review-presentation.test.ts
├── components/data-table/
│   ├── data-table.tsx                   # activeRowId, initialSorting, toolbar, visibility
│   ├── data-table-column-header.tsx     # reuse
│   ├── create-row-actions-column.tsx    # NEW helper
│   └── __tests__/
├── components/shared/
│   └── review-action-chip.tsx           # extend Reviewing variant OR adjacent chip
├── app/(dashboard)/attention/_components/
│   ├── attention-review-bar.tsx         # RTC-F01/F02/F05/F06
│   └── attention-queue-table.tsx        # createRowActionsColumn
└── app/(dashboard)/learners/[ref]/_components/
    ├── learner-detail-view.tsx          # pass active id / pending counts into children as needed
    └── learner-overview-tab.tsx         # activeRowId + Reviewing chip
```

---

## Notes

- **Analysis consistency:** Tier C (dashboard hosting) only; no Tier A AWS control-layer or Tier B LMS deployment required for this work.
- **React:** Derive active row and queue position from summary + feedback during render (`vercel-react-best-practices` §5.1); do not mirror `effectivePendingDecisionId` into redundant local state.
- **Prior UX contradiction:** Bar used `educator_summary` + hardcoded fallback while Overview used `educatorBodyCopy` — RTC-F01 is the normative fix.
- **shadcn Payments demo** (checkbox select + `…` menu) is a **composition reference**, not a mandate to enable select on every table. Enable row actions only on action-oriented tables; select/bulk remains out of scope.
- **Post-ship:** Spec marked shipped in [`docs/specs/README.md`](README.md) (2026-07-11); LPR UX copy note amended for identity fields; ledger row **Shipped** 15/15.

---

## Implementation Notes (2026-07-11)

Shipped via [`.cursor/plans/decision-review-table-consistency.plan.md`](../../.cursor/plans/decision-review-table-consistency.plan.md) (TASK-001–015). Contract coverage RTC-001–012 in dashboard unit/component tests + `dashboard/e2e/decision-panel.spec.ts`.

- **Pending helpers:** `dashboard/lib/pending-review-presentation.ts` exports `listPendingUrgentDecisionIds`, `pendingQueuePosition` (1-based), `nextPendingDecisionId` (`wrap` default `true`). Composes `buildPendingAttentionQueue` — does not redefine urgent types/priority.
- **Reviewing chip:** `ReviewActionChip` accepts `ReviewActionChipStatus = ReviewAction | 'reviewing'` with label **`Reviewing`** (`badge.warning`).
- **DataTable:** `activeRowId` → `data-state="active"` + `surface.warningMutedBg` / `surface.warningRing`; `initialSorting` default `[]`; `toolbar`; controlled/uncontrolled `columnVisibility` + `showColumnVisibility` (default `false`); page sizes remain `[10, 20, 30, 50]` in `data-table-pagination.tsx`.
- **Row actions:** `createRowActionsColumn(actions, options?)` — optional `id` / `size` / `headerLabel` (defaults `actions` / `160` / `Review actions`); `stopPropagation` on each control.
- **RTC-F14:** Overview non-active pending rows use Next.js `Link` + `cardInlineActionVariants({ variant: 'underline' })` (not the button `CardInlineAction` component) so navigation stays a real link — matches the module’s documented Link pattern.
- **Surfaces:** Attention / Decisions / Learners / Overview recent / learner recent / Signals ingestion / Settings policies sortable headers use shared grammar; Decisions + Learners facets live in `toolbar`.

---

*Spec created: 2026-07-11 | **Shipped:** 2026-07-11 | Phase: v1 dashboard educator UX | Depends on: `learner-pending-review-bar.md`, `attention-review-ux.md`, `dashboard-design-requirements.md`, `ai-educator-explanations.md` | Amends: LPR bar identity fields; extends DataTable §4 baseline*
