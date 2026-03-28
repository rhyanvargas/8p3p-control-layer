# Pilot Integration Guide (v1)

**Audience:** Pilot customer integration engineers  
**Goal:** Get from “we have LMS events” → “we send signals” → “we consume decisions” in hours, not days.  
**API contract:** `docs/api/openapi.yaml` (served at `/docs`)

---

## 1) What you implement (two calls)

### A. Send signals (write path)

- **Endpoint:** `POST /v1/signals`
- **Purpose:** Send learner events to the control layer in a standard envelope. The control layer persists the signal, updates state, and generates a decision (advisory).

### B. Read decisions (read path)

- **Endpoint:** `GET /v1/decisions`
- **Purpose:** Poll for decisions per learner and time range. You decide what to do with them in your system (we emit decisions; we do not enforce workflows).
- **Common use-case:** If you need decisions for **all learners in an org** (export/analytics), use the supported fan-out workflow: list learners → fetch decisions per learner. See [`get-all-learner-decisions-from-org.md`](get-all-learner-decisions-from-org.md).

---

## 2) Access + authentication (v1 pilot)

### API key (required in pilot)

8P3P will provide an API key for the pilot environment. Include it on every `/v1/*` request:

- **Header:** `x-api-key: <your_key>`

If the key is missing or invalid, you will receive **401** with `api_key_required` or `api_key_invalid`.

### Org scoping

- **When 8P3P sets `API_KEY_ORG_ID`** (typical single-tenant pilot): the server overrides every request’s `org_id` with that value. You cannot access another org; sending a different `org_id` has no effect. You may omit or leave `org_id` as a placeholder — the server fills it in.
- **When `API_KEY_ORG_ID` is not set (local dev / controlled testing only):** the server uses the `org_id` you send in the body (POST) or query (GET). This mode does **not** prevent cross-org access if more than one org’s data exists in the same environment, so it is not used for pilot deployments.

---

## 3) Quick start (curl)

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

## 4) Signal envelope requirements (what must be true)

Your request body must match the `SignalEnvelope` schema (see OpenAPI `/docs` and `docs/specs/signal-ingestion.md`).

Minimum required fields:

- `org_id` (string, 1–128)
- `signal_id` (string, 1–256; safe charset)
- `source_system` (string)
- `learner_reference` (string, 1–256)
- `timestamp` (RFC3339 with timezone)
- `schema_version` (`v1`, `v2`, …)
- `payload` (JSON object)

### Idempotency: how retries work (important)

`signal_id` is an idempotency key scoped by `(org_id, signal_id)`.

- If you retry the same signal (network retry, timeout), **reuse the same `signal_id`**.
- The server will return `status: duplicate` for repeats and will not double-apply.

**Recommendation:** Use your upstream event’s immutable ID as `signal_id` (or a deterministic hash of it).

---

## 5) The real integration work: mapping your data → canonical fields

The default decision policy evaluates a small set of canonical state fields (see `docs/specs/decision-engine.md` §4.7). In v1 pilot, **you provide these fields directly** in `payload` (no server-side field mapping yet).

### Canonical fields

All score-like fields are on a **0.0–1.0 scale**.

| Field | Type | Range | What it means | If you don’t have it |
|------|------|-------|---------------|-----------------------|
| `stabilityScore` | number | 0.0–1.0 | Stability in current path | Send 0.5 as neutral start, or omit (policy may fall through to defaults) |
| `masteryScore` | number | 0.0–1.0 | Mastery/competency | Normalize from % or rubric |
| `timeSinceReinforcement` | number | >= 0 | Seconds since last reinforcement/positive feedback | If unknown, omit or compute from your event stream |
| `confidenceInterval` | number | 0.0–1.0 | Confidence in your assessment | If unknown, start at 0.8 and refine later |
| `riskSignal` | number | 0.0–1.0 | Risk of regression / struggle | If unknown, omit or compute from negative signals |

### Normalization examples

- A percent score (0–100) → divide by 100 to get 0.0–1.0
- A rubric score (0–4) → divide by 4
- A binary flag → use 0.0/1.0 (only when semantically appropriate)

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

**Integration recommendation:** Implement handling for all 4, so the system never feels “surprising” in pilot.

### Traceability (why enterprises trust it)

Each decision includes a `trace` object (state_id/state_version, policy_version, matched_rule_id). This supports audit and reproducibility. (Enriched receipts are part of v1 pilot-readiness work; see `docs/specs/inspection-api.md`.)

---

## View your active policies (v1.1)

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

## 7) Troubleshooting and common errors

### 401 Unauthorized

- `api_key_required`: you didn’t send `x-api-key`
- `api_key_invalid`: the key value doesn’t match the pilot environment key

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

## 8) Integration checklist (pilot)

- [ ] Choose `learner_reference` format (stable ID from your system)
- [ ] Choose `signal_id` strategy (use upstream event ID; safe retry)
- [ ] Implement event → `SignalEnvelope` transformation
- [ ] Implement canonical field mapping + normalization (0.0–1.0)
- [ ] Send signals to `POST /v1/signals` with `x-api-key`
- [ ] Poll decisions from `GET /v1/decisions`
- [ ] Implement handling for all 4 decision types (`reinforce`, `advance`, `intervene`, `pause`)
- [ ] Use `/docs` as schema reference during implementation

---

## 9) Webhook Integration Pattern (Option A)

Use this pattern when your LMS (Canvas or equivalent) supports outbound webhooks and you want to forward events to the control layer in real time rather than batching.

### How it works

```
Canvas/LMS  →  Your webhook receiver  →  POST /v1/signals  →  Control Layer
```

1. Canvas fires a webhook to an endpoint you control when a learner completes an assignment, quiz, or module.
2. Your receiver maps the Canvas event payload to the `SignalEnvelope` schema.
3. Your receiver calls `POST /v1/signals` with the mapped payload.

You own the receiver; the control layer never calls Canvas directly.

### Mapping a Canvas assignment-completion event

Canvas `submission` webhook fields → `SignalEnvelope` fields:

| Canvas field | SignalEnvelope field | Notes |
|---|---|---|
| `body.submission.user_id` | `learner_reference` | Use `"user-{canvas_user_id}"` to namespace by source system |
| `body.submission.id` (or assignment_id + user_id hash) | `signal_id` | Must be stable and unique — safe for retries |
| `body.submission.submitted_at` | `timestamp` | RFC3339; ensure timezone is included |
| _(your Canvas domain / integration name)_ | `source_system` | Use `"canvas-lms"` |
| _(from your org config)_ | `org_id` | Hardcode to your pilot org id; the server overrides with `API_KEY_ORG_ID` |
| `"v1"` | `schema_version` | Always `"v1"` for pilot |
| _(computed from submission score / rubric)_ | `payload` | See canonical field mapping below |

### Canonical field mapping from Canvas submission

```json
{
  "stabilityScore":           "<score / possible_points, normalized 0.0–1.0>",
  "masteryScore":             "<same or rubric-derived, 0.0–1.0>",
  "timeSinceReinforcement":   "<seconds since previous submission or feedback event>",
  "confidenceInterval":       0.8,
  "riskSignal":               "<derive from late flag or low score, 0.0–1.0; omit if unknown>"
}
```

Rules:
- Include only canonical fields in `payload`. Do not include Canvas-specific fields (`submission_type`, `grader_id`, etc.); they will be rejected as forbidden keys.
- Omit optional fields rather than sending `null` — the engine treats absent fields as neutral.

### Example: POST /v1/signals from a Canvas webhook receiver

```bash
curl -sS -X POST "https://<host>/v1/signals" \
  -H "content-type: application/json" \
  -H "x-api-key: <your_key>" \
  -d '{
    "org_id": "springs-charter",
    "signal_id": "canvas-sub-98234",
    "source_system": "canvas-lms",
    "learner_reference": "user-40512",
    "timestamp": "2026-03-01T14:22:00Z",
    "schema_version": "v1",
    "payload": {
      "stabilityScore": 0.78,
      "masteryScore": 0.82,
      "timeSinceReinforcement": 86400,
      "confidenceInterval": 0.80,
      "riskSignal": 0.15
    }
  }'
```

### Idempotency note for webhooks

Canvas may deliver the same webhook more than once (retries on 5xx). Use a stable `signal_id` (e.g., `"canvas-sub-{submission_id}"`) so the control layer deduplicates automatically and returns `status: duplicate` on repeat delivery without double-applying.

---

## 10) Identity Resolution (learner_reference as canonical key)

The control layer uses `learner_reference` as the **persistent merge key** for all signals from a given org. If the same person exists in multiple systems (Canvas `user_id: 40512`, Internal LMS `user_id: STU-1234`), you must resolve to a single canonical ID before sending signals. All signals for that person — regardless of `source_system` — must carry the same `learner_reference`.

### Recommended strategy: SIS/HR primary key

| User type | Canonical ID source | Example `learner_reference` |
|-----------|--------------------|-----------------------------|
| Students | SIS student ID | `"stu-10042"` |
| Staff | HR employee ID | `"emp-00831"` |

You own this mapping. The control layer never calls your SIS or HR system directly. You map at the point of sending the signal.

### Why it works across 3 LMS systems

All three LMS systems (Canvas, Internal LMS, third LMS) have some mapping back to a shared SIS/HR record. Emerson's team controls this cross-reference. Once you adopt a canonical `learner_reference`, every signal from any system updates the same STATE record for that person — this is how the cross-system intelligence is unified.

```
Canvas submission (user 40512)     →  learner_reference: "stu-10042"  ─┐
Internal LMS activity (STU-1234)   →  learner_reference: "stu-10042"  ─┤─→ Single STATE → Single Decision
Third LMS event (LMS-9988)         →  learner_reference: "stu-10042"  ─┘
```

---

## 11) Multi-LMS Integration

All three LMS systems use the same `POST /v1/signals` endpoint. Differentiate by `source_system`:

| LMS | `source_system` value | Integration pattern |
|-----|-----------------------|---------------------|
| Canvas | `"canvas-lms"` | Webhook receiver (see §9) |
| Internal LMS | `"internal-lms"` | Direct API call from your application |
| Third LMS | `"lms-3"` (or your chosen name) | Same pattern — adapt field mapping |

The control layer is source-system agnostic. The same `SignalEnvelope` schema applies to all three.

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

### Springs example (`policies/springs/routing.json`)

```json
{
  "source_system_map": {
    "canvas-lms":    "learner",
    "internal-lms":  "learner",
    "hr-training":   "staff"
  },
  "default_policy_key": "learner"
}
```

With this config:
- Canvas and Internal LMS signals → evaluated against `springs:learner` policy (student progress thresholds: `stabilityScore`, `masteryScore`, `timeSinceReinforcement`)
- HR training signals → evaluated against `springs:staff` policy (staff compliance thresholds: `complianceScore`, `daysOverdue`, `certificationValid`)
- Any unrecognized `source_system` → falls back to `"learner"` policy

**Policy file resolution order (first found wins):**

1. `policies/{orgId}/{policyKey}.json`
2. `policies/{orgId}/default.json`
3. `policies/default.json`

---

## Reference Documents

- `docs/api/openapi.yaml` (served at `/docs`)
- `docs/specs/signal-ingestion.md`
- `docs/specs/decision-engine.md` (§4.7 canonical state fields)
- `docs/specs/api-key-middleware.md`
- `docs/specs/inspection-api.md` (enriched receipts, inspection endpoints — v1 scope)

