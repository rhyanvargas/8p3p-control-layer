---
name: Pilot Charter Onboarding
overview: "Ship AWS-hosted charter-school pilot readiness: contract fix, CDK plus Amplify deploy with AI explanations ON, customer feedback loop P0, data onboarding kit, and GTM demo checklist. SBIR Track 6 and TEKS build deferred."
todos:
  - id: PREREQ-001
    content: Green local gates (build, test, lint, typecheck, validate contracts baseline)
    status: completed
  - id: PREREQ-002
    content: Pilot environment record in vault (AWS account, org_id, keys, passphrase, COOKIE_SECRET)
    status: completed
  - id: PREREQ-003
    content: Confirm pilot org_id and policies path policies/org_id/learner.json
    status: completed
  - id: TASK-001
    content: Fix educator_explanation contract drift in asyncapi.yaml and openapi
    status: completed
  - id: TASK-002
    content: Relocate panel-helpers tests under tests/ for vitest CI inclusion
    status: completed
  - id: TASK-003
    content: "AWS API deploy via GitHub Actions (deploy.yml): OIDC + secrets per runbook §1.2–§2.0; fallback manual CDK §2.1"
    status: completed
  - id: TASK-004
    content: Amplify dashboard deploy with passphrase gate and proxy env
    status: completed
  - id: TASK-005
    content: Enable AI explanations and Bedrock IAM in pilot Lambda env
    status: completed
  - id: TASK-006
    content: ProductFeedback types, error codes, and FeedbackRepository extension
    status: pending
  - id: TASK-007
    content: SQLite and DynamoDB product_feedback storage (product# SK prefix)
    status: pending
  - id: TASK-008
    content: product-handler-core validation and csat_summary aggregation
    status: pending
  - id: TASK-009
    content: Fastify routes POST /v1/feedback, /v1/feedback/csat, GET /v1/admin/feedback
    status: pending
  - id: TASK-010
    content: pf_session API preHandler and dashboard login/logout mint/clear
    status: pending
  - id: TASK-011
    content: Dashboard proxy pf_session injection for product feedback POST paths
    status: pending
  - id: TASK-012
    content: Send feedback Sheet in app shell (always-on P0 affordance)
    status: pending
  - id: TASK-013
    content: CSAT prompt component flag-gated NEXT_PUBLIC_FEEDBACK_CSAT default OFF
    status: pending
  - id: TASK-014
    content: Instantiate pilot-feedback-log.md and tracked schema template
    status: pending
  - id: TASK-015
    content: Contract and integration tests PFEED-001 through PFEED-011
    status: pending
  - id: TASK-016
    content: Dashboard component and e2e tests PFEED-012 through PFEED-014
    status: pending
  - id: TASK-017
    content: Customer data requirements and IT questionnaire guide
    status: pending
  - id: TASK-018
    content: End-to-end ingestion dry-run on hosted pilot environment
    status: pending
  - id: TASK-019
    content: Update dashboard_pilot_roadmap and foundation roadmap priorities
    status: pending
  - id: TASK-020
    content: GTM demo video capture checklist against live hosted dashboard
    status: pending
isProject: false
---

# Pilot Charter Onboarding

**Primary spec**: `docs/specs/customer-feedback-loop.md`  
**Supporting refs**: `docs/guides/operators/aws-pilot-runbook.md`, `docs/specs/ai-educator-explanations.md`, `docs/guides/operators/pilot-readiness-gates.md`, `docs/specs/ingestion-preflight.md`, `docs/guides/customers/pilot-integration-guide.md`

**Context (2026-06-25, confirmed)**:

| Decision | Answer |
|----------|--------|
| Deploy path | **AWS** (CDK API + Amplify dashboard per `aws-pilot-runbook.md`) |
| Customer sample data | **Not yet**; may never arrive — prepare IT questionnaire + 8P3P-ingest path |
| Timeline | **Board-gated, uncertain** — deploy anyway; be ready before board decides |
| Demo video | **Yes** — record against live hosted env (TASK-020) |
| TEKS/STAAR | **Nice-to-have now**; if deal closes may need **fast follow** (config layer, not engine — TASK-017 hedge only, no build until gated) |
| SBIR Track 6 | **Deferred** (LIU, outcomes, program-metrics, research-export) |

Engineering must be **deployed and ready** for self-serve login, upload (customer or 8P3P), gap insight, decision validation (Approve/Reject + AI explanations ON), and **async in-product feedback** (customer-feedback-loop P0).

---

## Spec Literals

> Verbatim copies of normative blocks from `customer-feedback-loop.md`. TASK bodies MUST quote from here rather than paraphrase.

### From spec § POST /v1/feedback Body

```json
{
  "feedback_type": "idea | problem | praise | question",
  "category": "dashboard_ux",
  "message": "It would help to filter decisions by skill on the overview.",
  "page_context": "/decisions",
  "app_version": "2026.06.23"
}
```

### From spec § POST /v1/feedback Response (201)

```json
{ "feedback_id": "uuid", "kind": "general", "feedback_type": "idea", "category": "dashboard_ux", "created_at": "2026-06-23T21:12:04Z" }
```

### From spec § POST /v1/feedback/csat Body

```json
{ "csat_score": 4, "message": "Decisions are clear; upload was confusing.", "page_context": "/decisions", "app_version": "2026.06.23" }
```

### From spec § POST /v1/feedback/csat Response (201)

```json
{ "feedback_id": "uuid", "kind": "csat", "csat_score": 4, "created_at": "2026-06-23T21:12:04Z" }
```

### From spec § GET /v1/admin/feedback Response (200)

```json
{ "org_id": "...", "items": [ <rows> ], "csat_summary": { "count": 12, "mean": 4.1, "distribution": { "1":0, "2":1, "3":2, "4":4, "5":5 } } }
```

### From spec § Auth — pf_session sibling cookie

Per `docs/specs/dashboard-passphrase-gate.md` § "Sibling cookie: `fb_session`" — *"New `/v1/*` namespaces that need dashboard-gated auth must mint their own sibling cookie following this same pattern rather than widening `dp_session`."*

`/login` mints **`pf_session`** alongside `dp_session`/`fb_session`; `/logout` clears it. It follows the `fb_session` pattern exactly except **`Path=/v1/feedback`** (so it reaches `/v1/feedback` and `/v1/feedback/csat` but not `/v1/decisions/*` or other namespaces). Same `COOKIE_SECRET`, same value/Max-Age/SameSite=`Strict`/host-only as `fb_session`.

### From spec § Concrete Values Checklist — Cookies

| Name | Path | Notes |
|------|------|-------|
| `pf_session` | `/v1/feedback` | Sibling of `fb_session`; same `COOKIE_SECRET`, value, Max-Age, `SameSite=Strict`, host-only. Minted at `/login`, cleared at `/logout`. |

### From spec § Concrete Values Checklist — localStorage

| Key | Value | Notes |
|-----|-------|-------|
| `feedback:csat:v1` | `{ lastShownAt: <RFC3339> }` | CSAT frequency cap; try/catch; absence ⇒ eligible. Versioned per vercel-react-best-practices §4.4. |

### From spec § Concrete Values Checklist — Env vars

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `CSAT_MIN_INTERVAL_DAYS` | No | `7` | int | Min days between CSAT prompts per browser. |
| `FEEDBACK_TASK_DECISION_THRESHOLD` | No | `5` | int | Decisions reviewed in a session before the post-task CSAT is eligible. |
| `NEXT_PUBLIC_FEEDBACK_CSAT` | No | `false` | bool | Client flag gating the CSAT prompt UI. OFF for the controlled evaluation. |
| `COOKIE_SECRET` | Yes (gate active) | — | string | Reused; signs `pf_session`. |

### From spec § Concrete Values Checklist — Routes registered

| Method | Path | Auth |
|--------|------|------|
| POST | `/v1/feedback` | `x-api-key` + `pf_session` |
| POST | `/v1/feedback/csat` | `x-api-key` + `pf_session` |
| GET | `/v1/admin/feedback` | `ADMIN_API_KEY` |

### From spec § New Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `feedback_type_required` | 400 | `kind=general` without a valid `feedback_type` |
| `message_required` | 400 | `kind=general` with empty/missing `message` |
| `message_too_long` | 400 | `message` > 4000 chars |
| `invalid_category` | 400 | `category` not in the closed set |
| `invalid_csat_score` | 400 | `csat_score` missing/not an integer 1–5 on the CSAT route |
| `csat_score_forbidden` | 400 | `csat_score` present on `POST /v1/feedback` |

### From spec § feedback_type closed set

| Value | Meaning |
|-------|---------|
| `idea` | Feature request / improvement |
| `problem` | Something is broken, confusing, or missing |
| `praise` | Positive signal (what to preserve) |
| `question` | Customer needs help / clarity (also a docs signal) |

### From spec § category closed set

| Value | Maps to |
|-------|---------|
| `decisions` | Decision Panel / explanations |
| `data_ingestion` | Upload / connectors / mappings |
| `dashboard_ux` | Navigation, layout, performance, a11y |
| `trust_privacy` | Data-leakage posture, auditability, FERPA |
| `other` | Uncategorized at capture time; CS lead refines at triage |

### From ai-educator-explanations.md § Env vars (pilot enablement)

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `AI_EXPLANATIONS_ENABLED` | no | `false` | bool | Master toggle. `false` → template generator only; LLM provider never initialized. |
| `AI_PROVIDER` | no | `amazon-bedrock` | string | Provider backend: `amazon-bedrock` (Lambda/production) or `gateway` (local dev with AI Gateway). |
| `AI_MODEL` | when enabled | `us.anthropic.claude-3-5-haiku-20241022-v1:0` (bedrock) | string | Model ID passed to the provider. |

---

## Prerequisites

Before starting implementation:

- [ ] **PREREQ-001** Local gates green on release commit: `npm run build`, `npm test`, `npm run lint`, `npm run typecheck`, `cd dashboard && npm run build && npm test`. Record baseline; fix Node 22 via `.nvmrc` if `better-sqlite3` ABI errors.
- [ ] **PREREQ-002** Pilot environment record filled (vault, not git): AWS account ID, `STAGE=pilot`, `org_id`, API URL, dashboard URL, API key, `ADMIN_API_KEY`, `DASHBOARD_ACCESS_CODE`, `COOKIE_SECRET` — template in `docs/guides/operators/aws-pilot-runbook.md` §0.
- [ ] **PREREQ-003** Choose pilot `org_id` (e.g. `southwest-charter`) and confirm policy file path `policies/<org_id>/learner.json` exists or will be created at onboarding.

---

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list. Do not duplicate per-task status inside task bodies.

### TASK-001: Fix educator_explanation contract drift in asyncapi.yaml and openapi
- **Files**: `src/contracts/asyncapi.yaml`, `src/contracts/openapi.yaml` (or `docs/api/openapi.yaml` if mirrored)
- **Action**: Modify
- **Details**: Add optional `educator_explanation: { type: ['string', 'null'] }` to `Decision.trace.properties` in asyncapi.yaml to match `src/contracts/schemas/decision.json`. Mirror in OpenAPI if the validator compares it. Re-run `npm run validate:contracts` until zero mismatches.
- **Depends on**: PREREQ-001
- **Verification**: `npm run validate:contracts` exits 0.

### TASK-002: Relocate panel-helpers tests under tests/ for vitest CI inclusion
- **Files**: `dashboard/lib/__tests__/panel-helpers.test.ts` → `tests/unit/panel-helpers.test.ts` (or `tests/dashboard/panel-helpers.test.ts`)
- **Action**: Move
- **Details**: Root `vitest.config.ts` `include` is `tests/**/*.test.ts` only. Move existing `educatorBodyCopy` / `findRecentDecisionForSkill` tests; fix import paths (`@/lib/panel-helpers`).
- **Depends on**: none
- **Verification**: `npm test -- --run tests/unit/panel-helpers.test.ts` passes.

### TASK-003: AWS API deploy (GitHub Actions — recommended)
- **Files**: `.github/workflows/deploy.yml`, GitHub repo secrets, `infra/` (stack unchanged unless env/IAM updates)
- **Action**: Deploy (ops)
- **Details**: Follow `docs/guides/operators/aws-pilot-runbook.md` § 0 → § 1.1 bootstrap → § 1.2 OIDC secrets (`AWS_DEPLOY_ROLE_ARN`, `ADMIN_API_KEY`, `API_KEY_ORG_ID=southwest-charter`) → § 2.0 run **Deploy** workflow with **`stage=pilot`**. Capture `ApiUrl` (§ 2.2) and API Gateway key (§ 2.3) into vault. Set `AI_EXPLANATIONS_ENABLED=false` for baseline. **Fallback:** § 2.1 manual `cdk deploy` only if GitHub/OIDC unavailable.
- **Depends on**: PREREQ-002
- **Verification**: Deploy workflow green; `curl -sS "$API_URL/health"` returns `{"status":"ok"}`; optional `GET /docs` reachable.

### TASK-004: Amplify dashboard deploy with passphrase gate and proxy env
- **Files**: `dashboard/amplify.yml`, Amplify console env vars
- **Action**: Deploy (ops)
- **Details**: Per runbook §3: set `CONTROL_LAYER_API_BASE_URL`, `CONTROL_LAYER_API_KEY`, `CONTROL_LAYER_ORG_ID`, `DASHBOARD_ACCESS_CODE`, `COOKIE_SECRET` (same value as API `COOKIE_SECRET`), `NEXT_PUBLIC_APP_NAME`. Confirm `/dashboard/login` redirect when unauthenticated; successful login lands on Overview.
- **Depends on**: TASK-003
- **Verification**: All gates in `docs/guides/operators/pilot-readiness-gates.md` § Decision Panel pass against hosted URL.

### TASK-005: Enable AI explanations and Bedrock IAM in pilot Lambda env
- **Files**: `infra/lib/control-layer-stack.ts` (if env/IAM not yet wired), Lambda env in CDK or console
- **Action**: Modify + deploy
- **Details**: Set `AI_EXPLANATIONS_ENABLED=true`, `AI_PROVIDER=amazon-bedrock`, `AI_MODEL` per spec defaults. Grant Lambda execution role `bedrock:InvokeModel` scoped to configured model ARN (`docs/specs/ai-educator-explanations.md` § Production Correctness Notes). Re-ingest or seed so new decisions carry `trace.educator_explanation`.
- **Depends on**: TASK-003
- **Verification**: One new decision after enablement has non-null `trace.educator_explanation` in `GET /v1/decisions`; dashboard Panels 2 and 3 show narrative via `educatorBodyCopy()`.

### TASK-006: ProductFeedback types, error codes, and FeedbackRepository extension
- **Files**: `src/shared/types.ts`, `src/shared/error-codes.ts`, `src/feedback/repository.ts`
- **Action**: Modify
- **Details**: Add `ProductFeedbackRecord` matching spec § Data Model columns. Extend `FeedbackRepository` with `insertProductFeedback(record)` and `listProductFeedback(orgId, filters)`. Add error codes verbatim from Spec Literals § New Error Codes. Export closed sets for `feedback_type` and `category`.
- **Depends on**: TASK-001
- **Verification**: `npm run typecheck` clean; repository interface documented with `@see docs/specs/customer-feedback-loop.md`.

### TASK-007: SQLite and DynamoDB product_feedback storage (product# SK prefix)
- **Files**: `src/feedback/sqlite-repository.ts`, `src/feedback/dynamodb-repository.ts`
- **Action**: Modify
- **Details**: SQLite: `product_feedback` table + `(org_id, created_at)` index. DynamoDB: SK `product#<timestamp>#<uuid>`, `record_kind: 'product_feedback'`. Implement `insertProductFeedback` / `listProductFeedback` with org-scoped queries and optional filters (`kind`, `feedback_type`, `category`, `since`, `limit` default 100 max 500).
- **Depends on**: TASK-006
- **Verification**: Unit tests insert and list round-trip on SQLite path.

### TASK-008: product-handler-core validation and csat_summary aggregation
- **Files**: `src/feedback/product-handler-core.ts` (NEW)
- **Action**: Create
- **Details**: Framework-agnostic handlers: `handleSubmitGeneralFeedbackCore`, `handleSubmitCsatFeedbackCore`, `handleListAdminProductFeedbackCore`. Validation per spec: general requires `feedback_type` + non-empty `message` ≤ 4000; CSAT requires `csat_score` 1–5 integer, forbids `feedback_type`/`category`; general forbids `csat_score` (`csat_score_forbidden`). Default `category` to `other`. Compute `csat_summary` over filtered csat rows. Session ID from `pf_session` preHandler (first 32 hex of sig, same as `feedbackSessionPreHandler`).
- **Depends on**: TASK-007
- **Verification**: Unit tests cover all validation branches and csat_summary mean/distribution.

### TASK-009: Fastify routes POST /v1/feedback, /v1/feedback/csat, GET /v1/admin/feedback
- **Files**: `src/feedback/product-handler.ts` (NEW), `src/feedback/routes.ts`, `src/auth/product-feedback-session-preHandler.ts` (NEW), `src/auth/session-cookie.ts`, `src/server.ts`
- **Action**: Create + Modify
- **Details**: Add `PRODUCT_FEEDBACK_SESSION_COOKIE_NAME = 'pf_session'` and `buildProductFeedbackCookieAttributes` with `path: '/v1/feedback'` (mirror `buildFeedbackCookieAttributes` pattern). `productFeedbackSessionPreHandler` reads `pf_session`, returns 401 `session_required` when missing/invalid. Register routes per Spec Literals § Routes registered. Admin GET uses existing `adminApiKeyPreHandler`; no `pf_session`. Append-only: no UPDATE/DELETE routes (PFEED-011).
- **Depends on**: TASK-008
- **Verification**: Manual curl with key + `pf_session` cookie returns 201 on happy path.

### TASK-010: pf_session API preHandler and dashboard login/logout mint/clear
- **Files**: `dashboard/lib/session-cookie-edge.ts`, `dashboard/app/(auth)/login/route.ts`, `dashboard/app/(auth)/logout/route.ts`, `docs/specs/dashboard-passphrase-gate.md` (additive sibling cookie section)
- **Action**: Modify
- **Details**: Add `PF_SESSION_COOKIE_NAME = 'pf_session'` and `buildProductFeedbackCookieAttributes({ path: '/v1/feedback', ... })` on dashboard edge. Login POST sets `pf_session` with **same signed value** as `dp_session`/`fb_session` (mirror lines 112–113 in login route). Logout clears `pf_session`. Mint/clear uses SameSite=`Strict`, host-only, same Max-Age as sibling cookies per spec.
- **Depends on**: TASK-009
- **Verification**: E2e: login response Set-Cookie includes `pf_session`; logout clears it.

### TASK-011: Dashboard proxy pf_session injection for product feedback POST paths
- **Files**: `dashboard/app/api/control/[...path]/route.ts`, `dashboard/lib/session-cookie-edge.ts`, `dashboard/app/api/control/__tests__/route.test.ts`
- **Action**: Modify
- **Details**: Add `isProductFeedbackProxyPath(pathSegments)` matching `v1/feedback` and `v1/feedback/csat`. On POST when path matches, inject `Cookie: pf_session=<signed>` from `readDashboardSessionCookieValue(request)` (same pattern as `FB_SESSION_COOKIE_NAME` injection for decision feedback). Browser never sees API key.
- **Depends on**: TASK-010
- **Verification**: Unit test mirrors REVIEW-UX-010 for `pf_session` on `POST v1/feedback`.

### TASK-012: Send feedback Sheet in app shell (always-on P0 affordance)
- **Files**: `dashboard/components/feedback/send-feedback-sheet.tsx` (NEW), `dashboard/components/layout/dashboard-shell.tsx`
- **Action**: Create + Modify
- **Details**: Per spec § In-Product UX (1): footer/sidebar "Send feedback" trigger on every authenticated page; shadcn `Sheet` with `feedback_type` segmented control (`idea`|`problem`|`praise`|`question`), single `Textarea`, read-only `page_context` (strip query strings client-side), optional `category` defaulting to `other`, submit via `POST /api/control/v1/feedback`. Focus trap, Esc dismiss, success toast, failure preserves typed text. Never auto-open.
- **Depends on**: TASK-011
- **Verification**: PFEED-012 manual; authenticated user on `/decisions` submits idea and receives 201 toast.

### TASK-013: CSAT prompt component flag-gated NEXT_PUBLIC_FEEDBACK_CSAT default OFF
- **Files**: `dashboard/components/feedback/csat-prompt.tsx` (NEW), `dashboard/components/layout/dashboard-shell.tsx`, `.env.example`
- **Action**: Create + Modify
- **Details**: Render only when `NEXT_PUBLIC_FEEDBACK_CSAT === 'true'`. Frequency cap via `localStorage` key `feedback:csat:v1` = `{ lastShownAt: <RFC3339> }`. Eligible after `FEEDBACK_TASK_DECISION_THRESHOLD` (default 5) reviews or upload complete; cap `CSAT_MIN_INTERVAL_DAYS` (default 7). SSR: render null on server, reconcile after mount. POST `/api/control/v1/feedback/csat`. All 5 scale options visible on mobile without horizontal scroll.
- **Depends on**: TASK-012
- **Verification**: With flag OFF, component never mounts. With flag ON, PFEED-013 and PFEED-014 pass.

### TASK-014: Instantiate pilot-feedback-log.md and tracked schema template
- **Files**: `internal-docs/reports/pilot-feedback-log.md` (NEW, gitignored), `docs/guides/pilot-feedback-log-schema.md` (NEW, tracked template)
- **Action**: Create
- **Details**: Local sink per spec § Closed Loop with schema `{date, customer, summary, category, feedback_type, proposed-roadmap-phase, status}`. Tracked template in `docs/guides/` so team has schema without committing customer rows. Seed first entries from Southwest meeting themes (TEKS ask → `proposed-roadmap-phase: Phase 2+`, category `decisions` or `other`).
- **Depends on**: none (can parallel)
- **Verification**: CS lead can append a row; `GET /v1/admin/feedback` items map to triage columns.

### TASK-015: Contract and integration tests PFEED-001 through PFEED-011
- **Files**: `tests/integration/product-feedback.test.ts` (NEW)
- **Action**: Create
- **Details**: Implement all contract/integration test IDs from spec § Contract Tests. Use same session-cookie signing helpers as `tests/integration/educator-feedback.test.ts`. PFEED-010 cross-org isolation. PFEED-011 assert no PUT/PATCH/DELETE on product feedback routes.
- **Depends on**: TASK-009
- **Verification**: `npm test -- --run tests/integration/product-feedback.test.ts` all green on Node 22.

### TASK-016: Dashboard component and e2e tests PFEED-012 through PFEED-014
- **Files**: `dashboard/e2e/product-feedback.spec.ts` (NEW), optional component test for Sheet
- **Action**: Create
- **Details**: PFEED-012: Sheet Esc closes, focus returns, page unchanged. PFEED-013: frequency cap. PFEED-014: mobile viewport 5 options visible. Reuse e2e fixtures login pattern from `decision-panel.spec.ts`.
- **Depends on**: TASK-012, TASK-013
- **Verification**: `cd dashboard && npm run test:e2e -- product-feedback.spec.ts` passes.

### TASK-017: Customer data requirements and IT questionnaire guide
- **Files**: `docs/guides/pilot-data-requirements.md` (NEW)
- **Action**: Create
- **Details**: Single customer-facing doc covering both ingestion branches:
  - **They upload**: canonical fields for upload wizard (`learner_reference`, `source_system`, `timestamp`, `schema_version`, score fields 0–1), CSV expectations, no PII rule, link to `/signals/upload`.
  - **We upload for them**: LMS export ask list, de-identification responsibility, raw sample for `POST /v1/admin/ingestion/preflight`, field-mapping path (`onboarding-field-mappings.md`).
  - **IT discovery questions**: LMS list, export capability, student ID scheme, FERPA owner, who de-identifies, preferred cadence.
  - **TEKS hedge paragraph**: standards = skill label mapping layer, no engine change; timeline TBD on contract close (do not pre-build).
- **Depends on**: none (can parallel with Track C)
- **Verification**: Solutions can send doc to Southwest IT without editing; preflight gate steps match `pilot-readiness-gates.md` § Integration.

### TASK-018: End-to-end ingestion dry-run on hosted pilot environment
- **Files**: none (verification ops)
- **Action**: Verify
- **Details**: On hosted pilot: upload sample CSV via wizard OR POST signals via curl → preflight clean → decisions in Attention → Approve/Reject persists → Send feedback returns 201 → admin GET lists row. Use seed persona if customer sample unavailable (`npm run seed:springs-demo` adapted to pilot org).
- **Depends on**: TASK-004, TASK-005, TASK-012, TASK-017
- **Verification**: `pilot-launch-checklist.md` sign-off items pass; record evidence in vault onboarding ticket.

### TASK-019: Update dashboard_pilot_roadmap and foundation roadmap priorities
- **Files**: `.cursor/plans/dashboard_pilot_roadmap_0fa0e18a.plan.md`, `docs/foundation/roadmap.md`, `docs/specs/README.md`
- **Action**: Modify
- **Details**: Promote customer-feedback-loop from Track 7 Deferred to P0 shipped/pending accurately. Mark Track 6 SBIR as deferred for charter sales path. Update foundation roadmap Active Execution Plans (ai-educator-explanations impl status, feedback loop next). Note TEKS as Phase 2+ hedge.
- **Depends on**: TASK-012, TASK-018
- **Verification**: Roadmap "Current state" matches branch; no contradiction between "feedback at any time" and implementation status.

### TASK-020: GTM demo video capture checklist against live hosted dashboard
- **Files**: `docs/guides/pilot-demo-video-checklist.md` (NEW, lightweight)
- **Action**: Create (GTM/CS)
- **Details**: Script outline for: (1) 5-min product overview — login, Overview KPIs, Attention triage, learner gaps, Approve/Reject, Send feedback; (2) ~15-min admin/backend — upload wizard, preflight, policies, admin feedback GET. Record against TASK-004 URL. Not a code deliverable; unblocks board/principal review per meeting action items.
- **Depends on**: TASK-004, TASK-012
- **Verification**: MP4/links stored in vault; shareable with Southwest teachers/principal.

---

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `src/feedback/product-handler-core.ts` | TASK-008 | Validation + csat_summary |
| `src/feedback/product-handler.ts` | TASK-009 | Fastify handlers |
| `src/auth/product-feedback-session-preHandler.ts` | TASK-009 | pf_session gate |
| `dashboard/components/feedback/send-feedback-sheet.tsx` | TASK-012 | Always-on affordance |
| `dashboard/components/feedback/csat-prompt.tsx` | TASK-013 | Flag-gated CSAT |
| `tests/integration/product-feedback.test.ts` | TASK-015 | PFEED contract tests |
| `dashboard/e2e/product-feedback.spec.ts` | TASK-016 | PFEED UI e2e |
| `docs/guides/pilot-data-requirements.md` | TASK-017 | IT questionnaire + data spec |
| `docs/guides/pilot-feedback-log-schema.md` | TASK-014 | Tracked log schema |
| `docs/guides/pilot-demo-video-checklist.md` | TASK-020 | GTM recording script |
| `internal-docs/reports/pilot-feedback-log.md` | TASK-014 | Local closed-loop sink |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `src/contracts/asyncapi.yaml` | TASK-001 | Add educator_explanation to Decision.trace |
| `src/shared/types.ts` | TASK-006 | ProductFeedbackRecord |
| `src/shared/error-codes.ts` | TASK-006 | Product feedback error codes |
| `src/feedback/repository.ts` | TASK-006 | insert/list product feedback |
| `src/feedback/sqlite-repository.ts` | TASK-007 | product_feedback table |
| `src/feedback/dynamodb-repository.ts` | TASK-007 | product# SK rows |
| `src/feedback/routes.ts` | TASK-009 | Register /feedback routes |
| `src/auth/session-cookie.ts` | TASK-009 | pf_session constants |
| `dashboard/lib/session-cookie-edge.ts` | TASK-010, TASK-011 | PF_SESSION + proxy path helper |
| `dashboard/app/(auth)/login/route.ts` | TASK-010 | Mint pf_session |
| `dashboard/app/(auth)/logout/route.ts` | TASK-010 | Clear pf_session |
| `dashboard/app/api/control/[...path]/route.ts` | TASK-011 | pf_session injection |
| `dashboard/components/layout/dashboard-shell.tsx` | TASK-012 | Send feedback trigger |

---

## Requirements Traceability

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| POST /v1/feedback persists kind=general; feedback_type + message required | spec § Requirements FR-1 | TASK-008, TASK-009, TASK-015 |
| POST /v1/feedback/csat persists csat 1-5; rejects feedback_type/category | spec § Requirements FR-2 | TASK-008, TASK-009, TASK-015 |
| GET /v1/admin/feedback filtered rows + csat_summary | spec § Requirements FR-3 | TASK-008, TASK-009, TASK-015 |
| Strict org-scoped product feedback | spec § Requirements FR-4 | TASK-007, TASK-015 (PFEED-010) |
| Write endpoints require pf_session; key-only returns 401 session_required | spec § Requirements FR-5 | TASK-009, TASK-010, TASK-015 (PFEED-003) |
| Dashboard always-on Send feedback affordance | spec § Requirements FR-6 | TASK-012, TASK-016 (PFEED-012) |
| CSAT prompt frequency cap when flag ON | spec § Requirements FR-7 | TASK-013, TASK-016 (PFEED-013, PFEED-014) |
| pilot-feedback-log.md exists with schema | spec § Requirements FR-8 | TASK-014 |
| AC: gated customer on /decisions submits idea; admin GET returns row | spec § Acceptance Criteria | TASK-012, TASK-015 (PFEED-001) |
| AC: csat_score 5 persists mean; csat_score 6 returns 400 | spec § Acceptance Criteria | TASK-015 (PFEED-002, PFEED-007) |
| AC: CSAT with feedback_type returns 400 invalid_request_body | spec § Acceptance Criteria | TASK-015 (PFEED-008) |
| AC: API-key-only POST /v1/feedback returns 401 | spec § Acceptance Criteria | TASK-015 (PFEED-003) |
| AC: cross-org admin GET isolation | spec § Acceptance Criteria | TASK-015 (PFEED-010) |
| AC: CSAT not shown again within CSAT_MIN_INTERVAL_DAYS | spec § Acceptance Criteria | TASK-013, TASK-016 (PFEED-013) |
| AC: Send feedback Sheet Esc closes; focus returns | spec § Acceptance Criteria | TASK-016 (PFEED-012) |
| AWS-hosted pilot environment accessible | trajectory Phase A | TASK-003, TASK-004 |
| AI explanations enabled for summary validation | trajectory Phase A | TASK-005 |
| Customer data requirements doc for IT | trajectory Phase B | TASK-017 |
| E2E upload to dashboard path verified | trajectory Phase B | TASK-018 |
| educator_explanation contract parity | prior /review finding | TASK-001 |
| NPS collection | spec § Out of Scope | DEFERRED — rejected by spec |
| Periodic relational survey | spec § Phasing Phase 1 | DEFERRED — live pilot 3-6 mo |
| In-app feedback analytics dashboard | spec § Out of Scope | DEFERRED |
| TEKS/STAAR standards mapping implementation | trajectory Q4 hedge | DEFERRED until deal closes — TASK-017 documents approach only |
| SBIR Track 6 LIU/outcomes/metrics/export | user direction | DEFERRED — not charter sales path |

---

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| PFEED-001 | integration | Happy path general submit with session + key | TASK-015 |
| PFEED-002 | integration | CSAT submit; csat_summary.mean reflects | TASK-015 |
| PFEED-003 | contract | No pf_session → 401 session_required | TASK-015 |
| PFEED-004 | contract | general without feedback_type → 400 feedback_type_required | TASK-015 |
| PFEED-005 | contract | general empty message → 400 message_required | TASK-015 |
| PFEED-006 | contract | message > 4000 → 400 message_too_long | TASK-015 |
| PFEED-007 | contract | CSAT csat_score=6 → 400 invalid_csat_score | TASK-015 |
| PFEED-008 | contract | CSAT with feedback_type → 400 invalid_request_body | TASK-015 |
| PFEED-009 | contract | general with csat_score → 400 csat_score_forbidden | TASK-015 |
| PFEED-010 | integration | Cross-org isolation admin GET | TASK-015 |
| PFEED-011 | unit | Append-only: no update/delete route | TASK-015 |
| PFEED-012 | component/e2e | Sheet Esc/focus/page state | TASK-016 |
| PFEED-013 | component/e2e | CSAT frequency cap | TASK-016 |
| PFEED-014 | e2e | CSAT mobile 5 options visible | TASK-016 |
| EXPL-contract | contract | validate:contracts passes with educator_explanation | TASK-001 |
| panel-helpers | unit | educatorBodyCopy preference order | TASK-002 |

---

## Deviations from Spec

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| spec § File Structure `dashboard/app/api/control/feedback/route.ts` | Dedicated feedback proxy route | Extend existing `dashboard/app/api/control/[...path]/route.ts` with `isProductFeedbackProxyPath` | Implementation detail — spec silent on catch-all vs dedicated route; matches existing `fb_session` pattern in `[...path]/route.ts` |
| spec § pilot-feedback-log path | `internal-docs/reports/pilot-feedback-log.md` only | Also add tracked `docs/guides/pilot-feedback-log-schema.md` | Implementation detail — spec silent; `.gitignore` excludes `internal-docs/` so tracked template aids team |
| spec § Concrete Values Checklist pf_session Path | `/v1/feedback` on cookie | Dashboard login may set cookie with path `/` for BFF hold (same as current `fb_session` login behavior) while API `@fastify/cookie` uses Path `/v1/feedback`; proxy injects header | Implementation detail — spec silent on dashboard cookie path vs API path; injection pattern matches shipped educator feedback |

None of the above change wire formats, error codes, or route auth models.

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Customer never provides sample data | High — empty dashboard at onboarding | TASK-017 questionnaire; 8P3P ingests de-identified export; seed demo as training fallback |
| Board delays weeks | Medium | Phase A deploy independent of board; demo video on hosted env (TASK-020) |
| TEKS becomes contract gate | Medium | TASK-017 hedge doc; skill-to-standard lookup is config layer, estimate days not weeks |
| Bedrock model not enabled in region | Medium | TASK-005 verify; null fallback does not block decisions |
| internal-docs gitignored | Low | TASK-014 tracked schema template + local log file |

---

## Verification Checklist

- [ ] All tasks completed
- [ ] `npm run validate:contracts` passes
- [ ] `npm test` passes (Node 22)
- [ ] `cd dashboard && npm run test:e2e` passes
- [ ] `pilot-readiness-gates.md` and `pilot-launch-checklist.md` signed off on hosted URL
- [ ] Matches `customer-feedback-loop.md` P0 scope

---

## Implementation Order

```
PREREQ-001 → TASK-001 → TASK-002
                ↓
         TASK-003 → TASK-004 → TASK-005
                ↓                    ↓
    TASK-006 → TASK-007 → TASK-008 → TASK-009
                ↓
    TASK-010 → TASK-011 → TASK-012 → TASK-013
                ↓
    TASK-015 → TASK-016
                ↓
         TASK-018 → TASK-019

Parallel (any time after PREREQ):
  TASK-014, TASK-017, TASK-020 (after TASK-004 + TASK-012 for video)
```

**Recommended first implementation command**: `/implement-spec .cursor/plans/pilot-charter-onboarding.plan.md`

**Suggested PR split** (optional, for reviewability):
1. PR1: TASK-001, TASK-002 (hygiene)
2. PR2: TASK-006–TASK-016 (customer feedback loop)
3. PR3: TASK-017, TASK-014, TASK-019, TASK-020 (docs + roadmap)
4. Ops: TASK-003–TASK-005, TASK-018 (deploy + verify)
