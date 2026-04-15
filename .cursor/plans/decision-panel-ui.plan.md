---
name: Decision Panel UI
overview: |
  A static React 19 SPA (dashboard/) that reads existing /v1/* API endpoints and renders a four-panel educator-facing proof surface: "Who Needs Attention?", "Why Are They Stuck?", "What To Do?", and "Did It Work?". Built with Vite, Tailwind v4, shadcn/ui, and TanStack Query. Served from the existing Fastify server at /dashboard via a second @fastify/static registration. No new backend endpoints. Pilot Wave 2 — depends on skill-level-tracking (done).
todos:
  - id: TASK-001
    content: Scaffold dashboard/ project — Vite + React 19 + TypeScript
    status: completed
  - id: TASK-002
    content: Install dashboard dependencies — Tailwind v4, TanStack Query, Lucide React
    status: completed
  - id: TASK-003
    content: shadcn/ui init + component installation (card, badge, button, select, tooltip, skeleton)
    status: completed
  - id: TASK-004
    content: Write globals.css — full spec'd oklch token set + 8P3P extensions
    status: completed
  - id: TASK-005
    content: API client — fetch wrapper with VITE_API_BASE_URL + x-api-key header
    status: completed
  - id: TASK-006
    content: TanStack Query hooks — use-decisions (org fan-out via state/list + per-learner /v1/decisions), use-learner-states, use-learner-list, use-signals
    status: completed
  - id: TASK-007
    content: Lib utilities — score-levels.ts, rationale-builder.ts, decision-review.ts
    status: completed
  - id: TASK-008
    content: Shared components — LearnerCard, DecisionBadge, UrgencyBadge, ProgressBadge
    status: completed
  - id: TASK-009
    content: Panel components — WhoNeedsAttention, WhyAreTheyStuck, WhatToDo, DidItWork (all panel states)
    status: completed
  - id: TASK-010
    content: Layout — Header.tsx + App.tsx + main.tsx responsive grid
    status: completed
  - id: TASK-011
    content: Fastify server integration — second @fastify/static at /dashboard + build:dashboard script
    status: completed
  - id: TASK-012
    content: Unit contract tests — tests/contracts/decision-panel-ui.test.ts (DPU-007, DPU-008)
    status: completed
  - id: TASK-013
    content: E2e test stubs — dashboard/e2e/ with Playwright scaffolding (DPU-001–DPU-006, DPU-009)
    status: completed
  - id: TASK-014
    content: Verification — build:dashboard, npm test, typecheck, lint all pass
    status: completed
isProject: false
---

# Decision Panel UI

**Spec**: `docs/specs/decision-panel-ui.md`

## Prerequisites

Before starting implementation:
- [x] PREREQ-001: `skill-level-tracking` complete (all 12 tasks done, 600 tests pass — `docs/specs/skill-level-tracking.md`)
- [x] PREREQ-002: All 5 consumed API endpoints implemented (`GET /v1/decisions`, `/v1/state`, `/v1/state/list`, `/v1/policies`, `/v1/signals`)
- [x] PREREQ-003: `@fastify/static` already in `package.json` at `^9.0.0`
- [ ] PREREQ-004: Node.js >= 20 available in dev environment (required for React 19 / Vite 6)

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

---

### TASK-001: Scaffold dashboard/ project

- **Files**: `dashboard/` (new directory), `dashboard/package.json`, `dashboard/vite.config.ts`, `dashboard/tsconfig.json`, `dashboard/index.html`
- **Action**: Create
- **Details**:
  Run from project root:
  ```bash
  npm create vite@latest dashboard -- --template react-ts
  ```
  After scaffold, update `dashboard/tsconfig.json` to target ES2022 (consistent with backend). Update `dashboard/index.html` title to "8P3P Decision Panel". The `dashboard/` directory is isolated — it does NOT inherit the root `tsconfig.json`, `eslint.config.js`, or `package.json`.

  `dashboard/package.json` scripts block (set during/after scaffold):
  ```json
  {
    "scripts": {
      "dev": "vite",
      "build": "tsc -b && vite build",
      "preview": "vite preview",
      "typecheck": "tsc -b --noEmit"
    }
  }
  ```
- **Depends on**: none
- **Verification**: `ls dashboard/` shows `src/`, `index.html`, `vite.config.ts`, `package.json`

---

### TASK-002: Install dashboard dependencies

- **Files**: `dashboard/package.json`, `dashboard/package-lock.json`
- **Action**: Modify
- **Details**:
  From `dashboard/` directory:
  ```bash
  # Tailwind v4 — uses @tailwindcss/vite plugin (no tailwind.config.ts needed)
  npm install tailwindcss @tailwindcss/vite

  # TanStack Query v5
  npm install @tanstack/react-query

  # Lucide React (shadcn/ui default icon set)
  npm install lucide-react
  ```

  Update `dashboard/vite.config.ts` to register the Tailwind v4 Vite plugin:
  ```ts
  import { defineConfig } from 'vite'
  import react from '@vitejs/plugin-react'
  import tailwindcss from '@tailwindcss/vite'

  export default defineConfig({
    plugins: [react(), tailwindcss()],
    base: '/dashboard/',
  })
  ```

  The `base: '/dashboard/'` is required so that Vite generates asset paths relative to the `/dashboard` prefix when served from Fastify.

  **Existing solutions check**: `@tailwindcss/vite` is the official Tailwind v4 integration — replaces the old PostCSS plugin and `tailwind.config.ts`. No config file needed.
- **Depends on**: TASK-001
- **Verification**: `npm ls @tanstack/react-query lucide-react tailwindcss` in `dashboard/` all resolve without errors

---

### TASK-003: shadcn/ui init + component installation

- **Files**: `dashboard/components.json`, `dashboard/src/lib/utils.ts`, `dashboard/src/components/ui/` (generated)
- **Action**: Create
- **Details**:
  From `dashboard/` directory:
  ```bash
  npx shadcn@latest init
  ```
  When prompted:
  - Style: **base-nova**
  - Base color: **Neutral** (we override in globals.css)
  - CSS variables: **Yes**
  - Tailwind config: (v4 — no config file)
  - Components alias: `@/components`
  - Utils alias: `@/lib/utils`

  After init, add required components:
  ```bash
  npx shadcn@latest add card badge button select tooltip skeleton
  ```

  This creates `dashboard/src/components/ui/` with the component files. Do NOT edit these files — shadcn components are owned by the project, but treating them as library code keeps upgrades clean.

  **Note:** shadcn init will generate a `globals.css` — it will be **replaced entirely** in TASK-004.
- **Depends on**: TASK-002
- **Verification**: `dashboard/src/components/ui/card.tsx`, `badge.tsx`, `button.tsx`, `select.tsx`, `tooltip.tsx`, `skeleton.tsx` all exist

---

### TASK-004: Write globals.css — design tokens

- **Files**: `dashboard/src/styles/globals.css`
- **Action**: Create (replacing shadcn-generated file)
- **Details**:
  Move `globals.css` from `dashboard/src/` to `dashboard/src/styles/globals.css`. Write the full content exactly as spec'd in `docs/specs/decision-panel-ui.md` § "Design Tokens — globals.css full content". This includes:
  - `@import "tailwindcss"`
  - `@custom-variant dark` declaration
  - `:root` block with full shadcn/ui v4 oklch light theme
  - 8P3P extension block: `--brand-accent-green`, `--brand-accent-warm`, and all `--urgency-*` / `--status-*` / `--progress-*` semantic tokens
  - `.dark` block with full dark theme
  - `@theme inline` bridge block
  - `@layer base` reset block

  Update `dashboard/src/main.tsx` to import from the new path:
  ```ts
  import './styles/globals.css'
  ```
- **Depends on**: TASK-003
- **Verification**: `dashboard/src/styles/globals.css` exists; `npm run dev` in dashboard/ starts without CSS errors; CSS variables are visible in browser devtools on `:root`

---

### TASK-005: API client

- **Files**: `dashboard/src/api/client.ts`
- **Action**: Create
- **Details**:
  A thin `fetch` wrapper. No Axios or other library — native `fetch` is sufficient per spec constraint.

  ```ts
  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
  const API_KEY  = import.meta.env.VITE_API_KEY ?? '';

  export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`API error ${res.status}: ${path}`);
    }
    return res.json() as Promise<T>;
  }
  ```

  Create `dashboard/.env.example`:
  ```
  VITE_API_BASE_URL=http://localhost:3000
  VITE_API_KEY=your-tenant-api-key-here
  ```

  `VITE_API_KEY` is injected at build time (Vite bundles `import.meta.env.*` at compile time). For pilot: supply via `dashboard/.env.local` locally; inject as build arg in CI.
- **Depends on**: TASK-004
- **Verification**: TypeScript compiles without errors; `apiFetch` is exported with correct generic signature

---

### TASK-006: TanStack Query hooks

- **Files**:
  - `dashboard/src/hooks/use-decisions.ts`
  - `dashboard/src/hooks/use-learner-states.ts`
  - `dashboard/src/hooks/use-learner-list.ts`
  - `dashboard/src/hooks/use-signals.ts`
- **Action**: Create
- **Details**:
  All hooks use `@tanstack/react-query` `useQuery` with `refetchInterval: 30_000` (30s auto-refresh per spec). The `queryClient.invalidateQueries()` triggered by the Refresh button hits all query keys.

  **`use-learner-list.ts`** — `GET /v1/state/list?org_id=:org`:
  ```ts
  export function useLearnerList(orgId: string) {
    return useQuery({
      queryKey: ['learner-list', orgId],
      queryFn: () => apiFetch<LearnerListResponse>(`/v1/state/list?org_id=${orgId}`),
      refetchInterval: 30_000,
    });
  }
  ```

  **`use-decisions.ts`** — `GET /v1/decisions?org_id=:org`:
  ```ts
  export function useDecisions(orgId: string) {
    return useQuery({
      queryKey: ['decisions', orgId],
      queryFn: () => apiFetch<DecisionsResponse>(`/v1/decisions?org_id=${orgId}`),
      refetchInterval: 30_000,
    });
  }
  ```

  **`use-learner-states.ts`** — `GET /v1/state?org_id=:org&learner=:ref` per learner (called with an array of refs):
  ```ts
  export function useLearnerState(orgId: string, learnerRef: string) {
    return useQuery({
      queryKey: ['learner-state', orgId, learnerRef],
      queryFn: () => apiFetch<LearnerStateResponse>(`/v1/state?org_id=${orgId}&learner=${encodeURIComponent(learnerRef)}`),
      refetchInterval: 30_000,
      enabled: !!learnerRef,
    });
  }
  ```

  **`use-signals.ts`** — `GET /v1/signals?org_id=:org` (used for context, not a primary panel data source):
  ```ts
  export function useSignals(orgId: string) {
    return useQuery({
      queryKey: ['signals', orgId],
      queryFn: () => apiFetch<SignalsResponse>(`/v1/signals?org_id=${orgId}`),
      refetchInterval: 30_000,
    });
  }
  ```

  Define response types in `dashboard/src/api/types.ts` (separate from hooks). Key types to define:
  - `Decision` (with `decision_type`, `decided_at`, `learner_reference`, `decision_context`, `trace`, `output_metadata`)
  - `LearnerState` (with `learner_reference`, `skills` map with `stabilityScore`, `stabilityScore_direction`, `masteryScore`, etc.)
  - `LearnerListItem` (`learner_reference`, `state_version`)
- **Depends on**: TASK-005
- **Verification**: All four hooks export without TypeScript errors; `useDecisions` is callable in a component

---

### TASK-007: Lib utilities

- **Files**:
  - `dashboard/src/lib/score-levels.ts`
  - `dashboard/src/lib/rationale-builder.ts`
  - `dashboard/src/lib/decision-review.ts`
- **Action**: Create
- **Details**:

  **`score-levels.ts`** — score → level mapping (contract tested by DPU-007):
  ```ts
  export type Level = 'emerging' | 'novice' | 'proficient' | 'mastery';

  const THRESHOLDS: [number, Level][] = [
    [0.25, 'emerging'],
    [0.50, 'novice'],
    [0.75, 'proficient'],
    [1.00, 'mastery'],
  ];

  export function scoreToLevel(score: number): Level {
    for (const [threshold, level] of THRESHOLDS) {
      if (score <= threshold) return level;
    }
    return 'mastery';
  }
  ```
  Exact threshold values must match spec: 0–0.25 emerging, 0.26–0.50 novice, 0.51–0.75 proficient, 0.76–1.0 mastery.

  **`rationale-builder.ts`** — human-readable sentences from state data:
  ```ts
  export function buildStabilityRationale(stabilityScore: number, skillName: string): string {
    const pct = Math.round(stabilityScore * 100);
    return `Understanding of ${skillName} is unstable (${pct}% stability). May need reinforcement.`;
  }
  ```
  The decision `trace.rationale` is the authoritative source when present — `rationale-builder.ts` is the fallback for Panel 2 when rationale is derived from state data.

  **`decision-review.ts`** — localStorage-backed approve/reject state:
  ```ts
  const KEY = '8p3p-reviewed-decisions';

  export function markReviewed(decisionId: string): void {
    const set = getReviewed();
    set.add(decisionId);
    localStorage.setItem(KEY, JSON.stringify([...set]));
  }

  export function isReviewed(decisionId: string): boolean {
    return getReviewed().has(decisionId);
  }

  function getReviewed(): Set<string> {
    try {
      const raw = localStorage.getItem(KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  }
  ```
- **Depends on**: TASK-006
- **Verification**: TypeScript compiles; `scoreToLevel(0.20)` returns `'emerging'` — will be confirmed by DPU-007 in TASK-012

---

### TASK-008: Shared badge and card components

- **Files**:
  - `dashboard/src/components/shared/LearnerCard.tsx`
  - `dashboard/src/components/shared/DecisionBadge.tsx`
  - `dashboard/src/components/shared/UrgencyBadge.tsx`
  - `dashboard/src/components/shared/ProgressBadge.tsx`
- **Action**: Create
- **Details**:

  **`DecisionBadge.tsx`** — uses `--status-*` CSS variables (not raw Tailwind color classes):
  ```tsx
  const variants: Record<string, string> = {
    intervene: 'bg-[var(--status-intervene)] text-white',
    reinforce: 'bg-[var(--status-reinforce)] text-white',
    advance:   'bg-[var(--status-advance)] text-white',
    pause:     'bg-[var(--status-pause)] text-white',
  };

  export function DecisionBadge({ type }: { type: string }) {
    return (
      <Badge className={variants[type] ?? 'bg-muted text-muted-foreground'}>
        {type.toUpperCase()}
      </Badge>
    );
  }
  ```

  **`UrgencyBadge.tsx`** — derived from `output_metadata.priority`:
  ```tsx
  function priorityToLabel(priority: number): { label: string; className: string } {
    if (priority === 1) return { label: 'high',   className: 'text-[var(--urgency-high)]' };
    if (priority <= 3)  return { label: 'medium', className: 'text-[var(--urgency-medium)]' };
    return               { label: 'low',    className: 'text-muted-foreground' };
  }
  ```

  **`ProgressBadge.tsx`** — `improved` / `declining` / `stable`:
  ```tsx
  const progressVariants: Record<string, string> = {
    improving: 'text-[var(--progress-improved)]',
    declining: 'text-[var(--progress-declining)]',
    stable:    'text-[var(--progress-stable)]',
  };
  ```

  **`LearnerCard.tsx`** — base card wrapper used by all panels. Accepts `learnerRef`, `children`, and optional `footer`. Uses shadcn/ui `Card` pattern from spec.

  All components must include ARIA labels for WCAG 2.1 AA compliance.
- **Depends on**: TASK-007
- **Verification**: Components render in isolation (`npm run dev` in dashboard/); no TypeScript errors

---

### TASK-009: Panel components with full state handling

- **Files**:
  - `dashboard/src/components/panels/WhoNeedsAttention.tsx`
  - `dashboard/src/components/panels/WhyAreTheyStuck.tsx`
  - `dashboard/src/components/panels/WhatToDo.tsx`
  - `dashboard/src/components/panels/DidItWork.tsx`
- **Action**: Create
- **Details**:
  Each panel implements the three-state guard from spec § "Panel States":
  ```tsx
  if (isLoading) return <PanelSkeleton />;
  if (isError)   return <PanelError status={error.message} onRetry={refetch} />;
  if (!data || data.length === 0) return <PanelEmpty message="No learners need attention right now." />;
  ```
  Do NOT collapse loading and empty into the same branch.

  **`WhoNeedsAttention.tsx`**:
  - Data: `useDecisions(orgId)` filtered to `decision_type: 'intervene' | 'pause'`
  - Sort: priority ascending, then `decided_at` descending
  - Limit: top 5. Show `+ N more learners` if truncated
  - Card: `LearnerCard` with `UrgencyBadge`, decision description, optional "Skill: {skill}" line (hidden if `decision_context.skill` absent — graceful degradation)

  **`WhyAreTheyStuck.tsx`**:
  - Data: `useLearnerState(orgId, ref)` for each learner from WhoNeedsAttention list
  - Filter: `skills.*` where `stabilityScore_direction === 'declining'` OR `stabilityScore < 0.5`
  - Multiple cards per learner if multiple declining skills
  - Quoted rationale from `rationale-builder.ts` when `trace.rationale` absent
  - Footer: `+ N more issues` when truncated

  **`WhatToDo.tsx`**:
  - Data: most recent unreviewed `intervene | pause` decision from `useDecisions(orgId)` filtered through `isReviewed()` from `decision-review.ts`
  - Single card layout: `DecisionBadge`, learner name, skill, rationale (3-line clamp + expand)
  - Approve button: calls `markReviewed(decision.id)`, triggers `queryClient.invalidateQueries(['decisions'])`
  - Reject button: same as approve for pilot (both mark as reviewed; post-pilot diverges)
  - Empty state: "No pending decisions." when all decisions reviewed or none exist

  **`DidItWork.tsx`**:
  - Data: `useLearnerState(orgId, ref)` for all learners; filter `skills.*` where `_direction === 'improving'`
  - Level transition: `scoreToLevel(previousScore) > scoreToLevel(currentScore)` — uses `score-levels.ts`
  - `ProgressBadge` with `improving` variant
  - Footer: "View Full Report (N)" → links to `/inspect` (external link)

  **Shared panel wrapper** (`PanelCard.tsx` in `components/layout/`):
  - shadcn/ui `Card` with fixed `h-[600px]`, scrollable body
  - Header: icon + title + shadcn/ui `Tooltip` with info description (ARIA labeled)
  - Accepts `variant`: `'danger' | 'warning' | 'action' | 'success'` for icon color
- **Depends on**: TASK-008
- **Verification**: `npm run dev` in `dashboard/` — all four panels render with seeded data from `npm run seed:demo`; panel states (loading/error/empty) render correctly

---

### TASK-010: Layout — Header, App, main

- **Files**:
  - `dashboard/src/components/layout/Header.tsx`
  - `dashboard/src/components/layout/PanelCard.tsx`
  - `dashboard/src/App.tsx`
  - `dashboard/src/main.tsx`
- **Action**: Create / Modify (main.tsx already exists from scaffold — replace)
- **Details**:

  **`Header.tsx`**:
  - Black topbar: `bg-primary text-primary-foreground px-6 py-4`
  - Left: "8P3P" logo text + "Decision Panel" h1 + subtitle (muted)
  - Right: shadcn/ui `Button` with `RefreshCw` Lucide icon — calls `queryClient.invalidateQueries()`
  - Org selector: shadcn/ui `Select` — single-org pilot can hide via `VITE_ORG_ID` env var (if set, selector hidden; `orgId` read from env)

  **`App.tsx`**:
  ```tsx
  export default function App() {
    const orgId = import.meta.env.VITE_ORG_ID ?? '';
    return (
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-background">
          <Header orgId={orgId} />
          <main className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 p-6">
            <WhoNeedsAttention orgId={orgId} />
            <WhyAreTheyStuck   orgId={orgId} />
            <WhatToDo          orgId={orgId} />
            <DidItWork         orgId={orgId} />
          </main>
        </div>
      </QueryClientProvider>
    );
  }
  ```

  **`main.tsx`**:
  ```tsx
  import './styles/globals.css'
  import { StrictMode } from 'react'
  import { createRoot } from 'react-dom/client'
  import App from './App.tsx'

  createRoot(document.getElementById('root')!).render(
    <StrictMode><App /></StrictMode>
  )
  ```

  Add `VITE_ORG_ID` to `.env.example`.
- **Depends on**: TASK-009
- **Verification**: `npm run build` in `dashboard/` succeeds. `dashboard/dist/` produced. Bundle size < 200KB gzipped (check with `npx vite-bundle-visualizer` if needed).

---

### TASK-011: Fastify server integration

- **Files**: `src/server.ts`, `package.json` (root)
- **Action**: Modify
- **Details**:

  **`src/server.ts`** — add second `@fastify/static` registration after the existing `/inspect/` registration:
  ```ts
  // Dashboard Decision Panel SPA (Pilot Wave 2)
  server.get('/dashboard', async (_request, reply) => {
    return reply.redirect('/dashboard/');
  });

  await server.register(fastifyStatic, {
    root: resolve(process.cwd(), 'dashboard', 'dist'),
    prefix: '/dashboard/',
    decorateReply: false,   // required: second @fastify/static registration
  });
  ```
  The `decorateReply: false` flag is mandatory to avoid Fastify decorator conflict with the existing `/inspect/` static registration (per spec and inspection-panels plan).

  Add `/dashboard` to the root endpoint list:
  ```ts
  endpoints: [...existing..., '/dashboard']
  ```

  **Root `package.json`** — add `build:dashboard` script:
  ```json
  "build:dashboard": "cd dashboard && npm ci --quiet && npm run build"
  ```

  The dashboard build is intentionally separate — it has its own lockfile and is not part of `npm run check` (backend pipeline). However, CI should add `npm run build:dashboard` as a pre-deploy step.

  **Conditional serving:** If `dashboard/dist/` does not exist (development, first clone), the `@fastify/static` registration will throw. Guard it:
  ```ts
  import { existsSync } from 'fs';
  const dashboardDist = resolve(process.cwd(), 'dashboard', 'dist');
  if (existsSync(dashboardDist)) {
    server.get('/dashboard', ...);
    await server.register(fastifyStatic, { root: dashboardDist, prefix: '/dashboard/', decorateReply: false });
  }
  ```
- **Depends on**: TASK-010
- **Verification**: `npm run build:dashboard && npm run dev` — `GET /dashboard/` returns 200 with HTML content. `npm run typecheck` passes. `npm run lint` passes.

---

### TASK-012: Unit contract tests — DPU-007 and DPU-008

- **Files**: `tests/contracts/decision-panel-ui.test.ts`
- **Action**: Create
- **Details**:
  These are Vitest unit tests living in `tests/contracts/` per the document-traceability rule (spec-defined test IDs belong in `tests/contracts/`, not `tests/unit/`).

  The test file imports from `dashboard/src/lib/` directly — Vitest can resolve these since there's no browser-specific API in the lib utilities.

  **DPU-007** — score-to-level mapping:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { scoreToLevel } from '../../dashboard/src/lib/score-levels.ts';

  describe('DPU-007: score-to-level mapping', () => {
    it('DPU-007: 0.20 → emerging', () => expect(scoreToLevel(0.20)).toBe('emerging'));
    it('DPU-007: 0.25 → emerging (boundary)', () => expect(scoreToLevel(0.25)).toBe('emerging'));
    it('DPU-007: 0.40 → novice', () => expect(scoreToLevel(0.40)).toBe('novice'));
    it('DPU-007: 0.50 → novice (boundary)', () => expect(scoreToLevel(0.50)).toBe('novice'));
    it('DPU-007: 0.60 → proficient', () => expect(scoreToLevel(0.60)).toBe('proficient'));
    it('DPU-007: 0.75 → proficient (boundary)', () => expect(scoreToLevel(0.75)).toBe('proficient'));
    it('DPU-007: 0.90 → mastery', () => expect(scoreToLevel(0.90)).toBe('mastery'));
    it('DPU-007: 1.00 → mastery (boundary)', () => expect(scoreToLevel(1.00)).toBe('mastery'));
  });
  ```

  **DPU-008** — graceful degradation (tests `isReviewed` and `markReviewed` without a browser DOM; and tests that skill-absent data produces correct output):
  ```ts
  import { isReviewed, markReviewed } from '../../dashboard/src/lib/decision-review.ts';

  describe('DPU-008: graceful degradation — decision-review state', () => {
    it('DPU-008: unreviewed decision returns false', () => {
      expect(isReviewed('decision-xyz')).toBe(false);
    });
    it('DPU-008: after markReviewed, isReviewed returns true', () => {
      markReviewed('decision-abc');
      expect(isReviewed('decision-abc')).toBe(true);
    });
  });
  ```

  Note: `decision-review.ts` uses `localStorage` — Vitest's jsdom environment provides this. Ensure `dashboard/src/lib/decision-review.ts` is importable from the root Vitest config (add `dashboard/src` to `resolve.alias` or include path if needed). If Vitest cannot resolve, add an alias in root `vitest.config.ts` or use `vi.stubGlobal('localStorage', ...)`.
- **Depends on**: TASK-007
- **Verification**: `npm run test:contracts` passes; DPU-007 and DPU-008 IDs appear in test output

---

### TASK-013: E2e test stubs — Playwright scaffolding

- **Files**:
  - `dashboard/e2e/decision-panel.spec.ts`
  - `dashboard/playwright.config.ts`
  - `dashboard/package.json` (add Playwright dev dep + `test:e2e` script)
- **Action**: Create
- **Details**:
  Browser e2e tests are scoped to the `dashboard/` directory with their own Playwright setup, separate from the backend Vitest suite.

  ```bash
  # from dashboard/
  npm install -D @playwright/test
  npx playwright install chromium
  ```

  `dashboard/playwright.config.ts`:
  ```ts
  import { defineConfig } from '@playwright/test';
  export default defineConfig({
    testDir: './e2e',
    use: {
      baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    },
    webServer: {
      command: 'npm run preview',
      port: 4173,
      reuseExistingServer: !process.env.CI,
    },
  });
  ```

  `dashboard/e2e/decision-panel.spec.ts` — stubs for DPU-001 through DPU-006 and DPU-009:
  ```ts
  import { test, expect } from '@playwright/test';

  test.describe('Decision Panel e2e', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard/');
    });

    test('DPU-001: all four panels render within 3s', async ({ page }) => {
      // TODO: seed data via API or fixture, then assert panel titles visible
      await expect(page.getByText('Who Needs Attention?')).toBeVisible({ timeout: 3000 });
      await expect(page.getByText('Why Are They Stuck?')).toBeVisible({ timeout: 3000 });
      await expect(page.getByText('What To Do?')).toBeVisible({ timeout: 3000 });
      await expect(page.getByText('Did It Work?')).toBeVisible({ timeout: 3000 });
    });

    test('DPU-002: Who Needs Attention shows intervene decisions', async ({ page }) => {
      // TODO: requires seeded org_demo data (npm run seed:demo)
      test.skip(true, 'Requires live API with seeded data');
    });

    test('DPU-003: Why Are They Stuck shows declining skills', async ({ page }) => {
      test.skip(true, 'Requires live API with seeded data');
    });

    test('DPU-004: What To Do shows decision with Approve/Reject', async ({ page }) => {
      test.skip(true, 'Requires live API with seeded data');
    });

    test('DPU-005: Did It Work shows improving skills', async ({ page }) => {
      test.skip(true, 'Requires live API with seeded data');
    });

    test('DPU-006: Approve button hides decision on next render', async ({ page }) => {
      test.skip(true, 'Requires live API with seeded data');
    });

    test('DPU-009: Refresh button triggers data reload', async ({ page }) => {
      const [request] = await Promise.all([
        page.waitForRequest(/\/v1\/decisions/),
        page.getByRole('button', { name: /refresh/i }).click(),
      ]);
      expect(request.url()).toContain('/v1/decisions');
    });
  });
  ```

  Add to `dashboard/package.json`:
  ```json
  "test:e2e": "playwright test"
  ```

  DPU-010 (responsive layout) is a visual/manual test — no automation stub needed.
- **Depends on**: TASK-010
- **Verification**: `npm run test:e2e` in `dashboard/` runs without configuration errors (skipped tests pass as skipped); DPU-001 passes when dev server is running

---

### TASK-014: Verification pass

- **Files**: none (verification only)
- **Action**: Run
- **Details**:
  Run all checks in order:

  ```bash
  # 1. Dashboard build
  npm run build:dashboard

  # 2. Backend tests (must still pass — no regressions)
  npm test

  # 3. Contract tests only (confirms DPU-007, DPU-008 pass)
  npm run test:contracts

  # 4. Backend lint (src/server.ts was modified in TASK-011)
  npm run lint

  # 5. Backend typecheck (src/server.ts was modified in TASK-011)
  npm run typecheck

  # 6. Dashboard typecheck (separate tsconfig)
  cd dashboard && npm run typecheck

  # 7. Manual smoke: start dev server, open /dashboard, verify 4 panels render
  npm run seed:demo && npm run dev
  # → open http://localhost:3000/dashboard/
  ```

  **Bundle size check:** After `npm run build:dashboard`, inspect `dashboard/dist/assets/`. Gzipped JS should be < 200KB. If over, check for accidental large dependencies (shadcn/ui and Lucide React are both tree-shakeable).
- **Depends on**: TASK-011, TASK-012, TASK-013
- **Verification**: All commands above exit 0. `/dashboard/` serves HTML with 4 panel titles visible.

---

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| `dashboard/` | TASK-001 | Isolated SPA project root |
| `dashboard/package.json` | TASK-001 | SPA deps, build scripts |
| `dashboard/vite.config.ts` | TASK-002 | Vite + Tailwind v4 plugin + base path |
| `dashboard/.env.example` | TASK-005 | Documents `VITE_API_BASE_URL`, `VITE_API_KEY`, `VITE_ORG_ID` |
| `dashboard/src/styles/globals.css` | TASK-004 | Full oklch token set + 8P3P extensions |
| `dashboard/src/api/client.ts` | TASK-005 | fetch wrapper |
| `dashboard/src/api/types.ts` | TASK-006 | `Decision`, `LearnerState`, `LearnerListItem` types |
| `dashboard/src/api/fetch-org-decisions.ts` | TASK-006 | Org-wide decision fan-out (state/list → per-learner /v1/decisions) |
| `dashboard/src/hooks/use-decisions.ts` | TASK-006 | TanStack Query hook |
| `dashboard/src/hooks/use-learner-states.ts` | TASK-006 | TanStack Query hook |
| `dashboard/src/hooks/use-learner-list.ts` | TASK-006 | TanStack Query hook |
| `dashboard/src/hooks/use-signals.ts` | TASK-006 | TanStack Query hook |
| `dashboard/src/lib/score-levels.ts` | TASK-007 | Score → level mapping |
| `dashboard/src/lib/rationale-builder.ts` | TASK-007 | Human-readable stability sentences |
| `dashboard/src/lib/decision-review.ts` | TASK-007 | localStorage approve/reject state |
| `dashboard/src/lib/attention-decisions.ts` | TASK-009 | Filter + rank intervene/pause decisions per learner |
| `dashboard/src/lib/panel-helpers.ts` | TASK-009 | `skillDisplayLine()` and shared panel utilities |
| `dashboard/src/lib/query-client.ts` | TASK-010 | Shared `QueryClient` instance |
| `dashboard/src/lib/state-skills.ts` | TASK-009 | Extract skill rows from nested learner state |
| `dashboard/src/components/layout/panel-states.tsx` | TASK-009 | PanelSkeleton, PanelError, PanelEmpty shared states |
| `dashboard/src/components/layout/SignalsPrefetch.tsx` | TASK-010 | Background signals prefetch for all learners |
| `dashboard/src/components/shared/LearnerCard.tsx` | TASK-008 | Base card for all panels |
| `dashboard/src/components/shared/DecisionBadge.tsx` | TASK-008 | CSS variable–driven badge |
| `dashboard/src/components/shared/UrgencyBadge.tsx` | TASK-008 | Priority → urgency badge |
| `dashboard/src/components/shared/ProgressBadge.tsx` | TASK-008 | improving/declining/stable badge |
| `dashboard/src/components/panels/WhoNeedsAttention.tsx` | TASK-009 | Panel 1 |
| `dashboard/src/components/panels/WhyAreTheyStuck.tsx` | TASK-009 | Panel 2 |
| `dashboard/src/components/panels/WhatToDo.tsx` | TASK-009 | Panel 3 + Approve/Reject |
| `dashboard/src/components/panels/DidItWork.tsx` | TASK-009 | Panel 4 |
| `dashboard/src/components/layout/Header.tsx` | TASK-010 | Black topbar + refresh button |
| `dashboard/src/components/layout/PanelCard.tsx` | TASK-010 | Shared panel wrapper (h-[600px] Card) |
| `dashboard/src/App.tsx` | TASK-010 | Root: QueryClientProvider + 4-col grid |
| `dashboard/src/main.tsx` | TASK-010 | Vite entry (replace scaffold version) |
| `dashboard/e2e/decision-panel.spec.ts` | TASK-013 | Playwright e2e stubs DPU-001–006, 009 |
| `dashboard/playwright.config.ts` | TASK-013 | Playwright config |
| `tests/contracts/decision-panel-ui.test.ts` | TASK-012 | Vitest: DPU-007, DPU-008 |

### To Modify

| File | Task | Changes |
|------|------|---------|
| `src/server.ts` | TASK-011 | Add conditional /dashboard @fastify/static + redirect; add to endpoints list |
| `package.json` (root) | TASK-011 | Add `"build:dashboard": "cd dashboard && npm ci --quiet && npm run build"` |

---

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| DPU-001 | e2e | All 4 panels render within 3s | TASK-013 |
| DPU-002 | e2e | "Who Needs Attention?" shows intervene decisions | TASK-013 |
| DPU-003 | e2e | "Why Are They Stuck?" shows declining skills | TASK-013 |
| DPU-004 | e2e | "What To Do?" shows decision with Approve/Reject | TASK-013 |
| DPU-005 | e2e | "Did It Work?" shows improving skills | TASK-013 |
| DPU-006 | e2e | Approve hides decision on next render | TASK-013 |
| DPU-007 | unit | Score-to-level mapping (4 boundary + 4 mid-range values) | TASK-012 |
| DPU-008 | unit | Graceful degradation — decision-review localStorage state | TASK-012 |
| DPU-009 | e2e | Refresh button fires network requests | TASK-013 |
| DPU-010 | visual | Responsive layout — xl/md/sm columns | Manual — no task |

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Second `@fastify/static` Fastify decorator conflict | High — server startup crash | `decorateReply: false` on second registration (TASK-011); conditional on `existsSync(dashboardDist)` |
| `dashboard/dist/` missing causes server crash | High | Conditional registration in `src/server.ts` — only register if dist exists |
| `VITE_API_KEY` baked into static build is visible in JS bundle | Medium | Acceptable for pilot (single-org, no production PII route exposed directly); passphrase gate (dashboard-passphrase-gate.md) adds access control. Post-pilot: move key injection to server-side proxy. |
| TanStack Query per-learner waterfall (Panel 2 fetches N learners serially) | Medium | `Promise.all()` the per-learner state fetches in `WhyAreTheyStuck` — pilot learner counts are small (< 20), so this is acceptable |
| `localStorage` not available in Vitest without jsdom | Low | Root `vitest.config.ts` already targets jsdom environment; confirm `environment: 'jsdom'` is set or add it |
| Vite `base: '/dashboard/'` breaks local `npm run dev` for standalone testing | Low | Run `npm run preview` for `/dashboard/` path testing; use `npm run dev` with proxy config for same-origin |
| Bundle > 200KB gzipped | Low | shadcn/ui and Lucide are tree-shakeable; add only the 6 required shadcn components; Lucide imports are per-icon (`import { AlertCircle } from 'lucide-react'`) |

---

## Verification Checklist

- [ ] All 14 tasks completed
- [ ] `npm run build:dashboard` succeeds, `dashboard/dist/` produced
- [ ] `npm test` passes (no backend regressions from TASK-011 changes)
- [ ] `npm run test:contracts` passes (DPU-007, DPU-008 green)
- [ ] `npm run lint` passes (src/server.ts clean)
- [ ] `npm run typecheck` passes (src/server.ts clean)
- [ ] `cd dashboard && npm run typecheck` passes
- [ ] `GET /dashboard/` returns 200 with HTML when `dashboard/dist/` exists
- [ ] Four panel titles visible in browser with seeded data (`npm run seed:demo`)
- [ ] Approve button removes decision from "What To Do?" panel
- [ ] Refresh button triggers visible network requests to `/v1/decisions`
- [ ] Responsive layout: 4-col at xl, 2-col at md, 1-col at sm (manual check)
- [ ] Bundle gzipped JS < 200KB

---

## Implementation Order

```
TASK-001 → TASK-002 → TASK-003 → TASK-004 → TASK-005 → TASK-006
                                                           │
                                              ┌────────────┤
                                              ▼            ▼
                                           TASK-007     (hooks ready)
                                              │
                                    ┌─────────┤
                                    ▼         ▼
                                TASK-012   TASK-008
                                           │
                                           ▼
                                        TASK-009
                                           │
                                           ▼
                                        TASK-010
                                           │
                                           ▼
                                        TASK-011 ── TASK-013
                                           │            │
                                           └─────┬──────┘
                                                 ▼
                                             TASK-014
```

TASK-012 (unit tests) can run in parallel with TASK-008/009/010 after TASK-007 completes.
