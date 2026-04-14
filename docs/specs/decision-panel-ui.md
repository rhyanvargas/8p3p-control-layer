# Decision Panel UI

> A lightweight, read-only proof surface that makes the control layer's intelligence visible to school staff — four panels answering: Who needs attention? Why are they stuck? What should we do? Did it work?

## Overview

The API produces decisions, traces, state, and deltas. But for a pilot school, JSON responses are invisible. The Decision Panel is the **minimum viable proof surface** — a single-page React application that reads from existing API endpoints and presents the control layer's output in an educator-friendly four-panel layout.

**This is not an admin dashboard.** It has no CRUD, no configuration, no user management. It is a read-only window into the engine's intelligence output. It exists to close the pilot: show the school that the system works, decisions are clear, and rationale is transparent.

### CEO Directive (2026-04-10)

> "I believe for pilot one, we should prioritize the end-to-end control-layer loop plus a very lightweight proof surface, not a full tenant or admin dashboard. APIs alone may be too invisible for the school, but a full dashboard is more than we need right now."

### Reference Design

The Decision Panel mockup (CEO-provided) defines four panels:

| Panel | Header | Icon/Color | Content |
|-------|--------|------------|---------|
| **Who Needs Attention?** | Alert icon, red accents | Learner cards with urgency level (`high`), decision type, skill context |
| **Why Are They Stuck?** | Warning icon, amber accents | Learner cards showing specific skill, stability status, quoted rationale |
| **What To Do?** | Lightbulb icon, green/teal accents | Single decision card with `INTERVENE` / `REINFORCE` badge, rationale, **Approve/Reject** buttons |
| **Did It Work?** | Checkmark icon, green accents | Progress cards showing learner + skill, level transition (`emerging → novice`), `improved` badge |

---

## Tech Stack

| Category | Technology | Version | Rationale |
|----------|------------|---------|-----------|
| Framework | React | 19+ (latest) | Industry standard, large ecosystem, team familiarity |
| Component Library | shadcn/ui | latest | Composable, accessible, unstyled primitives — full design control without fighting a design system |
| Styling | Tailwind CSS | 4+ (latest) | Utility-first, rapid iteration, consistent spacing/color, no custom CSS files |
| Build Tool | Vite | latest | Fast HMR, native ESM, minimal config |
| Language | TypeScript | ^5.9 | Matches control-layer backend |
| HTTP Client | Native `fetch` | — | No external dependency; API is same-origin or CORS-configured |
| State Management | React Query (TanStack Query) | latest | Automatic polling, caching, refetch — purpose-built for server-state UIs |
| Icons | Lucide React | latest | Default icon set for shadcn/ui, consistent with design language |

### Design Tokens (8P3P Brand)

```
--brand-bg:           #ffffff
--brand-text:         #111111
--brand-topbar-bg:    #000000
--brand-border:       #e5e1dc
--brand-accent-green: #c9d5c4
--brand-accent-warm:  #e4dbc9

--urgency-high:       #dc2626  (red-600)
--urgency-medium:     #f59e0b  (amber-500)
--status-intervene:   #dc2626  (red-600 bg, white text)
--status-reinforce:   #16a34a  (green-600 bg, white text)
--status-advance:     #2563eb  (blue-600 bg, white text)
--status-pause:       #6b7280  (gray-500 bg, white text)
--progress-improved:  #16a34a  (green-600)
--progress-declining: #dc2626  (red-600)
--progress-stable:    #6b7280  (gray-500)
```

---

## Architecture

### Deployment Model

The Decision Panel is a **static SPA** served from the control-layer API server. No separate hosting required.

```
┌──────────────────────────────────────────────────┐
│  Fastify Server (existing)                        │
│                                                    │
│  /v1/*          → API routes (existing)            │
│  /docs          → Swagger UI (existing)            │
│  /inspect       → Inspection panels (existing)     │
│  /dashboard     → Decision Panel SPA (NEW)         │
│                    Served via @fastify/static       │
│                    Build output: dashboard/dist/    │
└──────────────────────────────────────────────────┘
```

**Build process:** The Decision Panel lives in a `dashboard/` subdirectory at the project root. `npm run build:dashboard` compiles to `dashboard/dist/`. The Fastify server registers a second `@fastify/static` instance at `/dashboard` pointing to this dist folder. The SPA handles client-side routing.

**Alternative (if separate deploy preferred):** The SPA can be deployed to S3 + CloudFront independently, pointed at the API via `VITE_API_BASE_URL`. The spec supports both — the SPA is stateless and only needs fetch access to the API.

### Data Flow

```
Decision Panel (React SPA)
     │
     ├── GET /v1/state/list?org_id=:org         → learner list
     ├── GET /v1/decisions?org_id=:org&...       → decisions with traces
     ├── GET /v1/state?org_id=:org&learner=:ref  → current learner state
     ├── GET /v1/signals?org_id=:org&...         → signal history
     └── GET /v1/policies?org_id=:org            → active policy (for rule context)
     
     Headers: { "x-api-key": "<tenant_api_key>" }
```

All requests use the existing tenant API key. No new auth mechanism required.

### Auto-Refresh

The panel uses TanStack Query with a configurable `refetchInterval` (default: 30 seconds). The "Refresh Decisions" button in the header triggers an immediate refetch of all queries. No WebSocket required for pilot.

---

## Panel Specifications

### Panel 1: "Who Needs Attention?"

**Purpose:** Surface learners with the highest urgency — those with recent `intervene` or `pause` decisions, or rapidly declining metrics.

**Data source:** `GET /v1/decisions` filtered by `decision_type: intervene` or `decision_type: pause`, sorted by `decided_at DESC`, limited to most recent per learner.

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

### Panel 2: "Why Are They Stuck?"

**Purpose:** Show the specific skills where learners are struggling, with quoted stability/mastery context.

**Data source:** `GET /v1/state` for each learner from Panel 1. Extract `skills.*` entries where `*_direction === "declining"` or `stabilityScore < 0.5`.

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
| Quoted rationale | Generated from state data | "Understanding is unstable ({stabilityScore * 100}% stability). May need reinforcement." |

**Multiple skills per learner:** If a learner has multiple declining skills, show each as a separate card.

**Footer:** "+ N more issues" link when list is truncated.

### Panel 3: "What To Do?"

**Purpose:** Present the most recent actionable decision for educator review with Approve/Reject controls.

**Data source:** Most recent `intervene` or `pause` decision that has not been marked as reviewed.

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

```tsx
const badgeVariants = {
  intervene: "bg-red-600 text-white",
  reinforce: "bg-green-600 text-white", 
  advance:   "bg-blue-600 text-white",
  pause:     "bg-gray-500 text-white",
};
```

#### Approve/Reject Flow

For pilot scope, Approve/Reject is **client-side state only** — it marks the decision as "reviewed" in the browser (localStorage) and moves to the next unreviewed decision. No API write-back.

**Post-pilot enhancement:** `POST /v1/decisions/:decision_id/review` endpoint that persists educator acknowledgment. Spec deferred.

### Panel 4: "Did It Work?"

**Purpose:** Show learner progress — which skills have improved since the last decision.

**Data source:** Compare current state `skills.{name}.{metric}_direction` values. Show entries where `_direction === "improving"`.

**Card layout:**

```
┌─────────────────────────────────────────┐
│  Malosi                       improved  │
│  2D Shape Attributes                    │
│  emerging > novice                      │
└─────────────────────────────────────────┘
```

| Field | Source | Mapping |
|-------|--------|---------|
| Learner name | `state.learner_reference` | |
| Skill | Key from `skills.*` where direction is improving | |
| Progress badge | `_direction` | `improved` (green), `declining` (red), `stable` (gray) |
| Level transition | Compare prior and current state values | Format as "{prior_level} > {current_level}" — levels derived from score thresholds (see below) |

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
  <PanelCard title="Who Needs Attention?" icon={AlertCircle} variant="danger" />
  <PanelCard title="Why Are They Stuck?" icon={AlertTriangle} variant="warning" />
  <PanelCard title="What To Do?" icon={Lightbulb} variant="action" />
  <PanelCard title="Did It Work?" icon={CheckCircle} variant="success" />
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
│   │   └── client.ts             # fetch wrapper with API key header
│   ├── hooks/
│   │   ├── use-decisions.ts      # TanStack Query: GET /v1/decisions
│   │   ├── use-learner-states.ts # TanStack Query: GET /v1/state (per learner)
│   │   ├── use-learner-list.ts   # TanStack Query: GET /v1/state/list
│   │   └── use-signals.ts        # TanStack Query: GET /v1/signals
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components (Card, Badge, Button, etc.)
│   │   ├── layout/
│   │   │   └── Header.tsx        # Title + subtitle + refresh + org selector
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
│   │   └── decision-review.ts    # localStorage-backed approve/reject state
│   └── styles/
│       └── globals.css           # Tailwind directives + 8P3P design tokens
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── components.json               # shadcn/ui config
```

---

## API Data Contracts (Consumed)

The Decision Panel is a **read-only consumer** of existing API endpoints. No new endpoints are required for the pilot MVP. All endpoints are already implemented and deployed.

| Endpoint | Used By Panel | Fields Consumed |
|----------|--------------|-----------------|
| `GET /v1/state/list` | All | `learners[].learner_reference`, `learners[].state_version` |
| `GET /v1/decisions` | 1, 3 | `decision_type`, `decided_at`, `learner_reference`, `decision_context.skill`, `decision_context.assessment_type`, `trace.rationale`, `trace.matched_rule_id`, `trace.evaluated_fields`, `output_metadata.priority` |
| `GET /v1/state` | 2, 4 | `state.skills.{name}.stabilityScore`, `state.skills.{name}.stabilityScore_direction`, `state.skills.{name}.stabilityScore_delta`, `state.skills.{name}.masteryScore` |
| `GET /v1/policies` | 3 (context) | `policy_key`, `rules[].rule_id`, `rules[].decision_type` (for rationale context) |

### Dependency on skill-level-tracking spec

Panels 1, 2, and 4 depend on `decision_context.skill`, `skills.*.stabilityScore_direction`, and nested delta fields. These are delivered by `docs/specs/skill-level-tracking.md` (Changes 1-4). The Decision Panel spec assumes skill-level-tracking is implemented.

**Graceful degradation:** If `decision_context.skill` is absent (flat-field policy, pre-skill-tracking), the "Skill:" line is hidden. The panel still shows the learner, decision type, and rationale. This ensures the UI works during incremental rollout.

---

## Requirements

### Functional

- [ ] Four-panel layout matching CEO mockup: "Who Needs Attention?", "Why Are They Stuck?", "What To Do?", "Did It Work?"
- [ ] Each panel populated from existing API endpoints — no new backend endpoints for MVP
- [ ] Auto-refresh every 30 seconds via TanStack Query polling
- [ ] Manual "Refresh Decisions" button in header
- [ ] Decision type badges color-coded: intervene (red), reinforce (green), advance (blue), pause (gray)
- [ ] Urgency badges derived from `output_metadata.priority`
- [ ] Progress level labels derived from score thresholds (emerging/novice/proficient/mastery)
- [ ] Approve/Reject buttons on "What To Do?" panel (client-side localStorage state for pilot)
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
- [ ] 8P3P brand tokens applied (black topbar, warm accent palette, Inter font)
- [ ] Lucide React icons matching panel semantics (AlertCircle, AlertTriangle, Lightbulb, CheckCircle)
- [ ] Clean whitespace, consistent padding (`p-6`), subtle borders (`border-border`)

---

## Acceptance Criteria

- Given a deployed control layer with seeded learner data, when the Decision Panel loads at `/dashboard`, then all four panels render with data within 3 seconds.
- Given a learner with `decision_type: intervene` and `decision_context.skill: "Weather Patterns"`, when "Who Needs Attention?" renders, then the learner card shows urgency badge and "Skill: Weather Patterns".
- Given a learner with `skills.fractions.stabilityScore_direction: "declining"`, when "Why Are They Stuck?" renders, then the card shows "fractions: stability declining" with a quoted rationale.
- Given a recent intervene decision, when "What To Do?" renders, then the INTERVENE badge, learner name, skill, and rationale are displayed with Approve/Reject buttons.
- Given a learner with `skills.shapes.masteryScore_direction: "improving"` and masteryScore increasing from 0.20 to 0.40, when "Did It Work?" renders, then the card shows "emerging > novice" with an "improved" badge.
- Given the Approve button is clicked, when the same decision panel loads again, then that decision is no longer shown (stored in localStorage).
- Given a flat-field policy (no `skill` in decision_context), when panels render, then the "Skill:" line is absent but all other card content renders normally.
- Given the "Refresh Decisions" button is clicked, then all panel data refreshes immediately.
- Given a viewport width < 768px, then panels stack in a single column.

---

## Constraints

- **No new API endpoints for MVP.** The panel reads from existing `GET /v1/*` routes. All aggregation logic (grouping by urgency, extracting skill trends, deriving levels) happens client-side.
- **No write-back for Approve/Reject in MVP.** Educator review state is localStorage only. Post-pilot, add `POST /v1/decisions/:id/review`.
- **No user authentication UI.** API key is injected via `VITE_API_KEY` env var at build time, or prompted once on first visit and stored in localStorage.
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
| `GET /v1/decisions` with `decision_context.skill` | `docs/specs/skill-level-tracking.md` (Change 4) | **Spec'd** |
| `GET /v1/state` with nested `skills.*` + delta companions | `docs/specs/skill-level-tracking.md` (Changes 1-3) | **Spec'd** |
| `GET /v1/state/list` | `docs/specs/inspection-api.md` | **Implemented** |
| `GET /v1/decisions` | `docs/specs/decision-engine.md` | **Implemented** |
| `GET /v1/policies` | `docs/specs/policy-inspection-api.md` | **Spec'd** |

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
| DPU-002 | e2e | "Who Needs Attention?" shows intervene decisions | Cards show learner, urgency, skill |
| DPU-003 | e2e | "Why Are They Stuck?" shows declining skills | Cards show skill name, direction, stability % |
| DPU-004 | e2e | "What To Do?" shows decision with Approve/Reject | Badge, learner, rationale, buttons visible |
| DPU-005 | e2e | "Did It Work?" shows improving skills | Cards show level transition, improved badge |
| DPU-006 | e2e | Approve button hides decision on next render | Decision removed from "What To Do?" after approve |
| DPU-007 | unit | Score-to-level mapping | 0.20 → "emerging", 0.40 → "novice", 0.60 → "proficient", 0.90 → "mastery" |
| DPU-008 | unit | Graceful degradation without skill field | Card renders without "Skill:" line |
| DPU-009 | e2e | Refresh button triggers data reload | Network requests fired, data refreshed |
| DPU-010 | visual | Responsive layout — xl: 4-col, md: 2-col, sm: 1-col | Layout adapts to viewport |

> **Test strategy:** DPU-001 through DPU-006 and DPU-009 are browser-based e2e tests (Playwright or Cypress). DPU-007, DPU-008 are Vitest unit tests. DPU-010 is a visual/manual test.

---

## Implementation Notes

- **shadcn/ui init:** Run `npx shadcn@latest init` in `dashboard/` to scaffold the component library. Add components incrementally: `npx shadcn@latest add card badge button select tooltip`.
- **API client:** A thin `fetch` wrapper in `api/client.ts` that prepends `VITE_API_BASE_URL` (default: same origin) and adds `x-api-key` header. No Axios or other HTTP library needed.
- **Rationale builder:** `rationale-builder.ts` constructs human-readable sentences from state data: e.g., `stabilityScore: 0.22` → "Understanding is unstable (22% stability). May need reinforcement." This is purely client-side presentation logic — the decision trace `rationale` field is the authoritative source when available.
- **Build integration:** Add `"build:dashboard": "cd dashboard && npm run build"` to root `package.json`. The Fastify server registers `dashboard/dist/` as a static directory at `/dashboard`.
- **Demo seed compatibility:** The existing `npm run seed:demo` and `npm run seed:springs-demo` scripts produce decisions, states, and signals that the Decision Panel can display immediately — no additional seeding required once skill-level-tracking is implemented.

---

*Spec created: 2026-04-10 | Phase: v1.1 (Pilot Wave 2) | Depends on: skill-level-tracking.md (Pilot Wave 1). Recommended next: `/plan-impl docs/specs/decision-panel-ui.md`*
