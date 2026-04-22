---
name: Pilot Host Deployment (Friday Deploy Target for Springs Dry Run)
overview: |
  Produce the minimum deployable artifact set required to execute the Friday
  2026-04-17 morning block of the dry-run script: "Dockerfile, deploy server
  to chosen host, verify /health over TLS, build dashboard with baked API key,
  set all env vars." The readiness brief locks the deployment path to Decision 1
  Option A — hosted Fastify on Fly.io or Render (not AWS CDK, not ngrok) — so
  this plan ships a single multi-stage Dockerfile plus both a fly.toml and a
  render.yaml template so the CEO-approved host can go live without further
  plan revisions. The smoke test is the verbatim curl from the readiness brief
  § Single Go/No-Go Gate; no new test infrastructure is added. W1 (one-line
  drift in `pilot-readiness-definition.md:33`) is fixed in the same PR so the
  readiness gates line up with the runbook that landed in
  `pilot-p0-runbook-alignment.plan.md`. SQLite-in-container ephemerality is
  accepted as a documented dry-run-only deviation; re-seed is already the
  pre-flight action at Saturday 12:00–12:45 PM per `dry-run-script.md`. Bake-in
  of `VITE_API_KEY` at dashboard build time is accepted as in-scope to execute
  and out-of-scope to fix (readiness brief § What We Are Explicitly NOT Doing
  item 1). No new features, no behavior changes, no spec changes beyond the W1
  one-liner.
todos:
  - id: TASK-001
    content: Create .dockerignore to exclude tests, dist-of-dev, dashboard/node_modules, infra/, data/, and local env files from build context
    status: completed
  - id: TASK-002
    content: Create multi-stage Dockerfile (builder compiles TS + dashboard; runtime copies dist + dashboard/dist + src/decision/policies/ + src/contracts/schemas/ + docs/api/openapi.yaml and runs node dist/server.js)
    status: completed
  - id: TASK-003
    content: Create fly.toml template (Option A — Fly.io) with build args for VITE_* bake-in, runtime env slots, and /health check
    status: completed
  - id: TASK-004
    content: Create render.yaml template (Option A — Render) with equivalent build args, env slots, and /health check
    status: completed
  - id: TASK-005
    content: Author docs/guides/pilot-host-deployment.md — host pick workflow, env-var wiring, secret sourcing, build args, persistence caveat, smoke-test curl verbatim
    status: completed
  - id: TASK-006
    content: Fix W1 — one-line edit to internal-docs/pilot-operations/pilot-readiness-definition.md:33 so the "Default decision type makes sense" gate matches the runbook no-match rule landed in pilot-p0-runbook-alignment.plan.md
    status: completed
  - id: TEST-SMOKE-001
    content: Execute verbatim smoke-test curl from readiness brief § Single Go / No-Go Gate against the deployed pilot URL (Friday 6:00 PM gate)
    status: completed
isProject: false
---

# Pilot Host Deployment

**Spec (de facto):** `internal-docs/reports/2026-04-16-pilot-dry-run-readiness.md` § Decision 1, § Pre-Saturday Schedule — Friday morning, § Single Go / No-Go Gate, § What We Are Explicitly NOT Doing
**Supporting docs:** `internal-docs/pilot-operations/dry-run-script.md`, `internal-docs/pilot-operations/pilot-readiness-definition.md`, `docs/specs/dashboard-passphrase-gate.md`, `.env.example`

**Note on spec shape:** This is an operations artifact (infra/artifacts, not a product feature). There is no `docs/specs/pilot-host-deployment.md` and none is needed — the readiness brief is the normative source (same pattern as `pilot-dry-run-script.plan.md`). The `/plan-impl` skill's spec-literal discipline is still applied: the smoke-test curl, Decision 1 recommendation, Friday morning schedule, and "NOT doing" guardrails are copied verbatim into § Spec Literals and quoted by every task that consumes them.

## Spec Literals

> Verbatim copies of normative blocks from the readiness brief, dry-run script, and env-var contracts. TASK details MUST quote from this section rather than paraphrase. Update this section only if the source docs change.

### From readiness brief § Decision 1 — Deployment path for Saturday

```
| Option | Time to green | Springs experience | Cost | Risk |
|--------|---------------|---------------------|------|------|
| **A. Hosted Fastify on Fly.io or Render** (recommended) | ~3 hrs Friday AM | Realistic pilot URL + TLS | ~$5/month | Low |
| B. Local server + ngrok tunnel | ~30 min Friday | Works, but URL dies when laptop sleeps | $0 | Medium |
| C. Full AWS CDK deploy | 1–2 days (won't finish) | Most realistic | ~$20/month pilot volume | **High — will not finish by Saturday** |

**Recommendation:** Option A. Same Docker artifact is reusable for the real Springs pilot, removes laptop-uptime dependency, and mirrors the production shape. Option B is an acceptable fallback if we don't commit to A by end of day Thursday.
```

### From readiness brief § Pre-Saturday Schedule — Friday

```
- **Morning:** Dockerfile, deploy server to chosen host, verify `/health` over TLS, build dashboard with baked API key, set all env vars
```

### From readiness brief § Single Go / No-Go Gate Before Saturday

```
**By Friday 6:00 PM**, the following one-line test must succeed from a laptop not on our office wifi:

```bash
curl -sS https://<pilot-host>/health && \
curl -sS -X POST "https://<pilot-host>/v1/signals" \
  -H "content-type: application/json" \
  -H "x-api-key: <pilot_key>" \
  -d '{"signal_id":"dry-run-smoke","org_id":"springs","learner_reference":"stu-10042","source_system":"canvas-lms","event_type":"assessment_completed","occurred_at":"2026-04-18T13:00:00Z","data":{"masteryScore":0.75}}'
```

If this fails at 6:00 PM Friday and the cause is not a 10-minute fix, we pivot to ngrok (Option B) or postpone the dry run to Sunday.
```

### From readiness brief § What We Are Explicitly NOT Doing Before Saturday

```
1. Not fixing the `VITE_API_KEY` build-time bake-in. It is a finding, not a blocker.
2. Not attempting a full AWS CDK deploy.
3. Not adding new features or "polish."
4. Not skipping cross-device testing.
```

### From dry-run-script § Saturday 12:00–12:45 PM pre-flight

```
- Re-run deployment checklist
- Re-seed (idempotent) or wipe-and-reseed for clean slate
- Confirm all participants have access to observation log
- Confirm "Springs IT" is on a different network
- **No code deploys after 12:30 PM**
```

### From `.env.example` (server runtime contract)

```
PORT=3000
LOG_LEVEL=info

# API_KEY=
# API_KEY_ORG_ID=

SIGNAL_BODY_LIMIT=1048576

IDEMPOTENCY_DB_PATH=./data/idempotency.db
SIGNAL_LOG_DB_PATH=./data/signal-log.db
STATE_STORE_DB_PATH=./data/state.db
INGESTION_LOG_DB_PATH=./data/ingestion-log.db
DECISION_DB_PATH=./data/decisions.db

DECISION_POLICY_PATH=./src/decision/policies/default.json

# TENANT_FIELD_MAPPINGS_PATH=
# FIELD_MAPPINGS_TABLE=
# FIELD_MAPPINGS_CACHE_TTL_MS=

# ADMIN_API_KEY=

# Dashboard passphrase gate (Decision Panel). See docs/specs/dashboard-passphrase-gate.md
DASHBOARD_ACCESS_CODE=
DASHBOARD_SESSION_TTL_HOURS=8
COOKIE_SECRET=
```

### From dashboard-passphrase-gate spec § Environment Variables

```
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DASHBOARD_ACCESS_CODE` | No | — | The passphrase value. When set, gate is active. When unset/empty, gate is disabled. |
| `DASHBOARD_SESSION_TTL_HOURS` | No | `8` | Session cookie lifetime in hours. |
| `COOKIE_SECRET` | Yes (when gate active) | — | Secret used to sign session cookies. Min 32 chars. Generate with `openssl rand -hex 32`. |
```

### From dashboard source — build-time VITE variables

> Quoted from `dashboard/src/api/client.ts:1-2` and `dashboard/src/App.tsx:13`, `dashboard/src/components/layout/Header.tsx:20`. These are the three variables the dashboard bakes at `vite build` time.

```
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const API_KEY  = import.meta.env.VITE_API_KEY ?? '';
const envOrg   = import.meta.env.VITE_ORG_ID as string | undefined;
```

### From `src/decision/policy-loader.ts:629` (runtime policy path contract)

```
policyPath ?? process.env.DECISION_POLICY_PATH ?? path.join(process.cwd(), 'src/decision/policies/default.json');
```

> Normative effect for containerization: the server reads policy files from `process.cwd() + "/src/decision/policies/"`. The container's working directory MUST be the project root and the `src/decision/policies/` directory tree MUST be present on disk at that path. This is the single reason the runtime stage copies `src/decision/policies/` back in alongside `dist/`.

### From `src/server.ts:237` (runtime dashboard dist path contract)

```typescript
const dashboardDist = resolve(process.cwd(), 'dashboard', 'dist');
if (existsSync(dashboardDist)) { ... }
```

> Normative effect: `/dashboard` routes register only when `<cwd>/dashboard/dist` exists. The runtime stage MUST copy `dashboard/dist/` to that path — otherwise the passphrase gate and Decision Panel disappear silently and the dry run cannot execute.

### From `src/server.ts:263` (OpenAPI spec path contract)

```typescript
const apiSpecDir = resolve(__dirname, '..', 'docs', 'api');
// ...
specification: { path: join(apiSpecDir, 'openapi.yaml'), baseDir: apiSpecDir }
```

> Normative effect: Swagger UI at `/docs` reads `<dist/..>/docs/api/openapi.yaml`. Because `dist/` lives at the project root in the runtime container, the directory `docs/api/` MUST exist as a sibling of `dist/` with the current `openapi.yaml`. `/docs` is called out in `pilot-readiness-definition.md` as a pilot-ready gate ("Swagger UI accessible at `/docs`").

### From `src/server.ts:229` (inspect panels path contract)

```typescript
await server.register(fastifyStatic, { root: resolve(process.cwd(), 'src/panels'), prefix: '/inspect/' });
```

> Normative effect: the `/inspect` static panels route requires `<cwd>/src/panels/` to exist. If the directory is absent, Fastify throws on boot. Container MUST include `src/panels/` even though the dry run does not exercise these panels.

### From `pilot-readiness-definition.md` line 33 (W1 — the drift being fixed in TASK-006)

```
| Default decision type makes sense for the customer | Review `default_decision_type` in policy — should be safe (e.g. `reinforce`) | Solutions |
```

> W1 context: `pilot-p0-runbook-alignment.plan.md` TASK-005 removed `default_decision_type` from every policy file and TASK-002/003/004 removed the fallback from the evaluator per the pilot runbook "If no policy rule matches, no decision is created and no LIU is counted." Line 33 is now stale and contradicts the shipped behavior — a reviewer following this gate would look for a field that is gone. TASK-006 replaces it with a gate that reflects the runbook (policy rules cover expected state ranges; no unintended no-match outcomes for seeded personas).

## Prerequisites

- [x] PREREQ-001: Decision Engine + policy loader behavior per `pilot-p0-runbook-alignment.plan.md` is shipped (no `default_decision_type` fallthrough). Required so the W1 fix in TASK-006 reflects current behavior.
- [x] PREREQ-002: Dashboard passphrase gate is shipped (`src/auth/dashboard-gate.ts`, `src/auth/dashboard-login.ts`, `src/auth/session-cookie.ts` present). Required so runtime env-var wiring in TASK-002 has real consumers.
- [x] PREREQ-003: Springs seed script accepts `--host`, `--api-key`, `--admin-key`, `--org` (`scripts/seed-springs-demo.mjs`). Required so re-seed works against the deployed URL Friday afternoon and Saturday pre-flight.
- [x] PREREQ-004: `dry-run-script.md` § Saturday 12:00–12:45 pre-flight explicitly lists re-seed as the pre-flight action. Required so SQLite ephemerality in-container is already addressed by existing pre-flight procedure (no new runbook work).
- [ ] PREREQ-005: CEO Decision 1 resolved (`fly.io` or `render` — or `ngrok` fallback). This plan ships BOTH `fly.toml` and `render.yaml` so Friday morning does not depend on the decision landing before Thursday EOD; whichever is chosen gets used, the other stays as an alternate-host artifact.
- [ ] PREREQ-006: Pilot secrets provisioned per `onboarding-runbook.md` Phase 0 — `API_KEY`, `API_KEY_ORG_ID=org_springs`, `DASHBOARD_ACCESS_CODE`, `COOKIE_SECRET` (32-byte hex), `ADMIN_API_KEY` (for seed script). Plan documents how to inject them in TASK-005; the values themselves are provisioned out-of-band.

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list. Do not duplicate per-task status in task bodies.

> **Existing-solutions check** (per `.cursor/rules/prefer-existing-solutions/RULE.md`): No new SDK/library introductions. The container uses the existing `npm run build` + `npm run build:dashboard` scripts from `package.json:11,24` — no custom bundler, no `npm prune`, no hand-rolled multi-package build. `node:22-bookworm-slim` is the minimum Node base that supports `better-sqlite3` precompiled binaries for linux/amd64 (confirmed by `package.json` dependency `"better-sqlite3": "^12.6.2"`, which ships a prebuilt for Node 22 / glibc 2.36). Fly.io and Render both natively support Dockerfile-based deploys with build args — no custom buildpack needed. No AWS CDK changes (explicitly excluded per readiness brief § What We Are Explicitly NOT Doing #2).

---

### TASK-001: Create `.dockerignore`
- **Files**: `.dockerignore` (new)
- **Action**: Create
- **Details**: Exclude from build context:
  - `node_modules`, `dashboard/node_modules`, `infra/node_modules`
  - `dist`, `dashboard/dist` (rebuilt in builder stage; never copy pre-built artifacts from the host)
  - `data/` (SQLite dev DBs — must never ship; container creates its own under its cwd)
  - `tests/`, `coverage/`, `.vitest-cache`
  - `.env`, `.env.local`, `.env.*.local` (secrets — runtime env only)
  - `.git/`, `.github/`, `.cursor/`, `.agents/`, `internal-docs/` (not needed at runtime; internal-docs contains PII-adjacent pilot content that must never land in an image)
  - `docs/reports/`, `docs/testing/`, `docs/design/` (reduce image size; `docs/api/openapi.yaml` is the only runtime-required docs file — TASK-002 re-adds it explicitly via COPY, so a broad `docs/` exclude is not used)
  - `infra/` (AWS CDK — not used in Fly/Render runtime; excluded per readiness-brief guardrail #2)
  - `.DS_Store`, `*.log`
- **Depends on**: none
- **Verification**: `docker build .` completes without sending `node_modules` over the wire (observable in the "Sending build context" line; context size should be well under 20 MB for the repo).

---

### TASK-002: Multi-stage Dockerfile
- **Files**: `Dockerfile` (new)
- **Action**: Create
- **Details**: Multi-stage build. The runtime stage's COPY list is **prescribed verbatim in the user's plan directive**: "copy dist + dashboard/dist + src/decision/policies/ + src/contracts/schemas/ → run node dist/server.js." Three additional runtime copies are forced by § Spec Literals constraints (`docs/api/openapi.yaml` for `/docs`, `src/panels/` for `/inspect/`, `package.json` + production `node_modules` for native `better-sqlite3`); each is justified in the verification note below.

  Stage 1 — **builder** (`node:22-bookworm-slim` + build deps for `better-sqlite3`):
  ```dockerfile
  FROM node:22-bookworm-slim AS builder
  RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
  WORKDIR /app

  # Server deps (compiles better-sqlite3 against linux/amd64 glibc 2.36)
  COPY package.json package-lock.json ./
  RUN npm ci --no-audit --no-fund

  # Server source (tsc emits dist/ including JSON schemas under dist/contracts/schemas/)
  COPY tsconfig.json ./
  COPY src ./src
  RUN npm run build

  # Dashboard build with baked VITE_* envs (readiness-brief scope guardrail #1:
  # accept bake-in for this week; do NOT redesign build-time key handling)
  ARG VITE_API_BASE_URL
  ARG VITE_API_KEY
  ARG VITE_ORG_ID
  ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
      VITE_API_KEY=${VITE_API_KEY} \
      VITE_ORG_ID=${VITE_ORG_ID}
  COPY dashboard ./dashboard
  RUN npm run build:dashboard

  # Drop devDependencies so runtime stage copies a lean node_modules
  RUN npm prune --omit=dev
  ```

  Stage 2 — **runtime** (`node:22-bookworm-slim`, non-root):
  ```dockerfile
  FROM node:22-bookworm-slim AS runtime
  ENV NODE_ENV=production \
      PORT=3000 \
      LOG_LEVEL=info \
      DECISION_POLICY_PATH=./src/decision/policies/default.json
  WORKDIR /app

  # Production deps (native better-sqlite3 binary built in Stage 1)
  COPY --from=builder /app/node_modules ./node_modules
  COPY --from=builder /app/package.json ./package.json

  # Per user directive: copy dist + dashboard/dist + src/decision/policies/ + src/contracts/schemas/
  COPY --from=builder /app/dist ./dist
  COPY --from=builder /app/dashboard/dist ./dashboard/dist
  COPY --from=builder /app/src/decision/policies ./src/decision/policies
  COPY --from=builder /app/src/contracts/schemas ./src/contracts/schemas

  # Forced by Spec Literals — required for /docs, /inspect, and correct cwd semantics
  COPY docs/api/openapi.yaml ./docs/api/openapi.yaml
  COPY src/panels ./src/panels

  # SQLite writes under ./data when *_DB_PATH env vars use the .env.example defaults.
  # Re-seed at Saturday 12:00–12:45 pre-flight handles the ephemeral volume for dry run.
  RUN mkdir -p /app/data && chown -R node:node /app
  USER node

  EXPOSE 3000
  CMD ["node", "dist/server.js"]
  ```

  **Copy-list justification table** (audit trail for every file the runtime image needs):

  | Path | Source | Why |
  |------|--------|-----|
  | `node_modules/` | builder (post-prune) | `better-sqlite3` native binary; Fastify; `@fastify/*` plugins |
  | `package.json` | builder | `"type": "module"` required for Node to resolve ESM `dist/server.js` |
  | `dist/` | builder | User directive; compiled entrypoint `dist/server.js` + all compiled modules |
  | `dashboard/dist/` | builder | User directive; gated by `existsSync(dashboardDist)` at `src/server.ts:238` — absence = no `/dashboard` routes = dry-run Block 5 fails |
  | `src/decision/policies/` | builder | User directive; `policy-loader.ts:629` reads `process.cwd()+"/src/decision/policies/default.json"` |
  | `src/contracts/schemas/` | builder | User directive; listed for defense-in-depth even though `tsc` already copies JSON imports into `dist/contracts/schemas/` (verified: `ls dist/contracts/schemas/` shows `decision.json`, `signal-envelope.json`). No code path reads the raw `src/` JSON at runtime today, but keeping it mirrors the user's stated layout and costs < 20 KB. |
  | `docs/api/openapi.yaml` | host | `src/server.ts:263` reads it for Swagger at `/docs`; `pilot-readiness-definition.md` lists `/docs` as a pilot-ready gate |
  | `src/panels/` | host | `src/server.ts:229` registers `/inspect/` static against this path; Fastify throws on boot if missing |

  Do **not** copy: `.env*` (secrets come from host env), `tests/`, `infra/`, `scripts/` (seed runs from CI / operator laptop against the deployed URL, not inside the container), `docs/specs/`, `internal-docs/`.
- **Depends on**: TASK-001
- **Verification**:
  1. `docker build --build-arg VITE_API_BASE_URL=https://example.invalid --build-arg VITE_API_KEY=dummy --build-arg VITE_ORG_ID=springs -t 8p3p-pilot:test .` succeeds locally.
  2. `docker run --rm -e API_KEY=t -e API_KEY_ORG_ID=springs -e DASHBOARD_ACCESS_CODE=t -e COOKIE_SECRET=$(openssl rand -hex 32) -p 3000:3000 8p3p-pilot:test` boots without error; `curl -sS localhost:3000/health` → `{"status":"ok"}`.
  3. `curl -sS localhost:3000/docs/` → 200 Swagger UI (proves `docs/api/openapi.yaml` copy).
  4. `curl -sS -i localhost:3000/dashboard` → 302 to `/dashboard/login` (proves `dashboard/dist` copy + gate wired).
  5. Image size under ~250 MB (builder artifacts dropped; prod node_modules only).

---

### TASK-003: `fly.toml` template (Option A — Fly.io)
- **Files**: `fly.toml` (new)
- **Action**: Create
- **Details**: Minimum-viable Fly.io config matching the readiness-brief Decision 1 Option A description: "~3 hrs Friday AM, realistic pilot URL + TLS, ~$5/month." Bake-in of `VITE_*` happens at Fly build time via `[build.args]` — Fly passes these to the `ARG VITE_*` directives in `Dockerfile` Stage 1.

  ```toml
  # Template — app name filled Thursday evening when Decision 1 lands.
  # app = "8p3p-pilot-springs"  # set via: fly launch --name 8p3p-pilot-springs
  primary_region = "iad"         # Washington DC — lowest latency to US East Coast schools

  [build]
    dockerfile = "Dockerfile"

  [build.args]
    # These are consumed by Dockerfile ARG VITE_* in Stage 1 (builder) and
    # baked into dashboard/dist at vite build time. Accepted per readiness-brief
    # scope guardrail #1: "Not fixing the VITE_API_KEY build-time bake-in."
    VITE_API_BASE_URL = ""   # set via: fly deploy --build-arg VITE_API_BASE_URL=https://8p3p-pilot-springs.fly.dev
    VITE_API_KEY = ""        # set via: fly deploy --build-arg VITE_API_KEY=<pilot_key>
    VITE_ORG_ID = "springs"

  [env]
    PORT = "3000"
    LOG_LEVEL = "info"
    API_KEY_ORG_ID = "springs"
    DECISION_POLICY_PATH = "./src/decision/policies/default.json"
    DASHBOARD_SESSION_TTL_HOURS = "8"

  # Runtime secrets (not in fly.toml — set via `fly secrets set`):
  #   API_KEY, ADMIN_API_KEY, DASHBOARD_ACCESS_CODE, COOKIE_SECRET
  # See docs/guides/pilot-host-deployment.md § Secrets for the exact commands.

  [http_service]
    internal_port = 3000
    force_https = true
    auto_stop_machines = "stop"     # idle scale-to-zero to hit the $5/month target
    auto_start_machines = true
    min_machines_running = 0

    [[http_service.checks]]
      grace_period = "10s"
      interval = "30s"
      method = "GET"
      timeout = "5s"
      path = "/health"

  [[vm]]
    memory = "512mb"
    cpu_kind = "shared"
    cpus = 1
  ```

  `[env]` carries non-secret values (`API_KEY_ORG_ID=springs` is not a secret — it is the org ID, same treatment as `.env.example`). Secrets use `fly secrets set` and are injected at runtime without appearing in the TOML or the image.

  **SQLite note in file comment:** add a header comment referencing `dry-run-script.md` § Saturday 12:00–12:45 pre-flight — re-seed after any machine stop/start that wipes the ephemeral volume. Do **not** attach a persistent volume for the dry run (keeps the artifact single-machine, matches the readiness brief's "same Docker artifact reusable for the real pilot" framing — volumes are added when the real pilot starts).
- **Depends on**: TASK-002
- **Verification**: `fly launch --copy-config --no-deploy` (Thursday evening by Eng) accepts the TOML without validation errors. Runtime verification happens in TEST-SMOKE-001.

---

### TASK-004: `render.yaml` template (Option A alternate — Render)
- **Files**: `render.yaml` (new)
- **Action**: Create
- **Details**: Equivalent Render Blueprint for the same Dockerfile. Shipped alongside `fly.toml` so Friday morning does not stall on the CEO Decision — whichever host is approved gets deployed, the other artifact stays as an alternate.

  ```yaml
  # Template — host pick happens Thursday evening per CEO Decision 1.
  services:
    - type: web
      name: 8p3p-pilot-springs
      runtime: docker
      dockerfilePath: ./Dockerfile
      plan: starter                 # ~$7/month; closest to the readiness brief's ~$5 target
      region: oregon                # change if Springs is East Coast — oregon is Render's default
      healthCheckPath: /health
      autoDeploy: true              # main-branch push triggers deploy (requested by user: "push after the plan lands")

      # Build args passed to Dockerfile ARG VITE_*. Bake-in accepted per
      # readiness-brief scope guardrail #1.
      buildFilter:
        paths:
          - Dockerfile
          - package.json
          - package-lock.json
          - src/**
          - dashboard/**
          - docs/api/openapi.yaml

      envVars:
        - key: PORT
          value: 3000
        - key: LOG_LEVEL
          value: info
        - key: API_KEY_ORG_ID
          value: springs
        - key: DECISION_POLICY_PATH
          value: ./src/decision/policies/default.json
        - key: DASHBOARD_SESSION_TTL_HOURS
          value: "8"

        # Secrets — set in Render dashboard (sync: false = value not stored in blueprint)
        - key: API_KEY
          sync: false
        - key: ADMIN_API_KEY
          sync: false
        - key: DASHBOARD_ACCESS_CODE
          sync: false
        - key: COOKIE_SECRET
          sync: false

        # Build-time (baked into dashboard/dist via Dockerfile ARG VITE_*)
        - key: VITE_API_BASE_URL
          sync: false
        - key: VITE_API_KEY
          sync: false
        - key: VITE_ORG_ID
          value: springs
  ```

  **Persistence note in file header comment:** Render starter plan has no persistent disk; SQLite at `/app/data/*.db` is ephemeral. Re-seed per `dry-run-script.md` § Saturday 12:00–12:45. Same deferral as `fly.toml` — persistent disk is a post-pilot decision.
- **Depends on**: TASK-002
- **Verification**: `render blueprint validate render.yaml` (or Render dashboard's blueprint preview) accepts the file. Runtime verification happens in TEST-SMOKE-001.

---

### TASK-005: Deployment guide
- **Files**: `docs/guides/pilot-host-deployment.md` (new)
- **Action**: Create
- **Details**: Single doc Eng reads Friday morning. Sections (in order):
  1. **Decision 1 anchor.** Quote § Spec Literals § Decision 1 verbatim. Table: "If CEO chose Fly.io → use `fly.toml`. If CEO chose Render → use `render.yaml`. If ngrok (Option B) → this doc does not apply; see `onboarding-runbook.md` § local-dev tunnel."
  2. **Secrets provisioning.** Table of secrets, source, and how to inject:

     | Secret | Source | Fly.io command | Render command |
     |--------|--------|----------------|----------------|
     | `API_KEY` | `scripts/generate-api-key.mjs` or 1Password | `fly secrets set API_KEY=...` | Render dashboard → Environment |
     | `ADMIN_API_KEY` | `scripts/generate-api-key.mjs` | same | same |
     | `DASHBOARD_ACCESS_CODE` | human-memorable passphrase (e.g. `springs-pilot-2026`) per `dashboard-passphrase-gate.md` § Key Lifecycle | same | same |
     | `COOKIE_SECRET` | `openssl rand -hex 32` per `dashboard-passphrase-gate.md` § Environment Variables | same | same |

     Public env (non-secret) values are templated directly in `fly.toml` `[env]` / `render.yaml` `envVars`: `PORT=3000`, `LOG_LEVEL=info`, `API_KEY_ORG_ID=springs`, `DECISION_POLICY_PATH=./src/decision/policies/default.json`, `DASHBOARD_SESSION_TTL_HOURS=8`. Rationale: these are either (a) listed as public defaults in `.env.example` or (b) org IDs that are not secrets per the `api-key-middleware.md` model.

  3. **Dashboard build-time bake-in (accepted).** Quote § Spec Literals § What We Are Explicitly NOT Doing item 1 verbatim. Explain that `VITE_API_BASE_URL`, `VITE_API_KEY`, `VITE_ORG_ID` are passed as Docker build args and baked into `dashboard/dist` during Stage 1. Rebuild required to change them. Logged as finding #2 in the readiness brief (`At-Saturday — log as finding, do not fix this week`). Do not attempt to retrofit first-visit prompt or any of the alternatives mentioned in `dashboard-passphrase-gate.md` § Architecture — out of scope per the guardrail.

  4. **Persistence — dry-run-only deviation.** Quote § Spec Literals § Saturday 12:00–12:45 pre-flight verbatim. Then state explicitly:

     > **Deviation (accepted for the Springs dry run only):** SQLite DBs under `/app/data/` are ephemeral. Any machine restart, scale-to-zero cycle, or redeploy wipes the state. The pre-flight step `Re-seed (idempotent) or wipe-and-reseed for clean slate` is how the dry run handles this. For the **actual** Springs pilot (post-Saturday), this plan does **not** make a persistence decision — that belongs in a follow-up plan scoped against `docs/specs/aws-deployment.md` (DynamoDB) or a Fly volumes plan. No production customer data should be stored in SQLite in a container.

  5. **Friday morning runbook.** Numbered steps from zero to green:
     ```bash
     # 1. Provision secrets (1Password → env vars)
     # 2. Provision a Fly app (or Render service) — one of:
     fly launch --name 8p3p-pilot-springs --no-deploy --copy-config
     # OR
     # Render: connect GitHub repo, point to render.yaml
     # 3. Set runtime secrets (fly secrets set ... OR Render dashboard)
     # 4. Deploy with VITE_* build args
     fly deploy \
       --build-arg VITE_API_BASE_URL=https://8p3p-pilot-springs.fly.dev \
       --build-arg VITE_API_KEY=<pilot_key> \
       --build-arg VITE_ORG_ID=springs
     # 5. Verify /health
     curl -sS https://8p3p-pilot-springs.fly.dev/health
     # 6. Seed against deployed URL (Friday afternoon)
     node scripts/seed-springs-demo.mjs --host https://<pilot-host> --api-key <pilot_key> --admin-key <admin_key> --org springs
     # 7. Run TEST-SMOKE-001 (the Single Go/No-Go Gate)
     ```

  6. **TEST-SMOKE-001 — Friday 6:00 PM gate.** Quote § Spec Literals § Single Go / No-Go Gate Before Saturday **verbatim** (including the escape-on-failure clause "If this fails at 6:00 PM Friday and the cause is not a 10-minute fix, we pivot to ngrok (Option B) or postpone the dry run to Sunday."). This IS the test; do not add unit tests or wrappers around it.

  7. **Cross-links.** To `dry-run-script.md`, `pilot-readiness-definition.md`, `deployment-checklist.md`, `dashboard-passphrase-gate.md`, `.env.example`.
- **Depends on**: TASK-002, TASK-003, TASK-004
- **Verification**: Eng can follow the doc from cold and reach a deployed `/health=200` URL without consulting this plan file. Every env-var in the doc appears in `.env.example` OR the passphrase-gate spec (no invented vars). Smoke-test curl matches Spec Literals byte-for-byte (TEST-SMOKE-001 guard).

---

### TASK-006: Fix W1 in `pilot-readiness-definition.md:33`
- **Files**: `internal-docs/pilot-operations/pilot-readiness-definition.md`
- **Action**: Modify (one table row — line 33)
- **Details**: The Policy & Configuration gates table currently reads (verbatim from § Spec Literals § pilot-readiness-definition.md line 33):

  ```
  | Default decision type makes sense for the customer | Review `default_decision_type` in policy — should be safe (e.g. `reinforce`) | Solutions |
  ```

  Replace with a gate that reflects the runbook rule landed in `pilot-p0-runbook-alignment.plan.md` (*"If no policy rule matches, no decision is created and no LIU is counted"*):

  ```
  | Policy rules cover the customer's expected state ranges (no unintended no-match outcomes) | Exercise seed personas end-to-end; confirm each produces a matched decision (no `matched: false` silently) — per `internal-docs/pilot-operations/pilot-runbook.md` § Policy rule | Solutions |
  ```

  Exactly one line changes. Surrounding table rows stay verbatim. The section header (§ Policy & Configuration) and the "8P3P Side" checklist at line 100 do not need touching — that checklist already says "Org policy file deployed and verified via `GET /v1/policies`" which is a valid gate independent of `default_decision_type`.

  **Why this is W1 (the one-line drift item, fixed in the same PR):** `default_decision_type` was removed from every policy file in `pilot-p0-runbook-alignment.plan.md` TASK-005 and from the evaluator in TASK-002/003/004. A reviewer running the readiness gate on line 33 would look for a field that no longer exists. This is a one-line documentation correction — no runbook change, no behavior change, no test change.
- **Depends on**: none (this is a pure doc edit; PREREQ-001 establishes that the runbook behavior is already shipped)
- **Verification**:
  1. `rg -n 'default_decision_type' internal-docs/pilot-operations/pilot-readiness-definition.md` returns **zero** matches after the edit.
  2. The checklist at line 100 ("Org policy file deployed and verified via `GET /v1/policies`") remains unchanged.
  3. The new line cross-references `pilot-runbook.md` (imported by `pilot-p0-runbook-alignment.plan.md` TASK-000).

---

### TEST-SMOKE-001: Single Go / No-Go Gate
- **Files**: none (operational test — no new test code; this IS the readiness brief's gate)
- **Action**: Verify
- **Details**: Execute the verbatim curl quoted in § Spec Literals § Single Go / No-Go Gate Before Saturday against the deployed pilot URL. **No shell script wrapper, no npm run target, no vitest case.** The test fidelity comes from being the exact bytes the readiness brief promised the CEO — any wrapping (e.g. "ok, close enough") dilutes that.

  Substitution: `<pilot-host>` → the host from CEO Decision 1; `<pilot_key>` → the `API_KEY` from the secrets vault (same key that was set in Fly/Render as a runtime secret). No other edits to the curl.

  **Pass:** both curls return HTTP 2xx; the POST returns an accepted envelope (`{"status":"accepted", ...}` per `docs/api/openapi.yaml` `/v1/signals` 200 response schema).
  **Fail:** quote the readiness brief's escape clause verbatim: *"If this fails at 6:00 PM Friday and the cause is not a 10-minute fix, we pivot to ngrok (Option B) or postpone the dry run to Sunday."* — CS lead + Eng decide live; do not extend this plan.
- **Depends on**: TASK-002, TASK-003 *or* TASK-004 (whichever host won Decision 1), TASK-005, and PREREQ-005, PREREQ-006
- **Verification**: Curl output captured in the observation log (the dry-run-script.md template row #0 already has a slot for the baseline commit SHA and pre-flight evidence — the smoke-curl output lands there alongside it).

---

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| `.dockerignore` | TASK-001 | Keep build context small; prevent host `node_modules`, secrets, PII-adjacent internal docs from landing in image |
| `Dockerfile` | TASK-002 | Multi-stage build; runtime copies dist + dashboard/dist + src/decision/policies/ + src/contracts/schemas/ + docs/api/openapi.yaml + src/panels/ (last two forced by Spec Literals) |
| `fly.toml` | TASK-003 | Fly.io template (Decision 1 Option A) |
| `render.yaml` | TASK-004 | Render Blueprint (Decision 1 Option A alternate) |
| `docs/guides/pilot-host-deployment.md` | TASK-005 | Friday morning deploy runbook; env-var wiring; persistence caveat; smoke-test verbatim |

### To Modify

| File | Task | Changes |
|------|------|---------|
| `internal-docs/pilot-operations/pilot-readiness-definition.md` | TASK-006 | One line (line 33): replace stale `default_decision_type` gate with a "policy rules cover expected state ranges" gate that matches the runbook |

### Not Touched (by design)

| File | Why |
|------|-----|
| `src/**` | No behavior change; server already supports all required envs and runtime paths per § Spec Literals |
| `dashboard/**` | Scope guardrail #1 — not fixing VITE_API_KEY bake-in |
| `infra/**` (AWS CDK) | Scope guardrail #2 — not attempting full AWS CDK deploy |
| `internal-docs/pilot-operations/dry-run-script.md` | Already references Friday morning Dockerfile + deploy; its Friday-morning block is the consumer of this plan's artifacts, not a collaborator |
| `docs/specs/*.md` | This plan does not change spec contracts |
| `docs/api/openapi.yaml` | No API surface change |
| `tests/**` | Smoke test is the readiness brief's curl; no new vitest cases per TEST-SMOKE-001 scope note |

## Requirements Traceability

> The spec is the readiness brief (+ supporting docs). Every normative requirement from § Spec Literals maps to ≥1 TASK. Unmapped = planning defect.

| Requirement (source anchor) | Source | Task |
|-----------------------------|--------|------|
| "Dockerfile, deploy server to chosen host, verify `/health` over TLS" | readiness brief § Pre-Saturday Schedule — Friday morning | TASK-002, TASK-003, TASK-004, TASK-005, TEST-SMOKE-001 |
| "build dashboard with baked API key" | readiness brief § Pre-Saturday Schedule — Friday morning | TASK-002 (Stage 1 `ARG VITE_*`), TASK-003 `[build.args]`, TASK-004 `envVars` |
| "set all env vars" | readiness brief § Pre-Saturday Schedule — Friday morning | TASK-003 `[env]`, TASK-004 `envVars`, TASK-005 § Secrets provisioning |
| Decision 1 Option A — Fly.io OR Render (recommended) | readiness brief § Decision 1 | TASK-003 (Fly), TASK-004 (Render) — both shipped |
| Decision 1 Option B (ngrok) remains a fallback | readiness brief § Decision 1 Recommendation | TASK-005 § Decision 1 anchor — doc explicitly defers to `onboarding-runbook.md` for tunnel path |
| Decision 1 Option C (AWS CDK) explicitly excluded | readiness brief § What We Are Explicitly NOT Doing #2 | Plan-level constraint — `infra/` in `.dockerignore` (TASK-001); no infra changes |
| VITE_API_KEY bake-in "NOT doing to fix, IN scope to execute" | readiness brief § What We Are Explicitly NOT Doing #1 + user directive | TASK-002 Stage 1 `ARG VITE_*`; TASK-005 § Dashboard build-time bake-in (accepted) |
| No new features / no polish | readiness brief § What We Are Explicitly NOT Doing #3 | Plan-level constraint — zero `src/` changes |
| Cross-device testing not skipped | readiness brief § What We Are Explicitly NOT Doing #4 | Out of this plan's scope — `dry-run-script.md` § Friday afternoon already carries this; deploy artifact does not prevent it |
| Single Go / No-Go Gate curl (verbatim) | readiness brief § Single Go / No-Go Gate | TEST-SMOKE-001 + TASK-005 § 6 (doc quotes verbatim) |
| `API_KEY` + `API_KEY_ORG_ID` runtime env | `.env.example`; `deployment-checklist.md` § Non-Negotiable Security Gates | TASK-003 `[env]` (org_id only — key is a secret), TASK-004 `envVars`, TASK-005 § Secrets |
| `DASHBOARD_ACCESS_CODE` + `COOKIE_SECRET` runtime env | `dashboard-passphrase-gate.md` § Environment Variables | TASK-003 secrets comment, TASK-004 `envVars` (`sync: false`), TASK-005 § Secrets |
| `DECISION_POLICY_PATH` runtime env | `.env.example`; `policy-loader.ts:629` | TASK-003 `[env]`, TASK-004 `envVars`, TASK-002 runtime `ENV DECISION_POLICY_PATH=...` |
| `LOG_LEVEL`, `PORT` runtime env | `.env.example` | TASK-002 runtime `ENV`, TASK-003 `[env]`, TASK-004 `envVars` |
| Swagger UI at `/docs` reachable (pilot-ready gate) | `pilot-readiness-definition.md` Infrastructure table | TASK-002 runtime COPY `docs/api/openapi.yaml` |
| SQLite ephemerality handled by re-seed | `dry-run-script.md` § Saturday 12:00–12:45 pre-flight | TASK-005 § Persistence (accepted deviation documented) |
| W1 — `pilot-readiness-definition.md:33` stale `default_decision_type` gate | User directive + `pilot-p0-runbook-alignment.plan.md` TASK-005 | TASK-006 |
| Push after plan lands so deploy target is current | User directive | Verification Checklist § Post-merge |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| TEST-SMOKE-001 | operational (manual) | Verbatim curl from readiness brief § Single Go / No-Go Gate against deployed host returns 2xx on `/health` and on `POST /v1/signals` | TEST-SMOKE-001 |

> **Why only one test.** The readiness brief explicitly names this curl as the single gate ("By Friday 6:00 PM, the following one-line test must succeed"). Adding wrapper tests or vitest cases around a deploy artifact duplicates coverage from the ~639-case baseline that already proves the server behaves correctly against a built `dist/`. The new risk introduced by this plan is containerization + host wiring, and the readiness brief's curl is the designed probe for exactly that risk. Per the scope guardrail "Not adding new features or polish" (§ Spec Literals § What We Are Explicitly NOT Doing #3), no test infrastructure is added.

## Deviations from Spec

> List every place the plan's literal values differ from § Spec Literals. Resolution must be one of: `Update spec in same PR`, `Implementation detail — spec silent`, `Reverted — plan now matches spec`.

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| readiness brief § Decision 1 Option A — cost | "~$5/month" | Fly.io shared-cpu-1x @ 512MB with scale-to-zero ≈ $3–5/month; Render `starter` = ~$7/month (no scale-to-zero on starter) | Implementation detail — spec silent on exact plan SKU. Both hosts stay in the "~$5/month" neighborhood the CEO approved; if Render's $7 is unacceptable, Fly is the pick. |
| readiness brief § What We Are Explicitly NOT Doing #1 — VITE_API_KEY bake-in | "Not fixing the `VITE_API_KEY` build-time bake-in" | Plan accepts bake-in AND wires it through `Dockerfile` `ARG VITE_*` → `fly.toml [build.args]` / `render.yaml` `envVars`. "Not fixing" ≠ "not executing" — the user directive is explicit ("accept the bake-in for this week"). | Implementation detail — spec silent on how bake-in is wired, only on whether it is *fixed*. Not fixing is respected; wiring is the required build path. |
| `.env.example` | `SIGNAL_BODY_LIMIT=1048576`, `IDEMPOTENCY_DB_PATH=./data/idempotency.db`, `SIGNAL_LOG_DB_PATH=./data/signal-log.db`, `STATE_STORE_DB_PATH=./data/state.db`, `INGESTION_LOG_DB_PATH=./data/ingestion-log.db`, `DECISION_DB_PATH=./data/decisions.db` | Plan does not template these in `fly.toml` / `render.yaml`; server's `src/server.ts` defaults to the `.env.example` values, so `/app/data/*.db` works with no env wiring | Implementation detail — spec silent. The `.env.example` defaults are the runtime defaults; setting them explicitly in the host config would only matter if we relocated `./data` to a mounted volume, which we explicitly are not doing (dry-run scope). |
| readiness brief § Decision 1 Option A — "Same Docker artifact is reusable for the real Springs pilot" | Implies one Docker artifact, one host | Plan ships one `Dockerfile` and TWO host configs (`fly.toml` + `render.yaml`) | Implementation detail — spec silent on how many host configs ship. One `Dockerfile` = one artifact (the spec's invariant). Two configs = two ways to point the same artifact at a host, driven by user directive ("plan can template both, Friday picks the one CEO approved"). |
| `pilot-readiness-definition.md:33` | Gate refers to `default_decision_type` | Gate refers to policy-rule coverage (matched outcomes) | Update spec in same PR — TASK-006 is the edit. |
| `pilot-readiness-definition.md:97` (8P3P Side checklist — Infrastructure) | "Environment deployed, `/health` returns 200" | No change in this plan; TEST-SMOKE-001 is the Friday evidence | Implementation detail — spec silent on *when* the checklist is run; the checklist is satisfied by the TEST-SMOKE-001 result. |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `better-sqlite3` native build fails in `node:22-bookworm-slim` (missing glibc version or CPU arch mismatch — e.g. Fly builds on amd64, local dev on arm64 Mac) | **High** (no server boot = no Saturday) | Dockerfile explicitly installs `python3 make g++` in builder stage (matches the documented install path for `better-sqlite3`). Base is `bookworm-slim` (Debian 12 / glibc 2.36), which is what `better-sqlite3 v12` pre-builds target. Local sanity check via `docker build` is the first verification step in TASK-002. If it fails, fallback is to pin `better-sqlite3@11.x` (older prebuilts) — not a plan change, a one-line `package.json` edit surfaced during TASK-002. |
| Fly.io or Render account setup (billing, SSH keys, `flyctl` install) pushes Friday morning past the 3-hour budget | Medium (forces pivot to ngrok Option B by 6 PM) | Thursday evening pre-work (`onboarding-runbook.md` Phase 0): Eng creates the Fly/Render account, verifies `flyctl auth login` works, confirms billing is attached. Zero-to-`fly launch` is under 30 min if account already exists; Friday morning is pure deploy. |
| Dashboard build fails inside the container because `dashboard/package-lock.json` is missing or `npm ci` cannot resolve a dep (seen before on tailwind v4 alpha chains) | Medium (blocks `dashboard/dist` copy → blocks Block 5 of Saturday) | Dockerfile uses `npm run build:dashboard` which is `cd dashboard && npm ci --quiet && npm run build` — same path as CI. If CI is green on main, the container build is green. Risk mitigator: run the full docker build once locally Thursday evening before committing. |
| Smoke-test curl (TEST-SMOKE-001) fails because seed never ran against the deployed URL (empty state → `/v1/signals` accepts but nothing appears in dashboard) | Low for the smoke curl itself (the gate accepts a POST 2xx), Medium for Saturday Block 3–5 | Friday afternoon step 6 in TASK-005 runbook is explicit: run `seed-springs-demo.mjs --host <deployed>` before 6 PM. Saturday 12:00–12:45 pre-flight re-runs seed — two chances. |
| SQLite wipes between Friday deploy and Saturday 12:00 pre-flight (machine restart / redeploy triggered by a TOML tweak) | Low (by design) | Pre-flight re-seed is the designed mitigation; documented in TASK-005 § Persistence and cross-linked to `dry-run-script.md`. Teams know to re-seed; this is not a surprise. |
| W1 fix in TASK-006 gets reviewed in isolation and someone unfamiliar with the runbook rejects the one-liner | Low | TASK-006 details section cross-links to `pilot-p0-runbook-alignment.plan.md` TASK-005 and `pilot-runbook.md` § Policy rule so the reviewer has the receipt chain. Commit message should cite both. |
| Two host configs (`fly.toml` + `render.yaml`) diverge over time | Low | Both are templates — once Decision 1 lands Thursday, the unused one can be `git rm`d in a follow-up if the team doesn't want dead files. Until then, keeping both is cheaper than a plan revision. |
| `src/contracts/schemas/` copy in the runtime stage is dead weight (runtime loads compiled JSON from `dist/contracts/schemas/` via `tsc` JSON-module copying) | Cost: < 20 KB image size | Kept per user directive ("copy … src/contracts/schemas/"). Documented in TASK-002 § Copy-list justification so future readers understand it is a belt-and-suspenders inclusion, not a required one. |
| Post-merge push triggers Render autoDeploy before secrets are set → deploy fails with missing `COOKIE_SECRET` / `API_KEY` | Medium | Render TASK-004 uses `sync: false` on secrets so the first deploy will fail fast with a clear missing-env error; ops fix is "set secrets in dashboard → redeploy." Fly.io is safer because `fly deploy` is explicit, not auto-on-push. Document this sequencing in TASK-005 § Friday morning runbook (secrets first, deploy second). |

## Verification Checklist

### Plan-level

- [ ] All tasks TASK-001 through TASK-006 completed; TEST-SMOKE-001 executed
- [ ] `docker build --build-arg VITE_API_BASE_URL=... --build-arg VITE_API_KEY=... --build-arg VITE_ORG_ID=springs -t 8p3p-pilot:test .` succeeds locally
- [ ] `docker run ...` boots; `/health`, `/docs/`, `/dashboard` all respond as specified in TASK-002 Verification
- [ ] `rg -n 'default_decision_type' internal-docs/pilot-operations/pilot-readiness-definition.md` returns zero matches (TASK-006 gate)
- [ ] `.dockerignore` excludes `internal-docs/` (PII-adjacent), `.env*`, `data/`, `infra/`, `tests/` (TASK-001 gate)
- [ ] `Dockerfile` runtime stage copy list includes, in order: `node_modules`, `package.json`, `dist/`, `dashboard/dist/`, `src/decision/policies/`, `src/contracts/schemas/`, `docs/api/openapi.yaml`, `src/panels/` (TASK-002 gate)
- [ ] `fly.toml` `[build.args]` lists `VITE_API_BASE_URL`, `VITE_API_KEY`, `VITE_ORG_ID` exactly (TASK-003 gate)
- [ ] `render.yaml` `envVars` lists the same three build-time vars with `sync: false` for the secret ones (TASK-004 gate)
- [ ] `docs/guides/pilot-host-deployment.md` quotes the Single Go/No-Go Gate curl byte-for-byte from § Spec Literals (TASK-005 gate — TEST-SMOKE-001 byte parity)
- [ ] `npm test`, `npm run lint`, `npm run typecheck` — all green (no src changes in this plan, so these should remain green from baseline)

### Deploy-time (Friday 2026-04-17 AM)

- [ ] CEO Decision 1 landed (PREREQ-005)
- [ ] Secrets provisioned in vault (PREREQ-006)
- [ ] Chosen host wired per TASK-003 or TASK-004
- [ ] First deploy produces a TLS URL; `curl /health` → 200
- [ ] Seed run against deployed URL; 11 signals + expected decisions per `docs/guides/springs-pilot-demo.md`
- [ ] TEST-SMOKE-001 executes successfully from a laptop **not** on office wifi (per readiness brief)

### Post-merge (user directive: "Push after the plan lands, so the deploy target is current.")

- [ ] Plan + artifacts merged to `main`
- [ ] `git push origin main` (Render `autoDeploy: true` triggers; Fly deploy is manual via `fly deploy`)
- [ ] Deployed image digest / commit SHA recorded in observation log (matches `dry-run-script.md` pre-flight row)

## Implementation Order

```
TASK-001 ─┐
          ├─ TASK-002 ──┬─ TASK-003 ─┐
          │             │            │
          │             └─ TASK-004 ─┤
          │                          │
          └─────────────────────────┴─ TASK-005 ─┐
                                                  │
                                     TASK-006 ───┤
                                                  │
                                                  └─ PR merge ─ push ─ TEST-SMOKE-001 (Friday 6 PM)
```

**TASK-006 is parallelizable** — it has no file overlap with TASK-001..005 and no dependency on them. Eng can ship TASK-006 as a separate commit within the same PR while the container work is in review, or vice versa.

## Next Steps

After the plan lands:
1. Review and adjust task ordering if Eng wants to hot-path TASK-002 before TASK-001 (acceptable — `.dockerignore` is additive).
2. Run `/implement-spec .cursor/plans/pilot-host-deployment.plan.md`.
3. Per user directive, push to `main` immediately after merge so Render auto-deploy (or Fly manual deploy) targets the plan's Dockerfile.
