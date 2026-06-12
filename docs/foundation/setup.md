# Local Dev & Testing

Run, seed, and verify the 8P3P Control Layer on your machine with SQLite — no AWS required.

**Audience:** 8P3P engineers and solutions team.  
**Customer integrators:** use [`docs/guides/customer-onboarding-quickstart.md`](../guides/customer-onboarding-quickstart.md) instead.  
**Deploy to AWS/Fly:** [`docs/guides/deployment-checklist.md`](../guides/deployment-checklist.md).

**Related:** [`architecture.md`](architecture.md) | [`terminology.md`](terminology.md) | [`.env.example`](../../.env.example)

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | **22.x** | Pinned in `.nvmrc` and `package.json` `engines` |
| **npm** | ≥ 10 | Bundled with Node 22 |

```bash
nvm use          # or: fnm use
node --version   # v22.x
npm install
```

---

## Quick start (first run)

```bash
cp .env.example .env
# Optional: copy secrets into .env.local (gitignored)

npm run dev      # predev builds dashboard/dist from your env
```

In a second terminal (server must be running):

```bash
npm run seed:springs-demo
```

Open:

| URL | Purpose |
|-----|---------|
| http://localhost:3000/health | Health check |
| http://localhost:3000/docs | Swagger UI |
| http://localhost:3000/dashboard/ | Decision Panel (org `springs` after seed) |
| http://localhost:3000/inspect/ | Developer inspection panels |

```bash
curl -s http://localhost:3000/health
# {"status":"ok"}
```

---

## Environment profiles

The server loads `.env` then `.env.local` at startup (`src/server.ts`). **Literal defaults and every variable name** live in [`.env.example`](../../.env.example) — do not duplicate that table here.

### Profile A — Easy local (default)

Leave `API_KEY` unset. Auth is off; pass any `org_id` in requests.

Good for: quick API experiments, unit/integration tests, first-time clone.

### Profile B — Pilot-like local

Set in `.env.local`:

```bash
API_KEY=$(npm run generate:api-key --silent 2>/dev/null || openssl rand -hex 32)
ADMIN_API_KEY=$(openssl rand -hex 32)
API_KEY_ORG_ID=springs

# Dashboard SPA (build:dashboard:local reads these; predev runs on npm run dev)
VITE_API_KEY=$API_KEY
VITE_ORG_ID=$API_KEY_ORG_ID
VITE_API_BASE_URL=
```

Good for: testing auth headers, dashboard with a fixed org, smoke tests that match deployed behavior.

### Optional — Dashboard passphrase gate

```bash
DASHBOARD_ACCESS_CODE=<shared passphrase>
COOKIE_SECRET=$(openssl rand -hex 32)
```

Spec: [`docs/specs/dashboard-passphrase-gate.md`](../specs/dashboard-passphrase-gate.md). When unset, `/dashboard/` loads without login (typical local dev).

### Storage

All data is SQLite under `./data/*.db` (gitignored, created on first use). No DynamoDB locally unless you set `FIELD_MAPPINGS_TABLE` or deploy.

---

## Daily dev loop

```bash
git pull && npm install
npm run dev                    # terminal 1
npm run seed:springs-demo      # terminal 2 — idempotent-ish; see Reset below
```

**Verify:**

```bash
# URS summary + mastery_breakdown (Jordan Mitchell, multi-subject)
curl -s -H "x-api-key: $API_KEY" \
  "http://localhost:3000/v1/learners/jordan-mitchell/summary?org_id=springs" \
  | jq '.current_state.mastery_breakdown.overall'
```

**Before commit:**

```bash
npm run check   # build → validate → lint → test (953+ tests)
```

**Worked example with full commands:** [`internal-docs/reports/pilot-smoke-2026-06-11.md`](../../internal-docs/reports/pilot-smoke-2026-06-11.md).

---

## Seed reference data (Springs)

Script: [`examples/springs/seed-springs-demo.mjs`](../../examples/springs/seed-springs-demo.mjs)

| Phase | What it does |
|-------|----------------|
| 1 | Registers field mappings for 4 LMS sources (needs `ADMIN_API_KEY` or `--admin-key`) |
| 2 | Ingests 11 signals for 5 personas |
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

**Demo talk track (stakeholders):** [`docs/guides/springs-pilot-demo.md`](../guides/springs-pilot-demo.md) — panel narration only; setup steps are above.

---

## New org / client (local)

Use this checklist when onboarding a **new org id** on localhost (not AWS).

| Step | Action |
|------|--------|
| 1 | Pick `org_id` (e.g. `acme_pilot`) |
| 2 | Create `src/decision/policies/<org_id>/` — copy from `springs/`: `learner.json`, `routing.json`, `subjects.json` |
| 3 | Set `API_KEY_ORG_ID=<org_id>` in `.env.local` (or pass `org_id` in API calls if auth off) |
| 4 | Register field mappings — see [`docs/guides/onboarding-field-mappings.md`](../guides/onboarding-field-mappings.md), or copy Springs seed Phase 1 pattern |
| 5 | Optional connector template: `ADMIN_API_KEY=... npx tsx scripts/apply-template.ts canvas-lms --org-id <org_id>` |
| 6 | Seed or send signals — fork `seed-springs-demo.mjs` or use `/docs` + `POST /v1/signals` |
| 7 | Rebuild dashboard if org/key changed: `npm run build:dashboard:local` then restart `npm run dev` |

Policies load from `src/decision/policies/{orgId}/` at runtime. Subject → skill mapping for URS aggregation uses `subjects.json` in that folder ([`docs/specs/urs-aggregation.md`](../specs/urs-aggregation.md)).

---

## Reset and repeat

Wipe local SQLite and start fresh:

```bash
rm -f data/*.db
npm run dev
npm run seed:springs-demo -- --org springs
```

Re-seeding the **same** org without wiping merges new signals; use reset when you need a clean decision/state history.

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

```bash
npm test                  # all tests
npm run test:contracts    # spec-driven contract tests
npm run test:integration  # e2e including springs-pilot
npm run validate:api      # OpenAPI lint
npm run check             # full CI gate locally
```

CI runs the same gate on Node 20 and 22 (`.github/workflows/ci.yml`).

---

## NPM scripts (common)

| Script | Description |
|--------|-------------|
| `dev` | Start server (`predev` → `build:dashboard:local`) |
| `seed:springs-demo` | Springs reference demo data |
| `build:dashboard:local` | Build dashboard with `VITE_*` from env |
| `generate:api-key` | Generate tenant API key |
| `check` | Full pre-commit gate |

See [`package.json`](../../package.json) for the full list.

---

## Troubleshooting

### `better-sqlite3` module not found

```bash
npm run precheck    # or: rm -rf node_modules && npm install
```

On macOS: `xcode-select --install` if native compile fails.

### Port 3000 in use

```bash
PORT=3001 npm run dev
npm run seed:springs-demo -- --host http://localhost:3001
```

### Dashboard blank or wrong org

Rebuild after env change:

```bash
npm run build:dashboard:local && npm run dev
```

Ensure `VITE_ORG_ID` matches the org you seeded.

### Seed: connection refused

Start `npm run dev` before running the seed script.

### Seed: Phase 1 skipped

Set `ADMIN_API_KEY` in `.env.local` or pass `--admin-key` so field mappings register.

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
