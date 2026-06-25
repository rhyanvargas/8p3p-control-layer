# Overview Cross-Filter Sync

## Overview

The Overview page (`/`) renders three linked data surfaces — KPI cards (`SectionCards`), the trend chart (`TrendChart`), and the recent-decisions table (`RecentDecisionsTable`) — from one server-fetched `OverviewData` payload via `OverviewSurfaces` and `OverviewSyncProvider`. This spec adds an **opt-in, 2-way linked-filter ("cross-filter") mode**: a single page-level **"Sync filters" toggle** (default **OFF**) that, when ON, wires the chart and table as filter **sources** so a selection on either drives the other and recomputes **decision-derived** KPI counts — selecting a decision type in the chart filters the table and narrows Needs attention / Pending decisions; typing a learner in the table scopes the chart and those same KPIs; changing the chart range scopes the table and chart. KPI card clicks **always navigate** (D3); they never act as filter sources.

This is the implementation contract for directive **D2** in `docs/specs/dashboard-design-requirements.md` (§2.1 "Cross-filter sync" doctrine, §8 Overview). It is a **dashboard-only, presentational** feature: it adds no control-layer endpoint, schema, or wire-contract change, reuses the already-fetched `OverviewData`, and never refetches per interaction. With the toggle OFF, the Overview behaves byte-for-byte as today (the calm 5-second "is anything wrong?" glance is preserved).

### Why opt-in, default OFF

The Overview's primary job is a glance-first status read (`dashboard-design-requirements.md` §8). Cross-filtering is an **exploratory power-feature** that adds interaction cost and can turn decision-derived KPI counts into a filtered (non-total) view; making it default-on would dilute the glance and risk a user mistaking a filtered count for the true total. It is therefore opt-in and the toggle state is persisted, while the active selection itself is ephemeral (per session).

---

## Requirements

### Functional

- [x] Render a single page-level **"Sync filters"** `Switch` in the Overview `PageHeader` actions slot, with an adjacent `Tooltip` explaining the behavior. Default **OFF**.
- [x] Persist **only the toggle state** (not the selection) to `localStorage` under a versioned key (see Concrete Values), read SSR-safely with a mounted guard that avoids hydration mismatch (`dashboard-design-requirements.md` §2.1; vercel-react-best-practices §6.5).
- [x] Define one shared, in-memory filter object `OverviewFilter = { decisionType: DecisionType | null; learner: string | null; range: TrendRangeDays }` lifted into a client `OverviewSyncProvider` context that wraps the three surfaces.
- [x] When sync is **ON**, the chart and table **consume** the shared filter and render the filtered subset of the single fetched `OverviewData`. KPI cards **always navigate** on click (D3, `dashboard-design-requirements.md` §8) — sync does **not** repurpose card clicks as filters.
- [x] When sync is **ON**, the chart and table act as filter **sources** (MUST): chart range selector → sets `range`; chart decision-type control → sets `decisionType`; table learner-filter input → sets `learner`; table type facet (if present) → sets `decisionType`. Chart legend/series click brushing is **optional post-D2** (not required for v1).
- [x] When sync is **ON**, only **Needs attention** and **Pending decisions** KPI counts **recompute** from the shared filter (decision-derived). **Rejected signals today** (ingestion) and **Improving learners** (state sample) stay **program-wide** org totals; when decision filters are active they MAY show a subtle program-wide indicator so educators do not mistake filtered decision counts for ingestion/state totals.
- [x] When sync is **OFF**, surfaces ignore the shared filter and render their full datasets; KPI cards navigate to their drill routes per directive D3 (`dashboard-design-requirements.md` §8). Each surface's own local controls (table search, chart range) continue to work locally without propagating.
- [x] Render the active cross-filter as a **removable `Badge` chip row** above the surfaces (e.g. "Filtered: Reinforce ✕", "Learner: stu-40123 ✕") whenever any filter field is non-null and sync is ON. A "Clear all" affordance resets the filter. Color is never the only indicator of an active filter (`dashboard-design-requirements.md` §2 #9 / §12).
- [x] Derive every filtered view with `useMemo` keyed on the shared filter; feed the filter through `useDeferredValue` and wrap non-urgent recomputes in `startTransition` so brushing/typing stays responsive (vercel-react-best-practices §5.9/§5.13/§5.14).
- [x] Pass only the fields the client filters on across the RSC→client boundary; do not serialize unused `OverviewData` fields into the client island (vercel-react-best-practices §3.6).
- [x] Toggling sync OFF→ON or ON→OFF must **not** trigger a network refetch; both modes operate on the same server-fetched dataset.
- [x] Behavior is gated by an optional public feature flag (see Concrete Values); when disabled the toggle is not rendered and the page is exactly today's behavior.

### Acceptance Criteria

- Given sync is OFF (default), when the Overview loads, then the KPI/chart/table render identical content and counts to the pre-feature behavior, the KPI cards navigate on click (D3), and no active-filter chip row is shown.
- Given sync is ON, when a user selects `Reinforce` via the chart decision-type control (or optional series click), then the table filters to `reinforce` rows, Needs attention and Pending decisions recompute over `reinforce`-scoped data, Rejected signals today and Improving learners remain program-wide, and a removable "Filtered: Reinforce" chip appears — with no network request.
- Given sync is ON, when a user clicks any KPI card, then navigation to its drill route occurs (D3) — the click does **not** apply or change the shared filter.
- Given sync is ON and a `learner` filter is active, when the user clicks the chip's ✕ (or "Clear all"), then `learner` is cleared, the chart and table revert to the unfiltered (but still range-scoped) view, decision-derived KPIs revert to the unfiltered subset, and the chip disappears.
- Given sync is ON, when the user types in the table's learner filter, then the input stays responsive (no dropped keystrokes) while the chart and decision-derived KPIs (Needs attention, Pending decisions) update via a deferred transition; ingestion/state KPIs stay program-wide.
- Given the user toggles sync ON, reloads the page, then the toggle is still ON (persisted) but the selection is empty (ephemeral) and surfaces show the unfiltered view.
- Given the user toggles sync OFF while a filter was active, then all surfaces immediately return to their full datasets and the chip row is removed (the stale selection is discarded, not hidden).
- Given the feature flag is disabled, when the Overview loads, then no "Sync filters" toggle renders and the page matches today's behavior.

---

## Constraints

- **Presentational only.** No control-layer endpoint, schema, decision logic, or wire-contract change. Reuses `getOverviewData` `(dashboard/lib/api/fetch-overview-data.server.ts:68)`.
- **No refetch on interaction or toggle.** All filtering is client-side derivation over the single server-fetched `OverviewData`. The dataset is already bounded (recent decisions + today's ingestion + a sampled learner-state set), so client-side filtering is cheap.
- **Aggregate honesty.** When a filter is active, decision-derived KPI counts (Needs attention, Pending decisions) are explicitly a filtered view (reflected by the visible chip row). Ingestion/state KPIs (Rejected signals today, Improving learners) remain program-wide totals and must not be silently narrowed by decision filters.
- **Glance-first default.** Default OFF; opt-in; toggle persisted, selection ephemeral.
- **A11y.** Toggle is a labeled `Switch` with tooltip; chips are keyboard-removable; active filter is conveyed by text+icon, not color alone; respects `prefers-reduced-motion` (`dashboard-design-requirements.md` §12).
- **Drill-down is unchanged.** Cross-filter narrows what each tier shows; it never bypasses the L0→L1→L2 ladder (row click still opens the decision L1 Sheet).

## Out of Scope

| Item | Rationale | Revisit |
|------|-----------|---------|
| URL-synced / shareable filter state (`nuqs`) | Selection is ephemeral and exploratory; URL sync adds a dep + RSC complexity for little pilot value | If shareable filtered Overview links are requested |
| Cross-filter on pages other than Overview (`/decisions`, `/learners`) | Those pages already have first-class filter bars; this directive targets the Overview's linked surfaces | Phase C if linked-brushing proves valuable |
| Persisting the active **selection** across reloads | Glance-first default; a stale persisted filter risks misread totals | If users ask for sticky exploration state |
| Brushing a **time range** by dragging on the chart area | Range selector (7/30/90d) covers the pilot need; drag-brush is a larger interaction | Post-pilot |
| Server-side / paginated datasets too large to filter client-side | Overview dataset is bounded by design (§8) | If Overview ever shows unbounded data |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|-----------------|--------|
| `OverviewData` (`kpis`, `decisions`, `recentDecisions`, `learnerStates`, `ingestionToday`) + `getOverviewData(orgId)` | `dashboard/lib/api/fetch-overview-data.server.ts` | Defined ✓ |
| `computeOverviewKpis()`, `computeRecentDecisions()` (reused for filtered recompute) | `dashboard/lib/overview-metrics.ts` | Defined ✓ |
| `OverviewFilter` decision-type values (`DecisionType`) + `TrendRangeDays` (`7 | 30 | 90`) | `dashboard/lib/api/types.ts`, `dashboard/lib/overview-metrics.ts`, `dashboard/components/dashboard/trend-chart.tsx` | Defined ✓ (reuse existing types) |
| Cross-filter doctrine (toggle default OFF, shared filter, visible chips, perf, KPI navigate-always / partial recompute) | `docs/specs/dashboard-design-requirements.md` §2.1, §8 | Defined ✓ |
| D1 educator-first recent table + D3 decluttered/clickable KPIs | `.cursor/plans/dashboard-uiux-improvements.plan.md` (D1/D3 tasks) | Coordinated — D2 wraps the same surfaces; sequence after D1/D3 land |
| `fetchedAt` on `OverviewData` (for freshness chip placement near the toggle) | `dashboard/lib/api/fetch-overview-data.server.ts`, `dashboard/app/(dashboard)/_components/overview-surfaces.tsx` | Defined ✓ |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| `OverviewSyncProvider` + `useOverviewFilter()` client context | Future linked-brushing on other dashboard pages (out of scope here) |

### External libraries / SDK (per `prefer-existing-solutions` rule)

| Need | Chosen solution | Why (vs. custom / alternative) |
|------|-----------------|--------------------------------|
| Toggle control | shadcn **`switch`** primitive (`dashboard/components/ui/switch.tsx`) | Compose, don't reinvent (shadcn rule); a11y-correct toggle |
| Active-filter chips | existing shadcn **`Badge`** + `lucide-react` `X` icon | Already installed; reuse |
| Shared filter state | **React context + `useState`** (no new dep) | Selection is ephemeral, single-page, small; a store (`zustand`/`jotai`) or URL-state lib (`nuqs`) is unjustified for one page's session-local filter. Revisit if scope grows. |
| Responsiveness under typing/brushing | React built-ins `useDeferredValue` / `useTransition` / `useMemo` | Native; no dep (vercel-react-best-practices §5.13/§5.14) |
| Toggle persistence | `localStorage` (versioned key, try/catch) | Native; per vercel-react-best-practices §4.4 (version + minimize) |

> **MCP / existing-solutions check:** Dashboard/Next.js-only feature on already-fetched data; no AWS or external service integration, so no AWS-docs/IaC MCP query is required (consistent with `dashboard-uiux-improvements.plan.md`). The relevant "official pattern" sources are React docs (`useDeferredValue`/`useTransition`) and shadcn (compose `switch`/`badge`), cited inline.

---

## Error Codes

This feature registers no routes and performs no server I/O, so it produces **no caller-facing or log-only error codes**.

### Existing (reuse)

| Code | Source |
|------|--------|
| — (none) | N/A — client-only presentational feature |

### New (add during implementation)

| Code | Surface | Description |
|------|---------|-------------|
| — (none) | — | No new error codes. A `localStorage` read/write failure (incognito/quota) is swallowed and the toggle defaults to OFF (no thrown error). |

---

## Contract Tests

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

> **Test strategy note:** XFILTER-001..007 exercise pure derivation/persistence helpers (`applyOverviewFilter`, the persistence hook) directly with no React tree. XFILTER-008..011 mount the Overview surfaces with a mocked `OverviewData` and assert provider-driven behavior. XFILTER-012/013 run Playwright against a seeded Overview and assert the **no-refetch** contract via network interception. Place unit tests beside the helpers (`dashboard/lib/overview/__tests__/`), component tests beside the provider, and e2e in `dashboard/e2e/`.

---

## Concrete Values Checklist

### Wire formats / signed payloads

- N/A — no network payloads, no signing. All state is in-memory client objects.

### Client state shapes (normative)

- `OverviewFilter` (in-memory, ephemeral):
  ```ts
  type OverviewFilter = {
    decisionType: DecisionType | null; // reuse dashboard/lib/api/types.ts DecisionType
    learner: string | null;            // learner_reference (pseudonymous; already shown in tables)
    range: TrendRangeDays;              // 7 | 30 | 90; default 30
  };
  ```
- Empty/default filter: `{ decisionType: null, learner: null, range: 30 }`.
- Filter composition semantics: fields combine with **AND**; `null` means "do not narrow on this field".

### HTTP behavior

| Transition | Status | Content-Type | Required headers |
|------------|--------|--------------|------------------|
| (none) | — | — | — |

> No routes; no HTTP transitions. The feature performs zero requests during interaction or toggle.

### Cookies (if applicable)

- N/A — no cookies. Toggle persistence uses `localStorage` only.

### localStorage (persistence)

| Key | Value | Notes |
|-----|-------|-------|
| `overview:sync-filters:v1` | `"on"` \| `"off"` | Toggle state only; **selection is never persisted**. Read/write wrapped in try/catch; absence or error ⇒ `"off"`. Versioned (`:v1`) per vercel-react-best-practices §4.4. |

### Env vars

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `NEXT_PUBLIC_OVERVIEW_CROSS_FILTER` | no | `true` | bool | Public feature flag. When `false`, the "Sync filters" toggle is not rendered and the Overview matches pre-feature behavior. Public (`NEXT_PUBLIC_`) because the gate is evaluated client-side; it gates only this presentational UI and exposes nothing sensitive. |

### Constants / limits

- Toggle default: **OFF**.
- Default `range`: `30` (matches existing `TrendChart` default `useState<TrendRangeDays>(30)`).
- No row/size caps introduced — the Overview dataset is already bounded by `getOverviewData` (recent decisions, today's ingestion, `IMPROVING_STATE_SAMPLE = 50` learner states) `(fetch-overview-data.server.ts:22)`.

### Routes registered

| Method | Path | Auth exempt? |
|--------|------|--------------|
| — | none | — |

---

## Production Correctness Notes

- **Proxy / `trustProxy`**: N/A — no server request path; feature reads no client IP/protocol.
- **CORS**: N/A — no network requests originate from this feature.
- **CSP / security headers**: N/A — no new HTTP surface or inline-eval; if persisted toggle state is reconciled during SSR, prefer a mounted-guard (`useEffect`) approach instead of an inline `<script>` to avoid a CSP `script-src` exception. Mounted-guard is the default choice.
- **Cookie prefix vs Path scoping**: N/A — no cookies.
- **Content-type parsing**: N/A — no request bodies parsed.
- **Body size limits**: N/A — no inbound endpoint.
- **Rate-limit storage scope**: N/A — no server state; filter state is per-tab client memory; toggle is per-browser `localStorage`.
- **Error-code surface**: N/A — no codes; `localStorage` failures degrade silently to OFF and never surface to the user.
- **SSR / hydration**: The persisted toggle must not cause a hydration mismatch — render OFF on the server, reconcile to the stored value after mount (mounted-guard), accepting a one-frame correction rather than an inline script (no CSP impact) (vercel-react-best-practices §6.5).
- **Bundle / RSC boundary**: KPI/chart/table become client islands fed by server-fetched props; pass only the fields needed for filtering across the boundary (vercel-react-best-practices §3.6), and keep heavy libs (Recharts) within the already-client `TrendChart`.
- **PII**: Filter values (`learner_reference`) are pseudonymous references already displayed in the Overview tables; cross-filter introduces no new PII exposure and sends nothing off-device.

---

## Architecture (informative)

Chosen composition (replaces the three independent `Suspense` sections on `page.tsx` with one server fetch + a client provider, preserving a single deduped fetch):

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

- **OFF path:** provider supplies the full dataset; surfaces ignore the filter; KPI cards render as nav links (D3). Visually/behaviorally identical to today.
- **ON path:** provider supplies `filter` + `setFilter`; chart and table derive their views via `applyOverviewFilter(data, deferredFilter)` memoized on the filter; chart/table sources call `setFilter` inside `startTransition`. Needs attention + Pending decisions recompute from the filter; Rejected signals + Improving learners stay program-wide. KPI cards remain nav links (D3) regardless of sync state.

**Alternative considered (dual render path):** keep the existing 3 RSC `Suspense` sections for OFF and mount client islands only when ON. Rejected for the pilot: it doubles the surface implementations and complicates the no-refetch-on-toggle guarantee. The single-provider approach keeps one code path and one fetch.

---

## Notes

- **Coordinate with D1/D3 sequencing:** D2 wraps the same KPI/chart/table that D1 (educator-first table) and D3 (decluttered, clickable KPIs) modify. Implement D1/D3 first (they are smaller and independently valuable), then D2 wraps the finished surfaces. D3 navigation on KPI cards is unchanged by D2 — sync only adds partial KPI recompute (Needs attention, Pending decisions) and chart/table linked filtering.
- **Design authority:** KPI behavior follows `dashboard-design-requirements.md` §2.1 (2026-06-23) and §8: chart + table are filter sources; KPI cards always navigate; only decision-derived KPIs recompute when sync is ON.
- **`pilot host` posture:** purely client-side; works identically on the SQLite pilot host and AWS — no infra dependency.
- **Future:** `OverviewSyncProvider`/`useOverviewFilter()` are written generically enough to extend linked brushing to other pages later (out of scope here).

---

*Spec created: 2026-06-23 | Updated: 2026-06-25 (functional requirements marked complete; post-implementation literals reconciled with `OverviewFilter` / mounted-guard implementation) | Phase: dashboard UX (data-viz directive D2) | Design source: `docs/specs/dashboard-design-requirements.md` §2.1/§8 | Coordinates with: `.cursor/plans/overview-cross-filter-sync.plan.md`.*
