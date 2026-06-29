# Pilot host deployment (Docker / Fly.io / Render)

> **Primary pilot path (2026-06):** [`aws-pilot-runbook.md`](aws-pilot-runbook.md) — CDK API + Amplify dashboard in one AWS account. Use **this doc** only when an AWS account is unavailable or you need the Docker/Fly shortcut.

**Audience:** Engineering (pilot API deploy + separate dashboard hosting)  
**Purpose:** Go from zero to a TLS URL with `/health`, runtime secrets, and the CEO readiness **single curl gate**. The **Decision Panel** is a standalone Next.js app (`dashboard/`) — it does **not** ship inside the API Docker image. For local two-process setup see [`docs/foundation/setup.md`](../../foundation/setup.md). For onboarding workflow see Internal onboarding runbook (local `internal-docs/`, not in public repo) and [`Pilot Readiness Gates`](pilot-readiness-gates.md).

---

## 1. Decision 1 — deployment path (readiness brief)

Normative text from the pilot readiness brief (*Decision 1 — Deployment path for Saturday*):

```
| Option | Time to green | Springs experience | Cost | Risk |
|--------|---------------|---------------------|------|------|
| **A. Hosted Fastify on Fly.io or Render** (recommended) | ~3 hrs Friday AM | Realistic pilot URL + TLS | ~$5/month | Low |
| B. Local server + ngrok tunnel | ~30 min Friday | Works, but URL dies when laptop sleeps | $0 | Medium |
| C. Full AWS CDK deploy | 1–2 days (won't finish) | Most realistic | ~$20/month pilot volume | **High — will not finish by Saturday** |

**Recommendation:** Option A. Same Docker artifact is reusable for the real Springs pilot, removes laptop-uptime dependency, and mirrors the production shape. Option B is an acceptable fallback if we don't commit to A by end of day Thursday.
```

### Host pick (this doc)

| CEO decision | Use |
|--------------|-----|
| **Fly.io** (Option A) | [`fly.toml`](../../../fly.toml) at repo root — `fly launch` / `fly deploy` with `Dockerfile` |
| **Render** (Option A) | Render **Web Service** from this repo’s `Dockerfile` (and Blueprint `render.yaml` when that file exists in the repo), with the same env/build-arg wiring as below |
| **ngrok** (Option B) | This guide assumes a **container on Fly or Render**. For a local Fastify process plus a public tunnel, follow Option B in the readiness brief and use Internal onboarding runbook (local `internal-docs/`, not in public repo) § Phase 1 for tenant secrets and URL wiring against your tunnel host |

---

## 2. Secrets provisioning

Provision values out of band (vault / Phase 0–1 handoff per Internal onboarding runbook (local `internal-docs/`, not in public repo)). **Never** commit secrets; runtime only (`Dockerfile` excludes `.env*`).

### Control layer (API) — Fly.io / Render

| Secret | Source | Fly.io | Render |
|--------|--------|--------|--------|
| `API_KEY` | [`scripts/generate-api-key.mjs`](../../scripts/generate-api-key.mjs) or team vault | `fly secrets set API_KEY='...'` | Dashboard → Environment → Secret |
| `ADMIN_API_KEY` | [`scripts/generate-api-key.mjs`](../../scripts/generate-api-key.mjs) | `fly secrets set ADMIN_API_KEY='...'` | Dashboard → Environment → Secret |

You can set several Fly secrets in one invocation, for example:

```bash
fly secrets set API_KEY='...' ADMIN_API_KEY='...'
```

### Decision Panel (Next.js) — separate host

Dashboard secrets are **runtime env** on the Next.js host (Amplify, Vercel, Fly second app, etc.) — not Docker build args. See [`dashboard/.env.example`](../../../dashboard/.env.example).

| Secret | Source | Notes |
|--------|--------|-------|
| `CONTROL_LAYER_API_BASE_URL` | Pilot API URL | e.g. `https://8p3p-pilot-springs.fly.dev` |
| `CONTROL_LAYER_API_KEY` | Same value as API `API_KEY` | **Server-only** — proxied by `/api/control/*`; never `NEXT_PUBLIC_` |
| `CONTROL_LAYER_ORG_ID` | Pilot org | e.g. `springs` |
| `DASHBOARD_ACCESS_CODE` | Human-memorable passphrase | [Dashboard passphrase gate](../../specs/dashboard-passphrase-gate.md) |
| `COOKIE_SECRET` | `openssl rand -hex 32` | Required when gate is enabled |

Example (Amplify console or host env):

```bash
CONTROL_LAYER_API_BASE_URL=https://<pilot-api-host>
CONTROL_LAYER_API_KEY=<same as API_KEY>
CONTROL_LAYER_ORG_ID=springs
DASHBOARD_ACCESS_CODE=<passphrase>
COOKIE_SECRET=<32+ byte secret>
```

Ensure the API allows the dashboard origin via `DASHBOARD_ALLOWED_ORIGINS` (see [`.env.example`](../../../.env.example)).

### Public (non-secret) runtime env

These are **not** vault secrets. They are fixed in [`fly.toml`](../../../fly.toml) `[env]` or the Render service env to match [`.env.example`](../../../.env.example) / pilot template:

| Variable | Example / note |
|----------|----------------|
| `PORT` | `3000` |
| `LOG_LEVEL` | `info` |
| `API_KEY_ORG_ID` | `springs` (org id for this deployment; not the API key) |
| `DECISION_POLICY_PATH` | `./src/decision/policies/default.json` |
| `DASHBOARD_SESSION_TTL_HOURS` | `8` |

Rationale: either defaults documented in `.env.example` or org identifiers that are not treated as secrets in the [API key middleware](../../specs/api-key-middleware.md) deployment model.

Optional overrides (paths, limits) from `.env.example` apply if you set them; otherwise the image defaults match local dev.

---

## 3. Two-artifact deployment (API + dashboard)

As of the Next.js migration ([`docs/specs/nextjs-amplify-dashboard-migration.md`](../../specs/nextjs-amplify-dashboard-migration.md)):

| Artifact | Build | Host | Image / output |
|----------|-------|------|----------------|
| **Control layer API** | Root [`Dockerfile`](../../../Dockerfile) (`npm run build` → `dist/`) | Fly.io / Render | Fastify only — **no dashboard bundle** |
| **Decision Panel** | `cd dashboard && npm run build` | AWS Amplify (planned), or any Next.js host | `.next/` standalone SSR |

**Security win:** `CONTROL_LAYER_API_KEY` is a **runtime server env** on the dashboard host. It is not baked into a client JS bundle (legacy `VITE_API_KEY` pattern is retired).

**Pilot minimum:** deploy the API first (this doc § 5–6). Deploy the dashboard separately with `CONTROL_LAYER_*` pointing at the API URL. Local parity: [`docs/foundation/setup.md`](../../foundation/setup.md).

**AWS Amplify** for the dashboard is spec'd but **blocked** pending startup credits — see migration spec stage gate. Until then, run the dashboard on any Node 22 host that supports Next.js 15 SSR, or develop locally with `npm run dev` in `dashboard/`.

---

## 4. Persistence — dry-run-only caveat

From internal dry-run script (local `internal-docs/`, not in public repo) — Saturday 12:00–12:45 pre-flight:

```
- Re-run deployment checklist
- Re-seed (idempotent) or wipe-and-reseed for clean slate
- Confirm all participants have access to observation log
- Confirm "Springs IT" is on a different network
- **No code deploys after 12:30 PM**
```

**Deviation (accepted for the Springs dry run only):** SQLite databases under `/app/data/` are **ephemeral** in the container. Any machine restart, scale-to-zero cycle, or redeploy can wipe state. The pre-flight step *Re-seed (idempotent) or wipe-and-reseed for clean slate* is how the dry run handles that. For any pilot exceeding 1 week — including the post-Saturday Springs pilot and any subsequent customer — **persistence is mandatory** per § 7 Pilot persistence below. The dry-run-ephemeral mode and the long-pilot persistent mode are two distinct deployment configurations.

---

## 7. Pilot persistence (3–6 month customer pilots)

**Adopted 2026-05-15 (CEO direction).** This section is the persistence ladder for any customer pilot longer than the Springs dry run. It is **required** for evidence-grade reporting (MC-A* / MC-B* / MC-C* in [`program-metrics.md`](../../specs/program-metrics.md)) because the signal-log, state-store, decision-store, and educator-feedback databases must survive the full pilot window for replay, audit, and the FERPA-safe research export.

### What the server actually writes

`src/server.ts` initializes **six** SQLite databases by default — all under `./data/`:

| Env var | Default path | Purpose |
|---------|--------------|---------|
| `IDEMPOTENCY_DB_PATH` | `./data/idempotency.db` | Signal-id dedup |
| `SIGNAL_LOG_DB_PATH` | `./data/signal-log.db` | Append-only signal log |
| `STATE_STORE_DB_PATH` | `./data/state.db` | Versioned learner state |
| `INGESTION_LOG_DB_PATH` | `./data/ingestion-log.db` | Accept/reject/duplicate audit |
| `DECISION_DB_PATH` | `./data/decisions.db` | Decision receipts |
| `FEEDBACK_DB_PATH` | `./data/feedback.db` | Educator feedback + view log (per `docs/specs/educator-feedback-api.md`) |

A wipe of `/app/data/*.db` wipes **all** of the above, including months of educator feedback and decision receipts.

### Recipe — solo-dev, ~$8–12/month all-in

1. **Create a Fly Volume in the same region as the app:**

   ```bash
   fly volumes create data --region dfw --size 3
   ```

   3 GB is plenty for pilot volume (≤ 15 k decisions × 6 months ≈ tens of MBs); pay for headroom because Fly Volumes cannot easily shrink.

2. **Mount it at `/app/data` in `fly.toml`:**

   ```toml
   [[mounts]]
     source = "data"
     destination = "/app/data"
   ```

3. **Pin a single writer.** Fly Volumes are region-bound and tied to one machine. Configure:

   ```toml
   [http_service]
     min_machines_running = 1
     auto_stop_machines  = "off"

   # (and constrain the deploy)
   ```

   ```bash
   fly scale count 1 --max-per-region 1
   ```

   This intentionally gives up scale-to-zero (~$5/mo) for persistence (~$8–12/mo). Worth it.

4. **Nightly off-host backup.** Run a Fly Machines cron task or a GitHub Action that streams each SQLite file off-host:

   ```bash
   for db in idempotency signal-log state ingestion-log decisions feedback; do
     sqlite3 /app/data/${db}.db ".backup /tmp/${db}.db"
   done
   tar czf /tmp/backup-$(date -u +%Y%m%dT%H%M%SZ).tgz /tmp/*.db
   # upload to R2 / B2 / S3 with object-lock (immutable retention ≥ 6 months)
   ```

   Storage cost at pilot volume: well under $1/month on Cloudflare R2 / Backblaze B2.

5. **Restore drill (run once before pilot starts).** Confirm a fresh machine can boot from a downloaded backup tarball into `/app/data/` and re-serve `/health` + `/v1/admin/program-metrics` against the same numbers as the source. Verifying backups work is the entire point of having them.

6. **Data-loss tripwire.** A daily Fly Machines exec calling `sqlite3 decisions.db "SELECT COUNT(*) FROM decisions"` → POST to a free monitor (Healthchecks.io). If the count ever *decreases*, alert. Catches accidental wipes before the weekly evidence report exposes them.

### Migration tripwires — when to leave Fly + SQLite

Stay on Fly + SQLite + Volume **until any of the following becomes true**, then migrate to the AWS path in [`docs/specs/aws-deployment.md`](../../specs/aws-deployment.md) (DynamoDB + Lambda):

- `signal-log.db` exceeds **1 GB** OR sustained write rate exceeds **100 k signals/day**, OR
- More than one Fly Machine needs to write (multi-region or HA), OR
- Customer contract requires a SOC 2 / FERPA-attested data residency story Fly Volumes do not provide.

At pilot scale none of these trigger; below them, SQLite-on-Fly is the right tool.

### Cross-references

- [`docs/guides/operators/pilot-readiness-gates.md`](pilot-readiness-gates.md) § Pilot vs production readiness — this section is the **persistence ladder** the gate references.
- [`docs/foundation/roadmap.md`](../../foundation/roadmap.md) item 31 — adopts this recipe.
- [`fly.toml`](../../../fly.toml) — `[[mounts]]` block commented in place; uncomment when running a real pilot.

---

---

## 5. Friday morning runbook (zero → green)

1. Provision API secrets (vault → `fly secrets set` or Render dashboard): `API_KEY`, `ADMIN_API_KEY`.
2. **Fly:** create the app if needed, e.g. `fly launch --name <app-name> --no-deploy --copy-config`. **Render:** create a Web Service from the repo; point at `Dockerfile`.
3. Deploy the **API only** (no dashboard build args):

   ```bash
   fly deploy
   ```

4. Verify health:

   ```bash
   curl -sS https://<pilot-host>/health
   ```

5. **Dashboard (separate step):** build and deploy `dashboard/` to your Next.js host with runtime `CONTROL_LAYER_*` env vars (§ 2). Smoke the panel URL after deploy.

6. **Friday afternoon:** seed against the deployed API URL:

   ```bash
   node examples/springs/seed-springs-demo.mjs --host https://<pilot-host> --api-key <pilot_key> --admin-key <admin_key> --org springs
   ```

7. Run **§ 6** (single go/no-go gate) before **Friday 6:00 PM**.

---

## 6. TEST-SMOKE-001 — Friday 6:00 PM gate

This is the readiness brief *Single Go / No-Go Gate Before Saturday* — copied verbatim (substitute only `<pilot-host>` and `<pilot_key>` as documented in the brief).

> **By Friday 6:00 PM**, the following one-line test must succeed from a laptop not on our office wifi:

```bash
curl -sS https://<pilot-host>/health && \
curl -sS -X POST "https://<pilot-host>/v1/signals" \
  -H "content-type: application/json" \
  -H "x-api-key: <pilot_key>" \
  -d '{"signal_id":"dry-run-smoke","org_id":"springs","learner_reference":"stu-10042","source_system":"canvas-lms","event_type":"assessment_completed","occurred_at":"2026-04-18T13:00:00Z","data":{"masteryScore":0.75}}'
```

> If this fails at 6:00 PM Friday and the cause is not a 10-minute fix, we pivot to ngrok (Option B) or postpone the dry run to Sunday.

**Pass:** both requests return HTTP 2xx; `POST /v1/signals` returns an accepted envelope per [`docs/api/openapi.yaml`](../../api/openapi.yaml). **Fail:** follow the escape clause above; CS lead + Eng decide live.

---

## Related documents

| Document | Purpose |
|----------|---------|
| Internal dry-run script (local `internal-docs/`, not in public repo) | Saturday timeline and observation log |
| [Pilot Readiness Gates](pilot-readiness-gates.md) | Pilot-ready gates |
| [Deployment checklist](./deployment-checklist.md) | Pre-deploy technical gates |
| [Dashboard passphrase gate](../../specs/dashboard-passphrase-gate.md) | `DASHBOARD_ACCESS_CODE`, `COOKIE_SECRET` |
| [`.env.example`](../../../.env.example) | Full server env contract |
