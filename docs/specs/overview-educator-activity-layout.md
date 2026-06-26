# Overview Educator Activity Layout (D4)

## Overview

The Overview page (`/`) answers *"Is anything wrong right now?"* for educators. Today it renders four KPI cards, a single-series trend chart, and a recent-decisions table as a flat vertical stack, with the time range buried inside the chart card and decision volume shown one type at a time. This spec reorganizes the page into a **Cursor-style scan → summarize → explore hierarchy**: a page-level period bar, semantically grouped KPI rows, and a unified **Classroom activity** panel with a stacked, educator-meaningful chart (composition + cumulative workload), in-panel controls, and co-located recent activity.

This is directive **D4**, building on shipped D1 (educator-first table), D2 ([`overview-cross-filter-sync.md`](overview-cross-filter-sync.md)), and D3 (decluttered clickable KPIs). It is **dashboard-only and presentational**: no control-layer endpoint, schema, or wire-contract change; it reuses `getOverviewData` and client-side derivation from [`overview-metrics.ts`](../../dashboard/lib/overview-metrics.ts).

**Problem:** Educators cannot see workload *mix* (intervene vs pause vs reinforce) or whether review backlog is *accumulating* over the week without switching chart modes and mentally combining single-series daily counts.

**User:** Pilot educator / admin scanning the Overview each morning.

**Expected outcomes:** (1) time scope is obvious before KPIs; (2) action KPIs vs health KPIs are visually separated; (3) the chart defaults to cumulative **needs-review** workload stacked by decision type; (4) chart + table feel like one exploratory surface when sync is on.

---

## Requirements

### Functional

- [ ] Add a **page-level period bar** directly under `PageHeader` (above KPI sections) with preset pills **`7d`**, **`30d`**, **`90d`** and a read-only date-range label (local calendar, e.g. `Jun 20 – Jun 26`).
- [ ] **Default period** is **`7`** days (changes Overview default from chart-local `30` to page-level `7`; update `DEFAULT_OVERVIEW_FILTER.range` accordingly).
- [ ] The period bar is the **sole** time-range control on Overview — remove the range `<Select>` from `TrendChart`.
- [ ] When cross-filter sync is **ON**, period pill changes set `OverviewFilter.range` (same as today's chart range behavior). When sync is **OFF**, period still scopes the chart and recent-decisions table locally via shared page-level period state (no decision-type/learner propagation).
- [ ] Split KPI cards into two labeled sections:
  - **Needs your action:** `Needs attention`, `Pending decisions` (2-up → 1-up responsive grid).
  - **Program health:** `Rejected signals today`, `Improving learners` (2-up → 1-up).
- [ ] Preserve D3 behavior: every KPI card remains a navigation link with hover/focus affordance; clicks never set filters ([`dashboard-design-requirements.md`](dashboard-design-requirements.md) §8, [`overview-cross-filter-sync.md`](overview-cross-filter-sync.md)).
- [ ] Replace the standalone `TrendChart` + adjacent summary layout with one **`ActivityPanel`** card titled **Classroom activity** containing:
  - Subtitle tied to selected period: *"Decisions and mastery across {startLabel} – {endLabel}."*
  - In-panel controls (top-right): **Group by** and **Metric** `<Select>`s (see Concrete Values).
  - One-line **insight** above the chart (educator language; replaces the right-rail prose summary).
  - Stacked area chart + legend + **Today** vertical reference line on the last day of the range.
  - **Recent activity** subsection: existing `RecentDecisionsTable` below the chart inside the same card (same filters when sync ON).
  - **Export CSV** button (bottom-right of panel) exporting the **currently displayed** chart series.
- [ ] **Group by** options drive chart series composition (see Concrete Values). Default: **`decision_type`** (four stacked series).
- [ ] **Metric** options drive Y-axis semantics (see Concrete Values). Default: **`cumulative_needs_review`** (cumulative count of `intervene` + `pause` only, stacked by decision type within that subset OR as a single cumulative line — see Concrete Values for normative behavior).
- [ ] Remove the **Decisions / Mastery** `Tabs` from the chart; mastery is exposed only via **Metric → `avg_mastery`**.
- [ ] Chart series colors MUST reuse existing semantic tokens: `--status-intervene`, `--status-pause`, `--status-reinforce`, `--status-advance` ([`dashboard/app/globals.css`](../../dashboard/app/globals.css)).
- [ ] Relabel sync toggle copy from **Sync filters** to **Link chart and table**; tooltip body unchanged in intent. **Default remains OFF** ([`overview-cross-filter-sync.md`](overview-cross-filter-sync.md) — do not change default without separate product decision).
- [ ] When sync is **ON**, render active-filter chips **inside** the Activity panel header (not between KPIs and chart). Chip behavior unchanged ([`active-filter-chips.tsx`](../../dashboard/app/(dashboard)/_components/active-filter-chips.tsx)).
- [ ] When sync is **ON** and **Group by → `decision_type`**, clicking a legend item (or optional series row) sets `OverviewFilter.decisionType` to that type (or clears on second click). This replaces the old single-series `<Select>` as the sync filter source.
- [ ] When **Metric → `avg_mastery`**, cross-filter sync ignores `decisionType` for chart building (same doctrine as today's mastery tab: chart-local metric; table/KPI sync unchanged).

### Acceptance Criteria

- Given a loaded Overview, when the educator views the page, then the period bar appears above KPIs showing active pill **`7d`** and a local date-range label spanning exactly 7 calendar days ending today.
- Given sync is OFF, when the educator selects **`30d`**, then KPI cards show program-wide totals (unchanged), the chart and recent table scope to 30 days, and no network refetch occurs.
- Given sync is ON, when the educator selects **`Reinforce`** via legend click, then a removable **Filtered: Reinforce** chip appears in the Activity panel header, the table shows only reinforce rows, decision-derived KPIs recompute, and ingestion/state KPIs stay program-wide — with no network refetch.
- Given default chart settings (Group by **`decision_type`**, Metric **`cumulative_needs_review`**), when the educator hovers a day, then the tooltip shows cumulative intervene + pause counts (and per-type breakdown when grouped).
- Given **Metric → `avg_mastery`**, when the chart renders, then Y-axis label reads **`Avg mastery %`**, values match `buildMasteryTrendSeries()` for the selected period, and the chart is a **single** series (not stacked).
- Given the educator clicks **Export CSV**, when download completes, then the file name matches `overview-activity-{startDate}-{endDate}.csv`, encoding is UTF-8, and rows match the visible chart data.
- Given any KPI card, when clicked, then navigation to its drill route occurs and the shared filter is unchanged (D3).
- Given reduced motion (`prefers-reduced-motion: reduce`), when the chart renders, then area animations are disabled (existing Recharts `isAnimationActive={false}` pattern preserved).

---

## Constraints

- **Presentational only.** Reuses `getOverviewData` ([`fetch-overview-data.server.ts`](../../dashboard/lib/api/fetch-overview-data.server.ts)); no new API routes on the control layer.
- **No refetch on interaction.** All filtering, stacking, cumulation, and export are client-side over the bounded Overview payload.
- **Amends D2 chart controls, not D2 state model.** Keep `OverviewFilter`, `OverviewSyncProvider`, and `applyOverviewFilter()`; extend chart builders and relocate controls.
- **Amends design §8 chart description.** On ship, update [`dashboard-design-requirements.md`](dashboard-design-requirements.md) §8 Overview bullet for `TrendChart` to reference this spec (stacked activity chart + Activity panel).
- **Aggregate honesty.** Unchanged from D2: filtered decision-derived KPIs remain explicitly filtered when chips are visible; ingestion/state KPIs stay program-wide.
- **A11y.** Period pills are a `role="group"` with `aria-pressed` on active pill; chart legend items are keyboard-focusable when they act as filter sources; insight line uses `aria-live="polite"`.
- **Local calendar bucketing.** All date keys use `toLocalDateKey` / `localDateKeyFromDate` ([`overview-metrics.ts`](../../dashboard/lib/overview-metrics.ts)).

## Out of Scope

| Item | Rationale |
|------|-----------|
| Custom calendar date picker (arbitrary start/end) | Pilot needs presets only; matches Cursor quick presets, not full calendar UX |
| Drag-brush time range on chart | Deferred in D2 spec |
| Third KPI card **Reviewed today** as its own tile | `countReviewedToday()` stays secondary line on Pending; avoids KPI sprawl |
| **Group by → mastery trend** (improving/stable/declining learners per day) | Requires new derivation over `learnerStates`; defer post-pilot |
| Server-side aggregation or unbounded datasets | Overview payload remains bounded |
| URL-synced filter/period state (`nuqs`) | Same rationale as D2 |
| Changing cross-filter default to ON | Conflicts with glance-first D2 doctrine unless separately approved |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|-----------------|--------|
| Overview data fetch + `OverviewData` shape | [`fetch-overview-data.server.ts`](../../dashboard/lib/api/fetch-overview-data.server.ts) | Defined ✓ |
| `OverviewFilter`, `applyOverviewFilter()`, `DEFAULT_OVERVIEW_FILTER` | [`overview-filter.ts`](../../dashboard/lib/overview/overview-filter.ts), [`overview-cross-filter-sync.md`](overview-cross-filter-sync.md) | Defined ✓ |
| `OverviewSyncProvider`, sync toggle, active chips | [`overview-sync-provider.tsx`](../../dashboard/app/(dashboard)/_components/overview-sync-provider.tsx), D2 spec | Defined ✓ |
| `buildDecisionTrendSeries()`, `buildMasteryTrendSeries()`, `TrendRangeDays` | [`overview-metrics.ts`](../../dashboard/lib/overview-metrics.ts) | Defined ✓ — **extend** with stacked + cumulative builders |
| KPI card behavior (D3) + four KPI definitions | [`section-cards.tsx`](../../dashboard/components/dashboard/section-cards.tsx), [`dashboard-design-requirements.md`](dashboard-design-requirements.md) §8 | Defined ✓ |
| Decision semantic colors | [`dashboard/app/globals.css`](../../dashboard/app/globals.css) | Defined ✓ |
| Cross-filter feature flag | `NEXT_PUBLIC_OVERVIEW_CROSS_FILTER` ([`feature-flag.ts`](../../dashboard/lib/overview/feature-flag.ts)) | Defined ✓ |
| Educator-first recent table (D1) | [`recent-decisions-table.tsx`](../../dashboard/app/(dashboard)/_components/recent-decisions-table.tsx) | Defined ✓ |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| Stacked/cumulative trend builders | Future Reports `/reports` charts (optional reuse) |
| `ActivityPanel` composition pattern | Dashboard design requirements §8 (normative reference after ship) |

### External libraries (per `prefer-existing-solutions`)

| Need | Chosen solution | Why |
|------|-----------------|--------------------------------|
| Stacked area chart | **Recharts** `AreaChart` + multiple `Area` + `stackId` (already `recharts@^3.8.0`) | Installed; shadcn `ChartContainer` already wraps Recharts |
| Chart legend / Today line | Recharts `Legend`, `ReferenceLine` | No new chart library |
| CSV export | Browser **`Blob` + `<a download>`** | No server; dataset is small; avoids adding `papaparse` for write-only export |
| Period pills | shadcn **`ToggleGroup`** or styled **`Button`** variants | Compose existing UI primitives |
| Panel layout | shadcn **`Card`** | Matches existing `TrendChart` / `StatCard` |

> **MCP check:** Dashboard-only client feature on fetched JSON; no AWS/external integration. N/A for AWS-docs MCP.

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| — (none) | N/A — client-only presentational feature |

### New (add during implementation)

| Code | Description |
|------|-------------|
| — (none) | CSV export failure (e.g. blocked download) is silent/no-op with optional console warning in dev only; no user-facing error code |

---

## Contract Tests

| Test ID | Type | Description | Input | Expected |
|---------|------|-------------|-------|----------|
| OVACT-001 | unit | `buildStackedDecisionTrendSeries` daily counts by type | 3 decisions (1 intervene, 1 pause, 1 reinforce) on same local day, range 7d | That day's point: `{ intervene:1, pause:1, reinforce:1, advance:0 }` |
| OVACT-002 | unit | Cumulative needs-review metric | 2 intervene on day1, 1 pause on day2 | Day2 cumulative intervene+pause = 3; reinforce/advance excluded from metric |
| OVACT-003 | unit | `buildCumulativeSeries` monotonicity | Any daily stacked series | Each series value at day N ≥ day N-1 |
| OVACT-004 | unit | Period label formatting | range 7, `now = 2026-06-26` | Label matches `Jun 20 – Jun 26` (locale-aware month/day, en dash separator) |
| OVACT-005 | unit | `formatActivityInsight` educator copy | cumulative needs-review rising | Insight mentions backlog/workload, not "prior half" jargon |
| OVACT-006 | unit | CSV export rows match chart points | stacked daily export | Header row + one row per day; columns match Concrete Values |
| OVACT-007 | component | Period bar default 7d | render Overview | `7d` pill pressed; chart scoped to 7 days |
| OVACT-008 | component | KPI sections labeled | render Overview | Headings **Needs your action** and **Program health** visible; 2+2 card layout |
| OVACT-009 | component | Activity panel houses table | render Overview | **Recent activity** table inside same card as chart |
| OVACT-010 | component | Sync ON legend sets filter | sync ON, click Intervene legend | Chip **Filtered: Intervene** in panel header; table filtered |
| OVACT-011 | component | Metric avg_mastery single series | select avg_mastery | One area; Y-axis **Avg mastery %**; no decision-type stack |
| OVACT-012 | e2e | Period change without refetch | sync OFF, click 30d, track `/v1` | Zero new API requests; chart updates |
| OVACT-013 | e2e | Export CSV downloads | click Export CSV | Download suggested name `overview-activity-*.csv` |

> **Test strategy note:** OVACT-001..006 are pure functions in `dashboard/lib/overview-metrics.ts` (or sibling `overview-activity.ts`). OVACT-007..011 are component tests beside `ActivityPanel` / updated `overview-explorer`. OVACT-012..013 extend `dashboard/e2e/` (update fixtures replacing `selectChartDecisionSeries` where the old select is removed). Existing XFILTER-* tests MUST remain green after adapting chart filter source from `<Select>` to legend.

---

## Concrete Values Checklist

### Period bar

| Pill label | `TrendRangeDays` value | Default active |
|------------|------------------------|----------------|
| `7d` | `7` | **yes** |
| `30d` | `30` | no |
| `90d` | `90` | no |

- Date-range label format: `{startShort} – {endShort}` where each date uses `toLocaleDateString(undefined, { month: 'short', day: 'numeric' })` and separator is **en dash** (`U+2013`), not hyphen.
- `DEFAULT_OVERVIEW_FILTER.range`: **`7`** (was `30`).

### KPI section labels

| Section heading | Cards (order) |
|-----------------|---------------|
| `Needs your action` | Needs attention, Pending decisions |
| `Program health` | Rejected signals today, Improving learners |

- Section headings: `<h2 className="text-sm font-medium text-muted-foreground">` (visually subtle, not page title).

### Activity panel copy

| Element | Literal |
|---------|---------|
| Panel title | `Classroom activity` |
| Subtitle template | `Decisions and mastery across {startLabel} – {endLabel}.` |
| Recent subsection title | `Recent activity` |
| Export button label | `Export CSV` |
| Sync toggle label | `Link chart and table` |

### Group by (`<Select>`)

| Value | Label | Series |
|-------|-------|--------|
| `decision_type` | `Decision type` | `intervene`, `pause`, `reinforce`, `advance` (default) |
| `needs_review_vs_ok` | `Review status` | `needs_review` (= intervene+pause), `on_track` (= reinforce+advance) |

- Default: `decision_type`.

### Metric (`<Select>`)

| Value | Label | Chart behavior |
|-------|-------|----------------|
| `daily` | `Daily count` | Stacked daily counts per group-by series |
| `cumulative_needs_review` | `Cumulative needs review` | **Default.** Running sum of (`intervene` + `pause`) only; when Group by = `decision_type`, stack cumulative intervene and cumulative pause as two series; when Group by = `needs_review_vs_ok`, single cumulative `needs_review` series |
| `avg_mastery` | `Avg mastery %` | Single series from `buildMasteryTrendSeries()`; Y-axis 0–100; ignores group-by |

- Default: `cumulative_needs_review`.

### Chart series colors (fill + stroke)

| Series key | CSS variable |
|------------|--------------|
| `intervene` | `var(--status-intervene)` |
| `pause` | `var(--status-pause)` |
| `reinforce` | `var(--status-reinforce)` |
| `advance` | `var(--status-advance)` |
| `needs_review` | `var(--status-intervene)` |
| `on_track` | `var(--status-reinforce)` |
| `avg_mastery` (single) | `var(--brand-accent-500)` |

### Today reference line

- Render `ReferenceLine` at X-axis tick where `date === localDateKeyFromDate(new Date())` when that date falls within the selected range.
- Stroke: `hsl(var(--muted-foreground))`, `strokeDasharray="4 4"`, `label={{ value: 'Today', position: 'top' }}`.

### Insight line (one sentence above chart)

- Template when Metric = `cumulative_needs_review`: **`{latestCumulative} learners need review ({deltaSign}{deltaAbs} vs start of period).`**
  - `latestCumulative` = last day's cumulative intervene+pause total.
  - `deltaSign` = `+` if delta > 0, `-` if delta < 0, empty if 0.
  - `deltaAbs` = absolute difference between last day and first day cumulative totals.
- Template when Metric = `daily`: **`{periodTotal} decisions in this period ({ busiestDayLabel } busiest).`**
- Template when Metric = `avg_mastery`: reuse refined `summarizeTrendSeries()` output but replace "prior half" phrasing with **`vs start of period`**.

### CSV export

| Property | Value |
|----------|-------|
| Filename | `overview-activity-{startDate}-{endDate}.csv` where dates are `YYYY-MM-DD` |
| MIME | `text/csv;charset=utf-8` |
| Daily + `decision_type` headers | `date,intervene,pause,reinforce,advance` |
| Cumulative + `decision_type` headers | `date,cumulative_intervene,cumulative_pause` (needs-review metric excludes reinforce/advance) |
| `needs_review_vs_ok` daily headers | `date,needs_review,on_track` |
| `avg_mastery` headers | `date,avg_mastery_pct` |
| Row date format | `YYYY-MM-DD` (ISO local date key) |

### Wire formats / signed payloads

- N/A — no signed payloads.

### HTTP behavior

| Transition | Status | Content-Type | Required headers |
|------------|--------|--------------|------------------|
| Overview page load | 200 | `text/html` | — |
| CSV export | N/A (client Blob download) | — | — |

### Cookies

- N/A — uses existing dashboard auth gate only.

### Env vars

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `NEXT_PUBLIC_OVERVIEW_CROSS_FILTER` | no | enabled (any value except `'false'`) | string | Unchanged from D2; gates **Link chart and table** toggle |

### Constants / limits

- Chart height: **`260px`** (preserve current `TrendChart` height).
- Max CSV rows: **`90`** (bounded by max range days).
- Recharts animation: **`isAnimationActive={false}`** (always).

### Routes registered

| Method | Path | Auth exempt? |
|--------|------|--------------|
| GET | `/` (Overview) | no (dashboard passphrase gate) |

No new routes.

---

## Production Correctness Notes

- **Proxy / `trustProxy`**: N/A — Next.js dashboard; no new server handlers.
- **CORS**: N/A — same-origin dashboard UI only.
- **CSP / security headers**: N/A — no new inline scripts; CSV via Blob URL revoked after download.
- **Cookie prefix vs Path scoping**: N/A — no new cookies.
- **Content-type parsing**: N/A — no new form posts.
- **Body size limits**: N/A — export generated client-side from in-memory series.
- **Rate-limit storage scope**: N/A — no server mutations.
- **Error-code surface**: N/A — no user-visible error codes; failed export is a silent no-op.

---

## Notes

- **Design source:** Cursor usage dashboard pattern (period presets → related totals → compositional chart with Group by / Metric / Today / Export), adapted to educator semantics ([`docs/reports/2026-06-22-dashboard-uiux-analysis.md`](../reports/2026-06-22-dashboard-uiux-analysis.md) D4 follow-on).
- **Implementation touchpoints:** `overview-explorer.tsx`, `section-cards.tsx`, `trend-chart.tsx` (refactor → `activity-panel.tsx`), `overview-metrics.ts`, `overview-filter.ts` (`DEFAULT_OVERVIEW_FILTER.range`), `active-filter-chips.tsx` (move render site), `sync-filter-toggle.tsx` (label), e2e fixtures in `dashboard/e2e/fixtures.ts`.
- **Post-ship doc sync:** Update [`dashboard-design-requirements.md`](dashboard-design-requirements.md) §8 Overview bullets for period bar, KPI grouping, Activity panel, stacked chart defaults; mark this spec shipped in [`docs/specs/README.md`](README.md).

---

*Spec created: 2026-06-26 | Phase: dashboard UX directive D4 | Design authority: amends §8 chart description in `dashboard-design-requirements.md` | Coordinates with: `overview-cross-filter-sync.md` (D2 state model preserved)*
