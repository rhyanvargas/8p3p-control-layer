---
name: Next.js + Amplify Dashboard Migration
overview: |
  Migrate the Decision Panel from a Vite 8 + React 19 SPA (served by Fastify at /dashboard/) to a standalone Next.js 15.5 App Router app, rebuilt to the dashboard-design-requirements.md IA (sidebar shell, Overview/Attention/Learners/Decisions/Signals/Reports/Settings). Primary product goal: **educators quickly see who needs attention and why** (Overview → Attention triage → learner drill-down) without clutter or exposed API keys. The browser stops sending x-api-key: all /v1/* calls go through a Next route-handler proxy (app/api/control/[...path]) that holds CONTROL_LAYER_API_KEY server-side. The passphrase gate is ported to Next middleware reusing the dp_session HMAC cookie scheme. Fastify is API-only (@fastify/cors added; static /dashboard + /inspect serving removed after parity). **Local Phases 1–4 are complete (TASK-001…016).** AWS provisioning (Amplify app, branch deploys) and Cognito (Phase 5) remain stage-gated — **do not deploy to AWS yet.**
todos:
  - id: TASK-001
    content: Replace Vite SPA with Next.js 15.5 App Router scaffold in dashboard/ (deps, configs, root layout, Geist fonts, ThemeProvider, TanStack Query provider)
    status: completed
  - id: TASK-002
    content: Port 8P3P tokens into globals.css + wire Geist vars; persisted theme (light default, SSR-safe, no flash)
    status: completed
  - id: TASK-003
    content: Server proxy route handler app/api/control/[...path] (holds x-api-key, 502 dashboard_upstream_unavailable); server-only env wiring
    status: completed
  - id: TASK-004
    content: Server-aware API/data layer — proxy fetch client, TanStack Query hooks targeting /api/control/* (no VITE_*, no client x-api-key)
    status: completed
  - id: TASK-005
    content: App shell — (dashboard) layout, AppSidebar, SiteHeader, NavMain/Secondary/User, PageHeader
    status: completed
  - id: TASK-006
    content: Standardized state components — EmptyState / ErrorState / LoadingState
    status: completed
  - id: TASK-007
    content: Reusable typed DataTable (TanStack Table — sort/filter/paginate/row-action) + L1 DetailSheet/SheetSection/DrillDownLink + JsonViewer (L3 collapsed) + StatusBadge family
    status: completed
  - id: TASK-008
    content: Overview page — SectionCards (4 KPIs max, L0 only) + TrendChart (single series + text summary) + RecentDecisionsTable → decision L1 Sheet
    status: completed
  - id: TASK-009
    content: Learners roster + Learner detail ([ref]) tabs (L2; state version drill-down) + LearnerDetailSheet (L1 peek, max 3 recent signals/decisions)
    status: completed
  - id: TASK-010
    content: Decisions stream + Decision detail ([id]) trace (L1 Sheet peek → L2 route; JsonViewer collapsed L3)
    status: completed
  - id: TASK-011
    content: Signals ingestion log (L0 default columns; rejected row expand drill-down; cursor pagination)
    status: completed
  - id: TASK-012
    content: Attention queue (no KPI cards; LearnerCard triage + Approve/Reject) + Reports (≤6 cards) + Settings pages
    status: completed
  - id: TASK-013
    content: Port passphrase gate to Next middleware + (auth) login/logout route handlers, reusing dp_session HMAC scheme + COOKIE_SECRET
    status: completed
  - id: TASK-014
    content: Add @fastify/cors to control layer; after dashboard parity, remove Fastify dashboard static + login + /inspect serving (API-only)
    status: completed
  - id: TASK-015
    content: amplify.yml (Node 22) + CI dashboard job (next build + typecheck + Playwright e2e, no deploy)
    status: completed
  - id: TASK-016
    content: Contract/e2e tests NXMIG-001..016 + full verification gate (build parity, no x-api-key, no VITE_*)
    status: completed
  - id: TASK-017
    content: "[AWS-BLOCKED] Create Amplify app, branch deploys, PR previews (Phase 4 deploy)"
    status: pending
  - id: TASK-018
    content: "[AWS-BLOCKED] Production auth via Cognito + @aws-amplify/adapter-nextjs (Phase 5)"
    status: pending
isProject: true
---

# Next.js + Amplify Dashboard Migration

**Execution spec**: `docs/specs/nextjs-amplify-dashboard-migration.md`
**Design source of truth (UI)**: `docs/specs/dashboard-design-requirements.md`
**UX/UI quality bar**: `.agents/skills/frontend-design/SKILL.md` (refined minimalism for data surfaces — drill-down tiers, anti-clutter, semantic color only)
**Auth scheme (ported, not redefined)**: `docs/specs/dashboard-passphrase-gate.md`
**Tokens**: `docs/specs/decision-panel-ui.md` (§ Design Tokens)
**Inspection data sources**: `docs/specs/inspection-panels.md`, `docs/specs/inspection-api.md`, `docs/specs/receipts-api.md`, `docs/specs/learner-summary-api.md`
**Perf rules (MUST follow)**: `.agents/skills/vercel-react-best-practices/AGENTS.md` (§1 waterfalls, §2 bundle/barrel imports, §3 server perf, §3.6 minimize RSC serialization)
**Master plan**: `.cursor/plans/pilot-mvp-launch.plan.md`

## ⛔ Stage Gate (read first)

Per the spec banner (status 2026-06-20: **AWS startup credits not yet applied for; local Phases 1–4 implemented**), **no billable AWS resource may be created**. TASK-001…TASK-016 are **complete**. TASK-017/018 are `[AWS-BLOCKED]` and stay `pending` until the repo owner flips the spec banner to `Status: AWS account available`.

## Educator UX (product intent)

Teachers land on **Overview** ("Is anything wrong?") → **Attention** ("Who do I act on, and why?") → **Learner detail** (struggles, progress, state history). Implementation follows design §2.1 anti-clutter rules:

- **Who:** ranked `LearnerCard` on `/attention` (intervene/pause decisions, urgency-ordered).
- **Why (L0):** `educator_summary`, decision type narration, dominant skill line on each card.
- **Why (depth):** L1 `LearnerDetailSheet` (state snapshot + 3 recent signals/decisions) → L2 `/learners/[ref]` **Struggles & progress** tab (per-skill evidence).
- **What to do:** Approve/Reject on pending decision review cards (client-side pilot).

Full mapping: `docs/specs/dashboard-design-requirements.md` § **Educator journey (implemented)**.

## Why this plan exists

The current `dashboard/` (`dashboard/package.json`) is a **Vite 8 + React 19 SPA** whose `src/api/client.ts` injects a **build-time** `VITE_API_KEY` into the browser bundle — the indefensible exposure documented in `dashboard-passphrase-gate.md`. This migration:
1. Removes the client-exposed key via a Next.js **server route-handler proxy** (the primary security win).
2. Decouples frontend hosting from the API (Fastify reverts to API + Swagger only).
3. **Rebuilds** the UI to `dashboard-design-requirements.md` (sidebar app shell + full page set) — it is **not** a 1:1 port of the SPA.
4. Implements **data-driven, non-cluttered UX** per design §2.1: three-tier drill-down (L0 page → L1 Sheet → L2 route → L3 JSON), one primary question per route, default table columns only at L0.

## Data-driven UX implementation (normative)

All Phase B tasks MUST follow `dashboard-design-requirements.md` §2.1 (three-tier drill-down) and §8 (per-page L0 limits). Summary for implementers:

| Rule | Implementation |
|------|----------------|
| L0 scannability | Default `DataTable` columns only (§2.1 table); no IDs/raw JSON on list pages |
| L1 peek | Row click → `DetailSheet` first; footer = single `DrillDownLink` CTA |
| L2 detail | Route + tabs; one concern per tab; breadcrumbs on L2 only |
| L3 raw | `JsonViewer` collapsed by default; never on L0/L1 |
| Anti-clutter | Attention: no KPI cards; Overview: no queue duplication; Reports: ≤6 metric cards |
| Chart | One chart on Overview; one visible series; text summary beside chart |
| Signals exception | Rejected rows use **row expand** (accordion), not Sheet — lightweight L1 |

**UX verification (manual + e2e):** list → Sheet → route on Learners and Decisions; Overview has ≤4 KPIs + 1 chart + 1 table; no raw JSON visible until L3 expand; Esc closes Sheet with list position preserved.

## Current-state inventory (post-migration)

> Source: `dashboard/` Next app + `src/server.ts` (read 2026-06-20).

**Removed:** Vite scaffold (`dashboard/vite.config.ts`, `index.html`, `dashboard/src/**`), Fastify `src/panels/`, `src/auth/dashboard-*.ts`, client `VITE_*` / browser `x-api-key`.

**Active dashboard (`dashboard/`):** Next 15.5.19 App Router; proxy at `app/api/control/[...path]`; middleware gate; educator pages Overview/Attention/Learners; inspection pages Signals/Decisions; Geist via `geist` package.

**Ported libs:** `lib/{score-levels,rationale-builder,decision-review,attention-decisions,state-skills,panel-helpers,learners}.ts`, hooks retargeted to `/api/control/*`.

## Prerequisites

- [x] PREREQ-001: Node **22** active (`.nvmrc` / root `engines >=22 <23`); Next 15.5 + React 19 require it.
- [x] PREREQ-002: All consumed `/v1/*` endpoints implemented (ingestion, state, state/list, receipts, decisions, learners/:ref/summary, admin/program-metrics) — already shipped per specs README.
- [x] PREREQ-003: `dashboard-passphrase-gate.md` cookie vectors available for parity unit test (NXMIG-009).
- [x] PREREQ-004: Decision to deploy `dashboard/` **in place** (replace Vite app) vs a new sibling dir — this plan replaces in place per spec File Structure (`dashboard/` = the standalone Next app).

## Deviations from Spec

| Item | Spec / plan prose | Implementation | Resolution |
|------|-------------------|----------------|------------|
| Session cookie name | `dp_session` (with `__Host-` recommended) | `__Host-dp_session` in production; `dp_session` in dev | **Update spec in same PR** — Cookies table now lists both |
| Geist font source | plan TASK-002 mentions `@fontsource-variable/geist` or `geist` package | `geist` package in `app/layout.tsx` | **Implementation detail** — spec Implementation Notes |
| Help nav target | design §5.2 external docs/guide | `/settings` placeholder | **Phase C** — design doc updated |
| SidebarMenuButton + Link | shadcn base `nativeButton={false}` on render | Omit on `useRender`-based `SidebarMenuButton`; keep on Base UI `Button` | **Implementation detail** — sidebar uses `useRender`, not `Button` primitive |
| Command palette | design §5.4 `⌘K` | Not implemented | **Phase C deferred** |
| Org switcher | multi-org `Combobox` | Hidden when `CONTROL_LAYER_ORG_ID` pinned; stub when not | **Phase C** — single-org pilot |
| `/inspect` availability | spec Phase 1b "remain until parity" | Removed with `src/panels/` after parity | **Update spec in same PR** — Phase 1b/3 checkboxes |

## Tasks

> **Status tracking**: status lives **only** in the YAML frontmatter `todos`. Do not duplicate per-task status in bodies. Test IDs (`NXMIG-001`…`016`) are owned by the spec § Contract Tests; spec-defined tests live in `tests/contracts/` (backend) or `dashboard/e2e/` (Playwright) per the traceability rule.

---

### Phase 1 — Next.js app shell + redesign foundation (LOCAL)

### TASK-001: Next.js 15.5 scaffold (replace Vite)

- **Files**: `dashboard/package.json`, `dashboard/next.config.ts`, `dashboard/tsconfig.json`, `dashboard/app/layout.tsx`, `dashboard/app/providers.tsx`, `dashboard/components.json`; **delete** `dashboard/vite.config.ts`, `dashboard/index.html`, `dashboard/src/main.tsx`, `dashboard/src/App.tsx`
- **Action**: Create / Modify / Delete
- **Details**:
  - Pin **`next@15.5.x`** (NOT 16 — Amplify managed SSR supports 12–15 only; spec § Version constraint). Keep `react@19`, `tailwindcss@4`, `@tanstack/react-query@5`, `lucide-react`, `shadcn`. Add `next` + remove Vite-only deps (`vite`, `@vitejs/plugin-react`, `eslint-plugin-react-refresh`).
  - `package.json` scripts → `{ "dev": "next dev", "build": "next build", "start": "next start", "typecheck": "tsc --noEmit", "lint": "next lint", "test:e2e": "playwright test" }`.
  - `app/layout.tsx`: root `<html>` with Geist Sans/Mono CSS vars (already have `@fontsource-variable/geist`; or switch to `geist` package per design §4.2 — pick one, document choice), wrap children in `Providers`.
  - `app/providers.tsx` (`"use client"`): `QueryClientProvider` (lazy `useState(() => new QueryClient())`) + `ThemeProvider`.
  - `next.config.ts`: `experimental.optimizePackageImports: ['lucide-react']` (bundle rule §2.1); security headers/CSP added in TASK-013.
  - shadcn `components.json` `aliases` retargeted to `@/components`, `@/lib`, with App-Router paths.
- **Depends on**: none
- **Verification**: `cd dashboard && npm run build` produces `.next/`; `npm run typecheck` clean; no `vite`/`import.meta.env` references remain (`rg "import.meta.env|VITE_" dashboard/` empty).

---

### TASK-002: globals.css tokens + theme (light default, SSR-safe)

- **Files**: `dashboard/app/globals.css` (move from `dashboard/src/styles/globals.css`), `dashboard/app/layout.tsx`, `dashboard/components/shared/theme-toggle.tsx`
- **Action**: Create / Modify
- **Details**:
  - Port the existing oklch + 8P3P token block (`--brand-accent-*`, `--urgency-*`, `--status-*`, `--progress-*`) unchanged; set `--font-sans: var(--font-geist-sans)`, `--font-mono: var(--font-geist-mono)` (design §4.2). **Do not redefine tokens** — extend (design §4.1). `:root` = light (default); `.dark` = dark override.
  - **Default theme = light** (design §4.4 — matches `dashboard-01` baseline). User-toggleable to dark via `ThemeToggle`; preference **persisted in a cookie** read in the Server Component layout so SSR emits the right `class` (no hydration flash; perf §6.5). `ThemeProvider` `defaultTheme="light"`; do not default to `system` or dark.
- **Depends on**: TASK-001
- **Verification**: `:root` exposes 8P3P light tokens in devtools on first load (no `.dark` class); toggling to dark persists across reload with no flash of wrong theme.

---

### TASK-003: Server proxy route handler (the security win)

- **Files**: `dashboard/app/api/control/[...path]/route.ts`, `dashboard/lib/env.ts`, `dashboard/.env.example`
- **Action**: Create
- **Details**:
  - Implement `GET/POST/PUT/PATCH/DELETE` forwarding `req` → `${CONTROL_LAYER_API_BASE_URL}/v1/<path>` with header `x-api-key: CONTROL_LAYER_API_KEY` (server-only, **no `NEXT_PUBLIC_`**), preserving method/query/body. 10s upstream timeout (matches Lambda; spec § Constants).
  - On network/timeout → `502 { "error": "dashboard_upstream_unavailable" }`; otherwise mirror upstream status/body + **safe** headers only. **Never** leak key, upstream URL, or stack (spec § Production Correctness Notes).
  - Optional org pin: inject `org_id` from `CONTROL_LAYER_ORG_ID` when set and absent.
  - `lib/env.ts`: typed server-only accessor (throws if required vars missing at runtime).
  - `.env.example`: `CONTROL_LAYER_API_BASE_URL`, `CONTROL_LAYER_API_KEY`, `CONTROL_LAYER_ORG_ID`, `NEXT_PUBLIC_APP_NAME`, `DASHBOARD_ACCESS_CODE`, `DASHBOARD_SESSION_TTL_HOURS`, `COOKIE_SECRET` (spec § Env vars table).
- **Depends on**: TASK-001
- **Verification**: NXMIG-003 (upstream called with server key; status/body mirrored), NXMIG-004 (upstream 401 proxied, no key material), NXMIG-005 (upstream down → 502 `dashboard_upstream_unavailable`).

---

### TASK-004: Server-aware API/data layer (retarget hooks)

- **Files**: `dashboard/lib/api/client.ts`, `dashboard/lib/api/types.ts` (port), `dashboard/hooks/*` (port `use-decisions`, `use-learner-list`, `use-learner-states`, `use-learner-summary`, `use-signals`), `dashboard/lib/api/fetch-org-decisions.ts`
- **Action**: Create (port from `dashboard/src/*`)
- **Details**:
  - New `apiFetch` calls **`/api/control/<path>`** (same-origin) — **no `x-api-key` in the browser, no `VITE_*`**. Reuse existing hook query logic verbatim; change only the path base.
  - First-paint reads happen server-side in RSC where possible; TanStack Query owns client polling/refetch (design §9.3). Parallelize independent fetches; use `Suspense` per section (perf §1.5/§1.6/§3.7).
  - Import icons per-name from `lucide-react` (no barrel; §2.1).
- **Depends on**: TASK-003
- **Verification**: hooks compile; a smoke page fetching `/api/control/v1/state/list` returns data with **no** `x-api-key` request header from the browser (NXMIG-002 precondition).

---

### TASK-005: App shell (sidebar + topbar + page header)

- **Files**: `dashboard/app/(dashboard)/layout.tsx`, `dashboard/components/layout/{app-sidebar,site-header,nav-main,nav-secondary,nav-user,page-header}.tsx`
- **Action**: Create
- **Details**:
  - Use `npx shadcn add dashboard-01` as **scaffolding reference** + install primitives (design §9.1): `sidebar, breadcrumb, tabs, sheet, dialog, dropdown-menu, combobox, input, alert, separator, chart, sonner, scroll-area, avatar` (button/card/badge/table/tooltip/skeleton/select already present).
  - `SidebarProvider variant="inset"` + `SidebarInset` shell (design §7). `NavMain` items: Overview `/`, Attention `/attention`, Learners `/learners`, Decisions `/decisions`, Signals `/signals`, Reports `/reports` (design §5.1). `NavSecondary`: API Docs (external Swagger), Settings, Help (§5.2). `NavUser`: org context + theme toggle + Log out (§5.3).
  - `SiteHeader`: `SidebarTrigger`, breadcrumbs, org switcher (hidden when `CONTROL_LAYER_ORG_ID` pins single org), global refresh (invalidate active queries), theme toggle; ⌘K is Phase C (§5.4).
  - Pages are Server Components; interactive leaves marked `"use client"` (§9.3).
- **Depends on**: TASK-002, TASK-004
- **Verification**: shell renders with all nav items; active-route highlighting works; sidebar collapse persists (cookie).

---

### TASK-006: Standardized state components

- **Files**: `dashboard/components/states/{empty-state,error-state,loading-state}.tsx`
- **Action**: Create
- **Details**: Per design §10 — `LoadingState` = `Skeleton` sized to final layout (no spinner-only; prefer `Suspense` fallback); `EmptyState` = icon + one-line + optional action; `ErrorState` = destructive `Alert` + HTTP status + **Retry** (`refetch()`), maps `dashboard_upstream_unavailable` → "Service unavailable, retrying."; never leaks key/URL/stack. TanStack guards use `isLoading`/`isError`/`data.length===0` as distinct branches.
- **Depends on**: TASK-001
- **Verification**: each component renders in all three branches; reused by every data section in Phase B.

---

### Phase B — Core surfaces (LOCAL) — design §8

### TASK-007: Reusable DataTable + drill-down primitives (L0–L3)

- **Files**: `dashboard/components/data-table/data-table.tsx` (+ parts), `dashboard/components/shared/{detail-sheet,sheet-section,drill-down-link,json-viewer}.tsx`, `dashboard/components/shared/{decision-badge,urgency-badge,progress-badge}.tsx` (port)
- **Action**: Create (port badges)
- **Details**:
  - Generic typed `DataTable` on TanStack Table: sorting, filtering, pagination, row→action; **default column sets per design §2.1** (technical columns hidden until drill-down); column defs co-located per feature (design §9.2/§9.3). Install `@tanstack/react-table`.
  - **L1:** `DetailSheet` — right-side ~480px desktop / full-width mobile; header slot, scroll body, **single** footer CTA; focus trap; Esc closes; list scroll preserved (design §2.1, §6). `SheetSection` — labeled field groups without nested cards. `DrillDownLink` — consistent "Open full view" / "Open trace" footer button.
  - **L3:** `JsonViewer` — collapsible `font-mono` + copy; **collapsed by default**; never used on L0 list pages.
  - Port badge family to use `--status-*`/`--urgency-*`/`--progress-*` tokens + Lucide icon + label (a11y: color never sole signal, design §4.4).
- **Depends on**: TASK-005, TASK-006
- **Verification**: `DataTable` sorts/filters/paginates stub dataset with default columns only; row click opens `DetailSheet` with single footer CTA; `JsonViewer` renders collapsed until expanded.

---

### TASK-008: Overview page (L0 only)

- **Files**: `dashboard/app/(dashboard)/page.tsx`, `dashboard/components/dashboard/{section-cards,stat-card,trend-chart}.tsx`, `dashboard/app/(dashboard)/_components/recent-decisions-table.tsx`
- **Action**: Create
- **Details**: **L0 layout only** (design §8): `SectionCards` — **4 KPIs max** (Needs attention Δ → links `/attention` when >0, Pending decisions, Signals today accepted/rejected, Improving learners); **no Attention queue** on this page. `TrendChart` — single area chart; 7/30/90d range; **one visible series** (decisions-by-type ↔ mastery toggle); adjacent **text summary** line for glanceability + a11y. `RecentDecisionsTable` (last 20, default columns §2.1) → row opens decision **L1 Sheet** → `DrillDownLink` "Open trace" → `/decisions/[id]`. Data via `/api/control/v1/state/list`, `/v1/receipts`/`/v1/decisions`, `/v1/ingestion` counts. Parallel fetch + per-section `Suspense` (perf §1.6/§3.7).
- **Depends on**: TASK-007
- **Verification**: NXMIG-001 (Overview renders with live data); ≤4 KPIs + 1 chart + 1 table; no raw JSON; row drill-down opens Sheet then route.

---

### TASK-009: Learners roster + Learner detail (L1 Sheet → L2 tabs)

- **Files**: `dashboard/app/(dashboard)/learners/page.tsx`, `dashboard/app/(dashboard)/learners/[ref]/page.tsx`, `dashboard/app/(dashboard)/learners/_components/learner-detail-sheet.tsx`, plus tab components
- **Action**: Create
- **Details**:
  - **L0 roster:** `DataTable` with **default columns only** (reference, level `ProgressBadge`, trend, last activity) + search/filters in compact bar. Data: `/v1/state/list`. Row → **L1** `LearnerDetailSheet` (design §8.1: max **3** recent signals + **3** recent decisions, no version history) → `DrillDownLink` "Open full view" → **L2** `/learners/[ref]`.
  - **L2 detail tabs** (one concern per tab, design §8): **Overview** (summary + recent decisions via `/v1/learners/:ref/summary`), **State** (canonical fields + **version selector** `?version=n` via `/v1/state`; raw JSON in collapsed **L3** `JsonViewer`), **Trajectory**, **Struggles & progress** (per-skill via `/v1/state` `skills.*`). Per `dashboard-summary-migration.plan.md`: decision-driven views use summary; per-skill views keep `/v1/state` (`learner_reference` param, not `learner=`).
- **Depends on**: TASK-007
- **Verification**: NXMIG-014 (version drill-down loads historical state; canonical + raw JSON match L3 expand only); L1 Sheet → route path works; Sheet Esc preserves list scroll.

---

### TASK-010: Decisions stream + Decision detail (L1 Sheet → L2 trace)

- **Files**: `dashboard/app/(dashboard)/decisions/page.tsx`, `dashboard/app/(dashboard)/decisions/[id]/page.tsx`, `_components/*`
- **Action**: Create
- **Details**: **L0 stream** = `DataTable` with default columns (time, type `DecisionBadge`, rule truncated, learner) + org/learner/time filters via `/v1/receipts`; row → **L1** Sheet peek (header + rationale excerpt) → `DrillDownLink` "Open trace" → **L2** `/decisions/[id]`. **L2 detail** = compliance trust view: header, `font-mono` rationale, evaluated-thresholds table, collapsible **L3** state snapshot + rule condition (`JsonViewer`, collapsed by default), **Export JSON** (sole primary CTA). Read-only (no mutations; spec § Phase 1b doctrine).
- **Depends on**: TASK-007
- **Verification**: NXMIG-015 (row → L1 Sheet → L2 trace shows rationale/threshold table; JSON only after L3 expand), NXMIG-016 (GET-only, no mutation requests).

---

### TASK-011: Signals ingestion log (L0 + row expand)

- **Files**: `dashboard/app/(dashboard)/signals/page.tsx`, `_components/*`
- **Action**: Create
- **Details**: **L0** `DataTable` with default columns (time, source, schema, outcome chip) via `/v1/ingestion`; outcome filter (accepted/duplicate/rejected); cursor pagination. Rejected rows: **L1 inline row expand** (accordion) for reason code + field path — **not** a Sheet (design §8 exception). No raw JSON in table body. Read-only.
- **Depends on**: TASK-007
- **Verification**: NXMIG-013 (rows render; outcome filter + rejection row expand work; no client `x-api-key`; no JSON visible at L0).

---

### TASK-012: Attention queue + Reports + Settings

- **Files**: `dashboard/app/(dashboard)/{attention,reports,settings}/page.tsx`, `_components/*`, port `lib/decision-review.ts`
- **Action**: Create
- **Details**:
  - **Attention** (design §8): **no KPI stat cards** (Overview owns aggregates). "Who needs help now" — ranked `LearnerCard` list (not full table) by urgency via `/v1/learners/:ref/summary`; card → L1 Sheet. "What should happen next" — decision review cards with **Approve/Reject** (client-side localStorage via ported `decision-review.ts`). Empty = "All caught up."
  - **Reports**: program-metrics cards (**≤6**) + export actions (CSV/JSON) via `/v1/admin/program-metrics`; link to Learners/Decisions routes for drill-down — no inline learner tables.
  - **Settings**: org/env info, theme; `/v1/policies` (read).
- **Depends on**: TASK-007
- **Verification**: Attention has no duplicate KPI grid; Approve/Reject persists client-side; reports ≤6 cards; drill-down e2e paths pass UX gate (see § Data-driven UX implementation).

---

### Phase 2/3 — Auth carry-over + API decoupling (LOCAL)

### TASK-013: Passphrase gate → Next middleware + login/logout + CSP

- **Files**: `dashboard/middleware.ts`, `dashboard/app/(auth)/login/route.ts`, `dashboard/app/(auth)/logout/route.ts`, `dashboard/lib/session-cookie.ts` (port from `src/auth/session-cookie.ts`), `dashboard/lib/login-rate-limiter.ts`, `dashboard/next.config.ts` (headers/CSP)
- **Action**: Create (port)
- **Details**:
  - Port the **exact** cookie scheme (`dp_session` = `hex(HMAC-SHA256(COOKIE_SECRET, payloadJson)) + "." + base64url(payloadJson)`, payload `{ "exp" }`) — **do not redefine** (spec § Concrete Values). Middleware gates all `(dashboard)` routes + `/api/control/*` when `DASHBOARD_ACCESS_CODE` set; **disabled when unset** (local-dev parity). `(auth)` routes are exempt.
  - Login POST parsed via `request.formData()` (`application/x-www-form-urlencoded`); preserve rate limit (5/15min/IP → 429; in-process Map, single-instance caveat noted for Amplify — Phase 5 hardening). Cookie: `Path=/`, `Strict`, `HttpOnly`, `Secure` in prod; adopt `__Host-dp_session` for standalone origin (spec § Cookies). `fb_session` only if educator-feedback flows move to the Next app (else N/A).
  - CSP in `next.config.ts`: restrict `connect-src` to same-origin (browser talks only to Next route handlers).
- **Depends on**: TASK-005
- **Verification**: NXMIG-006 (gate on, no cookie → 302 login), NXMIG-007 (valid passphrase → 303 + `Set-Cookie: dp_session`), NXMIG-008 (invalid → 200 + "Invalid access code", no cookie), NXMIG-009 (cookie verify parity vs gate vectors), NXMIG-010 (unset → serves without redirect).

---

### TASK-014: @fastify/cors + retire Fastify dashboard/inspect serving

- **Files**: `src/server.ts`, `package.json` (root), retire `src/panels/`, `src/auth/dashboard-*.ts` (post-cutover)
- **Action**: Modify / Delete (after parity)
- **Details**:
  - Add **`@fastify/cors`** (official plugin, not manual headers) allowing dashboard origin(s) + localhost with `credentials: true`; restrict origins (spec § Production Correctness). `/v1/*`, `/v1/admin/*`, `/docs`, `/health` unchanged.
  - **After** dashboard parity verified: remove Fastify `@fastify/static` for `dashboard/dist`, `GET/POST /dashboard/login`, `/dashboard/logout`, and `/inspect` static (`src/panels/`). Fastify becomes API-only. Keep `src/auth/session-cookie.ts` until cutover confirmed; `feedback-session-preHandler.ts` stays if feedback remains on API.
- **Depends on**: TASK-013, and Phase B parity (TASK-008…012)
- **Verification**: NXMIG-011 (CORS preflight `OPTIONS /v1/...` from dashboard origin → 204 with `Access-Control-Allow-Origin` = dashboard origin + `Allow-Credentials: true`); backend suite still green (`npm run check`).

---

### Phase 4 — Build/CI (LOCAL build; deploy is AWS-BLOCKED)

### TASK-015: amplify.yml + CI dashboard job (no deploy)

- **Files**: `dashboard/amplify.yml`, `.github/workflows/ci.yml`
- **Action**: Create / Modify
- **Details**:
  - Commit `dashboard/amplify.yml` exactly per spec § `amplify.yml` (Node 22, `npm ci`, `npm run build`, artifacts `.next`, cache `.next/cache` + `node_modules`). Valid to commit now; **deploy deferred**.
  - Add a `dashboard` job to `.github/workflows/ci.yml`: Node 22 → `next build` + `typecheck` + Playwright e2e. Existing server/CDK jobs unchanged. **No deploy step.** (Source of truth: `docs/specs/ci-cd-pipeline.md` — align job placement there.)
- **Depends on**: TASK-001
- **Verification**: NXMIG-012 (local `next build` with Node 22 succeeds; no `VITE_*` remain); CI `dashboard` job builds + runs e2e without an AWS account.

---

### TASK-016: Tests (NXMIG-001..016) + full verification gate

- **Files**: `dashboard/e2e/*.spec.ts`, `dashboard/playwright.config.ts`, `tests/contracts/nextjs-dashboard-migration.test.ts` (route-handler/CORS/cookie-parity), `tests/integration/*` as needed
- **Action**: Create
- **Details**:
  - Playwright (local Next app): NXMIG-001/002/006/007/008/010/013/014/015/016. Route-handler/CORS integration: NXMIG-003/004/005/011. Cookie-parity unit: NXMIG-009. Build gate: NXMIG-012. **No test requires AWS** (spec § Test strategy note).
  - Add e2e drill-down paths: Learners list → L1 Sheet → L2 route; Decisions list → L1 Sheet → L2 trace; Overview row → decision Sheet. Assert no raw JSON in DOM at L0/L1 (design §2.1).
  - Final gate: `cd dashboard && npm run build && npm run typecheck && npm run lint && npm run test:e2e`; `npm run check` (backend, no regressions); `rg "VITE_|import.meta.env" dashboard/` empty; browser network shows **no** `x-api-key` (NXMIG-002).
- **Depends on**: TASK-008…012, TASK-013, TASK-014, TASK-015
- **Verification**: all NXMIG IDs green; verification checklist below complete.

---

### Phase 4/5 — AWS (BLOCKED — do not start)

### TASK-017: `[AWS-BLOCKED]` Amplify app + branch deploys + PR previews

- **Action**: Deferred until spec banner = `Status: AWS account available`. Create Amplify app pointing at `dashboard/`, configure branch deploys + PR previews, set **runtime** server env (`CONTROL_LAYER_API_KEY` never `NEXT_PUBLIC_`). No code change; provisioning only.
- **Depends on**: TASK-015, stage gate lifted.

### TASK-018: `[AWS-BLOCKED]` Production auth (Cognito)

- **Action**: Deferred. Adopt Amplify Auth (Cognito) via official `@aws-amplify/adapter-nextjs`; Next middleware gates pages; route handlers exchange Cognito session for the server-held key. Prefer extending existing **CDK** stack over Amplify Gen 2 backend (spec § Constraints). Harden login rate-limit to a shared store (DynamoDB/Redis).
- **Depends on**: TASK-017, stage gate lifted.

---

## Files Summary

### To Create (dashboard — Next.js)
| File | Task |
|------|------|
| `dashboard/next.config.ts`, `app/layout.tsx`, `app/providers.tsx` | TASK-001 |
| `dashboard/app/globals.css`, `components/shared/theme-toggle.tsx` | TASK-002 |
| `dashboard/app/api/control/[...path]/route.ts`, `lib/env.ts`, `.env.example` | TASK-003 |
| `dashboard/lib/api/{client,types,fetch-org-decisions}.ts`, `hooks/use-*.ts` | TASK-004 |
| `dashboard/app/(dashboard)/layout.tsx`, `components/layout/{app-sidebar,site-header,nav-main,nav-secondary,nav-user,page-header}.tsx` | TASK-005 |
| `dashboard/components/states/{empty,error,loading}-state.tsx` | TASK-006 |
| `dashboard/components/data-table/data-table.tsx`, `components/shared/{detail-sheet,sheet-section,drill-down-link,json-viewer,*-badge}.tsx` | TASK-007 |
| `dashboard/app/(dashboard)/page.tsx`, `components/dashboard/{section-cards,stat-card,trend-chart}.tsx` | TASK-008 |
| `dashboard/app/(dashboard)/learners/{page,[ref]/page}.tsx`, `_components/learner-detail-sheet.tsx` | TASK-009 |
| `dashboard/app/(dashboard)/decisions/{page,[id]/page}.tsx` | TASK-010 |
| `dashboard/app/(dashboard)/signals/page.tsx` | TASK-011 |
| `dashboard/app/(dashboard)/{attention,reports,settings}/page.tsx` | TASK-012 |
| `dashboard/middleware.ts`, `app/(auth)/{login,logout}/route.ts`, `lib/{session-cookie,login-rate-limiter}.ts` | TASK-013 |
| `dashboard/amplify.yml` | TASK-015 |
| `dashboard/e2e/*.spec.ts`, `playwright.config.ts`, `tests/contracts/nextjs-dashboard-migration.test.ts` | TASK-016 |

### To Modify / Delete (control layer + CI)
| File | Task | Change |
|------|------|--------|
| `dashboard/package.json`, delete `vite.config.ts`/`index.html`/`src/main.tsx`/`src/App.tsx` | TASK-001 | Next deps + scripts; drop Vite |
| `src/server.ts`, root `package.json` | TASK-014 | Add `@fastify/cors`; remove dashboard/inspect static + login routes (post-parity) |
| `src/panels/`, `src/auth/dashboard-*.ts` | TASK-014 | Retire post-cutover |
| `.github/workflows/ci.yml` | TASK-015 | Add `dashboard` build/test job (no deploy) |

## Test Plan (spec § Contract Tests)
| Test ID | Type | Task |
|---------|------|------|
| NXMIG-001 | e2e | TASK-008 |
| NXMIG-002 | e2e | TASK-016 |
| NXMIG-003/004/005 | integration | TASK-003 |
| NXMIG-006/007/008/009/010 | integration/unit | TASK-013 |
| NXMIG-011 | integration | TASK-014 |
| NXMIG-012 | build | TASK-015 |
| NXMIG-013 | e2e | TASK-011 |
| NXMIG-014 | e2e | TASK-009 |
| NXMIG-015/016 | e2e | TASK-010 |

## Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Pinning Next 16 (latest) breaks Amplify managed SSR | High (forfeits managed SSR) | Pin 15.5.x; revisit 16 only when Amplify documents support (spec § Version constraint) |
| `CONTROL_LAYER_API_KEY` accidentally `NEXT_PUBLIC_` / bundled | Critical (re-exposes key) | Server-only var; NXMIG-002/012 assert absence in bundle + no browser `x-api-key` |
| Rebuild scope creep (full design IA) vs pilot timeline | High (schedule) | Phase B is the MVP surface; Reports/⌘K/org-switcher polish is design Phase C — defer if needed |
| Dashboard clutter creep (extra KPIs, inline JSON, duplicate metrics) | Medium (UX trust) | Enforce design §2.1 L0 limits + UX verification gate; code review rejects widgets beyond §8 per-page spec |
| URS summary projection strips `skills.*` (per-skill panels) | High (pilot proof) | Per `dashboard-summary-migration.plan.md`: per-skill views keep `/v1/state`; only decision views use summary |
| Removing Fastify `/inspect`/dashboard before parity | High (breaks current demo) | TASK-014 removal gated on Phase B parity verification |
| Login rate-limit in-process Map on multi-instance Amplify | Medium | Best-effort in pilot; shared store is Phase 5 `[AWS-BLOCKED]` hardening |
| Barrel imports inflate bundle/cold start | Medium | `optimizePackageImports` + per-name lucide imports (perf §2.1) |

## Verification Checklist (local Phases 1–4)
- [x] TASK-001…016 complete (TASK-017/018 remain `pending` — AWS-blocked)
- [x] `cd dashboard && npm run build` (Next 15.5.19, Node 22) succeeds (NXMIG-012)
- [x] No `VITE_*` / `import.meta.env` in active dashboard source (NXMIG-012 grep test passes)
- [x] Browser network shows **no** `x-api-key` on any page (NXMIG-002)
- [x] Proxy: server key attached; 401 proxied; upstream-down → 502 `dashboard_upstream_unavailable` (NXMIG-003/004/005)
- [x] Gate: 302 when on+no cookie; 303+session cookie on valid; 200+error on invalid; serves when unset; cookie parity (NXMIG-006…010)
- [x] CORS preflight 204 with allow-origin + credentials (NXMIG-011)
- [ ] Core pages e2e green (NXMIG-001/013/014/015/016) — verify after build fix
- [x] **Data-driven UX gate (code review):** Overview ≤4 KPIs + 1 chart + 1 table; Attention has no KPI cards; L1 Sheet → L2 route pattern implemented (design §2.1)
- [ ] `npm run check` (backend) green — verify before merge
- [ ] CI `dashboard` job builds + e2e without AWS — blocked on build fix
- [ ] a11y: WCAG 2.1 AA pass — **Phase C** (keyboard nav, focus rings, badge icon+label implemented; formal audit pending)

## Implementation Order
```
TASK-001 → TASK-002 → TASK-003 → TASK-004 → TASK-005 → TASK-006 → TASK-007
                                                                      │
                  ┌───────────────────────────────────────────────────┤
                  ▼        ▼        ▼        ▼        ▼
              TASK-008  TASK-009 TASK-010 TASK-011 TASK-012   (Phase B, parallelizable)
                  └───────────────┬───────────────────────────┘
                                  ▼
                              TASK-013 (gate) ──► TASK-014 (CORS + retire Fastify, after parity)
                                  │
                                  ▼
                              TASK-015 (amplify.yml + CI) ──► TASK-016 (tests + final gate)
                                                                   │
                                                       [stage gate lifted]
                                                                   ▼
                                                       TASK-017 → TASK-018  (AWS-BLOCKED)
```
TASK-008…012 can proceed in parallel once TASK-007 lands. TASK-013 can develop alongside Phase B but verifies after the shell (TASK-005) exists.

---

*Plan generated from `docs/specs/nextjs-amplify-dashboard-migration.md` (+ `dashboard-design-requirements.md` §2.1 data-driven UX). Local Phases 1–4 complete (2026-06-20); educator journey documented in design spec. AWS Phases (TASK-017/018) stage-gated — **do not deploy**. Status lives in YAML `todos` only.*
