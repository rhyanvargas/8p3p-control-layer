---
name: Overview Educator Activity Layout (D4)
overview: "Reorganize Overview into period bar, grouped KPI sections, and a unified Classroom activity panel with stacked/cumulative chart, in-panel controls, and co-located recent table. Presentational only; reuses getOverviewData and D2 sync model."
todos:
  - id: TASK-001
    content: Add stacked/cumulative chart builders, period label, insight, and CSV export helpers
    status: pending
  - id: TASK-002
    content: Change DEFAULT_OVERVIEW_FILTER.range to 7 and update filter tests
    status: pending
  - id: TASK-003
    content: Create PeriodBar component with 7d/30d/90d pills and date-range label
    status: pending
  - id: TASK-004
    content: Split SectionCards into Needs your action and Program health sections
    status: pending
  - id: TASK-005
    content: Create ActivityPanel replacing TrendChart with stacked chart and table
    status: pending
  - id: TASK-006
    content: Wire OverviewExplorer layout and sync-OFF page-level period scoping
    status: pending
  - id: TASK-007
    content: Relabel sync toggle and move ActiveFilterChips into ActivityPanel header
    status: pending
  - id: TASK-008
    content: Unit tests OVACT-001 through OVACT-006
    status: pending
  - id: TASK-009
    content: Component tests OVACT-007 through OVACT-011
    status: pending
  - id: TASK-010
    content: E2E tests OVACT-012 and OVACT-013 plus XFILTER fixture updates
    status: pending
  - id: TASK-011
    content: Post-ship doc sync for dashboard-design-requirements and specs README
    status: pending
isProject: false
---

# Overview Educator Activity Layout (D4)

**Spec**: `docs/specs/overview-educator-activity-layout.md`

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase. Update this section only if the spec itself changes.

### From spec § Concrete Values Checklist — Period bar

| Pill label | `TrendRangeDays` value | Default active |
|------------|------------------------|----------------|
| `7d` | `7` | **yes** |
| `30d` | `30` | no |
| `90d` | `90` | no |

- Date-range label format: `{startShort} – {endShort}` where each date uses `toLocaleDateString(undefined, { month: 'short', day: 'numeric' })` and separator is **en dash** (`U+2013`), not hyphen.
- `DEFAULT_OVERVIEW_FILTER.range`: **`7`** (was `30`).

### From spec § Concrete Values Checklist — KPI section labels

| Section heading | Cards (order) |
|-----------------|---------------|
| `Needs your action` | Needs attention, Pending decisions |
| `Program health` | Rejected signals today, Improving learners |

- Section headings: `<h2 className="text-sm font-medium text-muted-foreground">` (visually subtle, not page title).

### From spec § Concrete Values Checklist — Activity panel copy

| Element | Literal |
|---------|---------|
| Panel title | `Classroom activity` |
| Subtitle template | `Decisions and mastery across {startLabel} – {endLabel}.` |
| Recent subsection title | `Recent activity` |
| Export button label | `Export CSV` |
| Sync toggle label | `Link chart and table` |

### From spec § Concrete Values Checklist — Group by (`<Select>`)

| Value | Label | Series |
|-------|-------|--------|
| `decision_type` | `Decision type` | `intervene`, `pause`, `reinforce`, `advance` (default) |
| `needs_review_vs_ok` | `Review status` | `needs_review` (= intervene+pause), `on_track` (= reinforce+advance) |

- Default: `decision_type`.

### From spec § Concrete Values Checklist — Metric (`<Select>`)

| Value | Label | Chart behavior |
|-------|-------|----------------|
| `daily` | `Daily count` | Stacked daily counts per group-by series |
| `cumulative_needs_review` | `Cumulative needs review` | **Default.** Running sum of (`intervene` + `pause`) only; when Group by = `decision_type`, stack cumulative intervene and cumulative pause as two series; when Group by = `needs_review_vs_ok`, single cumulative `needs_review` series |
| `avg_mastery` | `Avg mastery %` | Single series from `buildMasteryTrendSeries()`; Y-axis 0–100; ignores group-by |

- Default: `cumulative_needs_review`.

### From spec § Concrete Values Checklist — Chart series colors (fill + stroke)

| Series key | CSS variable |
|------------|--------------|
| `intervene` | `var(--status-intervene)` |
| `pause` | `var(--status-pause)` |
| `reinforce` | `var(--status-reinforce)` |
| `advance` | `var(--status-advance)` |
| `needs_review` | `var(--status-intervene)` |
| `on_track` | `var(--status-reinforce)` |
| `avg_mastery` (single) | `var(--brand-accent-500)` |

### From spec § Concrete Values Checklist — Today reference line

- Render `ReferenceLine` at X-axis tick where `date === localDateKeyFromDate(new Date())` when that date falls within the selected range.
- Stroke: `hsl(var(--muted-foreground))`, `strokeDasharray="4 4"`, `label={{ value: 'Today', position: 'top' }}`.

### From spec § Concrete Values Checklist — Insight line (one sentence above chart)

- Template when Metric = `cumulative_needs_review`: **`{latestCumulative} learners need review ({deltaSign}{deltaAbs} vs start of period).`**
  - `latestCumulative` = last day's cumulative intervene+pause total.
  - `deltaSign` = `+` if delta > 0, `-` if delta < 0, empty if 0.
  - `deltaAbs` = absolute difference between last day and first day cumulative totals.
- Template when Metric = `daily`: **`{periodTotal} decisions in this period ({ busiestDayLabel } busiest).`**
- Template when Metric = `avg_mastery`: reuse refined `summarizeTrendSeries()` output but replace "prior half" phrasing with **`vs start of period`**.

### From spec § Concrete Values Checklist — CSV export

| Property | Value |
|----------|-------|
| Filename | `overview-activity-{startDate}-{endDate}.csv` where dates are `YYYY-MM-DD` |
| MIME | `text/csv;charset=utf-8` |
| Daily + `decision_type` headers | `date,intervene,pause,reinforce,advance` |
| Cumulative + `decision_type` headers | `date,cumulative_intervene,cumulative_pause` (needs-review metric excludes reinforce/advance) |
| `needs_review_vs_ok` daily headers | `date,needs_review,on_track` |
| `avg_mastery` headers | `date,avg_mastery_pct` |
| Row date format | `YYYY-MM-DD` (ISO local date key) |

### From spec § Concrete Values Checklist — Constants / limits

- Chart height: **`260px`** (preserve current `TrendChart` height).
- Max CSV rows: **`90`** (bounded by max range days).
- Recharts animation: **`isAnimationActive={false}`** (always).

### From spec § Concrete Values Checklist — Env vars

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `NEXT_PUBLIC_OVERVIEW_CROSS_FILTER` | no | enabled (any value except `'false'`) | string | Unchanged from D2; gates **Link chart and table** toggle |

### From spec § Dependencies — External libraries

| Need | Chosen solution | Why |
|------|-----------------|-----|
| Stacked area chart | **Recharts** `AreaChart` + multiple `Area` + `stackId` (already `recharts@^3.8.0`) | Installed; shadcn `ChartContainer` already wraps Recharts |
| Chart legend / Today line | Recharts `Legend`, `ReferenceLine` | No new chart library |
| CSV export | Browser **`Blob` + `<a download>`** | No server; dataset is small; avoids adding `papaparse` for write-only export |
| Period pills | shadcn **`ToggleGroup`** or styled **`Button`** variants | Compose existing UI primitives |
| Panel layout | shadcn **`Card`** | Matches existing `TrendChart` / `StatCard` |

### From spec § Constraints — A11y

- Period pills are a `role="group"` with `aria-pressed` on active pill; chart legend items are keyboard-focusable when they act as filter sources; insight line uses `aria-live="polite"`.

### From spec § Concrete Values Checklist — HTTP behavior

| Transition | Status | Content-Type | Required headers |
|------------|--------|--------------|------------------|
| Overview page load | 200 | `text/html` | — |
| CSV export | N/A (client Blob download) | — | — |

---

## Prerequisites

Before starting implementation:

- [ ] D2 cross-filter sync shipped (`OverviewSyncProvider`, `applyOverviewFilter`, XFILTER tests green)
- [ ] D3 clickable KPI cards shipped (`section-cards.tsx` navigation links)
- [ ] D1 educator-first recent table shipped (`recent-decisions-table.tsx`)

---

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Add stacked/cumulative chart builders, period label, insight, and CSV export helpers
- **Files**: `dashboard/lib/overview-activity.ts` (create), `dashboard/lib/overview-metrics.ts` (modify — re-export shared date helpers if needed)
- **Action**: Create
- **Details**:
  - Add types: `ActivityGroupBy = 'decision_type' | 'needs_review_vs_ok'`, `ActivityMetric = 'daily' | 'cumulative_needs_review' | 'avg_mastery'`.
  - Implement `buildStackedDecisionTrendSeries(decisions, rangeDays, groupBy, now?)` returning one point per day with keys per Group by table (`intervene`, `pause`, `reinforce`, `advance` OR `needs_review`, `on_track`). Use `toLocalDateKey` / `localDateKeyFromDate` for bucketing.
  - Implement `buildCumulativeSeries(dailyStackedPoints, metric, groupBy)` — for `cumulative_needs_review`: running sum of intervene+pause only; when Group by = `decision_type`, emit `cumulative_intervene` and `cumulative_pause` as two series; when Group by = `needs_review_vs_ok`, single cumulative `needs_review` series.
  - Implement `formatPeriodRangeLabel(rangeDays, now?)` → `{startShort} – {endShort}` with en dash `U+2013` and `toLocaleDateString(undefined, { month: 'short', day: 'numeric' })`.
  - Implement `formatActivityInsight(points, metric, groupBy)` using the three insight templates from Spec Literals verbatim.
  - Implement `buildActivityCsvRows(points, metric, groupBy)` and `downloadActivityCsv(...)` using `Blob` + `<a download>` with MIME `text/csv;charset=utf-8` and headers/rows per CSV export table.
  - Preserve existing `buildMasteryTrendSeries()` for `avg_mastery` metric path.
- **Depends on**: none
- **Verification**: Pure functions importable; no React dependencies; `buildCumulativeSeries` output is monotonic per series (OVACT-003)

### TASK-002: Change DEFAULT_OVERVIEW_FILTER.range to 7 and update filter tests
- **Files**: `dashboard/lib/overview/overview-filter.ts`, `dashboard/lib/overview/__tests__/overview-filter.test.ts`, `dashboard/app/(dashboard)/_components/__tests__/overview-sync.test.tsx`
- **Action**: Modify
- **Details**:
  - Set `DEFAULT_OVERVIEW_FILTER.range`: **`7`** (was `30`) per Spec Literals.
  - Update any tests asserting default range `30` (including active-filter chip range assertions).
- **Depends on**: none
- **Verification**: `DEFAULT_OVERVIEW_FILTER.range === 7`; filter unit tests pass

### TASK-003: Create PeriodBar component with 7d/30d/90d pills and date-range label
- **Files**: `dashboard/app/(dashboard)/_components/period-bar.tsx` (create)
- **Action**: Create
- **Details**:
  - Render pill labels `7d`, `30d`, `90d` mapping to `TrendRangeDays` values `7`, `30`, `90`; default active **`7d`**.
  - Use styled **`Button`** variants (no ToggleGroup in repo) inside `role="group"` with `aria-pressed` on active pill.
  - Show read-only date-range label from `formatPeriodRangeLabel(rangeDays)`.
  - Props: `rangeDays`, `onRangeChange(days: TrendRangeDays)`.
- **Depends on**: TASK-001
- **Verification**: Component renders three pills; active pill has `aria-pressed="true"`; label uses en dash separator

### TASK-004: Split SectionCards into Needs your action and Program health sections
- **Files**: `dashboard/components/dashboard/section-cards.tsx`
- **Action**: Modify
- **Details**:
  - Replace single 4-column grid with two labeled sections per KPI section labels table:
    - **`Needs your action`**: Needs attention, Pending decisions (2-up → 1-up responsive grid)
    - **`Program health`**: Rejected signals today, Improving learners (2-up → 1-up)
  - Section headings: `<h2 className="text-sm font-medium text-muted-foreground">`.
  - Preserve D3: every KPI card remains a navigation link; clicks never set filters; sync partial KPI recompute unchanged.
- **Depends on**: none
- **Verification**: Headings visible; card order matches spec; drill `href` values unchanged

### TASK-005: Create ActivityPanel replacing TrendChart with stacked chart and table
- **Files**: `dashboard/components/dashboard/activity-panel.tsx` (create), `dashboard/components/dashboard/trend-chart.tsx` (delete after migration)
- **Action**: Create / Delete
- **Details**:
  - Card titled **`Classroom activity`** with subtitle **`Decisions and mastery across {startLabel} – {endLabel}.`**
  - In-panel controls (top-right): **Group by** and **Metric** `<Select>`s with options/defaults from Spec Literals (`decision_type` + `cumulative_needs_review` defaults).
  - Remove Decisions / Mastery `Tabs`; mastery only via **Metric → `avg_mastery`**.
  - Remove range `<Select>` (period bar is sole time control).
  - One-line insight above chart via `formatActivityInsight` with `aria-live="polite"`.
  - Recharts stacked `AreaChart` (`stackId` shared) with series colors from Spec Literals CSS variables; height **`260px`**; **`isAnimationActive={false}`** on every `Area`.
  - **`Today`** `ReferenceLine` per Spec Literals when today falls in range.
  - When sync ON + Group by **`decision_type`**: legend items keyboard-focusable; click toggles `OverviewFilter.decisionType` (set on first click, clear on second click of same type).
  - When **Metric → `avg_mastery`**: single series from `buildMasteryTrendSeries()`; Y-axis label **`Avg mastery %`**; ignore `decisionType` for chart building (table/KPI sync unchanged).
  - **Recent activity** subsection with existing `RecentDecisionsTable` below chart inside same card.
  - **Export CSV** button (bottom-right) calling `downloadActivityCsv` for currently displayed series.
  - Chart data: sync ON uses `derived.filteredDecisions`; sync OFF uses full `decisions` scoped by page-level `rangeDays` prop.
- **Depends on**: TASK-001, TASK-002
- **Verification**: Panel renders stacked chart + table; no range select; export button present; legend filter works when sync ON

### TASK-006: Wire OverviewExplorer layout and sync-OFF page-level period scoping
- **Files**: `dashboard/app/(dashboard)/_components/overview-explorer.tsx`
- **Action**: Modify
- **Details**:
  - Layout order: `PageHeader` → **`PeriodBar`** (above KPIs) → `SectionCards` → **`ActivityPanel`** (chart + recent table).
  - Remove standalone `<ActiveFilterChips />` between header and KPIs (chips move in TASK-007).
  - Remove standalone `<TrendChart />` and `<RecentDecisionsTable />`.
  - Page-level period state (`useState<TrendRangeDays>(7)`):
    - When sync **ON**, period pill changes call `setFilter(prev => ({ ...prev, range: days }))`.
    - When sync **OFF**, period pill updates local state; pass `rangeDays` to `ActivityPanel`; filter `recentDecisions` client-side by range for table display (KPIs remain program-wide).
  - No network refetch on any interaction.
- **Depends on**: TASK-003, TASK-004, TASK-005
- **Verification**: Period bar appears under header above KPIs; default `7d` active; chart and table share period when sync OFF

### TASK-007: Relabel sync toggle and move ActiveFilterChips into ActivityPanel header
- **Files**: `dashboard/app/(dashboard)/_components/sync-filter-toggle.tsx`, `dashboard/app/(dashboard)/_components/active-filter-chips.tsx`, `dashboard/components/dashboard/activity-panel.tsx`, `dashboard/e2e/fixtures.ts`, `dashboard/.env.example`
- **Action**: Modify
- **Details**:
  - Change toggle label from **`Sync filters`** to **`Link chart and table`**; tooltip body intent unchanged.
  - Default remains OFF (do not change).
  - When sync **ON**, render `ActiveFilterChips` **inside** Activity panel header (not between KPIs and chart). Chip behavior unchanged (`Filtered: {Type}`, learner chip, range chip, Clear all).
  - Update e2e/component selectors from `/Sync filters/i` to `/Link chart and table/i`.
- **Depends on**: TASK-005, TASK-006
- **Verification**: Toggle accessible name updated; chips appear in panel header when sync ON and filters active

### TASK-008: Unit tests OVACT-001 through OVACT-006
- **Files**: `dashboard/lib/__tests__/overview-activity.test.ts` (create)
- **Action**: Create
- **Details**:
  - OVACT-001: `buildStackedDecisionTrendSeries` daily counts by type
  - OVACT-002: cumulative needs-review metric excludes reinforce/advance
  - OVACT-003: `buildCumulativeSeries` monotonicity
  - OVACT-004: `formatPeriodRangeLabel` with `now = 2026-06-26`, range 7 → `Jun 20 – Jun 26`
  - OVACT-005: `formatActivityInsight` educator copy (no "prior half" jargon for cumulative)
  - OVACT-006: CSV export rows/headers match Concrete Values for stacked daily export
- **Depends on**: TASK-001
- **Verification**: `npm test -- dashboard/lib/__tests__/overview-activity.test.ts` passes

### TASK-009: Component tests OVACT-007 through OVACT-011
- **Files**: `dashboard/app/(dashboard)/_components/__tests__/activity-panel.test.tsx` (create), `dashboard/app/(dashboard)/_components/__tests__/overview-sync.test.tsx` (modify)
- **Action**: Create / Modify
- **Details**:
  - OVACT-007: Period bar default `7d` pressed; chart scoped to 7 days
  - OVACT-008: KPI sections **Needs your action** and **Program health** visible
  - OVACT-009: **Recent activity** table inside same card as chart
  - OVACT-010: sync ON, click Intervene legend → chip **Filtered: Intervene** in panel header; table filtered
  - OVACT-011: Metric `avg_mastery` → one area, Y-axis **Avg mastery %**
  - Update existing overview-sync tests for toggle label and default range 7
- **Depends on**: TASK-006, TASK-007
- **Verification**: Component test file passes; XFILTER-related component tests still green

### TASK-010: E2E tests OVACT-012 and OVACT-013 plus XFILTER fixture updates
- **Files**: `dashboard/e2e/overview-activity-layout.spec.ts` (create), `dashboard/e2e/overview-cross-filter.spec.ts` (modify), `dashboard/e2e/fixtures.ts` (modify)
- **Action**: Create / Modify
- **Details**:
  - OVACT-012: sync OFF, click `30d`, track `/v1` → zero new API requests; chart updates
  - OVACT-013: click **Export CSV** → download name matches `overview-activity-*.csv`
  - Replace `selectChartDecisionSeries` fixture (removed `<Select>`) with legend-click helper for decision type filter
  - Update XFILTER-012/013 to use **Link chart and table** toggle name and legend-based filter
  - Existing XFILTER-* tests MUST remain green
- **Depends on**: TASK-007, TASK-009
- **Verification**: `npm run test:e2e -- overview-activity-layout overview-cross-filter` passes

### TASK-011: Post-ship doc sync for dashboard-design-requirements and specs README
- **Files**: `docs/specs/dashboard-design-requirements.md`, `docs/specs/README.md`
- **Action**: Modify
- **Details**:
  - Update §8 Overview bullets: period bar, KPI grouping, Activity panel, stacked chart defaults (amends D2 TrendChart description per spec Constraints).
  - Mark `overview-educator-activity-layout.md` shipped in specs README.
- **Depends on**: TASK-010
- **Verification**: Doc bullets reference ActivityPanel and period bar; README status updated

---

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `dashboard/lib/overview-activity.ts` | TASK-001 | Stacked/cumulative builders, insight, CSV export |
| `dashboard/app/(dashboard)/_components/period-bar.tsx` | TASK-003 | Page-level period pills + date label |
| `dashboard/components/dashboard/activity-panel.tsx` | TASK-005 | Unified Classroom activity card |
| `dashboard/lib/__tests__/overview-activity.test.ts` | TASK-008 | OVACT-001..006 unit tests |
| `dashboard/app/(dashboard)/_components/__tests__/activity-panel.test.tsx` | TASK-009 | OVACT-007..011 component tests |
| `dashboard/e2e/overview-activity-layout.spec.ts` | TASK-010 | OVACT-012..013 e2e tests |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `dashboard/lib/overview/overview-filter.ts` | TASK-002 | `DEFAULT_OVERVIEW_FILTER.range = 7` |
| `dashboard/components/dashboard/section-cards.tsx` | TASK-004 | Two labeled KPI sections |
| `dashboard/app/(dashboard)/_components/overview-explorer.tsx` | TASK-006 | New layout wiring |
| `dashboard/app/(dashboard)/_components/sync-filter-toggle.tsx` | TASK-007 | Label → Link chart and table |
| `dashboard/app/(dashboard)/_components/active-filter-chips.tsx` | TASK-007 | Optional slot/className for panel header placement |
| `dashboard/e2e/fixtures.ts` | TASK-010 | Toggle name, legend click helper |
| `dashboard/e2e/overview-cross-filter.spec.ts` | TASK-010 | Adapt filter source to legend |
| `dashboard/lib/overview/__tests__/overview-filter.test.ts` | TASK-002 | Default range assertions |
| `dashboard/app/(dashboard)/_components/__tests__/overview-sync.test.tsx` | TASK-009 | Toggle label, layout assertions |
| `dashboard/.env.example` | TASK-007 | Comment references new toggle label |
| `docs/specs/README.md` | TASK-011 | Mark spec shipped |
| `docs/specs/dashboard-design-requirements.md` | TASK-011 | Activity panel normative reference |

### To Delete
| File | Task | Reason |
|------|------|--------|
| `dashboard/components/dashboard/trend-chart.tsx` | TASK-005 | Replaced by `activity-panel.tsx` |

---

## Requirements Traceability

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| Add page-level period bar with 7d/30d/90d pills and date-range label | spec § Requirements | TASK-003, TASK-006 |
| Default period 7; update DEFAULT_OVERVIEW_FILTER.range | spec § Requirements | TASK-002, TASK-003 |
| Period bar is sole time-range control; remove range Select from TrendChart | spec § Requirements | TASK-005, TASK-006 |
| Sync ON: period sets OverviewFilter.range; Sync OFF: page-level period scopes chart and table | spec § Requirements | TASK-006 |
| Split KPI cards into Needs your action and Program health sections | spec § Requirements | TASK-004 |
| Preserve D3 KPI navigation; clicks never set filters | spec § Requirements | TASK-004 |
| ActivityPanel with subtitle, controls, insight, stacked chart, Today line, Recent activity, Export CSV | spec § Requirements | TASK-005 |
| Group by options drive chart composition; default decision_type | spec § Requirements | TASK-001, TASK-005 |
| Metric options drive Y-axis; default cumulative_needs_review | spec § Requirements | TASK-001, TASK-005 |
| Remove Decisions/Mastery Tabs; mastery via Metric avg_mastery | spec § Requirements | TASK-005 |
| Chart series colors reuse semantic CSS tokens | spec § Requirements | TASK-005 |
| Relabel sync toggle to Link chart and table; default OFF | spec § Requirements | TASK-007 |
| Active-filter chips inside Activity panel header when sync ON | spec § Requirements | TASK-007 |
| Sync ON + Group by decision_type: legend click sets decisionType filter | spec § Requirements | TASK-005 |
| Metric avg_mastery ignores decisionType for chart building | spec § Requirements | TASK-005 |
| Given loaded Overview, period bar above KPIs with 7d active and 7-day label | spec § Acceptance Criteria | TASK-003, TASK-006, TASK-009 |
| Given sync OFF, 30d scopes chart/table not KPIs, no refetch | spec § Acceptance Criteria | TASK-006, TASK-010 |
| Given sync ON, Reinforce via legend: chip in panel, table filtered, KPIs recompute, ingestion KPIs program-wide, no refetch | spec § Acceptance Criteria | TASK-005, TASK-007, TASK-009, TASK-010 |
| Given default chart settings, tooltip shows cumulative intervene+pause with per-type breakdown | spec § Acceptance Criteria | TASK-001, TASK-005, TASK-008 |
| Given Metric avg_mastery, Y-axis Avg mastery %, single series, buildMasteryTrendSeries values | spec § Acceptance Criteria | TASK-005, TASK-009 |
| Given Export CSV, filename pattern, UTF-8, rows match visible data | spec § Acceptance Criteria | TASK-001, TASK-005, TASK-010 |
| Given KPI click, navigation unchanged (D3) | spec § Acceptance Criteria | TASK-004 |
| Given prefers-reduced-motion, isAnimationActive={false} | spec § Acceptance Criteria | TASK-005 |
| Amends dashboard-design-requirements §8 on ship | spec § Constraints | TASK-011 |
| Post-ship mark spec in docs/specs/README.md | spec § Notes | TASK-011 |

---

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| OVACT-001 | unit | `buildStackedDecisionTrendSeries` daily counts by type | TASK-008 |
| OVACT-002 | unit | Cumulative needs-review metric excludes reinforce/advance | TASK-008 |
| OVACT-003 | unit | `buildCumulativeSeries` monotonicity | TASK-008 |
| OVACT-004 | unit | Period label formatting Jun 20 – Jun 26 | TASK-008 |
| OVACT-005 | unit | `formatActivityInsight` educator copy | TASK-008 |
| OVACT-006 | unit | CSV export rows match chart points | TASK-008 |
| OVACT-007 | component | Period bar default 7d | TASK-009 |
| OVACT-008 | component | KPI sections labeled | TASK-009 |
| OVACT-009 | component | Activity panel houses table | TASK-009 |
| OVACT-010 | component | Sync ON legend sets filter | TASK-009 |
| OVACT-011 | component | Metric avg_mastery single series | TASK-009 |
| OVACT-012 | e2e | Period change without refetch | TASK-010 |
| OVACT-013 | e2e | Export CSV downloads | TASK-010 |

---

## Deviations from Spec

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| External libraries — Period pills | shadcn ToggleGroup or styled Button variants | Styled Button variants only (no ToggleGroup in repo) | Implementation detail — spec silent on which when both listed |
| Implementation touchpoints — overview-metrics.ts | Extend overview-metrics.ts | New `overview-activity.ts` sibling for builders; reuses date helpers from overview-metrics.ts | Implementation detail — spec allows sibling file per Contract Tests note |
| ActiveFilterChips component | Move render site to panel header | Keep component; pass into ActivityPanel header via composition | Implementation detail — spec silent on refactor vs relocate |

None beyond the rows above — plan is literal-compatible with spec for all wire formats, copy, defaults, and CSV headers.

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| XFILTER e2e breaks when decision-type Select removed | High | TASK-010 updates fixtures to legend click before merging; run full e2e suite |
| Sync OFF table not range-scoped today | Medium | TASK-006 explicitly filters recent decisions by page-level period client-side |
| Stacked Recharts tooltip complexity | Medium | Use custom tooltip formatter showing per-series values; test with OVACT-004 default settings |
| DEFAULT range 7 changes active-filter chip baseline | Low | TASK-002 updates tests; 7d no longer shows range chip (expected) |
| Legend-as-filter only when Group by decision_type | Medium | Disable legend filter interaction for needs_review_vs_ok and avg_mastery per spec scope |

---

## Verification Checklist

- [ ] All tasks completed
- [ ] All tests pass (`npm test`)
- [ ] E2e passes (`npm run test:e2e -- overview-activity-layout overview-cross-filter`)
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Matches spec requirements
- [ ] Existing XFILTER-* tests green after legend migration

---

## Implementation Order

```
TASK-001 ──┬── TASK-008
TASK-002 ──┤
           ├── TASK-003 ── TASK-006 ── TASK-009
           └── TASK-005 ──┬── TASK-007 ── TASK-010 ── TASK-011
TASK-004 ────────────────┘
```

---

## Next Steps

After generating the plan:
- Review task ordering and the Deviations table
- Run `/implement-spec .cursor/plans/overview-educator-activity-layout.plan.md`
