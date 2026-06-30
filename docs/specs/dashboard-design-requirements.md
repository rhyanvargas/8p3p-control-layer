# Dashboard Design Requirements

> The design source of truth for the redesigned 8P3P control-layer dashboard (Next.js + shadcn/ui on AWS Amplify). Defines layout, information architecture, navigation, components, states, responsive behavior, visual language, and UX principles. **Execution/hosting decisions live in `docs/specs/nextjs-amplify-dashboard-migration.md`** — this document is design-only and that one references it.

---

## 1. Overview & Goals

The current dashboard is two disconnected surfaces: the educator **Decision Panel** (4 product panels) and the developer **Inspection Panels** (4 read-only `/inspect` panels). The redesign unifies them into **one coherent product** with a sidebar-driven app shell, clear page hierarchy, and a consistent design system.

**Goals**
- One navigation model for two audiences (educators; integration/compliance) without forking the UI.
- Strong, Vercel-style product UX: calm, data-dense, fast, keyboard-friendly, **light-mode-first** (matches shadcn `dashboard-01` baseline).
- **Non-cluttered, data-driven surfaces** — each page answers one primary question; depth is reached through drill-downs (Sheet peek → route → tab), not by stacking widgets.
- Implementation-ready with shadcn/ui + Tailwind v4 + Next.js App Router — no over-engineering.
- A scalable component system the future `8p3p-admin` platform can inherit.

**Audiences & primary jobs**
| Audience | Primary job | Lands on |
|----------|-------------|----------|
| Educator / school staff | Triage who needs help, understand **why**, review recommended actions, confirm progress | Overview → Attention → Learner detail |
| Integration engineer | Verify signals are arriving and parsing | Signals |
| Compliance / reviewer | Audit a decision's provenance end-to-end | Decisions → Decision detail |

### Educator journey (implemented)

The educator experience is the product default: a teacher should reach **full context on who needs attention and why** in at most three clicks (Overview → Attention card → L1 Sheet or L2 tab), without raw JSON or duplicate KPI clutter.

| Educator question | Route | L0 signal | "Why" context (plain language) | Drill-down |
|-------------------|-------|-----------|--------------------------------|------------|
| Is anything wrong? | `/` Overview | 4 KPIs max; Needs attention links to `/attention` when >0 | KPI deltas + trend text summary | Recent decision row → L1 Sheet → trace |
| Who needs help now? | `/attention` | Ranked `LearnerCard` list (no KPI cards) | `DecisionBadge` + `educator_summary` (or type narration) + dominant skill line + `UrgencyBadge` | Card → L1 `LearnerDetailSheet` → `/learners/[ref]` |
| What should I do? | `/attention` | Decision review cards (≤5 pending) | Expandable rationale; Approve/Reject (localStorage pilot) | — |
| Which skill is the gap? | `/learners/[ref]` → **Overview** tab | **Skills breakdown** callout (top 1 gap skill) | Label + detail from `extractProblemAreas()` / `mastery_breakdown` | "View all skills" → **Skills** tab |
| Why are they stuck? | `/learners/[ref]` → **Struggles & progress** tab | Per-skill struggle cards (skill-first — no learner header) | Skill name, direction, evidence quote via `/v1/state` `skills.*` | — |
| Did support work? | `/learners/[ref]` → **Struggles & progress** tab | Progress cards (skill-first — no learner header) | Stability rationale from `buildStabilityRationale()` | — |
| Full skill inventory | `/learners/[ref]` → **Skills** tab | `DataTable` of all skills | Mastery, stability, trend from `mastery_breakdown.skills` | — |
| Full learner picture | `/learners/[ref]` tabs | One concern per tab | Overview, Skills, State (version selector), Trajectory | L3 `JsonViewer` collapsed only on State tab |

**Legacy panel mapping:** "Who Needs Help Now" + "What Should Happen Next" → **Attention**; "What Do They Need Help With" + "Did the Support Work" → **Learner detail / Struggles & progress**; aggregates → **Overview** (no queue duplication per §2.1).

---

## 2. UX Principles (normative)

1. **Progressive disclosure.** Summary → list → detail. Drill-down opens a right-side `Sheet` (peek) or a dedicated route (deep link). Never dump raw JSON at the top level.
2. **One primary question per page.** Each route has a single headline job (e.g. Overview = "Is anything wrong?"; Attention = "Who do I act on?"; Signals = "Is ingestion healthy?"). Secondary questions defer to drill-downs — not extra panels on the same scroll.
3. **Action-oriented triage.** The educator's actionable queue (Attention) is one click from landing and is the only surface with write-ish actions (Approve/Reject, client-side in pilot).
4. **Read-only truth layer.** Inspection surfaces (Signals log, State, Decision Trace) are strictly read-only for audit — no ad-hoc mutations, preserving the `inspection-panels.md` doctrine. **Exception (in scope):** authenticated bulk signal ingest via `/signals/upload` → `POST /v1/signals` with optional preflight dry-run — the only dashboard write surface besides pilot Approve/Reject (see §8, §15).
5. **One consistent system, two densities.** Educator views = generous spacing, friendly copy. Inspection views = denser tables + `font-mono` for IDs/JSON. Same tokens, same components — only spacing/typography density changes.
6. **Security by default.** The browser never holds the API key; all data flows through the server-side proxy (`/api/control/*`). No "enter your API key" inputs in the redesigned UI (removes the legacy inspection-panel key prompt).
7. **Honest states.** Every data view implements distinct loading, empty, and error states (no blank screens, no spinner-only).
8. **Fast perceived load.** Use Next.js streaming + `Suspense` per section; skeletons sized to final content to avoid layout shift.
9. **Accessible.** WCAG 2.1 AA: keyboard nav, focus-visible rings (already in tokens via `--ring`), semantic landmarks, color never the only signal (pair color with icon/label on badges).
10. **Restraint over decoration.** Motion, color accents, and chart animation serve comprehension — not atmosphere. One orchestrated entrance per page; no competing visual focal points above the fold.

### 2.1 Data-driven dashboard doctrine (normative)

These rules govern **all** data surfaces. They extend principle #1 and define what "high quality" means for a control-layer dashboard — calm, scannable, and intentionally sparse at each tier.

**Anti-clutter (what we refuse to build)**
- No "everything dashboard" home pages: no simultaneous KPI grid + 3 charts + 2 full tables + JSON snippets on one scroll.
- No technical columns (IDs, schema versions, raw policy paths) in default table views — those appear only in Sheet peek or detail routes.
- No inline expansion of full JSON in list rows (use `Sheet` or collapsible `JsonViewer` on detail only).
- No duplicate metrics: if a KPI appears on Overview, the Attention page does not repeat the same stat cards — it goes straight to the queue.
- No chart junk: gridlines, legends, and series kept minimal; at most **one primary metric per chart** with an explicit toggle for a second view (e.g. decisions-by-type ↔ mastery trend), never both overlaid by default.

**Three-tier drill-down model**

Every entity (learner, decision, signal) follows the same depth ladder. Users never skip tiers accidentally — each tier adds *new* information, not a rearrangement of the parent.

| Tier | Surface | User intent | Max density | Typical contents |
|------|---------|-------------|-------------|------------------|
| **L0 — Page summary** | Route list/overview | Scan & prioritize | ≤7 KPIs or ≤6 table columns visible | Counts, status chips, human labels, relative time |
| **L1 — Peek** | Right `DetailSheet` (~480px) | Confirm identity + decide "open full view?" | 3–5 labeled fields + ≤5 recent rows | Header badge, current state snapshot, last N signals/decisions, single primary CTA |
| **L2 — Detail route** | `/…/[id]` with tabs | Audit, compare, export | Tabbed sections; one concern per tab | Full history, version selector, thresholds, collapsible JSON |
| **L3 — Raw truth** | Collapsed `JsonViewer` inside L2 | Compliance / engineering | Monospace, copy button, collapsed by default | Raw API payload only when explicitly expanded |

**Peek vs route decision tree**
- Row click / keyboard Enter → **always L1 Sheet first** (fast, preserves list context).
- Sheet footer → **one** primary CTA: "Open full view" → L2 route (deep-linkable).
- Direct URL to L2 → allowed (shareable); breadcrumbs reflect L0 → L2 path.
- Esc / backdrop click closes Sheet; list scroll position preserved.

**Visual hierarchy for data**
- **Typography carries structure:** page title (`text-2xl`) → section label (`text-sm font-medium text-muted-foreground`) → data value (`text-sm` / `font-mono` for IDs). Never bold entire rows.
- **Color is semantic only:** `--urgency-*`, `--status-*`, `--progress-*` on badges — not decorative backgrounds on cards.
- **Whitespace defines tiers:** L0 educator pages use `gap-6`/`p-6`; L1 Sheet uses tighter `gap-4` but still one column (no nested cards-in-cards).
- **Single focal action per view:** Overview has no primary button; Attention has Approve/Reject on cards; detail routes have Export JSON — never more than one emphasized CTA per viewport.

**Table scannability defaults**

Default visible columns per `DataTable` (additional columns via column picker or drill-down only):

| Table | Default columns | Hidden until drill-down |
|-------|-----------------|-------------------------|
| Learners | Reference, level, trend (`ProgressBadge`), last activity, status | Skill breakdown, internal IDs, raw state hash |
| Decisions | Time, type, learner, rule (truncated) | Policy version, full rationale, state snapshot |
| Signals | Time, source, outcome chip | Signal ID, schema, rejection field path |
| Overview recent decisions | Time, type, learner, **summary** (`educator_summary`, plain-language, truncated) — last 20 only | Technical `matched_rule_id`, rationale excerpt (→ L1 Sheet), filters beyond time sort |

**Educator-first vs inspection-first column ordering (normative).** The Overview recent-decisions table serves the **educator** audience, so its default L0 columns lead with the plain-language `educator_summary` ("Needs more practice"), and the technical `matched_rule_id` is **not** an L0 column — it moves into the L1 Sheet alongside the rationale excerpt (the technical/audit tier). The `/decisions` audit table serves the **inspection/compliance** audience and may keep the truncated rule id at L0. This applies the §2.1 "educator vs inspection density" rule and "no technical … raw policy paths in default table views": choose the L0 leading column by audience, defer IDs to the drill-down.

**Chart interaction**
- One chart per Overview; range selector (7/30/90d) changes window, not layout.
- Trend bucketing uses **local calendar dates** (`toLocalDateKey` in `dashboard/lib/overview-metrics.ts`) so chart buckets align with educator-facing timestamps across timezones.
- Provide a **textual summary** adjacent to or below the chart (e.g. "12 decisions this week, ↑3 vs prior") for screen readers and glanceability — chart is supplementary, not the only signal.
- No auto-playing or looping chart animations; respect `prefers-reduced-motion`.

**Cross-filter sync (linked brushing) — opt-in, normative**

Data surfaces on a page (chart ↔ table ↔ decision-derived KPI values) may be wired into a **2-way linked filter** so adjusting a filter on one synced surface updates the others. Because this adds interaction cost to a glance-first surface, it is governed strictly:

- **Opt-in, default OFF.** Expose a single page-level `Switch` ("Sync filters"). When OFF, surfaces render independently (the 5-second "is anything wrong?" glance is preserved). When ON, chart and table filters drive each other and decision-derived KPI counts. Persist the toggle (versioned localStorage key).
- **One shared filter object.** Sync mode lifts a single `{ decisionType, learner, dateWindow }` filter into a client provider wrapping the synced surfaces; all derived views are computed from it (no per-interaction refetch). Hydrate the already-fetched overview dataset client-side rather than re-querying.
- **Linked state is always visible.** Render the active cross-filter as removable `Badge` chips ("Filtered: Reinforce ✕") above the affected surfaces — never an invisible/implicit filter. Color is never the sole indicator (§2 #9).
- **Performance.** Derive filtered views with `useMemo`; feed the filter through `useDeferredValue` and `startTransition` so brushing/typing stays responsive (vercel-react-best-practices §5.9/§5.13/§5.14). Pass only the fields the client filters on across the RSC boundary (§3.6).
- **Scope.** Cross-filter is an **exploratory** aid, not a replacement for drill-down — it never bypasses the L0→L1→L2 ladder; it only narrows what each tier shows.

**Cross-filter implementation notes (2026-06-23, grounded in current `dashboard/`):**

- **Structural prerequisite.** Overview today renders as three independent Suspense RSC sections (`OverviewKpiSection`, `OverviewTrendSection`, `OverviewRecentDecisionsSection`), each calling `getOverviewData` (deduped via `React.cache`). D2 requires consolidating to **one RSC fetch** passing a slim client payload into an `OverviewExplorer` (or equivalent) client wrapper. TanStack Query is **not** required — hydrate once, derive with `useMemo`; global Refresh already calls `router.refresh()` to re-fetch RSC data.
- **KPI cards vs filter sync.** KPI cards remain **navigation drill targets** (§8, D3) at all times — sync does **not** repurpose card clicks as filters. When sync is ON, only **Needs attention** and **Pending decisions** recompute from the shared filter; **Rejected signals today** (ingestion) and **Improving learners** (state sample) stay org-wide and may show a subtle program-wide indicator when decision filters are active.
- **Chart view mode.** The decisions ↔ mastery toggle on `TrendChart` is **chart-local** — cross-filter applies only in **decisions** mode. Mastery series ignores `decisionType` and learner sync.
- **Sync sources (v1).** Chart `Select` controls (7/30/90d range, decision type) and the recent-decisions table learner text filter. Chart legend or area click brushing is **optional post-D2**, not required for v1.
- **Filtered recent table.** When sync is ON and filters are active, the table shows the last 20 decisions **matching the filter**, not the last 20 org-wide.
- **URL params.** Active cross-filters are surfaced via removable `Badge` chips (satisfies linked-state visibility). URL registration in `page-url-state.ts` is **deferred** unless shareable Overview filter URLs are explicitly required.

**URL query parameters (normative).** The linked-state rule applies to route `?query` params, not only cross-filter sync:

- **Rule of thumb:** If a URL parameter affects what the user sees, they must be able to see and control it on the page. Analytics-only params may stay hidden; params that look like filters may not.
- **Register first:** every new dashboard query param MUST be declared in `dashboard/lib/page-url-state.ts` before merge.
- **Kinds:** `data-filter` (↔ filter control), `entry-context` (↔ dismissible chip or back link), `entity-state` (↔ version picker / review bar / tab), `redirect-only` (compat redirect — never a silent page filter).
- **Enforcement:** `.cursor/rules/dashboard-url-linked-state/RULE.md` (agent guidance); `dashboard/lib/__tests__/page-url-state.test.ts` (CI contract); e2e chip/control assertions for KPI drill-downs.

**Educator vs inspection density (same drill-down ladder)**
- Educators: L0/L1 use plain language labels ("Needs help", "Improving"); L2 tabs named for jobs ("Overview", "Skills", "Struggles & progress").
- Inspection: L0/L1 may show monospace IDs in peek headers; L2 exposes thresholds tables and `JsonViewer` — still collapsed by default.

### 2.2 Persona surfaces (D5 — normative)

§2.1 defines **what depth each tier exposes** (L0/L1/L2/L3). **D5 defines who sees which routes and drill-downs** on the hosted dashboard (tier **C** only — no new backend tier). Auth interim: dual passphrases in [`dashboard-passphrase-gate.md`](dashboard-passphrase-gate.md) (educator vs compliance session persona). Implementation: [`.cursor/plans/dashboard-persona-enforcement.plan.md`](../../.cursor/plans/dashboard-persona-enforcement.plan.md) (PE-001–PE-008). Phase 2 Cognito replaces access codes, **not** these IA rules.

Until PE-001–PE-006 ship, GTM may use **two passphrases + two-path demo script** ([`springs-pilot-demo.md`](../guides/playbooks/springs-pilot-demo.md)) as interim mitigation — see [`organic-educator-wave-zoom.md`](../guides/playbooks/organic-educator-wave-zoom.md).

#### Educator surface (educator access code)

**Primary job:** Triage who needs help, understand **why** in plain language, confirm progress — not audit ingestion, policy internals, or raw JSON.

| Area | Educator surface |
|------|------------------|
| **Sidebar (`nav-main`)** | Overview, Attention, Learners **only** — no Decisions, Signals, or Reports |
| **Learner L2 tabs** (`/learners/[ref]`) | **Overview**, **Struggles & progress** only — no State, Trajectory, or Skills tabs |
| **L0 table columns** | Summary-first; **no** `matched_rule_id`, state version, or policy id at L0 (§2.1 educator-first columns apply) |
| **Overview KPIs** | Hide or relocate **Rejected signals today** to the compliance surface — ingestion health is not an educator primary question. D4 "Program health" groupings **defer to D5** in educator mode (compliance-only KPIs) |
| **Learner Overview tab** | No rule/policy leak — scrub `matched_rule_id`, policy version, and raw rule paths from educator-visible fields (PE-005) |
| **Write surfaces** | Approve/Reject on `/attention`; product feedback POST — **not** signal upload, policy admin, or trace export |

#### Compliance / admin surface (compliance access code)

**Primary job:** Audit provenance, verify ingestion, export receipts — full inspection density.

| Area | Compliance surface |
|------|-------------------|
| **Sidebar (`nav-main`)** | Full nav: Overview, Attention, Learners, Decisions, Signals, Reports |
| **Learner L2 tabs** | All tabs: Overview, Skills, State (version selector + collapsed L3 JSON), Trajectory, Struggles & progress |
| **Audit routes** | `/decisions`, `/decisions/[id]` (trace + Export JSON), `/signals`, `/signals/upload`, `/reports` |
| **L0/L1 density** | May show truncated rule ids, outcome chips, monospace IDs in peek headers per §2.1 inspection-first rules |
| **Write surfaces** | Signal upload wizard, policy admin API (server-side admin key), program/research export when available |

#### Role × feature × infrastructure map (SSoT)

| Feature / route | Educator code | Compliance code | Infra tier |
|-----------------|:-------------:|:---------------:|------------|
| Overview, Attention, Learners | Yes | Yes | C |
| Learner Struggles & progress | Yes | Yes | C reads A (`/v1/learners`, `/v1/state`) |
| Learner State / Trajectory / JSON | No | Yes | C |
| Decisions stream + trace export | No | Yes | C reads A |
| Signals log + upload wizard | No | Yes | C proxy + A admin preflight |
| Reports + export | No | Yes | C (+ staged program-metrics on A) |
| Policy admin API | No | Yes (API key server-side) | A `/v1/admin/policies/*` |
| Product feedback POST | Yes | Yes | A (pilot-charter TASK-006+) |
| Per-decision Approve/Reject | Yes | Yes | A + C |

**Note:** §1 educator journey tables describe the **full product** capability; in educator persona mode, D5 **narrows** nav and tabs to the rows marked "Educator code = Yes" above.

---

## 3. Baseline: shadcn `dashboard-01` (adapt, don't copy)

We start from [`dashboard-01`](https://ui.shadcn.com/blocks#dashboard-01) (`npx shadcn add dashboard-01`), which ships: `app-sidebar`, `site-header`, `section-cards`, `chart-area-interactive`, `data-table`, `nav-main`, `nav-secondary`, `nav-documents`, `nav-user`, plus the `SidebarProvider`/`SidebarInset` shell.

| dashboard-01 piece | Keep? | Adaptation for 8P3P |
|--------------------|-------|---------------------|
| `SidebarProvider` + `SidebarInset` app shell | ✅ Keep | Core layout primitive; `variant="inset"`. |
| `app-sidebar` | ✅ Adapt | Replace demo nav with our IA (§5). Brand mark in header, org context + theme + logout in footer. |
| `site-header` | ✅ Adapt | Add breadcrumbs, org switcher, global refresh, theme toggle, command-palette trigger. |
| `section-cards` (KPI cards) | ✅ Adapt | Map to real KPIs (§8 Overview). Keep the 4-up responsive grid + trend delta pattern. |
| `chart-area-interactive` | ✅ Adapt | Repurpose as decisions/mastery trend over time (Recharts via shadcn `chart`). |
| `data-table` (TanStack Table) | ✅ Adapt | Becomes the reusable `DataTable` used by Learners, Decisions, Signals (sorting, filtering, pagination, row→drill-down). |
| `nav-documents` | ➖ Replace | Becomes `nav-secondary` items (API Docs link to Swagger, Settings, Help). |
| `nav-user` | ✅ Adapt | Org/session context (passphrase logout in pilot; Cognito user later). |
| Demo `data.json` | ❌ Drop | All data comes from `/api/control/*` via TanStack Query. |

**What we improve over the block:** real IA instead of demo nav; a reusable typed `DataTable` (not a one-off); standardized state components; a drill-down `Sheet` pattern; org-context awareness; security (no client key); and a documented token/typography system.

---

## 4. Visual Design Language

### 4.1 Foundation
Build on the **existing 8P3P token set** already defined in `docs/specs/decision-panel-ui.md` (shadcn v4 `base-nova`, `oklch`, light + dark mode, `--brand-accent-*`, `--urgency-*`, `--status-*`, `--progress-*`). **Do not redefine tokens here** — extend that block. This keeps Swagger, dashboard, and future admin UI on one palette.

### 4.2 Typography (upgrade)
"Vercel-style product UX" → adopt **Geist Sans** (UI) + **Geist Mono** (IDs, JSON, metrics) via `next/font` (`geist` package). This is an intentional, characterful, enterprise-appropriate choice that replaces the current generic system stack, and it pairs a refined UI face with a true monospace for the inspection "truth layer."

```tsx
// app/layout.tsx
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
// <html className={`${GeistSans.variable} ${GeistMono.variable}`}>
```
Wire into tokens: `--font-sans: var(--font-geist-sans)`, `--font-mono: var(--font-geist-mono)` (override the two lines in the existing `globals.css` token block; everything else unchanged).

### 4.3 Density modes
- **Comfortable** (educator views): card padding `p-6`, `gap-6`, base text `text-sm`/`text-base`.
- **Compact** (inspection tables/JSON): `p-3`, `gap-3`, `text-xs`/`text-sm`, `font-mono` for data cells. Implemented as Tailwind utility presets, not a theme fork.

### 4.4 Color usage
- **Light mode is the default** (`:root` tokens — white/near-white surfaces, neutral `oklch` base per `dashboard-01`). Dark mode is first-class (`.dark` override); user-toggleable via theme toggle, persisted in a cookie (SSR-safe to avoid flash). Accent colors used sparingly.
- Status/urgency/progress badges use `--status-*` / `--urgency-*` / `--progress-*` only (never raw Tailwind colors), each paired with a Lucide icon + text label (a11y: color is never the sole signal).

### 4.5 Motion (restraint)
- One orchestrated entrance per page (staggered section reveal via `tw-animate-css`), **`Sheet`/`Dialog` slide transitions for drill-down** (L0→L1), and table row hover. No scattered micro-animations; no chart load animations. Respect `prefers-reduced-motion`.

---

## 5. Information Architecture & Navigation Model

### 5.1 Sidebar — `nav-main` (primary)

**Persona gating (D5):** Educator sessions see Overview, Attention, and Learners only. Compliance sessions see the full table below. Middleware + nav allowlists enforce this ([`dashboard-passphrase-gate.md`](dashboard-passphrase-gate.md) § Dual access codes).

| Item | Icon (Lucide) | Route | Persona | Replaces legacy |
|------|---------------|-------|---------|-----------------|
| Overview | `LayoutDashboard` | `/` | Educator + Compliance | — (new home) |
| Attention | `AlertCircle` | `/attention` | Educator + Compliance | Decision Panel: "Who Needs Help Now" + "What Should Happen Next" |
| Learners | `Users` | `/learners` | Educator + Compliance | State Viewer + "What Do They Need Help With" + "Did the Support Work" |
| Decisions | `GitBranch` | `/decisions` | Compliance only | Decision Stream + Decision Trace |
| Signals | `Radio` | `/signals` | Compliance only | Signal Intake (ingestion log) |
| Reports | `BarChart3` | `/reports` | Compliance only | program-metrics / research export surfaces |

### 5.2 Sidebar — `nav-secondary` (utility, bottom)
| Item | Icon | Target |
|------|------|--------|
| API Docs | `BookOpen` | External link to Fastify `/docs` (Swagger) |
| Settings | `Settings` | `/settings` |
| Help | `LifeBuoy` | `/settings` (pilot placeholder; external guide link is Phase C) |

### 5.3 Sidebar footer — `nav-user`
Org context (org name + environment badge), theme toggle, and session control: **Log out** (passphrase session in pilot; Cognito user menu in production — see migration spec Phase 5).

### 5.4 Topbar (`site-header`)
- `SidebarTrigger` (collapse) · breadcrumbs (section → detail) · spacer
- **Org switcher** (`Select`/`Combobox`) — hidden when single-org pinned via `CONTROL_LAYER_ORG_ID`
- **Global refresh** (`RefreshCw`, invalidates active TanStack queries)
- **Command palette** trigger (`⌘K`) for quick learner/decision lookup — **Phase C (not yet implemented)**
- **Theme toggle**

---

## 6. Page Hierarchy & Routes

| Route | Page | Purpose | Data (via `/api/control/*`) |
|-------|------|---------|------------------------------|
| `/` | Overview | KPIs + trend chart + recent decisions table | `/v1/state/list`, `/v1/decisions` (recent), `/v1/ingestion` (counts) |
| `/attention` | Attention queue | Triage: high-urgency learners + actionable decisions (Approve/Reject) | `/v1/learners/:ref/summary` |
| `/learners` | Learner roster | Searchable/sortable learner table | `/v1/state/list` |
| `/learners/[ref]` | Learner detail | Overview skills breakdown, full **Skills** tab, state (**version drill-down**), trajectory, struggles/progress | `/v1/state`, `/v1/state?version=n`, `/v1/learners/:ref/summary` |
| `/decisions` | Decision stream | Filterable audit feed of receipts | `/v1/receipts` |
| `/decisions/[id]` | Decision trace | Full provenance: rationale, thresholds, state snapshot, rule condition, JSON export | `/v1/decisions` |
| `/signals` | Signal intake | Ingestion log w/ outcome filter + rejection drill-down; **Upload signals** entry → `/signals/upload` | `/v1/ingestion` |
| `/signals/upload` | Signal upload | Bulk ingest wizard: parse → map → validate → review → commit | `/v1/signals`; optional preflight via `/api/preflight` → `/v1/admin/ingestion/preflight` |
| `/reports` | Reports | Program metrics, exports | `/v1/admin/program-metrics`, export endpoints |
| `/settings` | Settings | Org/env info, theme, (later) user/Cognito | local + `/v1/policies` (read) |
| `/login`, `/logout` | Auth | Passphrase gate (pilot) → Cognito (prod) | per migration spec |

Drill-down convention (implements §2.1 three-tier model):
- **L0** list/overview rows are scannable only (see default column tables in §2.1).
- **L1** row click / `Enter` → right-side **`DetailSheet`** peek (~480px desktop; full-width mobile). Preserves list scroll position.
- **L2** Sheet footer **one** primary CTA ("Open full view" / "Open trace") → detail **route** (deep-linkable, shareable).
- **L3** raw JSON only inside L2, inside collapsed **`JsonViewer`** — never on L0/L1.
- Breadcrumbs update on L2: `{Section} → {Entity label}`; Sheet does not change the URL.

## 7. Layout Structure (app shell)

```tsx
// app/(dashboard)/layout.tsx  — authenticated shell
<SidebarProvider style={{ "--sidebar-width":"16rem", "--header-height":"3rem" } as CSSProperties}>
  <AppSidebar variant="inset" />
  <SidebarInset>
    <SiteHeader />               {/* breadcrumbs, org switcher, refresh, theme, ⌘K */}
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {children}                 {/* page content: PageHeader + sections */}
    </main>
  </SidebarInset>
</SidebarProvider>
```
- Auth pages (`/login`) live **outside** this shell in a separate route group `(auth)`.
- Each page composes a `PageHeader` (title, description, primary action) + content sections, each wrapped in `Suspense` with a sized skeleton.

---

## 8. Core Pages (detail)

Each page below states its **primary question** (§2, principle #2), **L0 layout** (what stays on screen), and **drill-down exit** (where depth lives). Do not add widgets beyond what is listed — defer to Sheet/route tabs.

**Overview `/`** — *"Is anything wrong right now?"*
- **L0** (decision **L1 Sheet** opens from the recent table — see below): `SectionCards` (4 KPIs max, 4-up → 2-up → 1-up): **Needs attention** (count, Δ vs yesterday), **Pending decisions**, **Rejected signals today** (rejected count + accepted icon-chip), **Improving learners**. No duplicate Attention queue here.
  - **Decluttered KPI cards (normative):** each card shows a leading icon + short label + **one value** + delta/contextual comparison + status color — **no prose description sentences** (defer nuance to a `Tooltip`). Honors the data-ink ratio and one-number-per-card (≤4–6 contextual KPI cards). Split compound values (e.g. rejected + accepted counts) into a single number + icon-chip breakdown, not a sentence.
  - **Uniform clickability (normative):** **every** KPI card is interactive with a consistent hover/focus affordance and links to its drill target — Needs attention→`/attention`, Pending→`/attention?from=pending` (legacy `/decisions?status=pending` redirects), Rejected signals→`/signals`, Improving→`/learners?trend=improving`. No card is a dead end.
- `TrendChart` (single area chart; 7/30/90d range; decisions-by-type ↔ mastery toggle — one series visible at a time) + adjacent text summary line for glanceability + a11y.
- `RecentDecisionsTable` (reusable `DataTable`, last 20) — **educator-first L0 columns** `Time · Type · Learner · Summary` (`educator_summary`, plain-language, truncated); the technical `matched_rule_id` is **not** at L0 (per §2.1) → row opens decision **L1 Sheet** (technical tier) → "Open trace" → `/decisions/[id]`.
- **Cross-filter "Sync filters" toggle** (default OFF) per §2.1 cross-filter doctrine. OFF = independent surfaces (calm glance); ON = chart ↔ table ↔ decision-derived KPI values stay in sync via shared `{ decisionType, learner, dateWindow }` filter, with removable active-filter chips and `useDeferredValue`/`startTransition` for responsiveness. KPI card clicks still navigate (D3); ingestion/state KPIs stay program-wide when filters are active.

**Attention `/attention`** — *"Who do I act on, and what should I do?"*
- **No KPI cards** (Overview owns aggregates). Two stacked regions only:
  - **Who needs help now** — ranked `LearnerCard` list by urgency (not a full `DataTable`; cards are the scannable L0).
  - **What should happen next** — decision review cards with `Approve`/`Reject` (client-side localStorage in pilot per decision-panel-ui.md).
- Card click → learner **L1 Sheet** (summary peek) or inline decision context; "Open full view" → `/learners/[ref]`. Empty = "All caught up."

**Learners `/learners`** — *"Who is in the program and how are they trending?"*
- **L0:** `DataTable` with default columns only (reference, level, trend `ProgressBadge`, last activity, status — separate sortable columns for level and trend). Search + filters (declining only, by skill) in a compact filter bar — not a second panel.
- Row → **L1** `LearnerDetailSheet` (§8.1) → "Open full view" → **L2** `/learners/[ref]`.

### 8.1 Learner drill-down `Sheet` (L1 peek payload)
Clicking a learner row opens the right-side `DetailSheet` (read-only, ~480px desktop / full-width mobile per §11). It carries **summary-level traceability only** — honoring the three-tier model (§2.1); deep history stays on the route. Contents (max — do not exceed):
- **Header:** learner reference + current `ProgressBadge` (level + trend).
- **Current traceability state:** latest canonical state fields (current version label, key mastery/struggle indicators). Not the full version history.
- **Recent signals:** last **3** ingested signals (time, source, outcome chip) — preview, not the full log.
- **Recent decisions:** last **3** receipts with `DecisionBadge`.
- **Primary CTA (footer, sole emphasized action):** "Open full view" → `/learners/[ref]`.

Everything heavier (state **version drill-down**, full **signal history**, full skill inventory, trajectory, struggles/progress) lives on **L2** route tabs below — never crammed into the peek.

**Learner detail `/learners/[ref]` (L2)** — tabs (one concern per tab; no all-in-one scroll):
- **Overview** — summary + **Skills breakdown** (§8.2) + recent decisions (decision-driven via `/v1/learners/:ref/summary`).
- **Skills** — full per-skill inventory table (§8.2); defers roster L0 "skill breakdown" column per §2.1.
- **State** — canonical fields + **version selector** for historical drill-down; raw JSON in collapsed **L3** `JsonViewer`.
- **Trajectory** — per-field trend from summary projection (reads `/v1/learners/:ref/summary` `field_trajectories`; per-skill trajectory grouped by skill is future scope per `learner-trajectory-api.md` §v1.2).
- **Struggles & progress** — "What Do They Need Help With" + "Did the Support Work" merged (§8.2); narrative struggle/progress cards only — not the full skill roster.

### 8.2 Learner skills breakdown (L2, dashboard-only)

> Closes the gap between the **60-second student profile** (`docs/specs/urs-aggregation.md`) and the roster rule that hides skill breakdown at L0 (§2.1 table defaults). No new API endpoints — consumes existing summary and state contracts.

**Primary questions**

| Tab / section | Educator question | Data source |
|---------------|-------------------|-------------|
| Overview → **Skills breakdown** | "Which skill needs attention *right now*?" | `GET /v1/learners/:ref/summary` → `current_state.mastery_breakdown`; derive via `extractProblemAreas()` in `dashboard/lib/learner-problem-areas.ts` |
| **Skills** tab | "How is this learner doing on every skill?" | Same summary payload → `mastery_breakdown.skills` (+ `learning_gaps` when present) |
| **Struggles & progress** tab | "Why are they stuck?" / "Did support work?" | `GET /v1/state?learner_reference=:ref` → `skills.*` (pilot-required per `decision-panel-ui.md` § Panel 2/4 — summary MUST NOT substitute here) |

**Overview — Skills breakdown section**

- Place **below** the Summary `SheetSection` and **above** Recent decisions.
- Show **one** primary gap skill: first item from `extractProblemAreas(summary, 1)`.
- Render as a compact callout (not a grid of cards): skill label, detail line (e.g. "25% mastery · declining"), optional `ProgressBadge`.
- When more than one problem area exists, append "+ N more" and a text link **View all skills** → activates the **Skills** tab (client tab switch or `?tab=skills` entity-state param per §2.1 URL doctrine).
- When `mastery_breakdown` is `null` and `extractProblemAreas` returns empty, show muted empty copy ("No skill gaps detected") — do not hide the section heading.
- **Do not** duplicate the dominant **Focus skill** field in Summary unless it differs from the top gap; when they match, one line is enough (prefer the Skills breakdown callout for gap context).

**Skills tab — full inventory**

- **L0 layout:** one `DataTable` (compact density per §2.1 inspection/educator hybrid — comfortable spacing, no JSON).
- **Default columns:** Skill (educator label via `formatSkillLabel`), Mastery (score + level), Stability (when present in breakdown or merged from state), Trend (`ProgressBadge` from `_direction`), Evidence count (when `evidenceCount` present).
- **Default sort:** lowest mastery first; ties broken by skill label ascending.
- **Optional filter bar (v1):** "Needs attention only" toggles rows where mastery &lt; 0.6 or direction is `declining` (same threshold as `skillsFromBreakdown` in `learner-problem-areas.ts`).
- Reuse the summary query already mounted on Overview where possible (TanStack Query cache key by org + learner ref) — no redundant fetch on tab switch.
- Empty state: "No per-skill data yet" when `mastery_breakdown` is `null`.

**Struggles & progress — card component rule**

- On L2 learner detail, struggle and progress entries MUST NOT repeat the learner reference in each card header — the page `PageHeader` already identifies the learner.
- Use **skill-first** cards (`SkillIssueCard` or plain `Card` with skill name as title). Reserve `LearnerCard` (learner ref in header) for **multi-learner** surfaces only: `/attention`, org-wide "What Do They Need Help With" panel (`WhyAreTheyStuck`).
- Card body unchanged: skill + stability direction, quoted rationale from `buildStabilityRationale()`; progress cards retain level transition line + `ProgressBadge`.

**Acceptance criteria**

- Given learner `stu-20891` on `/learners/stu-20891` with two skills below stability threshold, when the educator opens **Overview**, then the Skills breakdown shows the highest-priority gap (first `extractProblemAreas` item) and "+ 1 more" with a link to the Skills tab — not a grid of `LearnerCard`s repeating `stu-20891`.
- Given the same learner on **Struggles & progress**, when struggle cards render, then each card title is the **skill name** (e.g. "ELA-201"), not the learner reference.
- Given `mastery_breakdown.skills` contains N skills, when the educator opens the **Skills** tab, then all N rows appear sorted by mastery ascending with educator labels.
- Given a skill with `stabilityScore_direction: "declining"` in state, when **Struggles & progress** renders, then the quoted rationale still comes from `/v1/state` (not summary-only projection).

**Out of scope (this amendment)**

- Per-skill trajectory chart redesign (see `learner-trajectory-api.md` §v1.2 — may merge with Skills tab later).
- Skill breakdown column on `/learners` roster L0 (remains hidden per §2.1).
- New backend fields or aggregation logic.

**Decisions `/decisions`** — *"What decisions were emitted?"*
- **L0:** `DataTable` default columns (time, type w/ `DecisionBadge`, rule truncated, learner) + filter bar (org/learner/time). Row → **L1** Sheet peek → "Open trace" → **L2** `/decisions/[id]`.
- **Decision L1 Sheet payload (shared by Overview + Decisions):** header keeps the plain-language `educator_summary` for continuity, then a **Technical detail** section carrying `matched_rule_id` (mono), evaluated-fields summary, and the rationale excerpt (`font-mono`) — i.e. the Sheet is the technical/audit tier that the educator-first L0 table defers to (§2.1). Sole footer CTA: "Open trace" → L2.

**Decision detail `/decisions/[id]` (L2)** — compliance trust view: decision header, rationale block (`font-mono`), evaluated-thresholds table (field/op/threshold/actual/pass), collapsible **L3** state snapshot + rule condition (`JsonViewer`, collapsed by default), **Export JSON** (sole primary CTA).

**Signals `/signals`** — *"Is ingestion healthy?"*
- **L0:** `DataTable` default columns (time, source, schema, outcome chip). Outcome filter (accepted/duplicate/rejected); cursor pagination.
- **Upload entry (normative):** `PageHeader` primary action **Upload signals** → `/signals/upload` (discoverable; not a sidebar item — design restraint).
- Rejected rows: **L1 inline expand** (single row accordion) for reason code + field path — not a Sheet (lightweight exception). Full signal payload → future detail route if needed; do not inline JSON in the table body.

**Signal upload `/signals/upload`** — *"How do I bulk-ingest signals?"* (control-plane write; see §15)
- **Wizard stepper (normative):** Upload → Map → Validate → Review → Done — explicit progression; no auto-commit.
- **Upload step:** accessible dropzone (JSON, CSV, XLSX); parse client-side with row/size caps.
- **Map step:** column mappers to SignalEnvelope fields (`autoMap` heuristics); `org_id` proxy-injected (not collected).
- **Validate step:** per-row client validation + optional preflight dry-run (when `CONTROL_LAYER_ADMIN_API_KEY` is set). PII-blocking verdict disables commit. Per-row projected outcomes via `IngestionOutcomeChip`; field-level errors inline.
- **Review + Done:** explicit commit confirmation; bounded-concurrency `POST /v1/signals`; outcome summary + rejections export; link to `/signals` ingestion log to verify.

**Signal upload implementation notes (2026-06-24, grounded in `dashboard/`):**

- **Route + wizard:** `dashboard/app/(dashboard)/signals/upload/` (`UploadWizard` + step components); entry from `/signals` `PageHeader` **Upload signals** button (not a sidebar item).
- **Parse caps:** `MAX_UPLOAD_ROWS = 5000`, `MAX_UPLOAD_BYTES = 5 MiB` (`dashboard/lib/upload/parse.ts`).
- **Commit:** `commitSignals()` posts row-by-row to `/v1/signals` with default concurrency **5** (`dashboard/lib/upload/commit.ts`); preflight via `/api/preflight` when admin key is configured.
- **Done step:** outcome grid (accepted/duplicate/rejected), optional rejections CSV download, **View ingestion log** → `/signals`, **Upload another file** restart.
- **Verification:** unit tests in `dashboard/lib/upload/__tests__/`; e2e `UPL-E2E-001` in `dashboard/e2e/signal-upload.spec.ts`.

**Reports `/reports`** — *"What are program-level outcomes?"*
- Program metrics cards (≤6) + export actions (CSV/JSON). Honors read-only de-identified export contracts. No learner-level drill-down on this page — link out to Learners/Decisions routes instead.

---

## 9. Component Strategy & Catalog

### 9.1 shadcn/ui primitives (install)
`sidebar, breadcrumb, button, card, badge, table, tabs, sheet, dialog, dropdown-menu, select, combobox, input, tooltip, skeleton, alert, separator, chart, sonner (toast), scroll-area, avatar`.

### 9.2 App components (built on primitives)
| Component | File | Responsibility |
|-----------|------|----------------|
| `AppSidebar` | `components/layout/app-sidebar.tsx` | Brand + `NavMain` + `NavSecondary` + `NavUser` |
| `SiteHeader` | `components/layout/site-header.tsx` | Breadcrumbs, org switcher, refresh, theme, ⌘K |
| `NavMain` / `NavSecondary` / `NavUser` | `components/layout/nav-*.tsx` | Nav groups (active route highlighting) |
| `PageHeader` | `components/layout/page-header.tsx` | Title + description + slot for primary action |
| `SectionCards` / `StatCard` | `components/dashboard/section-cards.tsx` | KPI grid + single metric card w/ delta |
| `TrendChart` | `components/dashboard/trend-chart.tsx` | Interactive area chart (shadcn `chart`) |
| `DataTable` | `components/data-table/data-table.tsx` | Generic TanStack Table (sort/filter/paginate/row-action); column defs per feature |
| `DetailSheet` | `components/shared/detail-sheet.tsx` | L1 peek wrapper: header slot, scroll body, **single** footer CTA; focus trap; preserves list context |
| `SheetSection` | `components/shared/sheet-section.tsx` | Label + compact field list for peek payloads (avoids nested cards) |
| `DrillDownLink` | `components/shared/drill-down-link.tsx` | Consistent "Open full view" / "Open trace" footer button + optional `ArrowRight` |
| `LearnerDetailSheet` | `app/(dashboard)/learners/_components/learner-detail-sheet.tsx` | Learner peek payload (§8.1) on `DetailSheet`: summary, current state, recent signals/decisions, "Open full view" CTA |
| `JsonViewer` | `components/shared/json-viewer.tsx` | Collapsible, `font-mono`, copy button |
| `StatusBadge` family | `components/shared/{decision-badge,urgency-badge,progress-badge}.tsx` | Reuse existing 8P3P badges (icon + token color + label) |
| `LearnerCard` | `components/shared/learner-card.tsx` | Reuse existing |
| `EmptyState` / `ErrorState` / `LoadingState` | `components/states/*.tsx` | Standardized non-data states (§10) |
| `ThemeToggle` / `OrgSwitcher` / `RefreshButton` | `components/shared/*.tsx` | Header utilities |

### 9.3 Architecture & naming conventions
- **Files:** kebab-case (`app-sidebar.tsx`, `data-table.tsx`) — matches shadcn output. **Components:** PascalCase. **Hooks:** `use-*.ts`. **Routes:** kebab-case segments.
- **Server vs client:** pages/layouts are Server Components; mark interactive leaves `"use client"` (tables, charts, toggles, forms). Data fetching for first paint happens server-side (route handlers / RSC) where possible; TanStack Query owns client polling/refetch. Per vercel-react-best-practices: parallelize fetches, `Suspense` boundaries per section, no client API key.
- **Feature co-location:** column defs + feature hooks live beside their page (`app/(dashboard)/decisions/_components`, `_hooks`), shared things in top-level `components/`.
- **No barrel files** for icon/UI imports (bundle-size rule).

---

## 10. State Patterns (loading / empty / error) — standardized

Every data section uses the same three components (no ad-hoc handling):
| State | Component | Pattern |
|-------|-----------|---------|
| Loading | `LoadingState` | shadcn `Skeleton` sized to final layout (table rows / card grid); no spinner-only. Prefer `Suspense` fallback. |
| Empty | `EmptyState` | Icon + one-line message + optional action. Per-surface copy (e.g. "All caught up — no learners need attention.", "No signals yet."). |
| Error | `ErrorState` | `Alert` (destructive) with friendly message + HTTP status + **Retry** (`refetch()`); never leaks key/URL/stack. Maps `dashboard_upstream_unavailable` → "Service unavailable, retrying." |

TanStack Query guards: use `isLoading`, `isError`, and `data.length === 0` as distinct branches.

---

## 11. Responsive Behavior

| Breakpoint | Sidebar | Section cards | Tables | Chart |
|------------|---------|---------------|--------|-------|
| `< md` (mobile) | Off-canvas `Sheet` (hamburger in header) | 1 col | Horizontal scroll **or** stacked card rows for key columns | Full-width, reduced height |
| `md–lg` (tablet) | Icon rail (collapsible) | 2 col | Scrollable table | Standard |
| `≥ xl` (desktop) | Expanded inset sidebar | 4 col | Full table | Standard |

- Sidebar collapse state persists (cookie). Drill-down `Sheet` is full-width on mobile, ~480px on desktop.
- Touch targets ≥ 44px; tables degrade gracefully (priority columns first).

---

## 12. Accessibility (WCAG 2.1 AA)
Semantic landmarks (`main`, `nav`), labeled controls, visible focus (`--ring`), badges carry icon+text (not color alone), `Sheet`/`Dialog` focus trap + ESC, charts have accessible summaries/data tables, `prefers-reduced-motion` honored, contrast verified in light+dark.

---

## 13. File / Folder Structure (new dashboard)

```
dashboard/                                  # Next.js 15 App Router app (see migration spec)
├── app/
│   ├── layout.tsx                          # html, fonts (Geist), ThemeProvider
│   ├── globals.css                         # 8P3P tokens (extend decision-panel-ui.md) + Geist vars
│   ├── (auth)/
│   │   ├── login/route.ts
│   │   └── logout/route.ts
│   ├── (dashboard)/
│   │   ├── layout.tsx                       # app shell (SidebarProvider/Inset + SiteHeader)
│   │   ├── page.tsx                         # Overview
│   │   ├── attention/page.tsx
│   │   ├── learners/page.tsx
│   │   ├── learners/[ref]/page.tsx          # tabs: overview/skills/state/trajectory/struggles
│   │   ├── decisions/page.tsx
│   │   ├── decisions/[id]/page.tsx
│   │   ├── signals/page.tsx
│   │   ├── signals/upload/
│   │   │   ├── page.tsx                       # bulk signal ingest wizard
│   │   │   └── _components/                   # upload-wizard, step-upload/map/validate/review/done
│   │   ├── reports/page.tsx
│   │   └── settings/page.tsx
│   ├── api/control/[...path]/route.ts       # server proxy (holds x-api-key)
│   └── api/preflight/route.ts               # scoped preflight proxy (admin key, server-only)
├── components/
│   ├── layout/        # app-sidebar, site-header, nav-*, page-header
│   ├── dashboard/     # section-cards, stat-card, trend-chart
│   ├── data-table/    # data-table + parts
│   ├── shared/        # detail-sheet, sheet-section, drill-down-link, json-viewer, *-badge, learner-card, theme-toggle, org-switcher
│   ├── states/        # empty-state, error-state, loading-state
│   └── ui/            # shadcn primitives
├── hooks/             # use-learners, use-decisions, use-signals, use-learner-summary, ...
├── lib/
│   ├── api/           # client, query-client, errors, fetch-overview-data
│   ├── upload/        # parse, mapping, validate, preflight, commit (bulk ingest)
│   └── …              # score-levels, rationale-builder, utils (cn), constants, org-id, env
├── middleware.ts      # passphrase gate (pilot) → Cognito (prod)
└── e2e/               # Playwright specs
```

---

## 14. Phased Implementation Checklist

**Phase A — Foundation (no AWS)**
- [x] Scaffold Next.js 15 app shell; install shadcn primitives (§9.1); `npx shadcn add dashboard-01` as scaffolding reference.
- [x] Port 8P3P tokens into `globals.css`; wire Geist Sans/Mono via `geist` package; ThemeProvider + persisted theme (**light default**, SSR-safe, no flash).
- [x] Build `AppSidebar`, `SiteHeader`, `NavMain/Secondary/User`, `PageHeader` per §5/§7.
- [x] Build standardized `EmptyState`/`ErrorState`/`LoadingState` (§10).

**Phase B — Core surfaces**
- [x] Overview (`SectionCards` + `TrendChart` + `RecentDecisionsTable`) — **L0 only**; row → decision L1 Sheet; no Attention queue duplication (§8).
- [x] Reusable typed `DataTable` (sort/filter/paginate/row-action) with **default column sets** per §2.1; hidden columns via drill-down only.
- [x] `DetailSheet` + `SheetSection` + `DrillDownLink` implementing L1 peek pattern (§2.1, §6).
- [x] Learners roster + Learner detail (state **version drill-down**, trajectory, struggles/progress); Sheet capped at 3 recent signals/decisions (§8.1).
- [x] Decisions stream + Decision trace (`JsonViewer` collapsed by default, thresholds table, export).
- [x] Signals ingestion log (outcome filter + rejection **row expand** drill-down, not Sheet).
- [x] Attention queue (educator triage + Approve/Reject client-side) — **no KPI cards** on this route.

**Phase C — Polish & scale**
- [x] Reports page (program metrics + export) — metrics cap ≤6 cards.
- [x] Overview freshness chip (`fetchedAt` from `getOverviewData`) + global Refresh calls `router.refresh()` for RSC sections.
- [x] Overview trend chart local-date bucketing (`toLocalDateKey`) aligned with educator-facing timestamps.
- [x] **D1** — Overview recent-decisions table educator-first columns (`Time·Type·Learner·Summary`); move `matched_rule_id` + rationale excerpt into the decision L1 Sheet (technical tier).
- [x] **D3** — Declutter KPI cards (one value + delta + status, no prose) and make all 4 cards clickable to a drill target (`section-cards.tsx`, `stat-card.tsx`; Pending drills to `/attention?from=pending`).
- [x] **D2** — Cross-filter "Sync filters" toggle (default OFF) per §2.1 cross-filter doctrine (consolidate RSC sections → `OverviewSurfaces` server fetch + `OverviewSyncProvider` client wrapper; see [`overview-cross-filter-sync.md`](overview-cross-filter-sync.md) § Architecture).
- [x] Signal upload wizard (`/signals/upload`) — dropzone, field mapping, client validation, optional preflight dry-run, bounded-concurrency commit to `POST /v1/signals` (see §8 implementation notes).
- [ ] **D5** — Persona surfaces: dual-code login, nav/route/tab allowlists, educator Overview scrub, compliance-only KPI filter (spec §2.2; impl [`.cursor/plans/dashboard-persona-enforcement.plan.md`](../../.cursor/plans/dashboard-persona-enforcement.plan.md) PE-001–PE-008).
- [ ] Command palette (`⌘K`), org switcher multi-org behavior, Help external docs link, breadcrumbs polish.
- [ ] Responsive passes (mobile sidebar `Sheet`, table degradation, L1 full-width Sheet), a11y audit (WCAG AA), reduced-motion.
- [ ] **UX gate:** Playwright drill-down paths green in CI; formal educator walkthrough sign-off.

---

## 15. Out of Scope (design)
- Control-plane **mutations** beyond pilot Approve/Reject and **authenticated bulk signal ingest** (`/signals/upload` → `POST /v1/signals` + optional preflight dry-run). General inspection surfaces remain read-only.
- Swagger `/docs` restyle (stays on Fastify).
- Cognito UI states (defined in migration spec Phase 5).
- Multi-theme/branding-per-tenant; native mobile app.

---

## 16. References
- Baseline: [shadcn dashboard-01](https://ui.shadcn.com/blocks#dashboard-01)
- Tokens & product panels: `docs/specs/decision-panel-ui.md`
- Inspection surfaces: `docs/specs/inspection-panels.md`, `docs/specs/inspection-api.md`, `docs/specs/receipts-api.md`
- Hosting/execution: `docs/specs/nextjs-amplify-dashboard-migration.md`
- Persona auth (dual codes): `docs/specs/dashboard-passphrase-gate.md` § Dual access codes
- Perf patterns: `.agents/skills/vercel-react-best-practices/`
- UX/UI quality bar (data-driven dashboards, drill-down, anti-clutter): `.agents/skills/frontend-design/SKILL.md` — apply **refined minimalism** (restraint, hierarchy, whitespace) not decorative maximalism.

---

*Created: 2026-06-12 | Updated: 2026-06-29 (§2.2 D5 Persona surfaces — normative role × route map; §5.1 persona column; §14 D5 checklist item) | Prior: 2026-06-25 (§14: D2 cross-filter [x]; `OverviewSurfaces` + `OverviewSyncProvider`); 2026-06-24 (signal upload wizard [x]); 2026-06-22 (D1/D2/D3). Design-only. Execution & hosting: nextjs-amplify-dashboard-migration.md. Tokens: decision-panel-ui.md.*
