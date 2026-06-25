---
name: Overview Cross-Filter Sync (D2)
overview: Adds opt-in Sync filters to Overview with linked chart and table filtering, partial decision KPI recompute, D3 navigation unchanged, one RSC fetch, and no interaction refetch.
todos:
  - id: TASK-001
    content: Add shadcn switch and NEXT_PUBLIC_OVERVIEW_CROSS_FILTER env gate
    status: completed
  - id: TASK-002
    content: Create overview-filter.ts with applyOverviewFilter pure derivation
    status: completed
  - id: TASK-003
    content: Create sync-toggle-persistence.ts for localStorage read/write
    status: completed
  - id: TASK-004
    content: Create OverviewSyncProvider and useOverviewFilter hook
    status: completed
  - id: TASK-005
    content: Create SyncFilterToggle and ActiveFilterChips UI components
    status: completed
  - id: TASK-006
    content: Create OverviewSurfaces server component with single getOverviewData fetch
    status: completed
  - id: TASK-007
    content: Refactor page.tsx to OverviewSurfaces and header toggle placement
    status: completed
  - id: TASK-008
    content: Wire TrendChart as sync filter source and consumer
    status: completed
  - id: TASK-009
    content: Wire RecentDecisionsTable as sync filter source and consumer
    status: completed
  - id: TASK-010
    content: Wire SectionCards partial KPI recompute with D3 navigation preserved
    status: completed
  - id: TASK-011
    content: Unit tests XFILTER-001 through XFILTER-007
    status: completed
  - id: TASK-012
    content: Component tests XFILTER-008 through XFILTER-011 and XFILTER-014
    status: completed
  - id: TASK-013
    content: E2e tests XFILTER-012 and XFILTER-013 no-refetch contract
    status: completed
  - id: TASK-014
    content: Remove deprecated overview section RSC wrappers after consolidation
    status: completed
isProject: false
---

# Overview Cross-Filter Sync (D2)

**Spec**: `docs/specs/overview-cross-filter-sync.md`

**Prerequisite (Track 0 HK-03 spec reconciliation):** Complete. The spec Overview section and Requirements already match `dashboard-design-requirements.md` section 2.1 (2026-06-23): chart and table are filter sources; KPI cards always navigate (D3); only Needs attention and Pending decisions recompute when sync is ON; Rejected signals today and Improving learners stay program-wide. Spec updated 2026-06-24 per spec footer.

## Current baseline (branch)

| Area | Status |
|------|--------|
| Single Suspense boundary on `page.tsx` with `OverviewSurfaces` fetching once | Shipped |
| D1 educator-first recent table | Shipped |
| D3 clickable KPI cards with drill routes | Shipped |
| `getOverviewData` + `React.cache` dedup | Shipped |
| `computeOverviewKpis`, `computeRecentDecisions`, trend builders | Shipped (`overview-metrics.ts`) |
| Sync toggle, provider, filter derivation, chips | Shipped |
| shadcn `Switch` component | Installed |

---

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase. Update this section only if the spec itself changes.

### From spec § Requirements — Functional

- [ ] Render a single page-level **"Sync filters"** `Switch` in the Overview `PageHeader` actions slot, with an adjacent `Tooltip` explaining the behavior. Default **OFF**.
- [ ] Persist **only the toggle state** (not the selection) to `localStorage` under a versioned key (see Concrete Values), read SSR-safely with a mounted guard that avoids hydration mismatch (`dashboard-design-requirements.md` §2.1; vercel-react-best-practices §6.5).
- [ ] Define one shared, in-memory filter object `OverviewFilter = { decisionType: DecisionType | null; learner: string | null; range: TrendRangeDays }` lifted into a client `OverviewSyncProvider` context that wraps the three surfaces.
- [ ] When sync is **ON**, the chart and table **consume** the shared filter and render the filtered subset of the single fetched `OverviewData`. KPI cards **always navigate** on click (D3, `dashboard-design-requirements.md` §8) — sync does **not** repurpose card clicks as filters.
- [ ] When sync is **ON**, the chart and table act as filter **sources** (MUST): chart range selector → sets `range`; chart decision-type control → sets `decisionType`; table learner-filter input → sets `learner`; table type facet (if present) → sets `decisionType`. Chart legend/series click brushing is **optional post-D2** (not required for v1).
- [ ] When sync is **ON**, only **Needs attention** and **Pending decisions** KPI counts **recompute** from the shared filter (decision-derived). **Rejected signals today** (ingestion) and **Improving learners** (state sample) stay **program-wide** org totals; when decision filters are active they MAY show a subtle program-wide indicator so educators do not mistake filtered decision counts for ingestion/state totals.
- [ ] When sync is **OFF**, surfaces ignore the shared filter and render their full datasets; KPI cards navigate to their drill routes per directive D3 (`dashboard-design-requirements.md` §8). Each surface's own local controls (table search, chart range) continue to work locally without propagating.
- [ ] Render the active cross-filter as a **removable `Badge` chip row** above the surfaces (e.g. "Filtered: Reinforce ✕", "Learner: stu-40123 ✕") whenever any filter field is non-null and sync is ON. A "Clear all" affordance resets the filter. Color is never the only indicator of an active filter (`dashboard-design-requirements.md` §2 #9 / §12).
- [ ] Derive every filtered view with `useMemo` keyed on the shared filter; feed the filter through `useDeferredValue` and wrap non-urgent recomputes in `startTransition` so brushing/typing stays responsive (vercel-react-best-practices §5.9/§5.13/§5.14).
- [ ] Pass only the fields the client filters on across the RSC→client boundary; do not serialize unused `OverviewData` fields into the client island (vercel-react-best-practices §3.6).
- [ ] Toggling sync OFF→ON or ON→OFF must **not** trigger a network refetch; both modes operate on the same server-fetched dataset.
- [ ] Behavior is gated by an optional public feature flag (see Concrete Values); when disabled the toggle is not rendered and the page is exactly today's behavior.

### From spec § Requirements — Acceptance Criteria

- Given sync is OFF (default), when the Overview loads, then the KPI/chart/table render identical content and counts to the pre-feature behavior, the KPI cards navigate on click (D3), and no active-filter chip row is shown.
- Given sync is ON, when a user selects `Reinforce` via the chart decision-type control (or optional series click), then the table filters to `reinforce` rows, Needs attention and Pending decisions recompute over `reinforce`-scoped data, Rejected signals today and Improving learners remain program-wide, and a removable "Filtered: Reinforce" chip appears — with no network request.
- Given sync is ON, when a user clicks any KPI card, then navigation to its drill route occurs (D3) — the click does **not** apply or change the shared filter.
- Given sync is ON and a `learner` filter is active, when the user clicks the chip's ✕ (or "Clear all"), then `learner` is cleared, the chart and table revert to the unfiltered (but still range-scoped) view, decision-derived KPIs revert to the unfiltered subset, and the chip disappears.
- Given sync is ON, when the user types in the table's learner filter, then the input stays responsive (no dropped keystrokes) while the chart and decision-derived KPIs (Needs attention, Pending decisions) update via a deferred transition; ingestion/state KPIs stay program-wide.
- Given the user toggles sync ON, reloads the page, then the toggle is still ON (persisted) but the selection is empty (ephemeral) and surfaces show the unfiltered view.
- Given the user toggles sync OFF while a filter was active, then all surfaces immediately return to their full datasets and the chip row is removed (the stale selection is discarded, not hidden).
- Given the feature flag is disabled, when the Overview loads, then no "Sync filters" toggle renders and the page matches today's behavior.

### From spec § Concrete Values Checklist — Client state shapes (normative)

```ts
type OverviewFilter = {
  decisionType: DecisionType | null; // reuse dashboard/lib/api/types.ts DecisionType
  learner: string | null;            // learner_reference (pseudonymous; already shown in tables)
  range: TrendRangeDays;              // 7 | 30 | 90; default 30
};
```

- Empty/default filter: `{ decisionType: null, learner: null, range: 30 }`.
- Filter composition semantics: fields combine with **AND**; `null` means "do not narrow on this field".

### From spec § Concrete Values Checklist — localStorage (persistence)

| Key | Value | Notes |
|-----|-------|-------|
| `overview:sync-filters:v1` | `"on"` \| `"off"` | Toggle state only; **selection is never persisted**. Read/write wrapped in try/catch; absence or error ⇒ `"off"`. Versioned (`:v1`) per vercel-react-best-practices §4.4. |

### From spec § Concrete Values Checklist — HTTP behavior

| Transition | Status | Content-Type | Required headers |
|------------|--------|--------------|------------------|
| (none) | — | — | — |

> No routes; no HTTP transitions. The feature performs zero requests during interaction or toggle.

### From spec § Concrete Values Checklist — Cookies

- N/A — no cookies. Toggle persistence uses `localStorage` only.

### From spec § Concrete Values Checklist — Env vars

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `NEXT_PUBLIC_OVERVIEW_CROSS_FILTER` | no | `true` | bool | Public feature flag. When `false`, the "Sync filters" toggle is not rendered and the Overview matches pre-feature behavior. Public (`NEXT_PUBLIC_`) because the gate is evaluated client-side; it gates only this presentational UI and exposes nothing sensitive. |

### From spec § Concrete Values Checklist — Constants / limits

- Toggle default: **OFF**.
- Default `range`: `30` (matches existing `TrendChart` default `useState<TrendRangeDays>(30)`).
- No row/size caps introduced — the Overview dataset is already bounded by `getOverviewData` (recent decisions, today's ingestion, `IMPROVING_STATE_SAMPLE = 50` learner states) `(fetch-overview-data.server.ts:22)`.

### From spec § Concrete Values Checklist — Routes registered

| Method | Path | Auth exempt? |
|--------|------|--------------|
| — | none | — |

### From spec § Out of Scope

| Item | Rationale | Revisit |
|------|-----------|---------|
| URL-synced / shareable filter state (`nuqs`) | Selection is ephemeral and exploratory; URL sync adds a dep + RSC complexity for little pilot value | If shareable filtered Overview links are requested |
| Cross-filter on pages other than Overview (`/decisions`, `/learners`) | Those pages already have first-class filter bars; this directive targets the Overview's linked surfaces | Phase C if linked-brushing proves valuable |
| Persisting the active **selection** across reloads | Glance-first default; a stale persisted filter risks misread totals | If users ask for sticky exploration state |
| Brushing a **time range** by dragging on the chart area | Range selector (7/30/90d) covers the pilot need; drag-brush is a larger interaction | Post-pilot |
| Server-side / paginated datasets too large to filter client-side | Overview dataset is bounded by design (§8) | If Overview ever shows unbounded data |

### From spec § Dependencies — Required from Other Specs

| Dependency | Source Document | Status |
|------------|-----------------|--------|
| `OverviewData` (`kpis`, `decisions`, `recentDecisions`, `learnerStates`, `ingestionToday`) + `getOverviewData(orgId)` | `dashboard/lib/api/fetch-overview-data.server.ts` | Defined ✓ |
| `computeOverviewKpis()`, `computeRecentDecisions()` (reused for filtered recompute) | `dashboard/lib/overview-metrics.ts` | Defined ✓ |
| `OverviewFilter` decision-type values (`DecisionType`) + `TrendRangeDays` (`7 | 30 | 90`) | `dashboard/lib/api/types.ts`, `dashboard/lib/overview-metrics.ts`, `dashboard/components/dashboard/trend-chart.tsx` | Defined ✓ (reuse existing types) |
| Cross-filter doctrine (toggle default OFF, shared filter, visible chips, perf, KPI navigate-always / partial recompute) | `docs/specs/dashboard-design-requirements.md` §2.1, §8 | Defined ✓ |
| D1 educator-first recent table + D3 decluttered/clickable KPIs | `.cursor/plans/dashboard-uiux-improvements.plan.md` (D1/D3 tasks) | Coordinated — D2 wraps the same surfaces; sequence after D1/D3 land |
| `fetchedAt` on `OverviewData` (for freshness chip placement near the toggle) | `dashboard/lib/api/fetch-overview-data.server.ts`, `dashboard/app/(dashboard)/_components/overview-surfaces.tsx` | Defined ✓ |

### From spec § Dependencies — External libraries / SDK

| Need | Chosen solution | Why (vs. custom / alternative) |
|------|-----------------|--------------------------------|
| Toggle control | shadcn **`switch`** primitive (`dashboard/components/ui/switch.tsx`) | Compose, don't reinvent (shadcn rule); a11y-correct toggle |
| Active-filter chips | existing shadcn **`Badge`** + `lucide-react` `X` icon | Already installed; reuse |
| Shared filter state | **React context + `useState`** (no new dep) | Selection is ephemeral, single-page, small; a store (`zustand`/`jotai`) or URL-state lib (`nuqs`) is unjustified for one page's session-local filter. Revisit if scope grows. |
| Responsiveness under typing/brushing | React built-ins `useDeferredValue` / `useTransition` / `useMemo` | Native; no dep (vercel-react-best-practices §5.13/§5.14) |
| Toggle persistence | `localStorage` (versioned key, try/catch) | Native; per vercel-react-best-practices §4.4 (version + minimize) |

### From spec § Contract Tests

| Test ID | Type | Description | Input | Expected |
|---------|------|-------------|-------|----------|
| XFILTER-001 | unit | Filter derivation is identity when filter empty | `applyOverviewFilter(data, {decisionType:null,learner:null,range:30})` | KPIs/decisions equal range-scoped full set; no narrowing by type/learner |
| XFILTER-002 | unit | Decision-type filter narrows decisions + recomputes decision-derived KPIs | filter `{decisionType:'reinforce'}` | only `reinforce` decisions; Needs attention + Pending decisions recomputed over that subset; Rejected signals + Improving learners unchanged (program-wide) |
| XFILTER-003 | unit | Learner filter narrows chart/table + decision-derived KPIs | filter `{learner:'stu-40123'}` | decisions/chart scoped to that learner; Needs attention + Pending decisions recomputed; ingestion/state KPIs program-wide |
| XFILTER-004 | unit | Range filter scopes the time window only | filter `{range:7}` | dataset limited to last 7d; type/learner untouched |
| XFILTER-005 | unit | Combined filters compose (AND) | `{decisionType:'reinforce',learner:'stu-40123'}` | intersection only |
| XFILTER-006 | unit | Toggle persistence read/write (versioned key) | set ON, re-read | returns ON; selection not persisted (empty on reload) |
| XFILTER-007 | unit | localStorage failure degrades to OFF | `setItem`/`getItem` throws | no throw; toggle resolves OFF |
| XFILTER-008 | component | Toggle OFF renders today's behavior | render Overview, sync OFF | no chip row; KPI cards are navigation links (D3) |
| XFILTER-009 | component | Toggle ON shows chips + partial KPI recompute | sync ON, set `decisionType` | chip "Filtered: Reinforce" visible; Needs attention + Pending decisions reflect subset; Rejected signals + Improving learners program-wide; KPI click navigates (D3), does not set filter |
| XFILTER-014 | component | KPI cards navigate when sync ON | sync ON, click Needs attention card | navigates to `/attention`; shared filter unchanged |
| XFILTER-010 | component | Chip ✕ / Clear all resets filter | active filter, click ✕ | field cleared; surfaces revert; chip removed |
| XFILTER-011 | component | SSR-safe persisted ON reconciliation | SSR + hydrate with stored ON | server HTML renders OFF via mounted guard; hydration reconciles ON without persisting filter selection |
| XFILTER-012 | e2e | Linked brushing chart→table→decision-derived KPIs, no network | sync ON, set chart decision type | table + Needs attention/Pending decisions update; ingestion/state KPIs unchanged; assert no `/v1/*` request fired on interaction |
| XFILTER-013 | e2e | Toggle does not refetch | flip sync ON/OFF | assert zero new network requests; data identical |

### From spec § Architecture (informative)

```
app/(dashboard)/page.tsx (server)
└─ OverviewSurfaces (server)               // awaits getOverviewData(orgId) once
   └─ OverviewSyncProvider (client)        // receives serializable slice of OverviewData
      ├─ SyncFilterToggle (client)         // shadcn Switch + Tooltip; persists toggle
      ├─ ActiveFilterChips (client)        // Badge row; visible only when sync ON & filter set
      ├─ SectionCards (client partial consumer; always navigates on click — D3)
      ├─ TrendChart (client consumer/source)
      └─ RecentDecisionsTable (client consumer/source)  // D1 educator-first columns
```

### From spec § dashboard-design-requirements.md §2.1 — Cross-filter implementation notes (design authority)

- **KPI cards vs filter sync.** KPI cards remain **navigation drill targets** (§8, D3) at all times — sync does **not** repurpose card clicks as filters. When sync is ON, only **Needs attention** and **Pending decisions** recompute from the shared filter; **Rejected signals today** (ingestion) and **Improving learners** (state sample) stay org-wide and may show a subtle program-wide indicator when decision filters are active.
- **Chart view mode.** The decisions ↔ mastery toggle on `TrendChart` is **chart-local** — cross-filter applies only in **decisions** mode. Mastery series ignores `decisionType` and learner sync.
- **Sync sources (v1).** Chart `Select` controls (7/30/90d range, decision type) and the recent-decisions table learner text filter. Chart legend or area click brushing is **optional post-D2**, not required for v1.
- **Filtered recent table.** When sync is ON and filters are active, the table shows the last 20 decisions **matching the filter**, not the last 20 org-wide.

---

## Prerequisites

Before starting implementation:

- [x] **PREREQ-001** Spec reconciliation with `dashboard-design-requirements.md` §2.1/§8 (KPI navigate-always, partial recompute) — done in spec 2026-06-24 update.
- [x] **PREREQ-002** D1 educator-first table and D3 clickable KPIs landed on branch.
- [x] **PREREQ-003** Install shadcn `switch` (TASK-001).

---

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Add shadcn switch and NEXT_PUBLIC_OVERVIEW_CROSS_FILTER env gate
- **Files**: `dashboard/components/ui/switch.tsx` (new via shadcn), `dashboard/.env.example`, `dashboard/lib/overview/feature-flag.ts` (new)
- **Action**: Create
- **Details**: Run `npx shadcn add switch` in `dashboard/`. Add `NEXT_PUBLIC_OVERVIEW_CROSS_FILTER=true` to `.env.example` with comment matching spec env table. Export `isOverviewCrossFilterEnabled()` reading `process.env.NEXT_PUBLIC_OVERVIEW_CROSS_FILTER !== 'false'` (default `true` per spec).
- **Depends on**: none
- **Verification**: `switch.tsx` exists; feature flag helper returns `false` when env is `'false'`, `true` otherwise.

### TASK-002: Create overview-filter.ts with applyOverviewFilter pure derivation
- **Files**: `dashboard/lib/overview/overview-filter.ts` (new)
- **Action**: Create
- **Details**: Define `OverviewFilter` type and `DEFAULT_OVERVIEW_FILTER`. Export `applyOverviewFilter(data, filter)` returning `{ filteredDecisions, filteredRecentDecisions, decisionDerivedKpis, programWideKpis }` where:
  - Range scopes decisions by local calendar date (`toLocalDateKey`) using existing `TrendRangeDays`.
  - `decisionType` and `learner` narrow with AND semantics; `null` skips.
  - `decisionDerivedKpis` recomputes Needs attention + Pending decisions via `computeOverviewKpis` on the filtered decision subset (pass through original `ingestionToday` + `learnerStates` for the function, then replace only those two KPI fields).
  - `programWideKpis` preserves original `signalsToday` and `improvingLearners` from unfiltered `computeOverviewKpis`.
  - `filteredRecentDecisions` = `computeRecentDecisions(filteredDecisions, 20)`.
  - Identity path: empty type/learner with default range returns range-scoped full set (XFILTER-001).
- **Depends on**: none
- **Verification**: Pure function; no React imports; exported types match spec filter shape (`TrendRangeDays`).

### TASK-003: Create sync-toggle-persistence.ts for localStorage read/write
- **Files**: `dashboard/lib/overview/sync-toggle-persistence.ts` (new)
- **Action**: Create
- **Details**: Key `overview:sync-filters:v1`; values `"on"` | `"off"`. Export `readSyncToggle(): boolean` (absent/error ⇒ `false`), `writeSyncToggle(on: boolean): void` (try/catch swallow). Selection is never persisted.
- **Depends on**: none
- **Verification**: XFILTER-006/007 behavior covered in unit tests (TASK-011).

### TASK-004: Create OverviewSyncProvider and useOverviewFilter hook
- **Files**: `dashboard/app/(dashboard)/_components/overview-sync-provider.tsx` (new)
- **Action**: Create
- **Details**: Client provider wrapping synced surfaces. Props: serializable slice `{ decisions, recentDecisions, learnerStates, ingestionToday, kpis }` (omit unused fields per spec §3.6). State: `syncEnabled` (from persistence, mounted-guard SSR OFF then reconcile — XFILTER-011), `filter` (`DEFAULT_OVERVIEW_FILTER`). Export `useOverviewFilter()` returning `{ syncEnabled, setSyncEnabled, filter, setFilter, deferredFilter, data, derived }`. Use `useDeferredValue(filter)` + `useMemo(() => applyOverviewFilter(...), [data, deferredFilter])` + `startTransition` in `setFilter` wrappers. When `syncEnabled` is false, derived views use full datasets; filter writes are ignored by consumers. Toggling OFF clears chip visibility and surfaces revert immediately (stale selection discarded per AC).
- **Depends on**: TASK-002, TASK-003
- **Verification**: Provider renders children; hook throws outside provider in dev.

### TASK-005: Create SyncFilterToggle and ActiveFilterChips UI components
- **Files**: `dashboard/app/(dashboard)/_components/sync-filter-toggle.tsx` (new), `dashboard/app/(dashboard)/_components/active-filter-chips.tsx` (new)
- **Action**: Create
- **Details**:
  - **SyncFilterToggle**: Labeled shadcn `Switch` ("Sync filters") + adjacent `Tooltip` explaining linked chart/table behavior. Hidden when `isOverviewCrossFilterEnabled()` is false. Calls `setSyncEnabled` and `writeSyncToggle`. Respects mounted-guard SSR behavior (no hydration mismatch).
  - **ActiveFilterChips**: Renders only when sync ON and any filter field active. Removable `Badge` chips: e.g. `Filtered: Reinforce ✕`, `Learner: stu-40123 ✕`, range chip if non-default optional. "Clear all" resets filter to `DEFAULT_OVERVIEW_FILTER`. Keyboard-removable; text+icon (not color alone).
- **Depends on**: TASK-001, TASK-004
- **Verification**: Toggle renders in PageHeader actions; chips appear/disappear per AC.

### TASK-006: Create OverviewSurfaces server component with single getOverviewData fetch
- **Files**: `dashboard/app/(dashboard)/_components/overview-surfaces.tsx` (new)
- **Action**: Create
- **Details**: Async server component `OverviewSurfaces({ orgId })` that awaits `getOverviewData(orgId)` once, handles error via `OverviewSectionError`, passes slim props into `OverviewSyncProvider`. Serialize only fields needed for filtering: `decisions`, `recentDecisions`, `learnerStates`, `ingestionToday`, `kpis`, `fetchedAt` (optional for freshness chip placement).
- **Depends on**: TASK-004, TASK-005
- **Verification**: Single `getOverviewData` call per page load; provider receives data.

### TASK-007: Refactor page.tsx to OverviewSurfaces and header toggle placement
- **Files**: `dashboard/app/(dashboard)/page.tsx`
- **Action**: Modify
- **Details**: Replace three Suspense section blocks with one `<OverviewSurfaces orgId={orgId} />`. Move `SyncFilterToggle` into `PageHeader` actions alongside `OverviewFreshness` (inside provider tree — may require lifting toggle into provider child or passing slot). Preserve org-missing Alert and existing loading/error patterns.
- **Depends on**: TASK-006
- **Verification**: Overview page loads; no triple Suspense boundaries for KPI/chart/table.

### TASK-008: Wire TrendChart as sync filter source and consumer
- **Files**: `dashboard/components/dashboard/trend-chart.tsx`
- **Action**: Modify
- **Details**: Accept optional sync props from `useOverviewFilter()` (via wrapper or direct hook when rendered inside provider). When sync **ON** and `viewMode === 'decisions'`:
  - Range `Select` sets shared numeric `filter.range` (`TrendRangeDays`).
  - Decision-type `Select` sets `filter.decisionType` (`'all'` → `null`).
  - Chart renders from `derived.filteredDecisions`.
  When sync **OFF**: keep existing local `useState` for range/series (today's behavior). When sync **ON** and `viewMode === 'mastery'`: ignore `decisionType`/`learner` sync (design spec chart-local mastery mode); range may still sync or stay local — prefer syncing range only.
- **Depends on**: TASK-004, TASK-006
- **Verification**: Chart→table linked brushing with no network (XFILTER-012 partial); mastery mode unaffected by decisionType filter.

### TASK-009: Wire RecentDecisionsTable as sync filter source and consumer
- **Files**: `dashboard/app/(dashboard)/_components/recent-decisions-table.tsx`
- **Action**: Modify
- **Details**: When sync **ON**: table `data` = `derived.filteredRecentDecisions`; learner filter input sets shared `filter.learner` via `startTransition`; type facet (if added or via column filter) sets `filter.decisionType`. When sync **OFF**: existing local `DataTable` filter on `learner_reference` unchanged. Update subtitle copy when sync ON + filters active: "Matching decisions" vs "Last 20 decisions".
- **Depends on**: TASK-004, TASK-006
- **Verification**: Learner typing stays responsive (deferred filter); table scopes to filter intersection (XFILTER-003/005).

### TASK-010: Wire SectionCards partial KPI recompute with D3 navigation preserved
- **Files**: `dashboard/components/dashboard/section-cards.tsx`
- **Action**: Modify
- **Details**: When sync **ON** and decision filters active: display `derived.decisionDerivedKpis` for Needs attention and Pending decisions; keep `derived.programWideKpis` (or original) for Rejected signals today and Improving learners. Optional subtle "Program-wide" indicator on ingestion/state cards when decision filters active (spec MAY). **KPI cards remain `<StatCard href=...>` navigation links at all times** — clicks do NOT call `setFilter` (XFILTER-014, AC KPI navigate). When sync OFF: pass through original `kpis` prop unchanged.
- **Depends on**: TASK-004, TASK-006
- **Verification**: Existing e2e KPI-004 drilldown tests still pass; filtered counts update without blocking navigation.

### TASK-011: Unit tests XFILTER-001 through XFILTER-007
- **Files**: `dashboard/lib/overview/__tests__/overview-filter.test.ts` (new), `dashboard/lib/overview/__tests__/sync-toggle-persistence.test.ts` (new)
- **Action**: Create
- **Details**: Implement contract tests per spec Contract Tests table for pure helpers. Mock `localStorage` throw for XFILTER-007.
- **Depends on**: TASK-002, TASK-003
- **Verification**: `cd dashboard && npm test -- --run overview-filter sync-toggle-persistence` passes all seven IDs.

### TASK-012: Component tests XFILTER-008 through XFILTER-011 and XFILTER-014
- **Files**: `dashboard/app/(dashboard)/_components/__tests__/overview-sync.test.tsx` (new)
- **Action**: Create
- **Details**: Mount provider + surfaces with mocked `OverviewData`. Assert: OFF = no chips, full KPIs, nav links (XFILTER-008); ON + decisionType = chip + partial KPI recompute + KPI click navigates without filter change (XFILTER-009, XFILTER-014); chip ✕ / Clear all (XFILTER-010); persisted ON hydration (XFILTER-011).
- **Depends on**: TASK-005, TASK-008, TASK-009, TASK-010
- **Verification**: Component test file covers XFILTER-008..011 and XFILTER-014.

### TASK-013: E2e tests XFILTER-012 and XFILTER-013 no-refetch contract
- **Files**: `dashboard/e2e/overview-cross-filter.spec.ts` (new)
- **Action**: Create
- **Details**:
  - **XFILTER-012**: Enable sync, change chart decision type, assert table rows + Needs attention/Pending decisions update; Rejected signals + Improving learners unchanged; intercept `/v1/*` — zero requests on interaction.
  - **XFILTER-013**: Flip sync ON/OFF, assert zero new network requests; data identical to OFF baseline.
- **Depends on**: TASK-007, TASK-008, TASK-009, TASK-010
- **Verification**: Playwright spec passes against seeded mock upstream.

### TASK-014: Remove deprecated overview section RSC wrappers after consolidation
- **Files**: `dashboard/app/(dashboard)/_components/overview-kpi-section.tsx`, `overview-trend-section.tsx`, `overview-recent-decisions-section.tsx`
- **Action**: Delete
- **Details**: Remove the three independent section components once `OverviewSurfaces` is wired and no imports remain.
- **Depends on**: TASK-007
- **Verification**: `rg OverviewKpiSection|OverviewTrendSection|OverviewRecentDecisionsSection dashboard/` returns no matches.

---

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `dashboard/components/ui/switch.tsx` | TASK-001 | shadcn Switch primitive |
| `dashboard/lib/overview/feature-flag.ts` | TASK-001 | `NEXT_PUBLIC_OVERVIEW_CROSS_FILTER` gate |
| `dashboard/lib/overview/overview-filter.ts` | TASK-002 | `OverviewFilter` + `applyOverviewFilter` |
| `dashboard/lib/overview/sync-toggle-persistence.ts` | TASK-003 | Toggle localStorage persistence |
| `dashboard/app/(dashboard)/_components/overview-sync-provider.tsx` | TASK-004 | Shared filter context |
| `dashboard/app/(dashboard)/_components/sync-filter-toggle.tsx` | TASK-005 | PageHeader toggle |
| `dashboard/app/(dashboard)/_components/active-filter-chips.tsx` | TASK-005 | Removable filter chips |
| `dashboard/app/(dashboard)/_components/overview-surfaces.tsx` | TASK-006 | Single-fetch server wrapper |
| `dashboard/lib/overview/__tests__/overview-filter.test.ts` | TASK-011 | XFILTER-001..005 |
| `dashboard/lib/overview/__tests__/sync-toggle-persistence.test.ts` | TASK-011 | XFILTER-006..007 |
| `dashboard/app/(dashboard)/_components/__tests__/overview-sync.test.tsx` | TASK-012 | XFILTER-008..011, XFILTER-014 |
| `dashboard/e2e/overview-cross-filter.spec.ts` | TASK-013 | XFILTER-012..013 |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `dashboard/.env.example` | TASK-001 | Add `NEXT_PUBLIC_OVERVIEW_CROSS_FILTER` |
| `dashboard/app/(dashboard)/page.tsx` | TASK-007 | Single `OverviewSurfaces`; header toggle |
| `dashboard/components/dashboard/trend-chart.tsx` | TASK-008 | Sync source/consumer wiring |
| `dashboard/app/(dashboard)/_components/recent-decisions-table.tsx` | TASK-009 | Sync source/consumer wiring |
| `dashboard/components/dashboard/section-cards.tsx` | TASK-010 | Partial KPI recompute; D3 nav unchanged |

### To Delete
| File | Task | Reason |
|------|------|--------|
| `overview-kpi-section.tsx` | TASK-014 | Replaced by `OverviewSurfaces` |
| `overview-trend-section.tsx` | TASK-014 | Replaced by `OverviewSurfaces` |
| `overview-recent-decisions-section.tsx` | TASK-014 | Replaced by `OverviewSurfaces` |

---

## Requirements Traceability

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| Render a single page-level **"Sync filters"** `Switch` in the Overview `PageHeader` actions slot, with an adjacent `Tooltip` explaining the behavior. Default **OFF**. | spec § Requirements / Functional | TASK-001, TASK-005, TASK-007 |
| Persist **only the toggle state** (not the selection) to `localStorage` under a versioned key (see Concrete Values), read SSR-safely with a mounted guard that avoids hydration mismatch (`dashboard-design-requirements.md` §2.1; vercel-react-best-practices §6.5). | spec § Requirements / Functional | TASK-003, TASK-004, TASK-005 |
| Define one shared, in-memory filter object `OverviewFilter = { decisionType: DecisionType \| null; learner: string \| null; range: TrendRangeDays }` lifted into a client `OverviewSyncProvider` context that wraps the three surfaces. | spec § Requirements / Functional | TASK-002, TASK-004 |
| When sync is **ON**, the chart and table **consume** the shared filter and render the filtered subset of the single fetched `OverviewData`. KPI cards **always navigate** on click (D3, `dashboard-design-requirements.md` §8) — sync does **not** repurpose card clicks as filters. | spec § Requirements / Functional | TASK-004, TASK-008, TASK-009, TASK-010 |
| When sync is **ON**, the chart and table act as filter **sources** (MUST): chart range selector → sets `range`; chart decision-type control → sets `decisionType`; table learner-filter input → sets `learner`; table type facet (if present) → sets `decisionType`. Chart legend/series click brushing is **optional post-D2** (not required for v1). | spec § Requirements / Functional | TASK-008, TASK-009 |
| When sync is **ON**, only **Needs attention** and **Pending decisions** KPI counts **recompute** from the shared filter (decision-derived). **Rejected signals today** (ingestion) and **Improving learners** (state sample) stay **program-wide** org totals; when decision filters are active they MAY show a subtle program-wide indicator so educators do not mistake filtered decision counts for ingestion/state totals. | spec § Requirements / Functional | TASK-002, TASK-010 |
| When sync is **OFF**, surfaces ignore the shared filter and render their full datasets; KPI cards navigate to their drill routes per directive D3 (`dashboard-design-requirements.md` §8). Each surface's own local controls (table search, chart range) continue to work locally without propagating. | spec § Requirements / Functional | TASK-004, TASK-008, TASK-009, TASK-010 |
| Render the active cross-filter as a **removable `Badge` chip row** above the surfaces (e.g. "Filtered: Reinforce ✕", "Learner: stu-40123 ✕") whenever any filter field is non-null and sync is ON. A "Clear all" affordance resets the filter. Color is never the only indicator of an active filter (`dashboard-design-requirements.md` §2 #9 / §12). | spec § Requirements / Functional | TASK-005 |
| Derive every filtered view with `useMemo` keyed on the shared filter; feed the filter through `useDeferredValue` and wrap non-urgent recomputes in `startTransition` so brushing/typing stays responsive (vercel-react-best-practices §5.9/§5.13/§5.14). | spec § Requirements / Functional | TASK-004, TASK-008, TASK-009 |
| Pass only the fields the client filters on across the RSC→client boundary; do not serialize unused `OverviewData` fields into the client island (vercel-react-best-practices §3.6). | spec § Requirements / Functional | TASK-006 |
| Toggling sync OFF→ON or ON→OFF must **not** trigger a network refetch; both modes operate on the same server-fetched dataset. | spec § Requirements / Functional | TASK-004, TASK-013 |
| Behavior is gated by an optional public feature flag (see Concrete Values); when disabled the toggle is not rendered and the page is exactly today's behavior. | spec § Requirements / Functional | TASK-001, TASK-005, TASK-012 |
| Given sync is OFF (default), when the Overview loads, then the KPI/chart/table render identical content and counts to the pre-feature behavior, the KPI cards navigate on click (D3), and no active-filter chip row is shown. | spec § Requirements / Acceptance Criteria | TASK-012, TASK-013 |
| Given sync is ON, when a user selects `Reinforce` via the chart decision-type control (or optional series click), then the table filters to `reinforce` rows, Needs attention and Pending decisions recompute over `reinforce`-scoped data, Rejected signals today and Improving learners remain program-wide, and a removable "Filtered: Reinforce" chip appears — with no network request. | spec § Requirements / Acceptance Criteria | TASK-008, TASK-009, TASK-010, TASK-012, TASK-013 |
| Given sync is ON, when a user clicks any KPI card, then navigation to its drill route occurs (D3) — the click does **not** apply or change the shared filter. | spec § Requirements / Acceptance Criteria | TASK-010, TASK-012 |
| Given sync is ON and a `learner` filter is active, when the user clicks the chip's ✕ (or "Clear all"), then `learner` is cleared, the chart and table revert to the unfiltered (but still range-scoped) view, decision-derived KPIs revert to the unfiltered subset, and the chip disappears. | spec § Requirements / Acceptance Criteria | TASK-005, TASK-009, TASK-012 |
| Given sync is ON, when the user types in the table's learner filter, then the input stays responsive (no dropped keystrokes) while the chart and decision-derived KPIs (Needs attention, Pending decisions) update via a deferred transition; ingestion/state KPIs stay program-wide. | spec § Requirements / Acceptance Criteria | TASK-004, TASK-009, TASK-010, TASK-012 |
| Given the user toggles sync ON, reloads the page, then the toggle is still ON (persisted) but the selection is empty (ephemeral) and surfaces show the unfiltered view. | spec § Requirements / Acceptance Criteria | TASK-003, TASK-004, TASK-011, TASK-012 |
| Given the user toggles sync OFF while a filter was active, then all surfaces immediately return to their full datasets and the chip row is removed (the stale selection is discarded, not hidden). | spec § Requirements / Acceptance Criteria | TASK-004, TASK-012 |
| Given the feature flag is disabled, when the Overview loads, then no "Sync filters" toggle renders and the page matches today's behavior. | spec § Requirements / Acceptance Criteria | TASK-001, TASK-005, TASK-012 |

---

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| XFILTER-001 | unit | Filter identity when filter empty | TASK-011 |
| XFILTER-002 | unit | Decision-type narrows + partial KPI recompute | TASK-011 |
| XFILTER-003 | unit | Learner filter narrows chart/table + partial KPIs | TASK-011 |
| XFILTER-004 | unit | Range filter scopes time window | TASK-011 |
| XFILTER-005 | unit | Combined filters AND semantics | TASK-011 |
| XFILTER-006 | unit | Toggle persistence read/write | TASK-011 |
| XFILTER-007 | unit | localStorage failure degrades to OFF | TASK-011 |
| XFILTER-008 | component | Toggle OFF = today's behavior | TASK-012 |
| XFILTER-009 | component | Toggle ON + decisionType = chips + partial KPIs | TASK-012 |
| XFILTER-014 | component | KPI cards navigate when sync ON | TASK-012 |
| XFILTER-010 | component | Chip ✕ / Clear all resets filter | TASK-012 |
| XFILTER-011 | component | SSR-safe persisted ON reconciliation | TASK-012 |
| XFILTER-012 | e2e | Linked brushing, no network on interaction | TASK-013 |
| XFILTER-013 | e2e | Toggle flip does not refetch | TASK-013 |

---

## Deviations from Spec

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| — | — | — | No remaining deviations after post-implementation literal sync. |

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hydration mismatch on persisted toggle ON | Medium | Mounted-guard pattern (SSR OFF, reconcile after mount) per spec Production Correctness |
| Triple-section removal breaks streaming perceived load | Low | Single fetch is spec-mandated; keep skeleton in `OverviewSurfaces` fallback if needed |
| TrendChart dual local/sync state divergence | Medium | Explicit branch: sync OFF uses local state only; sync ON reads/writes provider filter |
| Existing KPI e2e tests fail if cards stop being links | High | TASK-010 preserves `href` on all StatCards; run KPI-004 suite in TASK-013 CI |
| Bundle size from new Switch component | Low | shadcn switch is small; no new state library |

---

## Verification Checklist

- [ ] All tasks completed
- [ ] All tests pass (`cd dashboard && npm test -- --run`)
- [ ] E2e passes (`cd dashboard && npx playwright test overview-cross-filter overview-kpi-drilldown`)
- [ ] Linter passes (`cd dashboard && npm run lint`)
- [ ] Type check passes (`cd dashboard && npm run typecheck`)
- [ ] Manual pass: all 8 acceptance criteria blocks in spec
- [ ] `/review --spec docs/specs/overview-cross-filter-sync.md` clean

---

## Implementation Order

```
TASK-001 → TASK-002 → TASK-003 → TASK-004 → TASK-005
                              ↘
TASK-002 + TASK-003 → TASK-011 (unit tests, can parallel after helpers land)

TASK-004 + TASK-005 → TASK-006 → TASK-007
                              ↘
                    TASK-008 + TASK-009 + TASK-010 (parallel wiring)
                              ↘
                    TASK-012 (component tests)
                              ↘
                    TASK-013 (e2e)
                              ↘
                    TASK-014 (cleanup)
```

---

## Next Steps

After post-implementation sync:
- Keep this plan as the implementation trace for D2; rerun targeted unit/component/e2e checks before merge if code changes again.
