# Dashboard Design Requirements

> The design source of truth for the redesigned 8P3P control-layer dashboard (Next.js + shadcn/ui on AWS Amplify). Defines layout, information architecture, navigation, components, states, responsive behavior, visual language, and UX principles. **Execution/hosting decisions live in `docs/specs/nextjs-amplify-dashboard-migration.md`** — this document is design-only and that one references it.

---

## 1. Overview & Goals

The current dashboard is two disconnected surfaces: the educator **Decision Panel** (4 product panels) and the developer **Inspection Panels** (4 read-only `/inspect` panels). The redesign unifies them into **one coherent product** with a sidebar-driven app shell, clear page hierarchy, and a consistent design system.

**Goals**
- One navigation model for two audiences (educators; integration/compliance) without forking the UI.
- Strong, Vercel-style product UX: calm, data-dense, fast, keyboard-friendly, dark-mode-first.
- Implementation-ready with shadcn/ui + Tailwind v4 + Next.js App Router — no over-engineering.
- A scalable component system the future `8p3p-admin` platform can inherit.

**Audiences & primary jobs**
| Audience | Primary job | Lands on |
|----------|-------------|----------|
| Educator / school staff | Triage who needs help, review recommended actions, confirm progress | Overview → Attention |
| Integration engineer | Verify signals are arriving and parsing | Signals |
| Compliance / reviewer | Audit a decision's provenance end-to-end | Decisions → Decision detail |

---

## 2. UX Principles (normative)

1. **Progressive disclosure.** Summary → list → detail. Drill-down opens a right-side `Sheet` (peek) or a dedicated route (deep link). Never dump raw JSON at the top level.
2. **Action-oriented triage.** The educator's actionable queue (Attention) is one click from landing and is the only surface with write-ish actions (Approve/Reject, client-side in pilot).
3. **Read-only truth layer.** Inspection surfaces (Signals, State, Decision Trace) are strictly read-only — no mutations, preserving the `inspection-panels.md` doctrine.
4. **One consistent system, two densities.** Educator views = generous spacing, friendly copy. Inspection views = denser tables + `font-mono` for IDs/JSON. Same tokens, same components — only spacing/typography density changes.
5. **Security by default.** The browser never holds the API key; all data flows through the server-side proxy (`/api/control/*`). No "enter your API key" inputs in the redesigned UI (removes the legacy inspection-panel key prompt).
6. **Honest states.** Every data view implements distinct loading, empty, and error states (no blank screens, no spinner-only).
7. **Fast perceived load.** Use Next.js streaming + `Suspense` per section; skeletons sized to final content to avoid layout shift.
8. **Accessible.** WCAG 2.1 AA: keyboard nav, focus-visible rings (already in tokens via `--ring`), semantic landmarks, color never the only signal (pair color with icon/label on badges).

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
Build on the **existing 8P3P token set** already defined in `docs/specs/decision-panel-ui.md` (shadcn v4 `base-nova`, `oklch`, dark mode, `--brand-accent-*`, `--urgency-*`, `--status-*`, `--progress-*`). **Do not redefine tokens here** — extend that block. This keeps Swagger, dashboard, and future admin UI on one palette.

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
- Neutral `oklch` base carries the UI; **accent sparingly**. Status/urgency/progress badges use `--status-*` / `--urgency-*` / `--progress-*` only (never raw Tailwind colors), each paired with a Lucide icon + text label (a11y: color is never the sole signal).
- Dark mode is first-class (tokens already defined); default theme follows system, user-toggleable, persisted (cookie, SSR-safe to avoid flash).

### 4.5 Motion (restraint)
- One orchestrated entrance per page (staggered section reveal via `tw-animate-css`), `Sheet`/`Dialog` transitions, and table row hover. No scattered micro-animations. Respect `prefers-reduced-motion`.

---

## 5. Information Architecture & Navigation Model

### 5.1 Sidebar — `nav-main` (primary)
| Item | Icon (Lucide) | Route | Replaces legacy |
|------|---------------|-------|-----------------|
| Overview | `LayoutDashboard` | `/` | — (new home) |
| Attention | `AlertCircle` | `/attention` | Decision Panel: "Who Needs Help Now" + "What Should Happen Next" |
| Learners | `Users` | `/learners` | State Viewer + "What Do They Need Help With" + "Did the Support Work" |
| Decisions | `GitBranch` | `/decisions` | Decision Stream + Decision Trace |
| Signals | `Radio` | `/signals` | Signal Intake (ingestion log) |
| Reports | `BarChart3` | `/reports` | program-metrics / research export surfaces |

### 5.2 Sidebar — `nav-secondary` (utility, bottom)
| Item | Icon | Target |
|------|------|--------|
| API Docs | `BookOpen` | External link to Fastify `/docs` (Swagger) |
| Settings | `Settings` | `/settings` |
| Help | `LifeBuoy` | docs/guide link |

### 5.3 Sidebar footer — `nav-user`
Org context (org name + environment badge), theme toggle, and session control: **Log out** (passphrase session in pilot; Cognito user menu in production — see migration spec Phase 5).

### 5.4 Topbar (`site-header`)
- `SidebarTrigger` (collapse) · breadcrumbs (section → detail) · spacer
- **Org switcher** (`Select`/`Combobox`) — hidden when single-org pinned via `CONTROL_LAYER_ORG_ID`
- **Global refresh** (`RefreshCw`, invalidates active TanStack queries)
- **Command palette** trigger (`⌘K`) for quick learner/decision lookup (progressive enhancement; Phase 2)
- **Theme toggle**

---

## 6. Page Hierarchy & Routes

| Route | Page | Purpose | Data (via `/api/control/*`) |
|-------|------|---------|------------------------------|
| `/` | Overview | KPIs + trend chart + recent decisions table | `/v1/state/list`, `/v1/decisions` (recent), `/v1/ingestion` (counts) |
| `/attention` | Attention queue | Triage: high-urgency learners + actionable decisions (Approve/Reject) | `/v1/learners/:ref/summary` |
| `/learners` | Learner roster | Searchable/sortable learner table | `/v1/state/list` |
| `/learners/[ref]` | Learner detail | State viewer (**version drill-down**), trajectory, struggles, progress | `/v1/state`, `/v1/state?version=n`, `/v1/learners/:ref/summary` |
| `/decisions` | Decision stream | Filterable audit feed of receipts | `/v1/receipts` |
| `/decisions/[id]` | Decision trace | Full provenance: rationale, thresholds, state snapshot, rule condition, JSON export | `/v1/decisions` |
| `/signals` | Signal intake | Ingestion log w/ outcome filter + rejection drill-down | `/v1/ingestion` |
| `/reports` | Reports | Program metrics, exports | `/v1/admin/program-metrics`, export endpoints |
| `/settings` | Settings | Org/env info, theme, (later) user/Cognito | local + `/v1/policies` (read) |
| `/login`, `/logout` | Auth | Passphrase gate (pilot) → Cognito (prod) | per migration spec |

Drill-down convention: list rows open a **`Sheet`** (peek) by default; "Open full view" navigates to the detail **route** (deep-linkable, shareable).

---

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

**Overview `/`** — the dashboard-01 adaptation.
- `SectionCards` (KPIs, 4-up → 2-up → 1-up): **Needs attention** (count, Δ vs yesterday), **Pending decisions**, **Signals today** (accepted/rejected split), **Improving learners**.
- `TrendChart` (area, interactive range 7/30/90d): decisions by type over time (toggle to mastery trend).
- `RecentDecisionsTable` (reusable `DataTable`, last 20) → row opens decision `Sheet`.

**Attention `/attention`** — educator triage. Two stacked regions: **Who needs help now** (ranked `LearnerCard` list by urgency) and **What should happen next** (decision review cards with `Approve`/`Reject`, client-side localStorage in pilot per decision-panel-ui.md). Empty = "All caught up."

**Learners `/learners`** — `DataTable`: learner reference, current level, trend (`ProgressBadge`), last activity, open. Search + filters (declining only, by skill). Row → `Sheet` peek (`LearnerDetailSheet`, §8.1) → "Open full view" → `/learners/[ref]`.

### 8.1 Learner drill-down `Sheet` (peek payload)
Clicking a learner row opens the right-side `DetailSheet` (read-only, ~480px desktop / full-width mobile per §11). It carries **summary-level traceability only** — honoring progressive disclosure (§2.1: summary → list → detail); deep history stays on the route. Contents:
- **Header:** learner reference + current `ProgressBadge` (level + trend).
- **Current traceability state:** latest canonical state fields (current version label, key mastery/struggle indicators). Not the full version history.
- **Recent signals:** last N ingested signals (time, source, outcome chip) — preview, not the full log.
- **Recent decisions:** last few receipts with `DecisionBadge`.
- **Primary CTA:** "Open full view" → `/learners/[ref]` for the deep, deep-linkable detail.

Everything heavier (state **version drill-down**, full **signal history**, trajectory, struggles/progress) lives on the route tabs below — never crammed into the peek.

**Learner detail `/learners/[ref]`** — tabs: **Overview** (summary, recent decisions), **State** (canonical fields + raw JSON, **version selector** for historical drill-down), **Trajectory** (per-skill trend), **Struggles & progress** ("What Do They Need Help With" + "Did the Support Work" merged).

**Decisions `/decisions`** — `DataTable` of receipts (time, type w/ `DecisionBadge`, rule, policy, learner) + filter bar (org/learner/time). Row → `Sheet` peek → "Open trace" → `/decisions/[id]`.

**Decision detail `/decisions/[id]`** — the compliance trust view: decision header, rationale block (`font-mono`), evaluated-thresholds table (field/op/threshold/actual/pass), collapsible state snapshot + rule condition (`JsonViewer`), **Export JSON**.

**Signals `/signals`** — `DataTable` ingestion log (time, signal id, source, schema, outcome chip). Outcome filter (accepted/duplicate/rejected); rejected rows expand to reason code + field path. Cursor pagination.

**Reports `/reports`** — program metrics cards + export actions (CSV/JSON). Honors read-only de-identified export contracts.

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
| `DetailSheet` | `components/shared/detail-sheet.tsx` | Right-side drill-down peek wrapper (generic) |
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
│   │   ├── learners/[ref]/page.tsx          # tabs: overview/state/trajectory/progress
│   │   ├── decisions/page.tsx
│   │   ├── decisions/[id]/page.tsx
│   │   ├── signals/page.tsx
│   │   ├── reports/page.tsx
│   │   └── settings/page.tsx
│   └── api/control/[...path]/route.ts       # server proxy (holds x-api-key)
├── components/
│   ├── layout/        # app-sidebar, site-header, nav-*, page-header
│   ├── dashboard/     # section-cards, stat-card, trend-chart
│   ├── data-table/    # data-table + parts
│   ├── shared/        # detail-sheet, json-viewer, *-badge, learner-card, theme-toggle, org-switcher
│   ├── states/        # empty-state, error-state, loading-state
│   └── ui/            # shadcn primitives
├── hooks/             # use-learners, use-decisions, use-signals, use-learner-summary, ...
├── lib/               # api (client/query-client), score-levels, rationale-builder, utils (cn), constants
├── middleware.ts      # passphrase gate (pilot) → Cognito (prod)
└── e2e/               # Playwright specs
```

---

## 14. Phased Implementation Checklist

**Phase A — Foundation (no AWS)**
- [ ] Scaffold Next.js 15 app shell; install shadcn primitives (§9.1); `npx shadcn add dashboard-01` as scaffolding reference.
- [ ] Port 8P3P tokens into `globals.css`; wire Geist Sans/Mono; ThemeProvider + persisted dark mode (no flash).
- [ ] Build `AppSidebar`, `SiteHeader`, `NavMain/Secondary/User`, `PageHeader` per §5/§7.
- [ ] Build standardized `EmptyState`/`ErrorState`/`LoadingState` (§10).

**Phase B — Core surfaces**
- [ ] Overview (`SectionCards` + `TrendChart` + `RecentDecisionsTable`).
- [ ] Reusable typed `DataTable` (sort/filter/paginate/row-action).
- [ ] Learners roster + Learner detail (state **version drill-down**, trajectory, struggles/progress).
- [ ] Decisions stream + Decision trace (`JsonViewer`, thresholds table, export).
- [ ] Signals ingestion log (outcome filter + rejection drill-down).
- [ ] Attention queue (educator triage + Approve/Reject client-side).

**Phase C — Polish & scale**
- [ ] Reports page (program metrics + export).
- [ ] Command palette (`⌘K`), org switcher behavior, breadcrumbs.
- [ ] Responsive passes (mobile sidebar `Sheet`, table degradation), a11y audit (WCAG AA), reduced-motion.
- [ ] Playwright e2e for each surface; visual responsive checks.

---

## 15. Out of Scope (design)
- Control-plane **mutations** beyond pilot Approve/Reject (inspection stays read-only).
- Swagger `/docs` restyle (stays on Fastify).
- Cognito UI states (defined in migration spec Phase 5).
- Multi-theme/branding-per-tenant; native mobile app.

---

## 16. References
- Baseline: [shadcn dashboard-01](https://ui.shadcn.com/blocks#dashboard-01)
- Tokens & product panels: `docs/specs/decision-panel-ui.md`
- Inspection surfaces: `docs/specs/inspection-panels.md`, `docs/specs/inspection-api.md`, `docs/specs/receipts-api.md`
- Hosting/execution: `docs/specs/nextjs-amplify-dashboard-migration.md`
- Perf patterns: `.agents/skills/vercel-react-best-practices/`

---

*Created: 2026-06-12 | Design-only. Execution & hosting: nextjs-amplify-dashboard-migration.md. Tokens: decision-panel-ui.md.*
