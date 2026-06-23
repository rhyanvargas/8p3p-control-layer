# Decision Panel UI

> A lightweight, read-only proof surface that makes the control layer's intelligence visible to school staff — four panels answering: Who needs help now? What do they need help with? What should happen next? Did the support work?

> **Implementation (2026-06):** The Decision Panel is a **standalone Next.js 15 App Router** app in `dashboard/`, rebuilt per [`dashboard-design-requirements.md`](dashboard-design-requirements.md). Fastify no longer serves `/dashboard` or `/inspect`. API calls go through server-side proxy route handlers (`/api/control/*`) — see [`nextjs-amplify-dashboard-migration.md`](nextjs-amplify-dashboard-migration.md). Sections below that describe Vite, `dashboard/dist`, or `@fastify/static` are **historical** unless marked current.

## Overview

The API produces decisions, traces, state, and deltas. But for a pilot school, JSON responses are invisible. The Decision Panel is the **minimum viable proof surface** — a single-page React application that reads from existing API endpoints and presents the control layer's output in an educator-friendly four-panel layout.

**This is not an admin dashboard.** It has no CRUD, no configuration, no user management. It is a read-only window into the engine's intelligence output. It exists to close the pilot: show the school that the system works, decisions are clear, and rationale is transparent.

### CEO Directive (2026-04-10)

> "I believe for pilot one, we should prioritize the end-to-end control-layer loop plus a very lightweight proof surface, not a full tenant or admin dashboard. APIs alone may be too invisible for the school, but a full dashboard is more than we need right now."

### Reference Design

The Decision Panel mockup (CEO-provided) defines four panels:

| Panel | Header | Icon/Color | Content |
|-------|--------|------------|---------|
| **Who Needs Help Now** | Alert icon, red accents | Learner cards with urgency level (`high`), decision type, skill context |
| **What Do They Need Help With** | Warning icon, amber accents | Learner cards showing specific skill, stability status, quoted rationale |
| **What Should Happen Next** | Lightbulb icon, green/teal accents | Single decision card with `INTERVENE` / `REINFORCE` badge, rationale, **Approve/Reject** buttons |
| **Did the Support Work** | Checkmark icon, green accents | Progress cards showing learner + skill, level transition (`emerging → novice`), `improved` badge |

---

## Tech Stack

| Category | Technology | Version | Rationale |
|----------|------------|---------|-----------|
| Framework | **Next.js** (App Router) | 15.5.x | Standalone SSR host; server route handlers hide API key |
| UI | React | 19+ | Industry standard |
| Component Library | shadcn/ui | latest | Composable, accessible primitives |
| Styling | Tailwind CSS | 4+ | Utility-first; tokens in `dashboard/app/globals.css` |
| Language | TypeScript | ~6.0 | Matches control-layer backend |
| HTTP | Server proxy + TanStack Query | — | Browser calls `/api/control/*`; proxy adds `x-api-key` |
| State Management | TanStack Query | latest | Polling, caching, refetch |
| Icons | Lucide React | latest | shadcn default |
| E2E | Playwright | latest | `dashboard/e2e/` |

*(Legacy pilot used Vite 8 + client-side `VITE_API_KEY` — retired.)*

### Design Tokens (8P3P Brand)

> **Provenance:** The base theme is the shadcn/ui v4 `base-nova` style + Tailwind v4 palette using `oklch` color space. **Light mode is the default** (`:root`); dark mode is supported via `.dark` override. The 8P3P topbar maps to `--primary` (near-black `oklch(0.2050 0 0)`). The warm/green accent colors from `src/server.ts` (`--brand-accent`, `--brand-accent-2`) are preserved as custom additions in the 8P3P extension block. The urgency/status tokens are Decision Panel–only semantic tokens. Post-pilot, extract the 8P3P extension block into a shared `brand-tokens.css` consumed by Swagger, the Decision Panel, and the future admin platform (`8p3p-admin`).

**`dashboard/app/globals.css` — full content:**

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@custom-variant dark (&:is(.dark *));

/* ── shadcn/ui v4 base theme (light) ───────────────────────── */
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.1450 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.1450 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.1450 0 0);
  --primary: oklch(0.2050 0 0);           /* topbar + primary buttons */
  --primary-foreground: oklch(0.9850 0 0);
  --secondary: oklch(0.9700 0 0);
  --secondary-foreground: oklch(0.2050 0 0);
  --muted: oklch(0.9700 0 0);
  --muted-foreground: oklch(0.5560 0 0);
  --accent: oklch(0.9700 0 0);
  --accent-foreground: oklch(0.2050 0 0);
  --destructive: oklch(0.5770 0.2450 27.325);
  --destructive-foreground: oklch(1 0 0);
  --border: oklch(0.9220 0 0);
  --input: oklch(0.9220 0 0);
  --ring: oklch(0.7080 0 0);
  --chart-1: oklch(0.8100 0.1000 252);
  --chart-2: oklch(0.6200 0.1900 260);
  --chart-3: oklch(0.5500 0.2200 263);
  --chart-4: oklch(0.4900 0.2200 264);
  --chart-5: oklch(0.4200 0.1800 266);
  --sidebar: oklch(0.9850 0 0);
  --sidebar-foreground: oklch(0.1450 0 0);
  --sidebar-primary: oklch(0.2050 0 0);
  --sidebar-primary-foreground: oklch(0.9850 0 0);
  --sidebar-accent: oklch(0.9700 0 0);
  --sidebar-accent-foreground: oklch(0.2050 0 0);
  --sidebar-border: oklch(0.9220 0 0);
  --sidebar-ring: oklch(0.7080 0 0);
  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif,
    'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
  --font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    "Liberation Mono", "Courier New", monospace;
  --radius: 0.625rem;
  --shadow-2xs: 0 1px 3px 0px hsl(0 0% 0% / 0.05);
  --shadow-xs:  0 1px 3px 0px hsl(0 0% 0% / 0.05);
  --shadow-sm:  0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10);
  --shadow:     0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10);
  --shadow-md:  0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 2px 4px -1px hsl(0 0% 0% / 0.10);
  --shadow-lg:  0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 4px 6px -1px hsl(0 0% 0% / 0.10);
  --shadow-xl:  0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 8px 10px -1px hsl(0 0% 0% / 0.10);
  --shadow-2xl: 0 1px 3px 0px hsl(0 0% 0% / 0.25);
  --spacing: 0.25rem;

  /* ── 8P3P extension — warm brand accents ─────────────────── */
  --brand-accent-green: oklch(0.8450 0.0350 145);  /* ≈ #c9d5c4 */
  --brand-accent-warm:  oklch(0.8870 0.0300  75);  /* ≈ #e4dbc9 */

  /* ── 8P3P extension — educator-facing semantic tokens ──────
     These intentionally differ from src/panels/styles.css
     (developer-facing inspection panel) — see terminology.md  */
  --urgency-high:      oklch(0.5770 0.2450  27.3);  /* ≈ red-600   */
  --urgency-medium:    oklch(0.7680 0.1630  70.1);  /* ≈ amber-500 */
  --status-intervene:  oklch(0.5770 0.2450  27.3);  /* red bg   */
  --status-reinforce:  oklch(0.5270 0.1770 155.5);  /* green bg */
  --status-advance:    oklch(0.5460 0.2150 264.0);  /* blue bg  */
  --status-pause:      oklch(0.5560 0       0   );  /* gray bg  */
  --progress-improved: oklch(0.5270 0.1770 155.5);
  --progress-declining:oklch(0.5770 0.2450  27.3);
  --progress-stable:   oklch(0.5560 0       0   );
}

/* ── shadcn/ui v4 base theme (dark) ────────────────────────── */
.dark {
  --background: oklch(0.1450 0 0);
  --foreground: oklch(0.9850 0 0);
  --card: oklch(0.2050 0 0);
  --card-foreground: oklch(0.9850 0 0);
  --popover: oklch(0.2050 0 0);
  --popover-foreground: oklch(0.9850 0 0);
  --primary: oklch(0.9220 0 0);
  --primary-foreground: oklch(0.2050 0 0);
  --secondary: oklch(0.2690 0 0);
  --secondary-foreground: oklch(0.9850 0 0);
  --muted: oklch(0.2690 0 0);
  --muted-foreground: oklch(0.7080 0 0);
  --accent: oklch(0.2690 0 0);
  --accent-foreground: oklch(0.9850 0 0);
  --destructive: oklch(0.7040 0.1910 22.216);
  --destructive-foreground: oklch(0.9850 0 0);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.5560 0 0);
  --chart-1: oklch(0.8100 0.1000 252);
  --chart-2: oklch(0.6200 0.1900 260);
  --chart-3: oklch(0.5500 0.2200 263);
  --chart-4: oklch(0.4900 0.2200 264);
  --chart-5: oklch(0.4200 0.1800 266);
  --sidebar: oklch(0.2050 0 0);
  --sidebar-foreground: oklch(0.9850 0 0);
  --sidebar-primary: oklch(0.4880 0.2430 264.376);
  --sidebar-primary-foreground: oklch(0.9850 0 0);
  --sidebar-accent: oklch(0.2690 0 0);
  --sidebar-accent-foreground: oklch(0.9850 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.5560 0 0);
}

/* ── Tailwind v4 theme bridge ───────────────────────────────── */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --font-serif: var(--font-serif);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --shadow-2xs: var(--shadow-2xs);
  --shadow-xs: var(--shadow-xs);
  --shadow-sm: var(--shadow-sm);
  --shadow: var(--shadow);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
  --shadow-xl: var(--shadow-xl);
  --shadow-2xl: var(--shadow-2xl);
  --font-heading: var(--font-sans);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

**8P3P token mapping (for reference when updating `src/server.ts` Swagger theme post-pilot):**

| Legacy hex token (`server.ts`) | Replacement (oklch) | Notes |
|-------------------------------|---------------------|-------|
| `--brand-bg: #ffffff` | `--background: oklch(1 0 0)` | |
| `--brand-text: #000` | `--foreground: oklch(0.1450 0 0)` | Near-black, slightly lighter |
| `--brand-topbar-bg: #000` | `--primary: oklch(0.2050 0 0)` | Use for topbar `bg-primary` |
| `--brand-border: #e5e1dc` | `--border: oklch(0.9220 0 0)` | Note: oklch border is neutral (no warm hue). `--brand-accent-warm` available if warmth is needed. |
| `--brand-accent: #c9d5c4` | `--brand-accent-green` (custom) | Not in base shadcn theme; kept as 8P3P extension |
| `--brand-accent-2: #e4dbc9` | `--brand-accent-warm` (custom) | Not in base shadcn theme; kept as 8P3P extension |

---

## Architecture

### Deployment Model (current)

The Decision Panel is a **standalone Next.js application** deployed separately from the Fastify API.

```
┌─────────────────────────────┐     ┌──────────────────────────────┐
│  Next.js (dashboard/)        │     │  Fastify API (repo root)      │
│  Educator + inspection UI    │────▶│  /v1/*  /docs  /health        │
│  /api/control/* proxy        │     │  SQLite or DynamoDB           │
│  Runtime: CONTROL_LAYER_*    │     │  CORS: DASHBOARD_ALLOWED_*    │
└─────────────────────────────┘     └──────────────────────────────┘
```

**Build:** `cd dashboard && npm run build` → `.next/`. Root `npm run build:dashboard` wraps the same.

**Local dev:** API on `:3000`, dashboard on `:3001` — [`docs/foundation/setup.md`](../foundation/setup.md).

**Production target:** AWS Amplify Hosting (blocked pending account); any Node 22 host with Next 15 SSR until then.

### Deployment Model (legacy — superseded)

<details>
<summary>Fastify-served Vite SPA at <code>/dashboard</code> (pre-2026-06)</summary>

The Decision Panel was previously a static SPA served from the control-layer API server via `@fastify/static` at `/dashboard` with hash routing and `VITE_*` build-time env vars. That path is removed. See git history and `nextjs-amplify-dashboard-migration.md`.

</details>

### Data Flow (current)

```
Decision Panel (Next.js, browser)
     │
     └── GET/POST /api/control/v1/...  (same-origin)
              │
              └── Next route handler → CONTROL_LAYER_API_BASE_URL/v1/...
                    Headers: { "x-api-key": CONTROL_LAYER_API_KEY }  (server-only)
```

Educator pages consume `/v1/learners/:ref/summary`, `/v1/state`, `/v1/receipts`, `/v1/ingestion`, etc. through the proxy. The browser never sends `x-api-key`.

### Auto-Refresh

The panel uses TanStack Query with a configurable `refetchInterval` (default: 30 seconds). The "Refresh Decisions" button in the header triggers an immediate refetch of all queries. No WebSocket required for pilot.

---

## Panel Specifications

### Panel States (all panels)

Every panel must handle three non-data states consistently, matching the patterns established in `src/panels/styles.css`:

| State | Trigger | Rendering |
|-------|---------|-----------|
| **Loading** | Initial fetch or manual refresh in-flight | shadcn/ui `Skeleton` rows at the expected card height — no spinner text |
| **Error** | API returns non-200 (network failure, 401, 500) | Error card with the HTTP status code and a "Retry" button that calls `refetch()`. Use `--urgency-high` red border to match error severity. |
| **Empty** | Query succeeds but no items match the panel's filter | Muted center-aligned message (shadcn/ui `p` with `text-muted-foreground`). Per-panel copy: "No learners need attention right now." / "No skill struggles detected." / "No pending decisions." / "No progress changes yet." |

**Implementation note:** TanStack Query exposes `isLoading`, `isError`, and `data?.length === 0` as distinct states — use all three guards. Do not collapse loading and empty into the same branch.

### Panel 1: "Who Needs Help Now"

**Purpose:** Surface learners with the highest urgency — those with recent `intervene` or `pause` decisions, or rapidly declining metrics.

**Data source:** `GET /v1/learners/:learner_reference/summary` — `recent_decisions` filtered by `decision_type: intervene` or `decision_type: pause`, sorted by urgency, limited to most recent per learner.

**Card layout:**

```
┌─────────────────────────────────────────┐
│  Malosi                          high   │
│  high urgency decision                  │
│  Skill: Weather Patterns                │
└─────────────────────────────────────────┘
```

| Field | Source | Mapping |
|-------|--------|---------|
| Learner name | `decision.learner_reference` | Display as-is (pseudonymous ID or name depending on org config) |
| Urgency badge | `decision.output_metadata.priority` | `1` = `high` (red), `2-3` = `medium` (amber), `4+` = `low` (default) |
| Description | `decision.decision_type` | "high urgency decision", "high decay risk", etc. |
| Skill | `decision.decision_context.skill` | "Skill: {value}" — omitted if not present |

**Sorting:** Priority ascending (1 first), then `decided_at` descending.

**Limit:** Show top 5 learners. If more exist, show count: "+ N more learners".

### Panel 2: "What Do They Need Help With"

**Purpose:** Show the specific skills where learners are struggling, with quoted stability/mastery context.

**Data source:** `GET /v1/state?learner_reference=:ref` for each learner surfaced in Panel 1. Extract `skills.*` entries where `*_direction === "declining"` or `stabilityScore < 0.5`. Per-skill breakdown is **required** by the 9th Grade Literacy Pilot — the summary endpoint cannot substitute here.

**Card layout:**

```
┌─────────────────────────────────────────┐
│  Masina                                 │
│  Classifying Shapes: stability declining│
│  "Understanding is unstable (0%         │
│  stability). May need reinforcement."   │
└─────────────────────────────────────────┘
```

| Field | Source | Mapping |
|-------|--------|---------|
| Learner name | `state.learner_reference` | |
| Skill + status | `skills.{name}.stabilityScore_direction` | "{Skill}: stability {direction}" |
| Quoted rationale | Generated from state data | "Understanding of {skill} is unstable ({stabilityScore * 100}% stability). May need reinforcement." |

**Multiple skills per learner:** If a learner has multiple declining skills, show each as a separate card.

**Footer:** "+ N more issues" link when list is truncated.

### Panel 3: "What Should Happen Next"

**Purpose:** Present the most recent actionable decision for educator review with Approve/Reject controls.

**Data source:** Most recent `intervene` or `pause` entry in `recent_decisions` from `GET /v1/learners/:learner_reference/summary` that has not been marked as reviewed.

**Card layout:**

```
┌─────────────────────────────────────────┐
│  ┌──────────┐                           │
│  │INTERVENE │                           │
│  └──────────┘                           │
│  Malosi                                 │
│  Weather Patterns                       │
│  Persistent misconception detected in   │
│  Weather Patterns. Accuracy is low...   │
│                                         │
│  ┌─────────┐  ┌──────────┐             │
│  │ Approve │  │  Reject  │             │
│  └─────────┘  └──────────┘             │
└─────────────────────────────────────────┘
```

| Field | Source | Mapping |
|-------|--------|---------|
| Decision type badge | `decision.decision_type` | Color-coded: INTERVENE (red), REINFORCE (green), ADVANCE (blue), PAUSE (gray) |
| Learner name | `decision.learner_reference` | |
| Skill | `decision.decision_context.skill` | |
| Rationale | `decision.trace.rationale` | Full text, truncated at 3 lines with "..." expand |
| Approve/Reject | Client-side action | See "Approve/Reject Flow" below |

**Decision type badges (shadcn/ui `Badge` component):**

> The four decision types are the canonical closed set defined in `docs/foundation/terminology.md` (also `src/contracts/schemas/decision.json`). The color assignments below are intentionally **educator-facing** (red = urgent intervention, green = positive reinforcement) and differ from the developer-facing inspection panel colors at `src/panels/styles.css`. `reinforce` and `intervene` are the primary demo anchors per the CEO scope approval.
>
> Colors reference `--status-*` tokens from `globals.css` — do not use raw Tailwind color classes for these. This ensures the urgency palette stays in sync with the token definitions if they change post-pilot.

```tsx
const badgeVariants = {
  intervene: "bg-[var(--status-intervene)] text-white",
  reinforce: "bg-[var(--status-reinforce)] text-white",
  advance:   "bg-[var(--status-advance)] text-white",
  pause:     "bg-[var(--status-pause)] text-white",
};
```

#### Approve/Reject Flow

For pilot scope, Approve/Reject is **client-side state only** — it marks the decision as "reviewed" in the browser (localStorage) and moves to the next unreviewed decision. No API write-back.

**Post-pilot enhancement:** `POST /v1/decisions/:decision_id/review` endpoint that persists educator acknowledgment. Spec deferred.

### Panel 4: "Did the Support Work"

**Purpose:** Show learner progress — which skills have improved since the last decision.

**Data source:** `GET /v1/state?learner_reference=:ref` for org learners. Compare `skills.{name}.{metric}_direction` values. Show entries where `_direction === "improving"`. Per-skill breakdown is **required** by the 9th Grade Literacy Pilot.

**Card layout:**

```
┌─────────────────────────────────────────┐
│  Malosi                       improved  │
│  2D Shape Attributes                    │
│  emerging → novice                      │
└─────────────────────────────────────────┘
```

| Field | Source | Mapping |
|-------|--------|---------|
| Learner name | `state.learner_reference` | |
| Skill | Key from `skills.*` where direction is improving | |
| Progress badge | `_direction` | `improved` (green), `declining` (red), `stable` (gray) |
| Level transition | Compare prior and current state values | Format as "{prior_level} → {current_level}" — levels derived from score thresholds (see below) |

**Level derivation (configurable thresholds):**

| Score Range | Level |
|-------------|-------|
| 0.0 – 0.25 | emerging |
| 0.26 – 0.50 | novice |
| 0.51 – 0.75 | proficient |
| 0.76 – 1.0 | mastery |

These thresholds are defined as a client-side constant. Post-pilot, they can be policy-driven.

**Footer:** "View Full Report (N)" link — for pilot, this navigates to the `/inspect` panels for detailed state/decision views.

---

## Page Layout

### Header

```
┌──────────────────────────────────────────────────────────────┐
│  Decision Panel                              🔄 Refresh      │
│  Intelligence-driven insights from student learning data     │
└──────────────────────────────────────────────────────────────┘
```

- **Title:** "Decision Panel" (h1, `text-2xl font-bold`)
- **Subtitle:** "Intelligence-driven insights from student learning data" (muted text)
- **Refresh button:** shadcn/ui `Button` with `RefreshCw` Lucide icon. Triggers TanStack Query `invalidateQueries()`.
- **Org selector:** Dropdown (shadcn/ui `Select`) prepopulated from API key's org. For single-org pilot, can be hidden.

### Grid

Four equal-width columns on desktop (min 1280px). Stacks to 2x2 on tablet (768–1279px), single column on mobile (<768px).

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 p-6">
  <PanelCard title="Who Needs Help Now" icon={AlertCircle} variant="danger" />
  <PanelCard title="What Do They Need Help With" icon={AlertTriangle} variant="warning" />
  <PanelCard title="What Should Happen Next" icon={Lightbulb} variant="action" />
  <PanelCard title="Did the Support Work" icon={CheckCircle} variant="success" />
</div>
```

### Panel Card Component

Each panel is a shadcn/ui `Card` with:
- **Header:** Icon + title + info tooltip (shadcn/ui `Tooltip`)
- **Body:** Scrollable list of item cards (max-height with overflow-y-auto)
- **Footer:** Truncation indicator or navigation link

```tsx
<Card className="flex flex-col h-[600px]">
  <CardHeader className="flex flex-row items-center gap-2 pb-3">
    <Icon className="h-5 w-5 text-{variant}" />
    <CardTitle className="text-lg">{title}</CardTitle>
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger><Info className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
        <TooltipContent>{description}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </CardHeader>
  <CardContent className="flex-1 overflow-y-auto space-y-3">
    {items.map(item => <ItemCard key={item.id} {...item} />)}
  </CardContent>
  {footer && <CardFooter>{footer}</CardFooter>}
</Card>
```

---

## Component Tree

```
dashboard/
├── src/
│   ├── App.tsx                    # Root: QueryClientProvider + layout
│   ├── main.tsx                   # Vite entry
│   ├── api/
│   │   ├── client.ts             # fetch wrapper with API key header
│   │   ├── fetch-org-decisions.ts # Legacy fan-out helper (unused by panels post-summary migration)
│   │   └── types.ts              # TypeScript types mirroring API response shapes
│   ├── hooks/
│   │   ├── use-decisions.ts      # TanStack Query: GET /v1/decisions (legacy; panels use summary)
│   │   ├── use-learner-summary.ts # TanStack Query: GET /v1/learners/:ref/summary
│   │   ├── use-learner-states.ts # TanStack Query: GET /v1/state (per learner, Panels 2/4)
│   │   ├── use-learner-list.ts   # TanStack Query: GET /v1/state/list
│   │   └── use-signals.ts        # TanStack Query: GET /v1/signals (optional; not prefetched in MVP)
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components (Card, Badge, Button, etc.)
│   │   ├── layout/
│   │   │   ├── Header.tsx        # Title + subtitle + refresh + org selector
│   │   │   ├── PanelCard.tsx     # Reusable panel card shell (icon, title, tooltip, scroll body)
│   │   │   ├── panel-states.tsx  # PanelSkeleton, PanelError, PanelEmpty shared states
│   │   ├── panels/
│   │   │   ├── WhoNeedsAttention.tsx
│   │   │   ├── WhyAreTheyStuck.tsx
│   │   │   ├── WhatToDo.tsx
│   │   │   └── DidItWork.tsx
│   │   └── shared/
│   │       ├── LearnerCard.tsx   # Reusable learner name + badge card
│   │       ├── DecisionBadge.tsx # Color-coded decision type badge
│   │       ├── UrgencyBadge.tsx  # Priority-based urgency indicator
│   │       └── ProgressBadge.tsx # improved/declining/stable badge
│   ├── lib/
│   │   ├── score-levels.ts       # Score → level mapping (emerging/novice/proficient/mastery)
│   │   ├── rationale-builder.ts  # Build human-readable rationale from state data
│   │   ├── decision-review.ts    # localStorage-backed approve/reject state
│   │   ├── attention-decisions.ts # Filter + rank intervene/pause decisions per learner
│   │   ├── panel-helpers.ts      # skillDisplayLine() and shared panel utilities
│   │   ├── query-client.ts       # Shared QueryClient instance
│   │   ├── state-skills.ts       # Extract skill rows + pilot literacy skill labels
│   │   └── utils.ts              # cn() utility (clsx + tailwind-merge)
│   └── styles/
│       └── globals.css           # Tailwind directives + 8P3P design tokens
├── e2e/
│   └── decision-panel.spec.ts    # Playwright e2e tests (DPU-001–006, DPU-009)
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── components.json               # shadcn/ui config (base-nova style)
```

---

## API Data Contracts (Consumed)

The Decision Panel is a **read-only consumer** of existing API endpoints. Panels 1 and 3 use the learner summary endpoint; Panels 2 and 4 require full per-skill state. No new write paths for MVP.

| Endpoint | Used By Panel | Fields Consumed |
|----------|--------------|-----------------|
| `GET /v1/state/list` | All (learner index) | `learners[].learner_reference`, `learners[].state_version` |
| `GET /v1/learners/:learner_reference/summary` | 1, 3 | `recent_decisions[]`, `current_state.fields.skill`, `recent_decisions[].educator_summary`, `recent_decisions[].rationale`, `recent_decisions[].decision_type`, `recent_decisions[].decided_at` |
| `GET /v1/state?learner_reference=:ref` | 2, 4 | `state.skills.{name}.stabilityScore`, `state.skills.{name}.stabilityScore_direction`, `state.skills.{name}.stabilityScore_delta`, `state.skills.{name}.masteryScore`, `state.skills.{name}.masteryScore_direction`, `state.skills.{name}.masteryScore_delta` |
| `GET /v1/policies` | 3 (context) | `policy_key`, `rules[].rule_id`, `rules[].decision_type` (for rationale context) |

### Dependency on skill-level-tracking spec

Panels 1, 2, and 4 depend on `decision_context.skill`, `skills.*.stabilityScore_direction`, and nested delta fields. These are delivered by `docs/specs/skill-level-tracking.md` (Changes 1-4). The Decision Panel spec assumes skill-level-tracking is implemented.

**Graceful degradation:** If `decision_context.skill` is absent (flat-field policy, pre-skill-tracking), the "Skill:" line is hidden. The panel still shows the learner, decision type, and rationale. This ensures the UI works during incremental rollout.

---

## Requirements

### Functional

- [ ] Four-panel layout matching literacy pilot guide: "Who Needs Help Now", "What Do They Need Help With", "What Should Happen Next", "Did the Support Work"
- [ ] Uses summary endpoint for decision panels (1, 3); per-skill panels (2, 4) read `GET /v1/state`. No new write paths.
- [ ] Auto-refresh every 30 seconds via TanStack Query polling
- [ ] Manual "Refresh Decisions" button in header
- [ ] Decision type badges color-coded: intervene (red), reinforce (green), advance (blue), pause (gray)
- [ ] Urgency badges derived from `output_metadata.priority`
- [ ] Progress level labels derived from score thresholds (emerging/novice/proficient/mastery)
- [ ] Approve/Reject buttons on "What Should Happen Next" panel (client-side localStorage state for pilot)
- [ ] Graceful degradation when `skill` or `assessment_type` fields are absent
- [ ] Org selector (or env-configured single-org mode)
- [ ] API key configurable via environment variable or login prompt

### Non-Functional

- [ ] Responsive: 4-col (xl), 2-col (md), 1-col (sm)
- [ ] Accessible: WCAG 2.1 AA — proper ARIA labels, keyboard navigation, color contrast
- [ ] Performance: initial load < 2s on 3G; bundle < 200KB gzipped
- [ ] No authentication UI — API key is configured per deployment (env var or simple input prompt)
- [ ] Works as static build served from Fastify or standalone (S3/CloudFront)

### Design

- [ ] shadcn/ui components for all interactive elements (Card, Badge, Button, Select, Tooltip)
- [ ] Tailwind CSS utility classes — no custom CSS files beyond `globals.css`
- [ ] 8P3P brand tokens applied (black topbar, warm accent palette, system sans-serif font stack)
- [ ] Lucide React icons matching panel semantics (AlertCircle, AlertTriangle, Lightbulb, CheckCircle)
- [ ] Clean whitespace, consistent padding (`p-6`), subtle borders (`border-border`)

---

## Acceptance Criteria

- Given a deployed control layer with seeded learner data, when the Decision Panel loads at the dashboard root URL, then educator surfaces render with data within 3 seconds.
- Given a learner with `decision_type: intervene` and dominant skill `text_evidence`, when "Who Needs Help Now" renders, then the learner card shows urgency badge and "Skill: text_evidence" (or mapped literacy label).
- Given a learner with `skills.text_evidence.stabilityScore_direction: "declining"`, when "What Do They Need Help With" renders, then the card shows "Text Evidence: stability declining" with a quoted rationale.
- Given a recent intervene decision, when "What Should Happen Next" renders, then the INTERVENE badge, learner name, skill, and rationale are displayed with Approve/Reject buttons.
- Given a learner with `skills.text_evidence.masteryScore_direction: "improving"` and masteryScore increasing from 0.20 to 0.40, when "Did the Support Work" renders, then the card shows "emerging → novice" with an "improved" badge.
- Given the Approve button is clicked, when the same decision panel loads again, then that decision is no longer shown (stored in localStorage).
- Given a flat-field policy (no `skill` in decision_context), when panels render, then the "Skill:" line is absent but all other card content renders normally.
- Given the "Refresh" button is clicked, then all panel data refreshes immediately.
- Given a viewport width < 768px, then panels stack in a single column.

---

## Constraints

- **No new write paths for MVP.** Panels read from `GET /v1/learners/:ref/summary` (decision panels) and `GET /v1/state` (per-skill panels). All aggregation logic (grouping by urgency, extracting skill trends, deriving levels) happens client-side.
- **No write-back for Approve/Reject in MVP.** Educator review state is localStorage only. Post-pilot, add `POST /v1/decisions/:id/review`.
- **Passphrase gate (not full SSO).** Human access via `DASHBOARD_ACCESS_CODE` + session cookie on the **dashboard app** — [`dashboard-passphrase-gate.md`](dashboard-passphrase-gate.md). API key stays server-side via proxy.
- **No admin capabilities.** No policy editing, no field mapping config, no tenant management. This is a proof surface, not a dashboard.
- **Separate `package.json`.** The `dashboard/` directory has its own dependencies, build scripts, and tsconfig. It does not share dependencies with the backend.

---

## Out of Scope

| Item | Rationale | Revisit When |
|------|-----------|--------------|
| Full admin dashboard (policy CRUD, field mapping config, tenant management) | CEO directive: not needed for pilot proof | Post-contract, Phase 2 |
| User authentication / RBAC | Single API key per org is sufficient for pilot | Phase 2 admin platform |
| WebSocket real-time updates | 30s polling is adequate for pilot volume | Phase 2 if needed |
| Decision write-back (Approve/Reject persisted) | Client-side state sufficient for demo | Post-pilot `POST /v1/decisions/:id/review` |
| Cross-learner aggregation ("all students in fractions") | Individual learner view is the proof | Phase 2 analytics |
| Embeddable widget / iframe mode | Dashboard is standalone for pilot | Phase 3 partner embedding |
| Mobile native app | Responsive web is sufficient | Phase 4 |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| `GET /v1/decisions` with `decision_context.skill` | `docs/specs/skill-level-tracking.md` (Change 4) | **Implemented** |
| `GET /v1/state` with nested `skills.*` + delta companions | `docs/specs/skill-level-tracking.md` (Changes 1-3) | **Implemented** |
| `GET /v1/state/list` | `docs/specs/inspection-api.md` | **Implemented** |
| `GET /v1/decisions` | `docs/specs/decision-engine.md` | **Implemented** |
| `GET /v1/policies` | `docs/specs/policy-inspection-api.md` | **Implemented** |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| Pilot proof surface | Pilot close — demonstrates system value to school staff |
| Decision review UX pattern | Future admin dashboard decision management |
| Brand component library (shadcn/ui + 8P3P tokens) | Future admin platform UI |

---

## Contract Tests

| Test ID | Type | Description | Expected |
|---------|------|-------------|----------|
| DPU-001 | e2e | Panel loads with seeded data | All 4 panels render within 3s |
| DPU-002 | e2e | "Who Needs Help Now" shows intervene decisions | Cards show learner, urgency, skill |
| DPU-003 | e2e | "What Do They Need Help With" shows declining skills | Cards show skill name, direction, stability % |
| DPU-004 | e2e | "What Should Happen Next" shows decision with Approve/Reject | Badge, learner, rationale, buttons visible |
| DPU-005 | e2e | "Did the Support Work" shows improving skills | Cards show level transition, improved badge |
| DPU-006 | e2e | Approve button hides decision on next render | Decision removed from "What Should Happen Next" after approve |
| DPU-007 | unit | Score-to-level mapping | 0.20 → "emerging", 0.40 → "novice", 0.60 → "proficient", 0.90 → "mastery" |
| DPU-008 | unit | Graceful degradation without skill field | Card renders without "Skill:" line |
| DPU-009 | e2e | Refresh button triggers data reload | Network requests to `/v1/learners/` (Panels 1/3) and `/v1/state` (Panels 2/4) |
| DPU-010 | visual | Responsive layout — xl: 4-col, md: 2-col, sm: 1-col | Layout adapts to viewport |

> **Test strategy:** DPU-001 through DPU-006 and DPU-009 are browser-based e2e tests (Playwright or Cypress). DPU-007 and DPU-008 are Vitest unit tests implemented in `tests/contracts/decision-panel-ui.test.ts` — per the document-traceability rule, spec-defined test IDs belong in `tests/contracts/`, not `tests/unit/`. DPU-010 is a visual/manual test.

---

## Implementation Notes

- **shadcn/ui:** Initialized in `dashboard/components.json`; components under `dashboard/components/ui/`.
- **API client:** `dashboard/lib/api/client.ts` calls same-origin `/api/control/*`; the route handler adds `x-api-key` server-side. No client `VITE_*` or browser API key.
- **Rationale builder:** `dashboard/lib/rationale-builder.ts` — client-side presentation; decision trace `rationale` / `educator_summary` remain authoritative when present.
- **Build:** Root `"build:dashboard": "cd dashboard && npm ci --quiet && npm run build"` produces `.next/`. Fastify does **not** serve the dashboard.
- **Demo seed:** `npm run seed:springs-demo` + `CONTROL_LAYER_ORG_ID=springs` in `dashboard/.env.local` — see [`docs/foundation/setup.md`](../foundation/setup.md).

---

## Pilot Onboarding Integration

The Decision Panel is referenced in the internal onboarding workflow. When deploying for a new pilot customer:

1. **Readiness gate:** Decision Panel deployment is a required gate in the [Pilot Readiness Definition](../../internal-docs/pilot-operations/pilot-readiness-definition.md)
2. **Onboarding call:** The Decision Panel walkthrough is part of the standard onboarding call agenda — see [Onboarding Runbook Phase 2](../../internal-docs/pilot-operations/onboarding-runbook.md#phase-2-onboarding-call-day-1-2)
3. **Customer docs:** The Decision Panel is documented for customers in [Pilot Integration Guide §14](../guides/pilot-integration-guide.md#14-decision-panel--see-decisions-visually)
4. **Pilot close:** The four-panel walkthrough with live data is the primary proof artifact — see [Onboarding Runbook Phase 5](../../internal-docs/pilot-operations/onboarding-runbook.md#phase-5-pilot-close--renewal)
5. **PII access control:** The passphrase gate spec defines the auth layer — see [Dashboard Passphrase Gate](dashboard-passphrase-gate.md)

---

*Spec created: 2026-04-10 | Updated: 2026-04-14 (post-impl-doc-sync #2: level transition format `>` → `→` to match DidItWork.tsx; "Refresh Decisions" → "Refresh" button label to match Header.tsx) | Phase: v1.1 (Pilot Wave 2) | Depends on: skill-level-tracking.md (Pilot Wave 1). Recommended next: `/review --spec docs/specs/decision-panel-ui.md`.*
