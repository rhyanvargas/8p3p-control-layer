# Next.js + AWS Amplify Dashboard Migration

> Migrate the Decision Panel from a Vite + React SPA (served by Fastify at `/dashboard/`) to a standalone **Next.js** application hosted on **AWS Amplify Hosting**. The Fastify control-layer API, CDK stack, and DynamoDB data plane are **unchanged**.

---

## ⛔ Stage Gate — AWS account is BLOCKED (do not provision yet)

> **Status (2026-06-12): AWS startup credits not yet applied for.** No AWS account exists for this workstream. Until this status is updated by the repo owner:
>
> - **DO NOT** create an Amplify app, AWS account, IAM roles, Cognito user pool, or any billable AWS resource.
> - **DO NOT** pull AWS cost estimates (deferred until the credits/account decision is made).
> - Work is limited to **local, non-AWS** phases: Next.js scaffolding, route handlers, middleware auth, local build/test, CI build job (no deploy step).
> - Phases tagged **`[AWS-BLOCKED]`** below are parked until the account exists.
>
> When credits are approved and an account exists, the owner will update this banner to `Status: AWS account available` and the `[AWS-BLOCKED]` phases unblock.

---

## Overview

The Decision Panel (`dashboard/`) is today a **Vite 8 + React 19 SPA** with a single API client (`dashboard/src/api/client.ts`) that injects a **build-time** `VITE_API_KEY` into the browser bundle. It is built by Fastify (`@fastify/static`) and served at `/dashboard/`, gated by the passphrase session cookie (`docs/specs/dashboard-passphrase-gate.md`).

This spec migrates that SPA to a **standalone Next.js (App Router) app on AWS Amplify Hosting**, for two concrete wins backed by evidence:

1. **Removes the client-exposed API key.** With Next.js server **route handlers**, the `x-api-key` is held server-side (`CONTROL_LAYER_API_KEY`, no `NEXT_PUBLIC_` prefix → never bundled), directly closing the risk documented in `docs/specs/dashboard-passphrase-gate.md` (§ "API key baked into the build is not defensible").
2. **Decouples frontend hosting from the API.** Fastify reverts to a pure API; the dashboard deploys independently on Amplify with branch previews and managed SSR.

**Frontend owns all data viz, drill-down, and reporting.** The Next.js dashboard consolidates **both** the product Decision Panel views **and** the four read-only inspection panels currently served from Fastify at `/inspect` (`docs/specs/inspection-panels.md`): Signal Intake, State Viewer (with version drill-down), Decision Stream, and Decision Trace/Receipt. After migration there is a single frontend; Fastify serves API + Swagger only. Inside the authenticated dashboard these inspection views are an **upgrade** — they no longer require a raw client-side API-key input (the server-side proxy holds the key).

**Non-goals:** This spec does **not** migrate the Fastify control layer, the 5 Lambda handlers, the CDK stack, or the DynamoDB tables into Next.js/Amplify. That was evaluated and rejected (see § Constraints and § Out of Scope — "Full-stack Amplify Gen 2"). It also does **not** move Swagger `/docs` (API reference, not data viz) — that stays on Fastify.

**Version constraint (evidence):** Latest Next.js is **16.2.x** (Jun 2026), but AWS Amplify Hosting's managed SSR officially supports **Next.js 12–15 only** ([Amplify docs](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html)). This spec therefore pins **Next.js 15.5.x (SSR)** as the target. Next 16 SSR is revisited when Amplify documents support. React 19 (already in use) is compatible with Next 15.

**Design source of truth:** This spec covers **execution and hosting** only. The dashboard is being **redesigned from the ground up** (layout, navigation, pages, components, UX) per **`docs/specs/dashboard-design-requirements.md`** — that document owns all design decisions (IA, sidebar/topbar, page hierarchy, component catalog, states, responsive, visual language). This migration **does not** port the old Vite SPA 1:1; it rebuilds the UI to that design while delivering the same hosting/auth/proxy outcomes. Where this spec previously implied a like-for-like port, the design doc takes precedence on UI.

---

## Requirements

### Functional

#### Phase 1 — Next.js app shell + redesign foundation (local, NOT AWS-blocked)
- [ ] `dashboard/` is a Next.js 15.5.x App Router project (TypeScript, Tailwind 4, shadcn/ui, lucide-react, TanStack Query) built to the **app shell, IA, and component catalog in `docs/specs/dashboard-design-requirements.md`** (sidebar + topbar + page hierarchy). The old Vite SPA UI is **not** ported 1:1.
- [ ] The educator surfaces (legacy "Who Needs Help / What Do They Need Help With / What Should Happen Next / Did the Support Work") are rebuilt as the **Overview / Attention / Learners** pages defined in the design doc (§5–§8).
- [ ] The browser **no longer** sends `x-api-key`. All control-layer calls go through the Next **route-handler proxy** (`app/api/control/[...path]`) that attaches `CONTROL_LAYER_API_KEY` server-side and forwards to `CONTROL_LAYER_API_BASE_URL`.
- [ ] Data fetching uses the proxy (no `VITE_*` variables remain referenced anywhere in the dashboard).

#### Phase 1b — Inspection & reporting consolidation (local, NOT AWS-blocked)
- [ ] The four inspection surfaces (`docs/specs/inspection-panels.md`) are rebuilt as the **Signals / Decisions / Learner-detail (State) / Decision-detail (Trace)** pages per the design doc (§6, §8), consuming `/v1/*` through the server-side proxy (no raw client API-key input):
  - [ ] **Signal Intake** — `GET /v1/ingestion` with outcome filter (accepted/duplicate/rejected), rejection-reason drill-down, cursor pagination.
  - [ ] **State Viewer** — `GET /v1/state/list` + `GET /v1/state` with **version drill-down** (historical `version=n`), canonical-field + raw-JSON views.
  - [ ] **Decision Stream** — `GET /v1/receipts` with org/learner/time filters; row click drills into Decision Trace.
  - [ ] **Decision Trace / Receipt** — full audit record (rationale, evaluated thresholds, state snapshot, rule condition) with JSON export.
- [ ] Read-only doctrine preserved: inspection views perform **no** mutations (consistent with `inspection-panels.md` § Constraints and the "no UI ownership" principle).
- [ ] The Fastify-served static `/inspect` panels remain available until dashboard parity is verified, then are removed in Phase 3.

#### Phase 2 — Auth carry-over (local, NOT AWS-blocked)
- [ ] The passphrase gate (`DASHBOARD_ACCESS_CODE` + HMAC `dp_session` cookie) is reimplemented as **Next.js middleware** + a login route, reusing the exact cookie scheme in `docs/specs/dashboard-passphrase-gate.md` (§ Cookie Value Structure) and `COOKIE_SECRET`.
- [ ] When `DASHBOARD_ACCESS_CODE` is unset, the gate is disabled (local-dev backward compatible), matching current behavior.
- [ ] Fastify’s dashboard serving and login routes (`@fastify/static` for `dashboard/dist`, `GET/POST /dashboard/login`, `/dashboard/logout`) are **removed** from `src/server.ts`; Fastify becomes API-only.

#### Phase 3 — CORS + API decoupling (local, NOT AWS-blocked)
- [ ] `@fastify/cors` is added to the control layer, allowing the dashboard origin(s) with credentials. (New requirement: dashboard and API are no longer same-origin.)
- [ ] After dashboard parity for all inspection views is verified, Fastify’s static `/inspect` serving (`src/panels/`) is removed.
- [ ] `/v1/*`, `/v1/admin/*`, `/docs` (Swagger), `/health` remain unchanged on Fastify.

#### Phase 4 — Build/CI (local build NOT blocked; deploy `[AWS-BLOCKED]`)
- [ ] `amplify.yml` exists at the dashboard app root with Node 22 pinned (build is locally reproducible via `next build`).
- [ ] `.github/workflows/ci.yml` gains a `dashboard` job: `next build` + `typecheck` + Playwright e2e. Existing server/CDK jobs unchanged.
- [ ] **`[AWS-BLOCKED]`** Amplify app creation, branch deploys, and PR previews are deferred until the AWS account exists.

#### Phase 5 — Production auth (Cognito) `[AWS-BLOCKED]`
- [ ] **`[AWS-BLOCKED]`** Adopt Amplify Auth (Cognito) for the dashboard via `@aws-amplify/adapter-nextjs`; Next middleware gates pages; route handlers exchange the Cognito session for the server-held API key.

### Acceptance Criteria
- Given the migrated dashboard, when any page loads, then the network tab shows **no** `x-api-key` header from the browser and the page presents the same underlying control-layer data (rebuilt UI per the design doc, not a pixel copy of the old SPA).
- Given `DASHBOARD_ACCESS_CODE` is set and no `dp_session` cookie, when navigating to the dashboard root, then the user is redirected (302) to the login route.
- Given a valid passphrase POST, when it matches, then a `dp_session` cookie is set per `dashboard-passphrase-gate.md` and the user is redirected (303) to the dashboard root.
- Given `DASHBOARD_ACCESS_CODE` is unset, when navigating to the dashboard root, then it serves directly (gate disabled).
- Given the control layer with `@fastify/cors` configured, when the dashboard origin calls a Next route handler that forwards to `/v1/*`, then the upstream status/body are proxied unchanged.
- Given CI, when a PR is opened, then the `dashboard` job builds and runs e2e without an AWS account.

---

## Constraints
- **Frontend-only migration.** The Fastify API, Lambda handlers, CDK stack, DynamoDB tables, API Gateway keys, and all contract/integration tests are untouched (zero backend regression risk).
- **Next.js 15.5.x SSR** (not 16) — pinned to Amplify’s supported range. Revisit Next 16 only when Amplify documents support.
- **Node 22** across dashboard build/runtime to match root `engines` (`>=22 <23`) and `.nvmrc`.
- **No new IaC tool sprawl.** If Cognito is added (Phase 5), prefer extending the existing **CDK** stack over Amplify Gen 2 backend to keep one source of truth.
- **No billable AWS resources** until the stage gate above is lifted.

---

## Out of Scope

| Item | Rationale | Revisit When |
|------|-----------|--------------|
| Full-stack **Amplify Gen 2** (rewrite Fastify into Amplify/Next functions; replace CDK + DynamoDB) | Rewrites validated, contract-tested ingestion/idempotency/decision code for no functional gain; Fastify outperforms Next route handlers for this workload; regenerates infra already owned. | Never, unless the backend is intentionally consolidated for a separate reason |
| Porting `/v1` API into Next.js API routes (Option 3) | Adds a proxy hop and duplicates routing without removing the CDK stack. | If the API and dashboard intentionally merge into one runtime |
| Next.js **16** SSR | Not in Amplify’s documented support range (12–15). | Amplify documents Next 16 managed SSR support |
| `output: 'export'` static dashboard | Static export cannot hold the API key server-side, so it does not deliver the primary security win. | If SSR is undesired and the key stays at API Gateway only |
| Migrating Swagger `/docs` to the dashboard | API reference, not data viz/reporting; fine on Fastify. | If a customer-facing API explorer is needed in-product |
| Re-architecting inspection panels as mutating/workflow UI | Inspection views stay **read-only** per `inspection-panels.md` doctrine; consolidation is a hosting/UX move, not new write capability. | A product decision to add control-plane mutations |
| Cognito implementation details | Phase 5; `[AWS-BLOCKED]`. | After AWS account exists and pilot → production |

---

## Dependencies

### Required from Other Specs / Source

| Dependency | Source Document / File | Status |
|------------|------------------------|--------|
| Passphrase cookie scheme (`dp_session`, HMAC-SHA256, `COOKIE_SECRET`) | `docs/specs/dashboard-passphrase-gate.md` (§ Cookie Value Structure) | **Defined ✓** — reused, ported to Next middleware |
| `fb_session` sibling cookie (educator feedback) | `docs/specs/dashboard-passphrase-gate.md` (§ Sibling cookie) | **Defined ✓** — must be preserved if feedback flows move to the Next app |
| **Dashboard design (layout, IA, nav, components, states, responsive, visual language)** | `docs/specs/dashboard-design-requirements.md` | **Defined ✓** — design source of truth for the rebuilt UI |
| Design tokens (8P3P brand, oklch, status/urgency) | `docs/specs/decision-panel-ui.md` (§ Design Tokens) | **Defined ✓** — extended by the design doc |
| Inspection panel data sources, fields, drill-down behavior | `docs/specs/inspection-panels.md`, `src/panels/` | **Defined ✓** — rebuilt per design doc |
| Inspection API (`/v1/ingestion`, `/v1/state`, `/v1/state/list`) | `docs/specs/inspection-api.md` | **Defined ✓** — consumed via proxy |
| Receipts query (`/v1/receipts`) | `docs/specs/receipts-api.md` | **Defined ✓** — consumed via proxy |
| Control-layer REST contract (`/v1/*`) | `docs/api/openapi.yaml`, `docs/specs/aws-deployment.md` | **Defined ✓** — unchanged; consumed via proxy |
| `@fastify/cors` | npm (official Fastify plugin) | **GAP** — add to root `package.json` |
| `next`, `@aws-amplify/adapter-nextjs` (Phase 5) | npm (official) | **GAP** — add to `dashboard/package.json` |
| Amplify Hosting Next.js SSR support | [Amplify docs](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html) | **External** — Next 15 supported; no adapter needed |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| Server-held API key (browser never sees `x-api-key`) | Pilot/production security posture; `internal-docs/compliance-security-posture-and-migration-path.md` |
| Independent dashboard hosting + PR previews | Pilot onboarding / demos (`docs/guides/springs-pilot-demo.md`) |
| Cognito-ready Next.js app shell | Phase 2 admin platform auth |

### Prefer-existing-solutions notes (per `.cursor/rules/prefer-existing-solutions`)
- **Amplify managed SSR** requires **no framework adapter** for Next.js ([Amplify docs](https://docs.aws.amazon.com/amplify/latest/userguide/server-side-rendering-amplify.html)); do not hand-roll a deployment bundle.
- **Cognito + Next.js** uses the official **`@aws-amplify/adapter-nextjs`** ([Amplify Next.js docs](https://docs.amplify.aws/gen1/nextjs)); do not implement custom token handling.
- **API key hiding** uses native Next **route handlers / server actions** (no library) — the standard pattern for keeping secrets server-side.
- **CORS** uses the official **`@fastify/cors`** plugin, not manual header writing.

---

## Error Codes

### Existing (reuse)
| Code / Status | Source |
|---------------|--------|
| `401` (missing/invalid `x-api-key`) | `docs/specs/api-key-middleware.md` — surfaced by the control layer, proxied through unchanged |
| `403` (API Gateway missing key) | `docs/specs/aws-deployment.md` — AWS path only |

### New (add during implementation)
| Code | Description |
|------|-------------|
| `dashboard_upstream_unavailable` | Next route handler cannot reach the control layer (network/timeout). Returns `502` to the browser with no upstream internals leaked. |
| `dashboard_auth_required` | Middleware blocks an unauthenticated dashboard request when the gate is enabled (drives the 302 redirect). |

---

## Contract Tests

| Test ID | Type | Description | Input | Expected |
|---------|------|-------------|-------|----------|
| NXMIG-001 | e2e (Playwright) | Core pages render (per design doc IA) | Authenticated session | Overview, Attention, Learners, Decisions, Signals render with live data |
| NXMIG-002 | e2e | Browser never sends `x-api-key` | Any panel request | No `x-api-key` request header observed from the browser |
| NXMIG-003 | integration | Route handler forwards with server key | GET via `app/api/...` | Upstream called with `x-api-key: CONTROL_LAYER_API_KEY`; status/body proxied unchanged |
| NXMIG-004 | integration | Upstream 401 proxied | Upstream returns 401 | Handler returns 401, body contains no key material |
| NXMIG-005 | integration | Upstream unreachable | Upstream down | Handler returns 502 `dashboard_upstream_unavailable` |
| NXMIG-006 | integration | Gate redirect when enabled | `DASHBOARD_ACCESS_CODE` set, no cookie | 302 → login route |
| NXMIG-007 | integration | Valid passphrase sets cookie | Correct passphrase POST | 303 → dashboard root; `Set-Cookie: dp_session` per gate spec |
| NXMIG-008 | integration | Invalid passphrase re-render | Wrong passphrase POST | 200 login page with "Invalid access code"; no cookie |
| NXMIG-009 | unit | Cookie verify parity | Cookie minted by gate spec scheme | Verifies identically to Fastify implementation (HMAC + `exp`) |
| NXMIG-010 | integration | Gate disabled when unset | `DASHBOARD_ACCESS_CODE` empty | Dashboard root serves without redirect |
| NXMIG-011 | integration | CORS preflight on control layer | `OPTIONS /v1/...` from dashboard origin | 204 with `Access-Control-Allow-Origin` = dashboard origin, `Allow-Credentials: true` |
| NXMIG-012 | build | Local build parity (no AWS) | `next build` with Node 22 | Build succeeds; no `VITE_*` references remain |
| NXMIG-013 | e2e | Signal Intake view | `/v1/ingestion` data via proxy | Rows render; outcome filter + rejection drill-down work; no client `x-api-key` |
| NXMIG-014 | e2e | State Viewer version drill-down | Learner with ≥2 versions | Selecting `version=n` loads historical state; canonical + raw JSON match |
| NXMIG-015 | e2e | Decision Stream → Trace drill-down | Receipt row click | Trace view shows rationale, threshold table, state snapshot, rule condition |
| NXMIG-016 | e2e | Inspection views are read-only | Any inspection view | No mutation requests issued (GET-only) |

> **Test strategy note:** NXMIG-001/002/006/007/008/010/013/014/015/016 exercise the full flow (Playwright against a locally-run Next app). NXMIG-003/004/005/011 exercise route handlers/CORS directly. NXMIG-009 unit-tests the ported cookie helpers against the existing `dashboard-passphrase-gate` vectors. NXMIG-012 is a CI build gate. **No test requires an AWS account.**

---

## Concrete Values Checklist

### Wire formats / signed payloads
- **Session cookie** (`dp_session`, and sibling `fb_session`): unchanged from `docs/specs/dashboard-passphrase-gate.md` — `hex(HMAC-SHA256(COOKIE_SECRET, payloadJson)) + "." + base64url(payloadJson)`, payload `{ "exp": <unix_seconds> }`, separator `.`. **This spec does not redefine the scheme; it ports it.**
- **Proxy forwarding:** Next route handler → control layer adds header `x-api-key: <CONTROL_LAYER_API_KEY>` (utf-8), preserves method/body/query.

### HTTP behavior
| Transition | Status | Content-Type | Required headers |
|------------|--------|--------------|------------------|
| Unauthenticated dashboard page (gate on) | 302 | — | `Location: <login route>` |
| Valid passphrase POST | 303 | — | `Location: <dashboard root>`, `Set-Cookie: dp_session` (+ `fb_session` if feedback in scope) |
| Invalid passphrase POST | 200 | `text/html` | — |
| Route-handler proxy success | mirror upstream | mirror upstream | mirror safe upstream headers |
| Route-handler upstream down | 502 | `application/json` | — (body: `{ "error": "dashboard_upstream_unavailable" }`) |
| Control-layer CORS preflight | 204 | — | `Access-Control-Allow-Origin`, `-Methods`, `-Headers`, `-Credentials: true` |

### Cookies
| Name | HttpOnly | Secure | SameSite | Path | Max-Age |
|------|----------|--------|----------|------|---------|
| `dp_session` | true | true (prod) / false (dev) | Strict | `/` (Next app is dashboard-only; was `/dashboard` under Fastify) | `DASHBOARD_SESSION_TTL_HOURS * 3600` (default 8h) |
| `fb_session` | true | true (prod) | Strict | per `dashboard-passphrase-gate.md` (`/v1/decisions`) **only if** educator-feedback flows are served from the Next app; otherwise N/A this migration | same as `dp_session` |

> **Path change note:** Under Fastify the dashboard was path-scoped at `/dashboard`. As a standalone Next app (own origin/subdomain), `Path=/` is correct and the `__Host-` prefix becomes viable (requires `Secure`, `Path=/`, no `Domain`). Adopting `__Host-dp_session` is RECOMMENDED for the standalone deployment — see `dashboard-passphrase-gate.md` § Implementation Notes "future hardening".

### Env vars
| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `CONTROL_LAYER_API_BASE_URL` | yes | — | string (URL) | Control-layer base URL the route handlers forward to (e.g. `https://api.8p3p.dev` or `http://localhost:3000`). **Server-only.** |
| `CONTROL_LAYER_API_KEY` | yes | — | string | Tenant API key injected server-side. **No `NEXT_PUBLIC_` prefix — never bundled.** |
| `CONTROL_LAYER_ORG_ID` | no | — | string | Optional org pin (replaces `VITE_ORG_ID`). Server-only. |
| `NEXT_PUBLIC_APP_NAME` | no | `Decision Panel` | string | Client-visible label only (safe to expose). |
| `DASHBOARD_ACCESS_CODE` | no | — | string | Passphrase; when set, gate is active (parity with current behavior). |
| `DASHBOARD_SESSION_TTL_HOURS` | no | `8` | number | Session cookie lifetime. |
| `COOKIE_SECRET` | yes (when gate active) | — | string | HMAC signing secret (min 32 chars). Same semantics as today. |

> Migration mapping: `VITE_API_BASE_URL` → `CONTROL_LAYER_API_BASE_URL` (server), `VITE_API_KEY` → `CONTROL_LAYER_API_KEY` (server), `VITE_ORG_ID` → `CONTROL_LAYER_ORG_ID` (server).

### Constants / limits
- Next.js: **15.5.x**; Node: **22**.
- Login rate limit: preserve `dashboard-passphrase-gate.md` values (5 attempts / 15 min / per IP → 429). Storage: in-process (single-instance) — see Production Correctness Notes for Amplify-compute caveat.
- Proxy timeout to upstream: 10s (matches Lambda timeout in `aws-deployment.md`).

### `amplify.yml` (pinned, `[AWS-BLOCKED]` to deploy; valid to commit now)
```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - nvm install 22 && nvm use 22
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - .next/cache/**/*
      - node_modules/**/*
```

### Routes registered (Next app)
| Method | Path | Auth exempt? |
|--------|------|--------------|
| GET | `/` and all `(dashboard)` page routes (`/attention`, `/learners`, `/learners/[ref]`, `/decisions`, `/decisions/[id]`, `/signals`, `/reports`, `/settings`) per design §6 | No (gate when enabled) |
| GET | `/login` | Yes |
| POST | `/login` | Yes |
| GET | `/logout` | Yes |
| ALL | `/api/control/*` (route-handler proxy to `/v1/*`) | No (gate when enabled) |

> No `/inspect` route exists in the redesigned app: the four inspection surfaces are rebuilt as the **Signals / Decisions / Learners (State)** pages (design §6/§8), not a tabbed `/inspect` panel.

---

## Production Correctness Notes

- **Proxy / `trustProxy`**: The control layer must keep `trustProxy` correct for `request.ip` (login rate-limiting) — unchanged by this migration, but the Next app now sits between users and the API for dashboard traffic; the **API’s own** clients are unaffected.
- **CORS**: **New, required.** Add `@fastify/cors` to the control layer allowing the dashboard origin(s) with `credentials: true`. Dashboard ↔ API are no longer same-origin. Restrict origins to the Amplify domain(s) + localhost dev.
- **CSP / security headers**: Set CSP on the Next app (`next.config` headers) restricting `connect-src` to same-origin (the browser only talks to Next route handlers, not the control layer directly). `N/A` for direct API CSP.
- **Cookie prefix vs Path scoping**: Standalone app uses `Path=/`; adopt `__Host-dp_session` (requires `Secure`, `Path=/`, no `Domain`). If feedback `fb_session` (`Path=/v1/decisions`) is needed, it stays prefix-less per the gate spec.
- **Content-type parsing**: Login POST is `application/x-www-form-urlencoded`; Next route handlers parse via `request.formData()` (no `@fastify/formbody` needed on the Next side; Fastify keeps its own for any remaining server-rendered routes).
- **Body size limits**: Proxy handlers should cap forwarded body to the control layer’s `SIGNAL_BODY_LIMIT` semantics; default Next limits are acceptable for the read-mostly dashboard.
- **Rate-limit storage scope**: In-process Map is single-instance only. **Amplify managed SSR compute can run multiple instances**, so the login rate limiter is best-effort there; for production, back it with a shared store (DynamoDB/Redis) — tracked as a Phase 5 hardening item, `[AWS-BLOCKED]`.
- **Error-code surface**: Route handlers must not leak `CONTROL_LAYER_API_KEY`, upstream URLs, or stack traces. Only `dashboard_upstream_unavailable` / proxied upstream status reach the browser.
- **Secrets at build vs runtime**: `CONTROL_LAYER_API_KEY` must be a **runtime/server** env var on Amplify, never `NEXT_PUBLIC_`. Verify it is absent from the client bundle (NXMIG-002/012).

---

## File Structure (target)

> **Authoritative dashboard structure (pages, components, naming):** `docs/specs/dashboard-design-requirements.md` § 13. The tree below shows only the **migration-relevant** pieces (proxy, auth, Fastify changes); the design doc owns the full `app/` + `components/` layout.

```
dashboard/                         # standalone Next.js 15.5 App Router app (UI rebuilt per design §13, not ported 1:1)
├── app/
│   ├── layout.tsx                 # root layout: Geist fonts, ThemeProvider, TanStack Query provider
│   ├── globals.css                # 8P3P tokens + Geist vars (design §4)
│   ├── (auth)/                    # auth route group, OUTSIDE the dashboard shell
│   │   ├── login/route.ts         # GET/POST passphrase login (replaces Fastify login)
│   │   └── logout/route.ts
│   ├── (dashboard)/               # authenticated app shell + full page set (design §6/§13)
│   │   ├── layout.tsx             # SidebarProvider/Inset + SiteHeader
│   │   └── ...                    # Overview, Attention, Learners(+[ref]), Decisions(+[id]), Signals, Reports, Settings
│   └── api/
│       └── control/[...path]/route.ts   # server proxy → CONTROL_LAYER_API_BASE_URL with x-api-key
├── components/                    # REBUILT UI: layout, dashboard, data-table, shared, states, ui (design §9/§13)
├── hooks/, lib/                   # data hooks + api client/proxy helpers (fetches target /api/control/*)
├── lib/session-cookie.ts          # ported from src/auth/session-cookie.ts (gate parity)
├── middleware.ts                  # passphrase gate (dp_session) when DASHBOARD_ACCESS_CODE set
├── next.config.ts                 # headers/CSP; (no basePath if subdomain)
├── amplify.yml                    # build spec (Node 22)
└── package.json                   # next 15.5, react 19, tailwind 4, @tanstack/react-query, shadcn/ui, playwright

src/server.ts                      # REMOVE dashboard static + login routes; REMOVE /inspect static (after parity); add @fastify/cors
src/panels/                        # retire after dashboard inspection surfaces (Signals/Decisions/Learners) reach parity
src/auth/dashboard-*.ts            # retire from server once Next owns the gate (keep until cutover)
.github/workflows/ci.yml           # add `dashboard` job (build + typecheck + e2e); no deploy
```

> The legacy `app/page.tsx` "Decision Panel" and `app/inspect/*` tabbed structure are **removed** — the UI is rebuilt to the design-doc IA (the `(dashboard)` route group above). `src/panels/` is retired post-parity, not reused as React views.

---

## Implementation Order

```
1. [local] Scaffold Next.js 15 app in dashboard/; port components/hooks/lib (Phase 1)
2. [local] Add route-handler proxy + server env vars; delete VITE_* usage (Phase 1)
3. [local] Port the 4 inspection panels into dashboard React views (Phase 1b)
4. [local] Port passphrase gate to middleware + login/logout routes (Phase 2)
5. [local] Add @fastify/cors; after parity, remove Fastify dashboard + /inspect serving (Phase 3)
6. [local] amplify.yml + CI dashboard job (build/test only) (Phase 4)
7. [AWS-BLOCKED] Create Amplify app, branch deploys, PR previews (Phase 4)
8. [AWS-BLOCKED] Cognito via @aws-amplify/adapter-nextjs (Phase 5)
```

Steps 1–6 proceed **now**. Steps 7–8 wait for the stage gate.

---

## Notes
- **Why frontend-only (not full Amplify Gen 2):** The product is the Fastify control layer; rewriting validated ingestion/idempotency/decision code into Amplify functions is a lateral, high-risk rewrite that regenerates infra already owned (CDK + 10 DynamoDB tables + 5 Lambdas). The genuine weakness is the client-exposed API key, which this migration fixes without touching the backend.
- **Why Next 15, not 16:** Amplify managed SSR documents support for Next 12–15 only ([Amplify docs](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html)). Chasing "latest" (16.2.x) would forfeit managed SSR.
- **Auth phasing:** Pilot keeps the passphrase gate (ported to Next middleware, same cookie scheme). Production adopts Cognito (`@aws-amplify/adapter-nextjs`) — `[AWS-BLOCKED]`.
- **Cost:** Deferred per stage gate (apply for AWS startup credits first). Do not run pricing tools until the banner is lifted.

---

## Next Steps
1. Owner: apply for **AWS startup credits**; update the stage-gate banner when an account exists.
2. Run `/plan-impl docs/specs/nextjs-amplify-dashboard-migration.md` to generate the task-level plan for the **local** phases (1–5).
3. Defer AWS phases (6–7) and cost estimation until the banner is lifted.

---

*Spec created: 2026-06-12 | Updated: 2026-06-12 (consolidate inspection panels; reference dashboard-design-requirements.md as design source of truth — UI is rebuilt, not ported) | Phase: Frontend migration (pilot → production). Depends on: dashboard-design-requirements.md, dashboard-passphrase-gate.md, decision-panel-ui.md, inspection-panels.md, inspection-api.md, receipts-api.md, aws-deployment.md, api-key-middleware.md. AWS provisioning BLOCKED pending startup credits.*
