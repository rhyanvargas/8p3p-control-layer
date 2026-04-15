# Pilot Integration Guide (v3)

**Audience:** Pilot customer IT administrators and integration engineers
**Goal:** Get from "we have an LMS" → "signals flow" → "we consume decisions" in minutes, not days.
**API contract:** `docs/api/openapi.yaml` (served at `/docs`)

---

## 1) What you implement

### Send signals (Direct API)

Send learner events to the control layer via `POST /v1/signals`. You construct a `SignalEnvelope` with your LMS data — either with pre-normalized canonical fields or with raw LMS fields (if 8P3P has configured a field mapping for your `source_system`; see §13).

- **Endpoint:** `POST /v1/signals`
- **Purpose:** Send learner events. The control layer persists the signal, applies field mappings (if configured), updates state, and generates a decision.
- See §4 for the quick start and §9 for the full integration checklist.

### Read decisions

- **Endpoint:** `GET /v1/decisions`
- **Purpose:** Poll for decisions per learner and time range. You decide what to do with them in your system (we emit decisions; we do not enforce workflows).
- **Common use-case:** If you need decisions for **all learners in an org** (export/analytics), use the supported fan-out workflow: list learners → fetch decisions per learner. See [`get-all-learner-decisions-from-org.md`](get-all-learner-decisions-from-org.md).

> **Future:** Pre-built connectors for Canvas, I-Ready, and Branching Minds are on the post-pilot roadmap. When available, connectors will accept raw LMS webhooks directly — no `SignalEnvelope` construction required on your side. For pilot, all integrations use the Direct API.

---

## 2) Access + authentication (v1 pilot)

### API key (required in pilot)

8P3P will provide an API key for the pilot environment. Include it on every `/v1/*` request:

- **Header:** `x-api-key: <your_key>`

If the key is missing or invalid, you will receive **401** with `api_key_required` or `api_key_invalid`.

### Org scoping

- **When 8P3P sets `API_KEY_ORG_ID`** (typical single-tenant pilot): the server overrides every request's `org_id` with that value. You cannot access another org; sending a different `org_id` has no effect. You may omit or leave `org_id` as a placeholder — the server fills it in.
- **When `API_KEY_ORG_ID` is not set (local dev / controlled testing only):** the server uses the `org_id` you send in the body (POST) or query (GET). This mode does **not** prevent cross-org access if more than one org's data exists in the same environment, so it is not used for pilot deployments.

---

## 3) Integration overview

For the pilot, all LMS integrations use the **Direct API** — your system sends signals to `POST /v1/signals`. The control layer handles field normalization (if configured), state management, and decision generation.

```
Your LMS event → Your integration code → POST /v1/signals → State → Policy → Decision
                                              ↑
                                    Field mapping (if configured by 8P3P)
                                    normalizes raw fields → canonical fields
```

**Two options for the signal payload:**
- **Option A:** You compute canonical fields yourself (e.g. `masteryScore: 0.68`) and send them directly. No server-side mapping needed.
- **Option B:** You send your LMS's raw field structure, and 8P3P configures a field mapping that transforms them into canonical fields server-side. See §13.

Both options use the same `POST /v1/signals` endpoint.

---

## 4) Quick start — Direct API path

For a minimal first-run (verify access → send one signal → read one decision), see [Customer Onboarding Quick Start](customer-onboarding-quickstart.md). Below is the same flow inline.

### Health check (no key required)

```bash
curl -sS http://<host>:<port>/health
```

### Send a signal

```bash
curl -sS -X POST "http://<host>:<port>/v1/signals" \
  -H "content-type: application/json" \
  -H "x-api-key: <your_key>" \
  -d '{
    "org_id": "org_pilot1",
    "signal_id": "evt-000001",
    "source_system": "your-lms",
    "learner_reference": "learner-123",
    "timestamp": "2026-03-01T10:00:00Z",
    "schema_version": "v1",
    "payload": {
      "stabilityScore": 0.65,
      "masteryScore": 0.72,
      "timeSinceReinforcement": 90000,
      "confidenceInterval": 0.80,
      "riskSignal": 0.20
    }
  }'
```

Expected response: `status: accepted` (or `duplicate` if re-sent with the same `signal_id`).

### Read decisions for a learner

```bash
curl -sS "http://<host>:<port>/v1/decisions?org_id=org_pilot1&learner_reference=learner-123&from_time=2026-03-01T00:00:00Z&to_time=2026-03-02T00:00:00Z" \
  -H "x-api-key: <your_key>"
```

---

## 5) How field mappings work (you may not need to normalize)

If 8P3P has configured a field mapping for your `source_system`, the **Transform Engine** automatically normalizes your raw payload fields into canonical fields during signal ingestion. Here's what happens:

1. You send a signal with your LMS's native payload structure (e.g., `{ submission: { score: 68 }, assignment: { points_possible: 100 } }`)
2. The **Transform Engine** applies configured transforms to derive canonical fields (e.g., `score / points_possible` → `masteryScore: 0.68`)
3. The ingestion pipeline uses the canonical fields for state update and policy evaluation

**If a mapping is configured for your `source_system`**, you do not need to normalize scores or compute canonical fields yourself. Send your native payload and the engine handles it. Ask your 8P3P operator to confirm whether a mapping is configured for your LMS.

**If no mapping is configured**, send canonical fields directly in your payload (see §4 quick start example).

### Canonical fields (reference)

All score-like fields use a **0.0–1.0 scale**. These are the fields that drive policy evaluation:

| Field | Type | Range | What it means |
|------|------|-------|---------------|
| `stabilityScore` | number | 0.0–1.0 | Stability in current path |
| `masteryScore` | number | 0.0–1.0 | Mastery/competency |
| `timeSinceReinforcement` | number | >= 0 | Seconds since last reinforcement/positive feedback |
| `confidenceInterval` | number | 0.0–1.0 | Confidence in the assessment |
| `riskSignal` | number | 0.0–1.0 | Risk of regression / struggle |

---

## 6) Consuming decisions (what you do with output)

Decisions are advisory outputs. Your system decides how to act on them.

### The two primary demo anchors

In the pilot narrative, we anchor on:

- **`reinforce`**: prevent decay / prevent future failure before it happens
- **`intervene`**: high-risk now; take action immediately

These map directly to enterprise pain (waste + risk). The other two types (`advance`, `pause`) are fully supported and may appear in the Decision Stream; we simply don't lead with them unless asked.

### All 4 types may occur

The system returns exactly four decision types:
`reinforce`, `advance`, `intervene`, `pause`.

**Integration recommendation:** Implement handling for all 4, so the system never feels "surprising" in pilot.

### Traceability (why enterprises trust it)

Each decision includes a `trace` object (state_id/state_version, policy_version, matched_rule_id). This supports audit and reproducibility. (Enriched receipts are part of v1 pilot-readiness work; see `docs/specs/inspection-api.md`.)

---

## 7) View your active policies (v1.1)

After v1.1 deployment, you can **read** the policy configuration 8P3P applies to your org (thresholds, rule order, default decision) without asking an operator for a file export. Writes remain admin-only; see `docs/specs/policy-management-api.md`.

**List policies for your org** (requires tenant `x-api-key`; returns metadata and active keys):

```bash
curl -sS "https://<host>/v1/policies" \
  -H "x-api-key: <your_key>"
```

**Fetch one policy by key** (e.g. `learner`, `default`, or org routing target from `docs/specs/decision-engine.md`):

```bash
curl -sS "https://<host>/v1/policies/learner" \
  -H "x-api-key: <your_key>"
```

Typical response body includes `policy_id`, `policy_version`, `rules[]` with `rule_id`, `condition`, `decision_type`, and `default_decision_type`. Use this to align your LMS mapping with the thresholds your integration will hit in production.

**Spec:** `docs/specs/policy-inspection-api.md`

---

## 8) Troubleshooting and common errors

### 401 Unauthorized

- `api_key_required`: you didn't send `x-api-key`
- `api_key_invalid`: the key value doesn't match the pilot environment key

### 400 Rejected signals

The response includes `rejection_reason.code` and `field_path`. Common causes:

- `missing_required_field`: required field absent
- `invalid_timestamp`: not RFC3339 or missing timezone
- `payload_not_object`: payload is not a JSON object
- `forbidden_semantic_key_detected`: payload contains UI/workflow semantics (blocked intentionally)

### Debugging using the API docs

- Swagger UI: `GET /docs`
- OpenAPI source: `docs/api/openapi.yaml`

---

## 9) Integration checklist

- [ ] Receive API key from 8P3P operator
- [ ] Choose `learner_reference` format (stable SIS/HR ID from your system)
- [ ] Choose `signal_id` strategy (use upstream event ID for safe retry)
- [ ] Confirm with 8P3P whether a field mapping is configured for your LMS (if yes, send raw fields; if no, normalize to canonical 0.0–1.0 fields yourself)
- [ ] Implement event → `SignalEnvelope` transformation
- [ ] Send signals to `POST /v1/signals` with `x-api-key`
- [ ] Poll decisions from `GET /v1/decisions`
- [ ] Implement handling for all 4 decision types (`reinforce`, `advance`, `intervene`, `pause`)
- [ ] Use `/docs` (Swagger UI) as schema reference during implementation

---

## 10) Identity Resolution (learner_reference as canonical key)

The control layer uses `learner_reference` as the **persistent merge key** for all signals from a given org. If the same person exists in multiple systems (Canvas `user_id: 40512`, Internal LMS `user_id: STU-1234`), you must resolve to a single canonical ID before sending signals. All signals for that person — regardless of `source_system` — must carry the same `learner_reference`.

**When using a field mapping:** If 8P3P has configured a field mapping for your `source_system`, the `learner_reference` can be extracted automatically from a configured field in the LMS payload (e.g., `submission.user_id`). If your LMS uses internal IDs that don't match across systems, discuss ID resolution with your 8P3P operator during setup.

### Recommended strategy: SIS/HR primary key

| User type | Canonical ID source | Example `learner_reference` |
|-----------|--------------------|-----------------------------|
| Students | SIS student ID | `"stu-10042"` |
| Staff | HR employee ID | `"emp-00831"` |

You own this mapping. The control layer never calls your SIS or HR system directly.

### Why it works across multiple LMS systems

All LMS systems have some mapping back to a shared SIS/HR record. Once you adopt a canonical `learner_reference`, every signal from any system updates the same STATE record for that person — this is how the cross-system intelligence is unified.

```
Canvas submission (user 40512)     →  learner_reference: "stu-10042"  ─┐
I-Ready diagnostic (student 1234)  →  learner_reference: "stu-10042"  ─┤─→ Single STATE → Single Decision
Branching Minds (LM-9988)         →  learner_reference: "stu-10042"  ─┘
```

---

## 11) Multi-LMS Integration

All LMS systems use the same infrastructure and the same endpoint: `POST /v1/signals`. Each LMS is identified by a `source_system` string in the signal payload.

| LMS | `source_system` value | Integration pattern |
|-----|----------------------|---------------------|
| Canvas | `canvas-lms` | Direct API with field mapping (configured by 8P3P) |
| I-Ready | `iready` | Direct API with field mapping (configured by 8P3P) |
| Branching Minds | `branching-minds` | Direct API with field mapping (configured by 8P3P) |
| Custom LMS | your choice (e.g. `custom-lms`) | Direct API — normalize fields yourself or request a mapping |

The control layer is source-system agnostic. The same pipeline processes signals from all sources.

**Which policy runs?** Policy routing is configured per org (see §12). `source_system` determines which policy evaluates the signal.

---

## 12) Policy Routing (org-scoped, config-driven)

The control layer uses a declarative routing config at `policies/{orgId}/routing.json` to map `source_system` values to policy keys (e.g. `"learner"` or `"staff"`). You do not need to specify a policy in the signal — routing is resolved automatically from `source_system`.

### How it works

```
signal.source_system  →  routing.json lookup  →  policy key  →  loadPolicyForContext(orgId, key)
                                               ↓ (miss)
                                          default_policy_key
```

### Example routing config

```json
{
  "source_system_map": {
    "canvas-lms":        "learner",
    "iready":            "learner",
    "branching-minds":   "learner",
    "hr-training":       "staff"
  },
  "default_policy_key": "learner"
}
```

With this config:
- Canvas, I-Ready, and Branching Minds signals → evaluated against the `learner` policy (student progress thresholds)
- HR training signals → evaluated against the `staff` policy (staff compliance thresholds)
- Any unrecognized `source_system` → falls back to `"learner"` policy

**Policy file resolution order (first found wins):**

1. `policies/{orgId}/{policyKey}.json`
2. `policies/{orgId}/default.json`
3. `policies/default.json`

---

## 13) Custom LMS Integration (detailed)

If your school uses a custom-built LMS (or any platform where 8P3P hasn't pre-configured a field mapping), you send signals via the **Direct API** (`POST /v1/signals`). The key question is: do you normalize your data yourself, or does 8P3P handle it?

### Option A: You send pre-normalized canonical fields (simplest)

If you can compute canonical fields in your system before sending, no server-side mapping is needed:

```bash
curl -sS -X POST "https://<host>/v1/signals" \
  -H "content-type: application/json" \
  -H "x-api-key: <your_key>" \
  -d '{
    "org_id": "<org_id>",
    "signal_id": "quiz-result-4821",
    "source_system": "acme-lms",
    "learner_reference": "stu-10042",
    "timestamp": "2026-04-14T14:00:00Z",
    "schema_version": "v1",
    "payload": {
      "masteryScore": 0.80,
      "stabilityScore": 0.65,
      "confidenceInterval": 0.75,
      "riskSignal": 0.20
    }
  }'
```

All score fields must be **0.0–1.0**. `timeSinceReinforcement` is in **seconds**. See §5 for the full canonical field reference.

### Option B: You send raw data, 8P3P transforms it (recommended for pilot)

If your system fires events with raw scores (e.g. `earned_points: 8`, `possible_points: 10`), 8P3P can configure a **field mapping** for your `source_system` that automatically derives canonical fields. You send your native payload — the transform engine does the math.

```bash
curl -sS -X POST "https://<host>/v1/signals" \
  -H "content-type: application/json" \
  -H "x-api-key: <your_key>" \
  -d '{
    "org_id": "<org_id>",
    "signal_id": "quiz-result-4821",
    "source_system": "acme-lms",
    "learner_reference": "stu-10042",
    "timestamp": "2026-04-14T14:00:00Z",
    "schema_version": "v1",
    "payload": {
      "quiz_result": {
        "earned_points": 8,
        "possible_points": 10,
        "attempt_number": 2
      }
    }
  }'
```

With a mapping configured by your 8P3P operator, the transform engine computes:
- `masteryScore` = `earned_points / possible_points` = `0.8` (clamped to 0–1)

**To set this up:** Provide your 8P3P operator with:

1. **A sample event payload** — the raw JSON your system produces for a learner event
2. **Which fields represent scores/metrics** — so the operator knows what to map to canonical fields
3. **The `source_system` identifier you'll use** — a stable string like `"acme-lms"` or `"custom-quiz-platform"` that you include in every signal

Your operator will configure the transform rules. You can verify the mapping is working by sending a test signal and checking `GET /v1/decisions`.

### What the customer provides vs. what 8P3P configures

| Responsibility | Owner |
|---------------|-------|
| Choose a stable `source_system` identifier | Customer |
| Choose a canonical `learner_reference` per student | Customer (see §10) |
| Provide a sample raw event payload | Customer |
| Configure field mapping (transforms, aliases, types) | 8P3P operator |
| Configure policy routing for the new source system | 8P3P operator |
| Send signals to `POST /v1/signals` | Customer |
| Poll decisions from `GET /v1/decisions` | Customer |

### Adding multiple source systems

If your school uses Canvas + I-Ready + a custom platform, each gets its own `source_system` identifier. Signals from all systems flow through the same pipeline and merge into a single learner state per student — as long as you use the **same `learner_reference`** across all systems (see §10).

```
Custom LMS  (source_system: "acme-lms")    → learner_reference: "stu-10042" ─┐
Canvas      (source_system: "canvas-lms")   → learner_reference: "stu-10042" ─┤─→ Unified State → Decision
I-Ready     (source_system: "iready")       → learner_reference: "stu-10042" ─┘
```

Each source system can have its own transform mapping, but they all feed the same policy and produce the same decision types.

---

## 14) Decision Panel — see decisions visually

The **Decision Panel** is a read-only proof surface at `/dashboard` that presents the control layer's output in an educator-friendly layout. It reads from the same API endpoints your integration uses — no additional setup required beyond an API key.

### Four panels

| Panel | What it shows |
|-------|---------------|
| **Who Needs Attention?** | Learners with the highest urgency (`intervene` / `pause` decisions) |
| **Why Are They Stuck?** | Specific skills where learners are declining, with stability context |
| **What To Do?** | Most recent actionable decision with Approve/Reject controls |
| **Did It Work?** | Learner progress — which skills have improved since the last decision |

### Access

- **URL:** `https://<host>/dashboard`
- **Auth:** Uses the same `x-api-key` as the API (configured at build time or prompted on first visit)
- **Auto-refresh:** Data refreshes every 30 seconds; manual refresh button available

The Decision Panel is a static SPA served from the same host as the API. It consumes `GET /v1/decisions`, `GET /v1/state`, `GET /v1/state/list`, and `GET /v1/policies` — all endpoints already documented above.

**Spec:** `docs/specs/decision-panel-ui.md`

---

## Reference Documents

- `docs/api/openapi.yaml` (served at `/docs`)
- `docs/specs/tenant-field-mappings.md` (payload normalization and transforms)
- `docs/specs/multi-source-transforms.md` (multi-field transform expressions)
- `docs/specs/signal-ingestion.md` (SignalEnvelope schema, validation)
- `docs/specs/decision-engine.md` (§4.7 canonical state fields)
- `docs/specs/api-key-middleware.md` (authentication)
- `docs/specs/policy-inspection-api.md` (view active policies)
- `docs/specs/decision-panel-ui.md` (Decision Panel — proof surface for educators)

### Post-pilot (deferred)

- `docs/specs/integration-templates.md` (Connector Layer — pre-built LMS connectors)
- `docs/specs/webhook-adapters.md` (raw LMS webhook ingestion endpoints)

---

*Guide updated: 2026-04-14 (v3.0) — restructured around Direct API as the sole pilot integration path; moved connectors and webhooks to post-pilot roadmap references. Previous: v2.2 added §13 Custom LMS integration. v2.1 added Decision Panel section. v2 restructured around Connector Layer.*
