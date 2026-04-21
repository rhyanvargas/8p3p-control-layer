# Pilot host deployment (Docker / Fly.io / Render)

**Audience:** Engineering (Friday-morning deploy for the Springs dry run)  
**Purpose:** Go from zero to a TLS URL with `/health`, runtime secrets, dashboard build args, and the CEO readiness **single curl gate**. For onboarding workflow and customer-facing steps, see the [Onboarding Runbook](../../internal-docs/pilot-operations/onboarding-runbook.md) and [Pilot Readiness Definition](../../internal-docs/pilot-operations/pilot-readiness-definition.md).

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
| **Fly.io** (Option A) | [`fly.toml`](../../fly.toml) at repo root — `fly launch` / `fly deploy` with `Dockerfile` |
| **Render** (Option A) | Render **Web Service** from this repo’s `Dockerfile` (and Blueprint `render.yaml` when that file exists in the repo), with the same env/build-arg wiring as below |
| **ngrok** (Option B) | This guide assumes a **container on Fly or Render**. For a local Fastify process plus a public tunnel, follow Option B in the readiness brief and use [Onboarding Runbook § Phase 1](../../internal-docs/pilot-operations/onboarding-runbook.md#phase-1-environment-provisioning-day-0-1) for tenant secrets and URL wiring against your tunnel host |

---

## 2. Secrets provisioning

Provision values out of band (vault / Phase 0–1 handoff per [Onboarding Runbook](../../internal-docs/pilot-operations/onboarding-runbook.md)). **Never** commit secrets; runtime only (`Dockerfile` excludes `.env*`).

| Secret | Source | Fly.io | Render |
|--------|--------|--------|--------|
| `API_KEY` | [`scripts/generate-api-key.mjs`](../../scripts/generate-api-key.mjs) or team vault | `fly secrets set API_KEY='...'` | Dashboard → Environment → Secret |
| `ADMIN_API_KEY` | [`scripts/generate-api-key.mjs`](../../scripts/generate-api-key.mjs) | `fly secrets set ADMIN_API_KEY='...'` | Dashboard → Environment → Secret |
| `DASHBOARD_ACCESS_CODE` | Human-memorable passphrase per [Dashboard passphrase gate — Key Lifecycle](../specs/dashboard-passphrase-gate.md#key-lifecycle) | `fly secrets set DASHBOARD_ACCESS_CODE='...'` | Dashboard → Environment → Secret |
| `COOKIE_SECRET` | `openssl rand -hex 32` per [Dashboard passphrase gate — Environment Variables](../specs/dashboard-passphrase-gate.md#environment-variables) | `fly secrets set COOKIE_SECRET='...'` | Dashboard → Environment → Secret |

You can set several Fly secrets in one invocation, for example:

```bash
fly secrets set API_KEY='...' ADMIN_API_KEY='...' DASHBOARD_ACCESS_CODE='...' COOKIE_SECRET='...'
```

### Public (non-secret) runtime env

These are **not** vault secrets. They are fixed in [`fly.toml`](../../fly.toml) `[env]` or the Render service env to match [`.env.example`](../../.env.example) / pilot template:

| Variable | Example / note |
|----------|----------------|
| `PORT` | `3000` |
| `LOG_LEVEL` | `info` |
| `API_KEY_ORG_ID` | `springs` (org id for this deployment; not the API key) |
| `DECISION_POLICY_PATH` | `./src/decision/policies/default.json` |
| `DASHBOARD_SESSION_TTL_HOURS` | `8` |

Rationale: either defaults documented in `.env.example` or org identifiers that are not treated as secrets in the [API key middleware](../specs/api-key-middleware.md) deployment model.

Optional overrides (paths, limits) from `.env.example` apply if you set them; otherwise the image defaults match local dev.

---

## 3. Dashboard build-time bake-in (accepted scope)

Readiness brief — *What We Are Explicitly NOT Doing Before Saturday*:

```
1. Not fixing the `VITE_API_KEY` build-time bake-in. It is a finding, not a blocker.
2. Not attempting a full AWS CDK deploy.
3. Not adding new features or "polish."
4. Not skipping cross-device testing.
```

`VITE_API_BASE_URL`, `VITE_API_KEY`, and `VITE_ORG_ID` are **Docker build args** in [`Dockerfile`](../../Dockerfile) Stage 1 (builder). They are embedded in `dashboard/dist` at `vite build` time. Changing them requires a **rebuild and redeploy**, not a runtime env flip. Do not retrofit first-visit prompt or other alternatives from [Dashboard passphrase gate — Architecture](../specs/dashboard-passphrase-gate.md#architecture) for this dry run; that is out of scope per the guardrail above.

**Fly.io:** pass build args on deploy (values also appear in `fly.toml` `[build.args]` as placeholders):

```bash
fly deploy \
  --build-arg VITE_API_BASE_URL=https://<your-fly-hostname> \
  --build-arg VITE_API_KEY=<pilot_key> \
  --build-arg VITE_ORG_ID=springs
```

**Render:** define the same keys as **build-time** env vars on the service (secret values for `VITE_API_KEY` / URL as appropriate) so the Docker build receives them as `ARG`/`ENV` in the builder stage.

---

## 4. Persistence — dry-run-only caveat

From [dry-run script — Saturday 12:00–12:45 pre-flight](../../internal-docs/pilot-operations/dry-run-script.md):

```
- Re-run deployment checklist
- Re-seed (idempotent) or wipe-and-reseed for clean slate
- Confirm all participants have access to observation log
- Confirm "Springs IT" is on a different network
- **No code deploys after 12:30 PM**
```

**Deviation (accepted for the Springs dry run only):** SQLite databases under `/app/data/` are **ephemeral** in the container. Any machine restart, scale-to-zero cycle, or redeploy can wipe state. The pre-flight step *Re-seed (idempotent) or wipe-and-reseed for clean slate* is how the dry run handles that. For the **real** Springs pilot after Saturday, persistence is a **follow-up** decision (for example [AWS deployment spec](../specs/aws-deployment.md) / DynamoDB or Fly volumes)—not covered here. Do not rely on container SQLite for production customer of record.

---

## 5. Friday morning runbook (zero → green)

1. Provision secrets (vault → `fly secrets set` or Render dashboard).
2. **Fly:** create the app if needed, e.g. `fly launch --name <app-name> --no-deploy --copy-config` (after `app` name is set in `fly.toml` as required by Fly). **Render:** create a Web Service from the repo; point at `Dockerfile` / Blueprint if `render.yaml` exists.
3. Set runtime secrets (`API_KEY`, `ADMIN_API_KEY`, `DASHBOARD_ACCESS_CODE`, `COOKIE_SECRET`).
4. Deploy with `VITE_*` build args (Fly example):

   ```bash
   fly deploy \
     --build-arg VITE_API_BASE_URL=https://<pilot-host> \
     --build-arg VITE_API_KEY=<pilot_key> \
     --build-arg VITE_ORG_ID=springs
   ```

5. Verify health:

   ```bash
   curl -sS https://<pilot-host>/health
   ```

6. **Friday afternoon:** seed against the deployed URL (same key material as in secrets / build):

   ```bash
   node scripts/seed-springs-demo.mjs --host https://<pilot-host> --api-key <pilot_key> --admin-key <admin_key> --org springs
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

**Pass:** both requests return HTTP 2xx; `POST /v1/signals` returns an accepted envelope per [`docs/api/openapi.yaml`](../api/openapi.yaml). **Fail:** follow the escape clause above; CS lead + Eng decide live.

---

## Related documents

| Document | Purpose |
|----------|---------|
| [Dry-run script](../../internal-docs/pilot-operations/dry-run-script.md) | Saturday timeline and observation log |
| [Pilot readiness definition](../../internal-docs/pilot-operations/pilot-readiness-definition.md) | Pilot-ready gates |
| [Deployment checklist](./deployment-checklist.md) | Pre-deploy technical gates |
| [Dashboard passphrase gate](../specs/dashboard-passphrase-gate.md) | `DASHBOARD_ACCESS_CODE`, `COOKIE_SECRET` |
| [`.env.example`](../../.env.example) | Full server env contract |
