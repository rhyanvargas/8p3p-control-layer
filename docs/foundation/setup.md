# Local Dev & Testing

Run, seed, and verify the 8P3P Control Layer on your machine with SQLite — no AWS required.

**Audience:** 8P3P engineers and solutions team.  
**Customer integrators:** use [`docs/guides/customer-onboarding-quickstart.md`](../guides/customer-onboarding-quickstart.md) instead.  
**Deploy to AWS/Fly:** [`docs/guides/deployment-checklist.md`](../guides/deployment-checklist.md).

**Related:** [`architecture.md`](architecture.md) | [`terminology.md`](terminology.md) | [`.env.example`](../../.env.example) | [`dashboard/.env.example`](../../dashboard/.env.example)

---

## Architecture (local)

Two processes run independently:

| Process | Directory | Default port | Purpose |
|---------|-----------|--------------|---------|
| **Control layer API** | repo root | `3000` | Fastify REST API, Swagger at `/docs`, SQLite persistence |
| **Decision Panel** | `dashboard/` | `3001` | Next.js 15 app; proxies API calls server-side (no client `x-api-key`) |

The dashboard talks to the API through Next route handlers at `/api/control/*`, which attach `CONTROL_LAYER_API_KEY` server-side. See [`docs/specs/nextjs-amplify-dashboard-migration.md`](../specs/nextjs-amplify-dashboard-migration.md).

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | **22.x** | Pinned in `.nvmrc` and root `package.json` `engines` |
| **npm** | ≥ 10 | Bundled with Node 22 |

```bash
nvm use          # or: fnm use
node --version   # v22.x
```

---

## First-time setup

### 1. Control layer (API)

```bash
cp .env.example .env
# Optional: copy secrets into .env.local (gitignored)

npm install
npm run dev      # terminal 1 — API on http://localhost:3000
```

### 2. Seed reference data

In a second terminal (API must be running):

```bash
npm run seed:springs-demo
```

### 3. Decision Panel (dashboard)

```bash
cd dashboard
cp .env.example .env.local
# Edit .env.local — see Environment profiles below

npm install
npm run dev -- -p 3001    # terminal 3 — dashboard on http://localhost:3001
```

### 4. Verify

| URL | Purpose |
|-----|---------|
| http://localhost:3000/health | API health check |
| http://localhost:3000/docs | Swagger UI |
| http://localhost:3001/ | Decision Panel (Overview) |

```bash
curl -s http://localhost:3000/health
# {"status":"ok"}
```

---

## Environment profiles

### Control layer (`.env` / `.env.local`)

The server loads `.env` then `.env.local` at startup (`src/server.ts`). **Literal defaults and every variable name** live in [`.env.example`](../../.env.example).

#### Profile A — Easy local (default)

Leave `API_KEY` unset. Auth is off; pass any `org_id` in requests.

Good for: quick API experiments, unit/integration tests, first-time clone.

#### Profile B — Pilot-like local

Set in `.env.local`:

```bash
API_KEY=$(npm run generate:api-key --silent 2>/dev/null || openssl rand -hex 32)
ADMIN_API_KEY=$(openssl rand -hex 32)
API_KEY_ORG_ID=springs
```

Good for: testing auth headers, smoke tests that match deployed behavior.

When using Profile B with the dashboard, copy the same `API_KEY` into `dashboard/.env.local` as `CONTROL_LAYER_API_KEY` (see below).

#### Optional — Dashboard passphrase gate

Set in **both** root `.env.local` (if needed for feedback cookies) and `dashboard/.env.local`:

```bash
DASHBOARD_ACCESS_CODE=<shared passphrase>
COOKIE_SECRET=$(openssl rand -hex 32)
```

Spec: [`docs/specs/dashboard-passphrase-gate.md`](../specs/dashboard-passphrase-gate.md). When unset, the dashboard loads without login (typical local dev).

### Dashboard (`dashboard/.env.local`)

Source of truth: [`dashboard/.env.example`](../../dashboard/.env.example).

| Variable | Required | Example (local) | Notes |
|----------|----------|-----------------|-------|
| `CONTROL_LAYER_API_BASE_URL` | yes | `http://localhost:3000` | API the proxy forwards to |
| `CONTROL_LAYER_API_KEY` | when API auth on | same as root `API_KEY` | **Server-only** — never use `NEXT_PUBLIC_` |
| `CONTROL_LAYER_ORG_ID` | no | `springs` | Pins org after seed |
| `NEXT_PUBLIC_APP_NAME` | no | `Decision Panel` | Safe client label |
| `DASHBOARD_ACCESS_CODE` | no | — | Enables passphrase gate |
| `COOKIE_SECRET` | when gate on | random 32+ bytes | HMAC session signing |

### Storage

All API data is SQLite under `./data/*.db` (gitignored, created on first use). No DynamoDB locally unless you set `FIELD_MAPPINGS_TABLE` or deploy.

---

## Daily dev loop

```bash
# Terminal 1 — API
git pull && npm install
npm run dev

# Terminal 2 — seed (when you need fresh demo data)
npm run seed:springs-demo

# Terminal 3 — dashboard
cd dashboard && npm install && npm run dev -- -p 3001
```

**Verify URS summary** (Jordan Mitchell → `stu-30456` after Springs seed):

```bash
curl -s -H "x-api-key: $API_KEY" \
  "http://localhost:3000/v1/learners/stu-30456/summary?org_id=springs" \
  | jq '.current_state.mastery_breakdown.overall'
```

**Before commit:**

```bash
npm run check                              # API: build → validate → lint → test
cd dashboard && npm run build && npm run typecheck && npm run test:e2e   # dashboard
```

CI runs the same gates in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) (`check` + `dashboard` jobs, Node 22).

---

## Making changes

### Control layer (API)

| Area | Location | Notes |
|------|----------|-------|
| Routes / handlers | `src/*/routes.ts`, `src/*/handler*.ts` | Fastify; keep business logic in `*-core.ts` where present |
| Policies | `src/decision/policies/<org_id>/` | JSON policy files loaded at runtime |
| Contracts | `src/contracts/schemas/`, `docs/api/openapi.yaml` | Run `npm run validate:contracts` after schema changes |
| Learner APIs | `src/learners/` | Summary, trajectory, URS projection |
| Auth | `src/auth/` | API key middleware; dashboard auth lives in `dashboard/` |

After API changes: `npm run check` (or at minimum `npm test` + `npm run lint`).

### Decision Panel (dashboard)

| Area | Location | Notes |
|------|----------|-------|
| Pages | `dashboard/app/(dashboard)/` | App Router; design IA in [`dashboard-design-requirements.md`](../specs/dashboard-design-requirements.md) |
| API proxy | `dashboard/app/api/control/[...path]/route.ts` | Forwards to control layer with server-held key |
| Auth | `dashboard/middleware.ts`, `dashboard/app/(auth)/` | Passphrase gate |
| Data hooks | `dashboard/hooks/` | TanStack Query |
| UI components | `dashboard/components/` | shadcn/ui + Tailwind 4 |

After dashboard changes:

```bash
cd dashboard
npm run typecheck
npm run lint
npm run test:e2e      # Playwright (mock upstream by default)
```

Design spec: [`docs/specs/dashboard-design-requirements.md`](../specs/dashboard-design-requirements.md). Migration spec: [`docs/specs/nextjs-amplify-dashboard-migration.md`](../specs/nextjs-amplify-dashboard-migration.md).

### Contract / spec changes

When you change an API surface:

1. Update JSON Schema under `src/contracts/schemas/` if applicable
2. Update [`docs/api/openapi.yaml`](../api/openapi.yaml)
3. Run `npm run validate:schemas && npm run validate:contracts && npm run validate:api`
4. Add or update tests under `tests/contracts/` or `tests/integration/`

---

## Seed reference data (Springs)

Script: [`examples/springs/seed-springs-demo.mjs`](../../examples/springs/seed-springs-demo.mjs)

| Phase | What it does |
|-------|----------------|
| 1 | Registers field mappings for 4 LMS sources (needs `ADMIN_API_KEY` or `--admin-key`) |
| 2 | Ingests 24 synthesized signals for 6 personas (learning gaps, trajectories, gifted-interest) |
| 3 | Verifies decision narrative + prints `mastery_breakdown` for Jordan Mitchell |

```bash
npm run seed:springs-demo

# Explicit flags (override env):
npm run seed:springs-demo -- \
  --host http://localhost:3000 \
  --api-key "$API_KEY" \
  --admin-key "$ADMIN_API_KEY" \
  --org springs
```

Set `CONTROL_LAYER_ORG_ID=springs` in `dashboard/.env.local` so the panel shows seeded learners.

**Demo talk track (stakeholders):** [`docs/guides/springs-pilot-demo.md`](../guides/springs-pilot-demo.md).

---

## New org / client (local)

| Step | Action |
|------|--------|
| 1 | Pick `org_id` (e.g. `acme_pilot`) |
| 2 | Create `src/decision/policies/<org_id>/` — copy from `springs/`: `learner.json`, `routing.json`, `subjects.json` |
| 3 | Set `API_KEY_ORG_ID=<org_id>` in root `.env.local` (or pass `org_id` in API calls if auth off) |
| 4 | Set `CONTROL_LAYER_ORG_ID=<org_id>` in `dashboard/.env.local` |
| 5 | Register field mappings — [`docs/guides/onboarding-field-mappings.md`](../guides/onboarding-field-mappings.md), or copy Springs seed Phase 1 pattern |
| 6 | Optional connector template: `ADMIN_API_KEY=... npx tsx scripts/apply-template.ts canvas-lms --org-id <org_id>` |
| 7 | Seed or send signals — fork `seed-springs-demo.mjs` or use `/docs` + `POST /v1/signals` |

Policies load from `src/decision/policies/{orgId}/` at runtime. Subject → skill mapping for URS aggregation uses `subjects.json` in that folder ([`docs/specs/urs-aggregation.md`](../specs/urs-aggregation.md)).

---

## Reset and repeat

Wipe local SQLite and start fresh (stop `npm run dev` first; include WAL sidecars or SQLite can restore old rows):

```bash
rm -f data/*.db data/*.db-wal data/*.db-shm
npm run dev
npm run seed:springs-demo -- --org springs
```

Re-seeding the **same** org without wiping skips already-applied signals (seed logs `duplicate`); state is **not** recomputed, so `mastery_breakdown` stays `null` on learners seeded before URS aggregation landed. Use a full reset when you need fresh state or `mastery_breakdown`.

---

## Key endpoints (local)

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/health` | None |
| `POST` | `/v1/signals` | `x-api-key` if `API_KEY` set |
| `GET` | `/v1/decisions` | `x-api-key` if set |
| `GET` | `/v1/learners/:ref/summary` | `x-api-key` if set |
| `GET` | `/v1/state` | `x-api-key` if set |
| `PUT` | `/v1/admin/mappings/:org/:source` | `x-admin-api-key` if `ADMIN_API_KEY` set |

Full contract: [`docs/api/openapi.yaml`](../api/openapi.yaml).

---

## Tests and validation

### Control layer (repo root)

```bash
npm test                  # all Vitest tests (~950)
npm run test:contracts    # spec-driven contract tests
npm run test:integration  # e2e including springs-pilot
npm run test:unit         # unit tests only
npm run validate:api      # OpenAPI lint (Redocly)
npm run check             # full CI gate: build + validate + lint + test + cdk:synth
```

### Dashboard (`dashboard/`)

```bash
cd dashboard
npm run build             # Next.js production build
npm run typecheck
npm run lint
npm run test:e2e          # Playwright (starts mock upstream + next start unless E2E_BASE_URL set)
```

To run e2e against a live stack:

```bash
# Terminals 1–3 running API + dashboard as above, then:
cd dashboard
E2E_BASE_URL=http://127.0.0.1:3001 npm run test:e2e
```

---

## NPM scripts (common)

### Root

| Script | Description |
|--------|-------------|
| `dev` | Start Fastify API (`tsx watch src/server.ts`) |
| `seed:springs-demo` | Springs reference demo data |
| `generate:api-key` | Generate tenant API key |
| `build:dashboard` | `cd dashboard && npm ci && npm run build` |
| `check` | Full pre-commit gate (API + CDK synth) |

See [`package.json`](../../package.json) for the full list.

### Dashboard

| Script | Description |
|--------|-------------|
| `dev` | Next.js dev server (use `-p 3001` if API is on 3000) |
| `build` | Production build |
| `test:e2e` | Playwright end-to-end tests |

See [`dashboard/package.json`](../../dashboard/package.json).

---

## Troubleshooting

### Port conflict (3000 in use)

Run API on an alternate port and point the dashboard proxy at it:

```bash
PORT=3001 npm run dev    # API on 3001
# dashboard/.env.local: CONTROL_LAYER_API_BASE_URL=http://localhost:3001
cd dashboard && npm run dev    # dashboard on default 3000
```

Or keep API on 3000 and run dashboard on 3001 (recommended default above).

### `better-sqlite3` module not found

```bash
npm run precheck    # or: rm -rf node_modules && npm install
```

On macOS: `xcode-select --install` if native compile fails.

### Dashboard shows no data / wrong org

1. Confirm API is running: `curl -s http://localhost:3000/health`
2. Check `CONTROL_LAYER_API_BASE_URL` and `CONTROL_LAYER_API_KEY` in `dashboard/.env.local`
3. Set `CONTROL_LAYER_ORG_ID` to the org you seeded (e.g. `springs`)
4. Restart `npm run dev` in `dashboard/` after env changes

### Seed: connection refused

Start `npm run dev` (API) before running the seed script.

### Seed: Phase 1 skipped

Set `ADMIN_API_KEY` in `.env.local` or pass `--admin-key` so field mappings register.

### Dashboard e2e fails locally

Run `npm run build` in `dashboard/` first (e2e uses `next start` by default). Or set `E2E_BASE_URL` to an already-running dev server.

### `Unknown env config 'devdir'` (npm warning)

Harmless when `NPM_CONFIG_DEVDIR` is set (e.g. Cursor sandbox). `unset NPM_CONFIG_DEVDIR` to suppress.

---

## Related guides

| I want to… | Doc |
|------------|-----|
| Demo narrative for stakeholders | [`springs-pilot-demo.md`](../guides/springs-pilot-demo.md) |
| Configure LMS field mappings (deep dive) | [`onboarding-field-mappings.md`](../guides/onboarding-field-mappings.md) |
| Customer API integration | [`pilot-integration-guide.md`](../guides/pilot-integration-guide.md) |
| Deploy to AWS | [`deployment-checklist.md`](../guides/deployment-checklist.md) |
| Launch gate before customer access | [`pilot-launch-checklist.md`](../guides/pilot-launch-checklist.md) |
| Dashboard design & migration | [`dashboard-design-requirements.md`](../specs/dashboard-design-requirements.md), [`nextjs-amplify-dashboard-migration.md`](../specs/nextjs-amplify-dashboard-migration.md) |
