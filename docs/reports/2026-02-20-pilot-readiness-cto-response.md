# 8P3P Control Layer — Pilot Readiness: CTO Response

**Date:** 2026-02-20 (updated with v1.1 requirements)  
**Context:** CEO requested auditable, trustworthy pilot demo readiness assessment with exact artifacts, timeline, and reliability requirements. Follow-up: define v1.1 requirements for 2-3 concurrent pilots.  
**Baseline:** POC v2 QA complete (2026-02-18), 343 tests passing, Inspection API + Panels spec'd (2026-02-19)

---

## CEO Framing (Accepted)

> The pilot is the controlled productionization phase. The demo proves the decision loop. The pilot proves it in your environment with your data and integrates into your stack. If we hit success criteria, we convert to the full contract and harden to your enterprise requirements.

This framing is correct and governs every scoping decision below.

---

## 1. Definition of "Pilot-Ready" — Exact Artifacts

### Deliverable Artifacts (Exit Checklist)

| # | Artifact | Purpose | Status Today |
|---|----------|---------|--------------|
| 1 | **Enriched Decision Trace** — frozen state snapshot, matched rule condition tree, threshold comparisons, rationale string embedded in every decision | Makes every decision a self-contained audit record. Enterprise compliance can verify any decision without reconstructing state. | Spec'd (`inspection-api.md` §3), not built |
| 2 | **Ingestion Log** — every signal attempt (accepted/rejected/duplicate) persisted and queryable | Integration teams see what's arriving and what's failing, after the fact | Spec'd (`inspection-api.md` §1), not built |
| 3 | **State Query API** — `GET /v1/state` with version history | Read-only proof that persistent learning memory exists outside their tools | Spec'd (`inspection-api.md` §2), not built |
| 4 | **4 Inspection Panels** at `/inspect` — Signal Intake, State Viewer, Decision Stream, Decision Trace | The trust surface. Walk-through proves the full loop in ~30 seconds: send signal → see state update → see decision appear → click to see full audit receipt | Spec'd (`inspection-panels.md`), not built |
| 5 | **Decision Repository Interface** — persistence abstracted behind `DecisionRepository` | Answers the first enterprise CTO question: "Does this scale beyond SQLite?" Answer: yes, DynamoDB adapter is a swap. | Plan written (`.cursor/plans/repository-extraction.plan.md`), not built |
| 6 | **343+ passing tests** with enriched trace coverage | Regression safety net for pilot iterations | 343 passing today, will grow with inspection API tests (INSP-001 through INSP-017) |
| 7 | **Seeded demo dataset** — pre-loaded learners covering all 7 decision types | Repeatable demo script: escalate, pause, reroute, intervene, reinforce, advance, recommend — all visible in one walkthrough | QA vectors exist (vec-8a through vec-8g), need packaging as a seed script |

### What's Already Proven (Not Re-Work)

- Full pipeline: signal → validate → store → state accumulate → policy evaluate → decision with trace. All 7 decision types verified with JSON evidence (QA report, Feb 18).
- Deterministic decisions, org isolation, signal idempotency, contract drift detection — all covered by existing 343 tests.

### Minimum Scope — What We Will NOT Build for the Pilot

- No authentication/authorization (org_id scoping is sufficient for single-tenant pilot; auth is a full-contract hardening concern)
- No WebSocket real-time updates (5-30s polling is fine for demos and debugging)
- No mobile responsive panels (desktop-only; these are engineering inspection tools)
- No event output / EventBridge / webhooks (pilot proves the decision, not the routing)
- No tenant-scoped field mappings (pilot client sends signals in our schema; mapping is a full-contract integration concern)
- No TTL enforcement or downstream target routing (reserved fields exist, enforcement is Phase 2)
- No policy hot-reload (server restart to change policy is acceptable for single-tenant pilot)
- No data export to CSV/PDF (JSON export from Panel 4 is sufficient)
- No custom themes or branding

---

## 2. Timeline — Deliverables by Week

**Proposed: 3 weeks build + 1 week buffer = 4 weeks total.**

The original 4-6 week estimate (readiness assessment, Feb 19) included 1 full week for repository extraction and generous panel estimates. Compressed based on how well-specified the plans already are.

### Week 1: Backend Foundation (Days 1-5)

| Day | Deliverable | Evidence |
|-----|------------|----------|
| 1-2 | **Repository extraction** — `DecisionRepository` interface, `SqliteDecisionRepository` adapter, injection wiring, regression green | All 343 tests pass, `setDecisionRepository()` exported for Phase 2 |
| 3 | **Ingestion outcome log** — `ingestion_log` table, `appendIngestionOutcome()` on every request, `GET /v1/ingestion` endpoint | INSP-001 through INSP-005 passing |
| 4 | **State query API** — `GET /v1/state`, `GET /v1/state?version=N`, `GET /v1/state/list` | INSP-006 through INSP-009 passing |
| 5 | **Decision stream metadata** — `output_metadata.priority` on decisions | INSP-013 passing |

**Week 1 exit criteria:** All new read-only API endpoints operational. Existing 343 tests still green. New INSP tests passing.

### Week 2: Enriched Trace + Panels 1-2 (Days 6-10)

| Day | Deliverable | Evidence |
|-----|------------|----------|
| 6-7 | **Enriched decision trace** — `state_snapshot`, `matched_rule` with evaluated fields, `rationale` string on every new decision | INSP-010 through INSP-012, INSP-014, INSP-017 passing |
| 8 | **Panel 1: Signal Intake** — ingestion outcomes with color-coded pass/fail/duplicate, filtering | Live at `/inspect`, rendering real data |
| 9-10 | **Panel 2: State Viewer** — learner index + detail pane with version navigation | Live at `/inspect`, rendering real data |

**Week 2 exit criteria:** Full audit receipt data flowing. Panels 1-2 rendering live API data. The enriched trace is the hardest single piece — it modifies the core evaluation pipeline to capture snapshots and field-level comparisons.

### Week 3: Panels 3-4 + Demo Polish (Days 11-15)

| Day | Deliverable | Evidence |
|-----|------------|----------|
| 11 | **Panel 3: Decision Stream** — reverse-chronological feed with type, rule, priority, color coding | Live at `/inspect` |
| 12-13 | **Panel 4: Decision Trace/Receipt** — rationale block, threshold table, frozen state snapshot, rule condition JSON | Live at `/inspect`, Panel 3 → Panel 4 navigation working |
| 14 | **Integration smoke tests** — panels load, API calls succeed, error states handled gracefully | Smoke test suite passing |
| 15 | **Demo seed script + rehearsal** — deterministic dataset, scripted walkthrough covering all 7 decision types | End-to-end demo completes in <60 seconds |

**Week 3 exit criteria:** All 4 panels live. Full demo walkthrough rehearsed. All INSP tests + existing tests green.

### Week 4: Buffer + Hardening

Absorbs scope creep, edge cases discovered during panel testing, and integration surprises. If clean, use for:
- Org isolation verification on all new endpoints (INSP-015, INSP-016)
- Error state polish (API down, missing data, historical decisions without enriched trace)
- OpenAPI spec updates for new endpoints
- Documentation for pilot client integration guide

### What Specifically Forces 3-4 Weeks (Not 1-2)

Three things cannot be compressed without creating audit integrity risk:

1. **Enriched decision trace (2 days minimum, realistically 3).** This touches the core `evaluateState()` and `evaluatePolicy()` code paths — the same code that 343 tests validate. Modifying it requires capturing state snapshots mid-evaluation, collecting field-level threshold comparisons during condition tree walking, and generating deterministic rationale strings. Rushing this risks breaking the property the entire system is built on: deterministic, traceable decisions.

2. **Four panels consuming five API endpoints with edge case handling (5-6 days).** The panels are thin (vanilla JS, read-only), but they need to handle: historical decisions without enriched trace, API errors, pagination, filtering, and Panel 3 → Panel 4 navigation. Each panel has its own data shape, display logic, and error states. Claiming "2 days for 4 panels" would mean shipping panels that break on edge cases during a live pilot demo.

3. **Repository extraction before panels (2 days).** This is the cheapest insurance in the entire timeline. Without it, the first enterprise technical question — "What happens when we have 500K learners?" — gets answered with "It's SQLite." With it, the answer is "The persistence interface is abstracted; DynamoDB adapter is a swap." Two days of work buys permanent credibility.

---

## 3. Non-Negotiable Reliability Requirements for a Paid Pilot

Five requirements. Each one is a trust gate — if any fails during a pilot demo, the enterprise conversation is over.

| # | Requirement | Why Non-Negotiable | Status |
|---|-------------|-------------------|--------|
| 1 | **Deterministic decisions** — same state + same policy = same decision, every time | If the same learner gets different decisions on the same data, the system is not trustworthy. Enterprise compliance requires reproducibility. | **Proven.** 343 tests enforce this. Rationale generation will be deterministic by spec. |
| 2 | **Decision traceability** — every decision links to exact state version, policy version, matched rule, AND now: frozen state snapshot + threshold comparisons + rationale | The pilot client's compliance team will ask "why did this learner get this decision?" Panel 4 must answer that question completely, from the decision record alone, without reconstructing state. | **Partially proven.** Trace references exist today (state_id, policy_version, matched_rule_id). Enriched trace (snapshot, thresholds, rationale) is the primary build target. |
| 3 | **Zero data loss on accepted signals** — if we return `status: accepted`, the signal is in the log, state is updated, and a decision is produced | If a signal is "accepted" but no decision appears, the pilot client loses trust in the pipeline. | **Proven.** Integration tests verify full pipeline. Ingestion outcome logging adds a secondary evidence trail. |
| 4 | **Org isolation** — pilot client's data is never visible to another org | A pilot client that sees another org's data terminates the relationship. This is table stakes. | **Proven.** Enforced at query level, verified by existing contract tests. New endpoints will add INSP-015/016. |
| 5 | **Graceful degradation** — panels never show blank screens or unhandled errors | A panel crash during a live demo with a prospect kills the deal. Panels must show clear error messages, "N/A" for missing enriched data on historical decisions, and loading states. | **Not yet applicable.** Will be enforced during panel build (Week 2-3). |

### What Is Explicitly NOT Required for a Paid Pilot

- 99.9% uptime SLA (this is a controlled environment on a single server; if it goes down, we restart it)
- Horizontal scaling (single-tenant, single-server is fine for pilot volumes)
- Authentication (org_id scoping + controlled environment is sufficient)
- Automated backups (pilot data is demonstrative, not production-critical)

---

## Bottom Line (v1)

Your framing is right — tight scope, fast execution. Pilot-ready in **3 weeks of build** with a **1-week buffer** (4 weeks total from start date). The original 4-6 week range was conservative; compressing repository extraction from 1 week to 2 days and running panels in parallel with late backend work gets us there.

The one thing that will not be compressed: the enriched decision trace. That's the artifact that makes an enterprise compliance officer say "this is auditable" — which is exactly what converts a pilot to a full contract. Rushing it to save 2 days isn't worth the risk.

If enterprise conversations need to start before panels are ready (Week 1-2), the existing API + Swagger UI can demonstrate the decision loop via curl. The panels make it visual and self-service.

---

## 4. Pilot Readiness v1.1 — 2-3 Concurrent Pilots

### CEO Direction (Feb 20)

> Scope engineering to make the pilot successful for one customer first. But business-wise the platform must be designed so we can run multiple pilots in parallel as soon as v1 is stable. Treat "1-customer pilot-ready" as Pilot Readiness v1, and immediately define v1.1 requirements for 2-3 concurrent pilots: tenant isolation, per-tenant policy/config, separate logs/receipts, and basic rate limits.

Accepted. v1 is the engineering gate. v1.1 is the platform gate.

### What v1 Already Provides Toward v1.1

The architecture was designed multi-tenant from day one. These properties are **inherent, not retrofitted:**

| Capability | How It Works Today | v1.1 Ready? |
|-----------|-------------------|-------------|
| **Tenant isolation** | Every query (signals, state, decisions, ingestion log) is scoped by `org_id`. Cross-org access is blocked at the data layer. Verified by contract tests. | **Yes** — inherent |
| **Separate logs** | Signal log, ingestion log, and decision records all carry `org_id`. Pilot A's signals are invisible to Pilot B. | **Yes** — inherent |
| **Separate receipts** | Decision traces include `org_id`, `state_id`, and full provenance. Each pilot's audit trail is self-contained. | **Yes** — inherent |
| **Inspection panels per-org** | All 4 panels require `org_id` input and filter exclusively by it. | **Yes** — by design (spec'd in `inspection-panels.md`) |
| **Repository interfaces** | All 4 store extraction plans are written and ready to execute. DynamoDB adapters can slot in mechanically. | **Plans ready** — not yet built |

### What v1.1 Requires Beyond v1

Four capabilities are missing. Each has a spec, plan, or gap status:

#### 4.1 Authentication + Rate Limits

**Status: Spec'd.** `docs/specs/tenant-provisioning.md` defines:
- API key issuance via CLI (`scripts/provision-tenant.ts`)
- Key → org_id mapping in DynamoDB (callers cannot self-declare their org)
- API Gateway usage plans with per-tier rate limits:

| Plan | Burst | Rate (req/sec) | Monthly Quota |
|------|-------|----------------|---------------|
| `pilot` | 20 | 10 | 100,000 |
| `enterprise` | 100 | 50 | 1,000,000 |
| `internal` | 200 | 100 | Unlimited |

- Key rotation and revocation
- Org enforcement in Lambda (API key is source of truth, request body `org_id` is overridden)

**Dependency:** Requires AWS deployment (`docs/specs/aws-deployment.md`), which requires all 4 repository extractions.

#### 4.2 Per-Tenant Policy / Config

**Status: Gap — not spec'd anywhere.** This is the one genuine missing capability.

Today, all orgs evaluate against the same `policy.json` loaded at startup. For 2-3 concurrent pilots with different LMS platforms, they will likely need different decision thresholds (what triggers "escalate" for Absorb may differ from Coursera) and potentially different active rule sets.

**Proposed approach (scoped, low-risk):**

- Per-tenant policy files: `policies/{org_id}/policy.json`
- Default fallback: if no tenant-specific policy exists, use `policies/default/policy.json`
- `loadPolicy()` becomes `loadPolicy(orgId: string)` — one parameter change
- Policy loaded on-demand at evaluation time (cached per org, invalidated on file change or restart)
- No new infrastructure — file-based for v1.1, DynamoDB-based for production

**Estimated effort:** ~2 days. Modify `loadPolicy()` signature, add org-scoped file lookup with fallback, update decision engine to pass `org_id` through evaluation, add tests for per-tenant and default-fallback paths.

**What this does NOT include (deferred to full contract):**
- Per-tenant field mappings (tenants conform to our signal schema in v1.1)
- Policy editor / admin UI
- Policy validation API
- Hot-reload without restart (acceptable to restart for policy changes in v1.1)

#### 4.3 Remaining Repository Extractions (3 of 4)

**Status: Planned.** All 3 remaining extraction plans are written and ready in `.cursor/plans/`:

| Store | Plan | Complexity |
|-------|------|-----------|
| Idempotency | `idempotency-repository-extraction.plan.md` | Low — 2 production methods (`checkAndStore`, `close`) |
| Signal Log | `signal-log-repository-extraction.plan.md` | Medium — 4 methods, rich query interface, error contracts |
| State | `state-repository-extraction.plan.md` | High — 2 tables, optimistic locking, transactional writes |

Each plan follows the same proven pattern: define interface → implement SQLite adapter → inject via module-level delegation → regression check. The Decision Store extraction (v1 Week 1) proves the pattern; the remaining three are mechanical.

**Estimated effort:** ~3-4 days total (Idempotency: 0.5 day, Signal Log: 1 day, State: 1.5-2 days).

#### 4.4 AWS Deployment

**Status: Spec'd.** `docs/specs/aws-deployment.md` defines:
- API Gateway (REST) + Lambda + DynamoDB — serverless, near-zero idle cost
- Three Lambda functions (Ingest, Query, Inspect) separated by access pattern
- DynamoDB tables for all stores with correct key schemas and GSIs
- SAM template for infrastructure-as-code
- Handler refactoring: extract core logic from Fastify wrappers into framework-agnostic functions
- Cost estimate: 3 pilot customers = $5-$40/month

**Estimated effort:** ~5-7 days (SAM template + DynamoDB adapters + Lambda handlers + deploy + contract test verification against deployed endpoint).

### v1.1 Timeline

**Total delta from v1 completion: 2-3 weeks.**

| Week | Deliverable | Evidence |
|------|------------|----------|
| v1+1 (Week 5) | **Remaining 3 repository extractions** (Idempotency, Signal Log, State) + **Per-tenant policy lookup** | All 343+ tests green, `setStateRepository()` / `setSignalLogRepository()` / `setIdempotencyRepository()` exported, `loadPolicy(orgId)` working with fallback |
| v1+2 (Week 6) | **AWS deployment** — SAM template, DynamoDB tables, DynamoDB adapters, Lambda handlers, contract tests against deployed stack | `sam deploy` succeeds, all contract tests pass against `api.8p3p.dev` |
| v1+3 (Week 7) | **Tenant provisioning** — CLI tools, API key enforcement, rate limits, org-resolver middleware. **Second pilot tenant provisioned and verified.** | `provision-tenant.ts` works end-to-end, Pilot A and Pilot B data isolated, rate limits enforced |

**Overlap opportunity:** Start repository extractions 2-4 during v1 Week 4 (buffer week) if v1 is clean. This compresses the total to **~6 weeks from start** instead of 7.

### v1.1 Exit Criteria

All of the following must be true:

- [ ] 2-3 tenants provisioned with separate API keys
- [ ] Each tenant's signals, state, decisions, and ingestion log are isolated (org_id enforcement + API key enforcement)
- [ ] Each tenant can have its own policy file (or fall back to default)
- [ ] Rate limits enforced per tenant at API Gateway level
- [ ] All 4 inspection panels work per-tenant (filter by org_id resolves from API key)
- [ ] Deployed to AWS (API Gateway + Lambda + DynamoDB)
- [ ] All contract tests pass against the deployed endpoint
- [ ] Monthly cost < $100 for 2-3 concurrent pilots
- [ ] Onboarding a new pilot tenant is a single CLI command

### v1 → v1.1 Dependency Chain

```
v1 (4 weeks)                          v1.1 (+ 2-3 weeks)
─────────────────────────────────     ──────────────────────────────
Decision Repo Extraction ──────────► Idempotency Repo Extraction
Inspection API ──────────────────►   Signal Log Repo Extraction
Enriched Decision Trace ─────────►   State Repo Extraction
Inspection Panels ───────────────►   Per-Tenant Policy Lookup
Demo Seed + Rehearsal ───────────►   AWS Deployment (SAM + DynamoDB)
                                     Tenant Provisioning (CLI + keys)
                                     Contract Tests vs Deployed Stack
```

### What v1.1 Still Scopes Out (Full Contract / Production)

- JWT/OAuth authentication (API keys are sufficient for M2M pilot integrations)
- Self-serve tenant registration portal
- Per-tenant field mappings (tenants conform to our signal schema)
- Event output / EventBridge / webhooks
- Multi-region deployment
- WAF / advanced security
- CI/CD pipeline (manual deploy via `sam deploy` is acceptable for 2-3 pilots)
- Policy editor / admin dashboard
- Billing / invoicing integration

---

## Overall Timeline Summary

| Milestone | Target | Key Deliverable |
|-----------|--------|-----------------|
| **v1: 1-Customer Pilot-Ready** | Week 4 | Enriched trace + 4 inspection panels + demo dataset |
| **v1.1: 2-3 Concurrent Pilots** | Week 6-7 | AWS deployed + tenant provisioning + per-tenant policy + rate limits |
| **Full Contract Conversion** | Post-pilot | Enterprise hardening based on pilot success criteria |

---

## Reference Documents

| Document | Path | Relevance |
|----------|------|-----------|
| Pilot Readiness Assessment | `docs/reports/2026-02-19-pilot-readiness-assessment.md` | Gap analysis and phase sequence |
| Inspection API Spec | `docs/specs/inspection-api.md` | Backend endpoints, enriched trace, ingestion log |
| Inspection Panels Spec | `docs/specs/inspection-panels.md` | Frontend panels, layout, interactions |
| Decision Repo Extraction Plan | `.cursor/plans/repository-extraction.plan.md` | Decision persistence abstraction (v1) |
| Idempotency Repo Extraction Plan | `.cursor/plans/idempotency-repository-extraction.plan.md` | Idempotency persistence abstraction (v1.1) |
| Signal Log Repo Extraction Plan | `.cursor/plans/signal-log-repository-extraction.plan.md` | Signal log persistence abstraction (v1.1) |
| State Repo Extraction Plan | `.cursor/plans/state-repository-extraction.plan.md` | State persistence abstraction (v1.1) |
| Tenant Provisioning Spec | `docs/specs/tenant-provisioning.md` | API keys, rate limits, org enforcement (v1.1) |
| AWS Deployment Spec | `docs/specs/aws-deployment.md` | Lambda + DynamoDB + API Gateway infrastructure (v1.1) |
| POC v2 QA Execution | `docs/reports/2026-02-18-poc-v2-qa-test-execution.md` | All 7 decision types verified with JSON evidence |
| POC v1 Summary | `docs/reports/poc-v1-summary-report.md` | Architecture, test coverage, system properties |

---

*Generated: 2026-02-20 (v1.1 addendum added) | Baseline: Pilot Readiness Assessment (2026-02-19), POC v2 QA (2026-02-18)*
