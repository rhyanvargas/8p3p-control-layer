# 8P3P Dashboard — UX/UI Design Analysis

**Date:** 2026-06-22
**Scope:** full (updated 2026-06-22 — data-visualization UX directives)
**Skills referenced:** frontend-design, vercel-react-best-practices, shadcn, BI dashboard layout best-practices (external)
**Ground truth:** docs/specs/dashboard-design-requirements.md + dashboard/ implementation

## Executive Summary
The dashboard is structurally sound and faithful to the design doctrine: the three-tier drill-down (L0 list → L1 Sheet → L2 route) is implemented, badges pair color+label, no API key reaches the browser, and inspection surfaces are read-only. Two systemic gaps cap the customer value: (1) the **primary Overview surface never tells the user how fresh the data is, and the global Refresh control silently does nothing on it** because the KPIs/trend/recent-decisions are React Server Components while `useRefreshQueries` only invalidates TanStack caches; (2) **server-side failures are swallowed** (`catch {}` in the proxy with zero logging and no request-id), so a dev cannot answer *why*/*where* an error happened. The single biggest customer-value win is making "Is anything wrong right now?" trustworthy: add a freshness indicator + a refresh that actually re-renders the Overview, and make the KPI cards icon-first. The top risk is the developer-observability blind spot, which turns any upstream incident into a guessing game.

## Data-Visualization UX Directives (2026-06-22 update)

Three product directives sharpen the Overview's data experience. They are addressed in Lens 5, the Overview Redesign, and the Roadmap below; each is grounded in BI dashboard layout best-practices (data-ink ratio, the 5-second comprehension rule, audience-tiered density) plus the project skills.

| # | Directive | Net change | Status today |
|---|-----------|-----------|--------------|
| D1 | **Main table leads with educator-friendly info** (educator summary first); **drill-down Sheet carries the technical detail** (rule id + rationale excerpt) | Invert the column/sheet split — promote `educator_summary` to L0, demote the raw `matched_rule_id` to L1 | 🔴 Inverted today: L0 shows the technical `rule` mono column and **no** educator summary; the summary only appears in the Sheet `(recent-decisions-table.tsx:45-53, :113-127)` |
| D2 | **Cross-filter sync toggle** — opt-in 2-way linked filtering across KPI cards ↔ chart ↔ table so adjusting a filter on any one updates all three | Add a single overview-level toggle (default OFF) that hydrates the fetched dataset into a shared client filter state | 🔴 Not present; KPIs/chart/table are independent RSC/island renders with no shared selection `(page.tsx; overview-kpi-section.tsx; overview-trend-section.tsx; recent-decisions-table.tsx)` |
| D3 | **Declutter metric panels + uniform clickability** — fewer words per card, one number + context; every KPI card is interactive | Strip prose descriptions to a value + delta + status; give all four cards a consistent drill target | 🟡 Cards carry multi-clause `description` prose and a compound string value; only **1 of 4** (Needs attention) is clickable `(section-cards.tsx:13-34; stat-card.tsx:56-64)` |

## Critical-Path Scorecard

| # | Lens | Status | One-line verdict |
|---|------|--------|------------------|
| 1 | 🔒 Per-tenant view-only access | 🟡 | Read-only ✓ and no client key ✓, but tenant identity is a deployment-level env pin + one shared passphrase; the org switcher is a non-functional stub. |
| 2 | 📤 Data file upload (JSON/Excel) | 🔴 | No upload surface exists anywhere; the lens is unmet — and the design spec lists mutations as out-of-scope, so this needs an explicit product decision. |
| 3 | 🔗 Critical-path health (upload→dashboard) | 🟡 | Drill-down chains work end-to-end, but the Overview cannot be refreshed by the global control and has no freshness signal. |
| 4 | 🔍 Developer observability (what/why/where) | 🟡 | HTTP status + ingestion rejection reasons are visible, but proxy errors are swallowed with no logging and no request-id — *why/where* is not traceable. |
| 5 | 👁️ End-user clarity & data freshness | 🟡 | Scannable + semantic, but KPI cards are prose-heavy/not icon-first, only 1/4 is clickable, the recent table leads with a technical rule id instead of the educator summary, and there is no "last updated" indicator. |

## Findings by Lens

### 1. 🔒 Per-tenant view-only access — 🟡
- **Current state:** Tenant scope is resolved server-side from `CONTROL_LAYER_ORG_ID` and injected into every upstream call — query string `injectOrgIdIntoSearchParams` and JSON-body `org_id` backfill `(dashboard/app/api/control/[...path]/route.ts:31-35, :57-59, :90)`; the browser never holds the key `(route.ts:96; dashboard/lib/api/client.ts:36-37)`. Access is gated by a single shared passphrase `DASHBOARD_ACCESS_CODE` `(dashboard/lib/auth-gate.ts:6-9, :33-35; dashboard/middleware.ts:35-44)`. Org context is shown in the sidebar footer and ingestion header `(dashboard/components/layout/nav-user.tsx:36-39; dashboard/app/(dashboard)/signals/_components/ingestion-log.tsx:113-118)`. Read-only is honored — the only writes are client-side Approve/Reject (localStorage), per spec.
- **Gap:** "Per-tenant" is really *single-tenant-per-deployment + one shared secret* — there is no per-user tenant identity, and the header org switcher renders `all` + the pinned org with **no `onValueChange` handler**, so it cannot actually switch tenants `(dashboard/components/layout/site-header.tsx:68-78)`. Multi-org isolation per authenticated user does not exist.
- **Recommendation:** Either (a) hide the org switcher entirely while single-org-pinned (it is dead UI today), or (b) wire it to drive `org_id` end-to-end and gate it behind real per-user identity (Cognito, already the migration target). Treat the proxy as a public endpoint and assert tenant authorization server-side, not just via the env pin — per vercel-react-best-practices §3.1 (Authenticate Server Actions/Routes), and per dashboard-design-requirements.md §2 #6 / §5.4.

### 2. 📤 Data file upload — 🔴
- **Current state:** No upload surface exists. A repo-wide search for `upload|drag|drop|.csv|.xlsx|multipart` returns only false positives (Sheet/Dropdown/Dialog primitives and Reports *export*) `(dashboard/, grep)`. The proxy accepts `POST/PUT/PATCH` `(route.ts:135-137)` but no UI invokes it for ingest; signals arrive upstream and the dashboard only *views* them read-only `(dashboard/app/(dashboard)/signals/_components/ingestion-log.tsx)`.
- **Gap:** The lens (drag-drop, validating/accepted/duplicate/rejected states, inline field-level rejection, Excel/CSV parse) is entirely unimplemented. This conflicts with the design spec, which scopes the dashboard as an inspection/triage surface and lists control-plane mutations as **out of scope** (§15).
- **Recommendation:** Make an explicit product decision before building. If upload is in scope, add a dedicated `/signals/upload` surface using shadcn `Empty` for the dropzone idle state, `Progress`/`Spinner` for validating, and per-row `Alert` + `Field`/`FieldError` (`data-invalid` + `aria-invalid`) for field-level rejection — reusing the existing accepted/duplicate/rejected `IngestionOutcomeChip` vocabulary for parity with the ingestion log — per shadcn (Forms & Inputs validation; Empty/Alert/Progress) and dashboard-design-requirements.md §10 (honest loading/empty/error states). If out of scope, record it in §15 so the lens is intentionally N/A rather than silently missing.

### 3. 🔗 Critical-path health — 🟡
- **Current state:** The end-to-end flow is observable and chained: ingestion → `/v1/ingestion`, decisions → `/v1/receipts`/`/v1/decisions`, state → `/v1/state`, aggregated on Overview via a parallelized server fetch `(dashboard/lib/api/fetch-overview-data.server.ts:68-94, Promise.all at :69)`. Drill-down works (decision row → L1 Sheet → "Open trace" → `/decisions/[id]`) `(dashboard/app/(dashboard)/_components/recent-decisions-table.tsx:81-108)`. Rejected ingestion rows expand inline to show reason code + field path `(ingestion-log.tsx:289-312)`.
- **Gap:** The Overview's global **Refresh is a no-op for the primary surface**: `useRefreshQueries` calls `queryClient.invalidateQueries()` `(dashboard/hooks/use-refresh-queries.ts:10-12)`, but the KPIs/trend/recent-decisions are RSC (`getOverviewData`, not TanStack) `(dashboard/app/(dashboard)/_components/overview-kpi-section.tsx:11-25; dashboard/app/(dashboard)/page.tsx:30-42)` — so nothing re-renders. There is also no freshness signal and no auto-refresh on the page that answers "is anything wrong *right now*."
- **Recommendation:** Make the refresh button also call `router.refresh()` so RSC sections re-fetch, and add a per-section `Suspense`-bounded freshness line — per vercel-react-best-practices §1.6 (Strategic Suspense boundaries) and §3.7 (parallel RSC fetch, already done). Return a `fetchedAt` from `getOverviewData` and render "Updated {relative}" so a stale screen is never mistaken for a healthy one — per dashboard-design-requirements.md §2.1 (textual summary for glanceability) / §8.

### 4. 🔍 Developer observability — 🟡
- **What:** Error type/status is surfaced — `ApiError` carries `status` + `body` `(dashboard/lib/api/errors.ts:1-11)`, and `ErrorState` renders a friendly message plus `HTTP {status}` `(dashboard/components/states/error-state.tsx:31-36)`.
- **Why:** Partial. Ingestion rejection **reason code + field path** are shown `(ingestion-log.tsx:294-308)` and upstream-unavailable maps to a clear message `(errors.ts:13-26)`, but every other failure collapses to "Unable to load data." `(errors.ts:40-61)`, and the proxy `catch {}` discards the real cause with **zero server logging** `(route.ts:61-63, :119-123)`.
- **Where:** Not traceable. The proxy neither generates nor propagates an `x-request-id`, and errors carry no route/layer breadcrumb — a dev cannot correlate a dashboard error with an upstream log line.
- **Recommendation:** In the proxy `catch`, log the upstream URL/method/status server-side (never to the client) and generate+forward an `x-request-id`, surfacing it in `ErrorState` as a copyable "Reference: {id}" so users can quote it without leaking internals — per vercel-react-best-practices §3.10 (`after()` for non-blocking logging) and §3.1 (treat the route as a public endpoint), and dashboard-design-requirements.md §10 (ErrorState contract: status + retry, no key/URL/stack leak).

### 5. 👁️ End-user clarity & freshness — 🟡
- **Current state:** Surfaces are scannable and semantic: badges pair token color + text label (`DecisionBadge`, `UrgencyBadge`, `ProgressBadge`, `IngestionOutcomeChip`) `(dashboard/components/shared/ingestion-outcome-chip.tsx:23-30)`, KPI deltas use directional `TrendingUp`/`TrendingDown` icons + semantic tokens `(dashboard/components/dashboard/stat-card.tsx:30-44)`, and copy is plain-language. Some hooks poll (learner ingestion at 30s) `(dashboard/hooks/use-learner-ingestion.ts:7, :35)`.
- **Gap (icon-first + freshness):** The KPI cards are **not icon-first** — `StatCard` has no leading metric icon, only a title + number `(stat-card.tsx:66-78; section-cards.tsx:13-34)`, and `IngestionOutcomeChip` is color+label with **no icon** `(ingestion-outcome-chip.tsx:23-30)`. There is **no freshness indicator on Overview** and no polling there — so "current" is unverifiable at a glance.
- **Gap (D3 — metric-panel clutter + uneven clickability):** Cards carry multi-clause prose `description`s ("Intervene and pause decisions awaiting review.", "Ingestion outcomes since midnight.") and a compound *string* value ("`N accepted · N rejected`") instead of a single scannable number `(section-cards.tsx:22-34)` — this fails the 5-second comprehension rule and the data-ink ratio (every non-data word competes with the number). Only **1 of 4** cards is interactive (Needs attention → `/attention`); the other three have no drill target `(section-cards.tsx:13-34; stat-card.tsx:56-64)`, so the cards teach inconsistent affordances.
- **Gap (D1 — table shows the wrong tier first):** The Overview recent-decisions L0 table leads with a **technical** `matched_rule_id` rendered in `font-mono` (`rule-reinforce`) `(recent-decisions-table.tsx:45-53)` while the plain-language `educator_summary` ("Needs more practice") is buried in the L1 Sheet `(recent-decisions-table.tsx:113-127)`. This both inverts the educator-first priority and violates §2.1 ("no technical … raw policy paths in default table views").
- **Recommendation (freshness/icons):** Add a leading Lucide icon to each KPI card (icon + semantic color + short label + value + delta), add an icon to `IngestionOutcomeChip` (`CheckCircle2`/`XCircle`/`Copy`), and add a freshness chip ("Updated {relative}", `RefreshCw`/`Clock`) next to the page title — per frontend-design (icon-first restraint, hierarchy) and dashboard-design-requirements.md §2 #9 / §2.1.
- **Recommendation (D3):** Reduce each card to **value + delta/contextual comparison + status icon**, dropping the prose `description` (move any needed nuance to a `Tooltip`); split the compound "Signals today" card into a single number with an icon-chip breakdown; and make **all four** cards clickable to their drill target (Needs attention→`/attention`, Pending→`/decisions?status=pending`, Signals→`/signals`, Improving→`/learners?trend=improving`) with a consistent hover/focus affordance — per BI best-practices (data-ink ratio; one number per card; ≤4–6 contextual KPI cards) and frontend-design (restraint, single focal action) / §2.1.
- **Recommendation (D1):** Promote `educator_summary` to a default L0 column (`Time · Type · Learner · Summary`) and move the technical `matched_rule_id` into the L1 Sheet alongside the rationale excerpt — so the table is educator-readable at a glance and the Sheet carries the audit/technical detail — per BI best-practices (audience-tiered density; lead with the decision-driving signal) and dashboard-design-requirements.md §2.1 (educator vs inspection density; no technical columns at L0).

## Overview Page Redesign (icon-first, customer-value ranked)

Answers "Is anything wrong right now?" (§8). ≤4 KPIs, one chart, one recent table (§2.1).

| Rank | Metric | Icon (Lucide) | Why it's high customer value | Semantic color + label |
|------|--------|---------------|------------------------------|------------------------|
| 1 | Needs attention | `AlertCircle` | The one number that says "act now"; already links to `/attention` when >0 `(section-cards.tsx:13-19)` | `--urgency-high` + "Needs help" |
| 2 | Rejected signals today | `XCircle` | Ingestion failures = broken pipeline; the earliest sign data is wrong before decisions are even made | `--status` destructive + "Rejected" |
| 3 | Pending decisions | `Clock` | The educator's actionable backlog awaiting review | `--status` pending + "Awaiting review" |
| 4 | Improving learners | `TrendingUp` | The single positive-signal counterweight so the board isn't all-alarms | `--progress-improved` + "Improving" |

**KPI card declutter (D3):** each card = leading icon + short label + **one** value + delta/contextual comparison + status color; **no prose `description`** (push nuance to a `Tooltip`). Every card is clickable to a drill target. This honors the data-ink ratio (remove non-data words), one-number-per-card, and the 5-second comprehension rule — per BI best-practices and frontend-design (restraint).

| Card | One value (not prose) | Drill target (all clickable) |
|------|-----------------------|------------------------------|
| Needs attention | count + Δ | `/attention` |
| Rejected today / Signals | count (icon-chip breakdown, no sentence) | `/signals` |
| Pending decisions | count | `/decisions?status=pending` |
| Improving learners | count | `/learners?trend=improving` |

- **Chart:** keep the single area `TrendChart` with the 7/30/90d range selector and decisions↔mastery toggle (one series at a time), plus the existing adjacent text summary (`summarizeTrendSeries`) — per dashboard-design-requirements.md §8 / vercel-react-best-practices §1.6 (Suspense per section).
- **Recent table (D1 — educator-first):** change default L0 columns to `Time · Type · Learner · **Summary**` where Summary renders `educator_summary` (truncated, plain-language), and **remove** the technical `matched_rule_id` mono column from L0. Move `matched_rule_id` into the L1 Sheet next to the rationale excerpt so the Sheet is the technical/audit tier — per §2.1 (no technical columns at L0; educator vs inspection density) / BI best-practices (lead with the decision-driving signal).
- **Drill-down Sheet (D1 — technical tier):** Sheet header keeps the `educator_summary` label for continuity, then a **Technical detail** section: `matched_rule_id` (mono), evaluated-fields summary, and the rationale excerpt (`font-mono`), with "Open trace" → `/decisions/[id]` for the full L2 audit — per §2.1 (L1 peek → L2 route) / frontend-design.
- **Icons over prose:** swap KPI text-only titles for `icon + label`; replace the "Signals today: N accepted · N rejected" prose value with two icon chips (`CheckCircle2` N / `XCircle` N) — per frontend-design.
- **Freshness:** add an "Updated {relative}" chip by the `PageHeader` title, fed by a new `fetchedAt` from `getOverviewData`, and make global Refresh call `router.refresh()` — per §2.1 / vercel-react-best-practices §3.7.
- **Components:** compose with installed shadcn `Card`/`Badge`/`Chart`/`Table`/`Tooltip`/`Switch`; no new primitives needed — per shadcn (compose, don't reinvent).

### Cross-filter sync toggle (D2)

A single Overview-level **`Switch` ("Sync filters")**, **default OFF**, enables 2-way linked filtering across the KPI cards ↔ trend chart ↔ recent-decisions table. With it ON, a selection on any surface drives the other two (e.g. click `Reinforce` in the chart legend → table filters to reinforce rows and KPIs recompute on the filtered set; type a learner in the table filter → chart + KPIs scope to that learner). With it OFF, the surfaces render independently exactly as today (the calm "is anything wrong?" glance is preserved).

- **Why default OFF:** the Overview's primary job is a 5-second status glance (§8); cross-filtering is an *exploratory* power-feature, so it is opt-in and persisted (localStorage, versioned key) — per §2.1 (anti-clutter; one primary question per page) and BI best-practices (don't make the glance surface pay an interaction cost it doesn't need).
- **State model:** lift a shared `overviewFilter` (decisionType, learner, dateWindow) into a small client provider that wraps the three surfaces only when sync is ON. Because today's KPIs/chart/table are independent RSC/islands, sync mode must hydrate the already-fetched overview dataset client-side and derive all three views from the shared filter (no refetch per interaction) — per vercel-react-best-practices §3.6 (minimize RSC payload — pass only the fields the client filters on) and §5.1 (calculate derived state during render).
- **Performance:** wrap the filtered recompute in `useMemo` keyed on the shared filter, and feed the filter through `useDeferredValue` so typing/brushing stays responsive while the chart/table catch up; mark non-urgent recomputes with `startTransition` — per vercel-react-best-practices §5.14 (useDeferredValue) / §5.13 (transitions) / §5.9 (split combined computations).
- **A11y + clarity:** the active cross-filter renders as a removable `Badge` chip row ("Filtered: Reinforce ✕") above the table so the linked state is never invisible; the toggle has a `Tooltip` explaining the behavior; color is never the only indicator of an active filter — per §2 #9 / §12.
- **Components:** shadcn `Switch` (toggle), `Badge` (active-filter chips), existing `DataTable` column filters, `Chart` click/legend handlers — per shadcn.

## Design System Notes
- **Icon-first restraint:** add exactly one leading icon per KPI; do not decorate cards with backgrounds — color stays on badges only (§2.1 "color is semantic only") — per frontend-design / §4.4.
- **Typography hierarchy is correct:** `text-2xl` title → `text-sm` muted section label → `tabular-nums` value `(stat-card.tsx:70)`; keep it — per §2.1.
- **Motion restraint:** keep the single orchestrated entrance + Sheet slide; no chart load animations; honor `prefers-reduced-motion` — per §4.5.
- **Semantic tokens only:** continue using `--urgency-*`/`--status-*`/`--progress-*` (no raw Tailwind colors) — per shadcn (semantic colors) / §4.4.

## Observability Recommendations (what / why / where)
- **What:** keep `ApiError.status` in `ErrorState`; add the upstream `error` code (e.g. `dashboard_upstream_unavailable`) to a dev-visible tier without leaking to end-users — per §10.
- **Why:** stop swallowing causes — in the proxy `catch` and the JSON-parse `catch`, log method+URL+status+message server-side via `after()` so it's non-blocking `(route.ts:61-63, :119-123)` — per vercel-react-best-practices §3.10.
- **Where:** generate an `x-request-id` in the proxy, forward it upstream and back, and render it in `ErrorState` as a copyable "Reference: {id}"; this makes dashboard↔upstream correlation one copy-paste — per §3.1 and §10 (no key/URL/stack leak).
- **Contract:** formalize the `dashboard_upstream_unavailable` → "Service unavailable, retrying." mapping already present `(errors.ts:24-26)` as the template for additional reason-code mappings.

## Prioritized Roadmap

| Priority | Item | Lens | Effort | Citation |
|----------|------|------|--------|----------|
| P0 | Make global Refresh call `router.refresh()` so the RSC Overview actually updates | 3 | S | vercel-react-best-practices §3.7 |
| P0 | Add `fetchedAt` + "Updated {relative}" freshness chip on Overview | 3,5 | S | dashboard-design-requirements.md §2.1/§8 |
| P0 | Stop swallowing proxy errors: server-side log (via `after()`) + `x-request-id` propagation, surface copyable reference in `ErrorState` | 4 | M | vercel-react-best-practices §3.10/§3.1; §10 |
| P0 | **D1** — Lead recent-decisions L0 with `educator_summary` (`Time·Type·Learner·Summary`); move `matched_rule_id` + rationale excerpt into the L1 Sheet (technical tier) | 5 | S | §2.1; BI best-practices |
| P1 | Make KPI cards icon-first (leading Lucide icon per metric) + icon on `IngestionOutcomeChip` | 5 | S | frontend-design; §2 #9 |
| P1 | **D3** — Declutter KPI cards (one value + delta + status, drop prose) and make all 4 clickable to a drill target | 5 | S | BI best-practices; frontend-design; §2.1 |
| P1 | **D2** — Cross-filter "Sync filters" toggle (default OFF) linking KPI ↔ chart ↔ table via shared client filter | 5 | M | vercel-react-best-practices §3.6/§5.13/§5.14; shadcn |
| P1 | Resolve the org switcher: hide while single-org-pinned, or wire `onValueChange` end-to-end | 1 | S/M | §2 #6/§5.4; vercel-react-best-practices §3.1 |
| P1 | Decide upload scope; if in-scope, build `/signals/upload` with shadcn dropzone/validation/field-level rejection | 2 | L | shadcn (Forms/Empty/Alert); §10/§15 |
| P2 | Re-rank Overview KPIs to surface "Rejected signals today" (pipeline health) above "Improving learners" | 5 | S | §8 |
| P2 | Extend reason-code → friendly-message map beyond `dashboard_upstream_unavailable` | 4 | S | §10 |

## Skills & References Cited
- `.agents/skills/frontend-design/SKILL.md` — icon-first restraint, visual hierarchy, refined-minimalism direction for the KPI/overview redesign.
- `.agents/skills/vercel-react-best-practices/SKILL.md` — §1.6 Suspense boundaries, §3.1 authenticate routes, §3.7 parallel RSC fetch, §3.10 `after()` non-blocking logging (refresh, freshness, observability recs).
- `.agents/skills/shadcn/SKILL.md` — compose-don't-reinvent, semantic colors, Forms/Field validation + Empty/Alert/Progress for the upload surface.
- `docs/specs/dashboard-design-requirements.md` — §2 (UX principles), §2.1 (anti-clutter/drill-down/visual hierarchy/cross-filter doctrine), §5.4 (org switcher), §8 (Overview spec incl. D1/D2/D3), §10 (state contracts), §15 (out-of-scope/mutations).
- **BI dashboard layout best-practices (external)** — data-ink ratio (Tufte: remove non-data pixels), the 5-second comprehension rule, ≤4–6 contextual KPI cards (value + comparison + variance + status), audience-tiered density (lead with the decision-driving signal, defer technical IDs). Surfaced via `find-skills`: candidate skill `borghei/claude-skills@business-intelligence` (~1.2K installs; `npx skills add borghei/claude-skills@business-intelligence`). Sources: [IGC — Dashboard Layout/visual hierarchy + 5-second test](https://www.intelligentgraphicandcode.com/design/dashboard-design/dashboard-layout), [business-intelligence.info — 7 rules for effective data viz](https://business-intelligence.info/en/dashboard-design), [EPC Group — Power BI KPI card best practices 2026](https://www.epcgroup.net/power-bi-dashboard-design-best-practices-enterprise-2026).
