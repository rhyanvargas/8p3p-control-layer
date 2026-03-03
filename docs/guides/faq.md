# Frequently Asked Questions (Pilot)

**Audience:** Pilot customers and integration engineers  
**Purpose:** Quick, accurate answers to common questions about signals, state, decisions, and policy.

---

## Signals & payload

### Do I need to send only the canonical fields in the payload, or can I send extra fields?

You can send **extra fields** in the payload. The control layer accepts any JSON object in `payload` except for a fixed set of **forbidden keys** (e.g. `ui`, `workflow`, `course`, `score`, PII like `email`, `firstName`). Extra fields are stored and merged into learner state. Only the fields your **policy** evaluates are used for the decision; the decision trace’s `state_snapshot` includes only those policy-evaluated (canonical) fields, so extra data does not appear in receipts. See [Pilot Integration Guide §5](pilot-integration-guide.md#5-the-real-integration-work-mapping-your-data--canonical-fields) for canonical field reference.

### What happens if I send the same signal twice (same `signal_id`)?

The second request returns **200** with `"status": "duplicate"`. The signal is **not** applied again; state and decisions are unchanged. Use a stable `signal_id` (e.g. your upstream event ID) so retries are safe. See [Pilot Integration Guide §4](pilot-integration-guide.md#4-signal-envelope-requirements-what-must-be-true).

### Why was my signal rejected with `forbidden_semantic_key_detected`?

The payload (at any nesting level) contained a key that is not allowed: UI/workflow keys (e.g. `ui`, `workflow`, `task`, `course`, `score`, `status`) or PII keys (e.g. `email`, `firstName`, `ssn`). Remove or rename that key and retry. The full list is enforced in the API; see `docs/specs/signal-ingestion.md` for reference.

---

## State & accumulation

### When a learner has many signals (e.g. 10), does the engine use cumulative state or only the latest signal to produce the next decision?

**Cumulative state.** Each decision is based on the **full merged state** after all signals applied so far for that learner. When a new signal arrives, the engine loads the current state, deep-merges the new signal’s payload into it, then evaluates the policy against that merged state. So the decision reflects the accumulated picture, not only the latest payload.

### How are multiple payloads merged? If Maya sends 10 signals with different `masteryScore` values, what value is used for the decision?

**Last-write-wins per field.** State is updated by **deep merge**: nested objects merge recursively; **primitive values (numbers, strings, booleans) overwrite** the previous value for that key. So after 10 signals, `masteryScore` in state is the value from the **last signal that sent `masteryScore`**. The control layer does **not** compute aggregates (e.g. average, running mean, sum). If you want “overall cumulative mastery” or a rolling average, **you** compute it in your system and send that value in each signal; the engine stores and evaluates whatever you send.

---

## Policy & customization

### Can we customize our own policy (thresholds, field names, rules) and still get accurate, deterministic decisions?

**Yes.** The engine is policy-agnostic. You can use org-specific policy files (e.g. `policies/<org_id>/learner.json`, `staff.json`) and optional `routing.json` to map `source_system` to policy. Policy JSON defines: **field names** (any key that will exist in state), **thresholds** (numeric or boolean values in conditions), **rule order** (first match wins), and **compound conditions** (`all` / `any`). Same state + same policy always yields the same decision. Field names in the policy need not be “canonical”; they just must match the keys you put in state via your payloads.

### What is `source_system` and how does it affect which policy runs?

`source_system` is an identifier you send in each signal (e.g. `canvas-lms`, `absorb-lms`). The server uses the org’s `routing.json` to map that value to a **policy key** (e.g. `learner` or `staff`), then loads the policy file for that key. So one org can run different policies for different systems (e.g. student LMS → learner policy, staff LMS → staff policy) without you specifying the policy in the signal. Unknown `source_system` values fall back to `default_policy_key` (e.g. `learner`).

---

## Decisions & consumption

### What are the four decision types and when do they fire?

The system returns exactly four decision types: **`reinforce`**, **`advance`**, **`intervene`**, **`pause`**. When each fires depends on your **policy** (rule order and conditions). In the pilot narrative we anchor on **reinforce** (prevent decay / early warning) and **intervene** (high risk now). Implement handling for all four so behavior is predictable. See [Pilot Integration Guide §6](pilot-integration-guide.md#6-consuming-decisions-what-you-do-with-output).

### How do I get decisions for all learners in my org?

There is no single “all learners” decisions endpoint. Use the fan-out pattern: **1)** Page through `GET /v1/state/list` with your `org_id` to get every `learner_reference`. **2)** For each learner, page through `GET /v1/decisions` with `org_id`, `learner_reference`, and a time window. See [Get all learner decisions from org](get-all-learner-decisions-from-org.md).

### Why is my decisions response empty?

Common causes: **Time window** — `from_time` and `to_time` must bracket when the signal was processed (decisions are created at processing time). **Org/learner** — use the same `org_id` and `learner_reference` as in the signals; if `API_KEY_ORG_ID` is set, the server overrides `org_id` to that value. **No signal yet** — decisions are created when a signal is accepted; ensure at least one signal was accepted for that learner in that window.

---

## Identity & multi-LMS

### How do we represent the same person across multiple systems (e.g. Canvas and Blackboard)?

Use a single **canonical** `learner_reference` for that person in every signal, regardless of `source_system`. You own the mapping (e.g. SIS student ID, HR employee ID). All signals with that `learner_reference` update the same STATE record and share one decision history. The control layer does not call your SIS or HR; you resolve identity before sending. See [Pilot Integration Guide §10](pilot-integration-guide.md#10-identity-resolution-learner_reference-as-canonical-key).

### Can we use different `source_system` values for different LMSs?

Yes. Send a stable identifier per system (e.g. `canvas-lms`, `blackboard-lms`, `absorb-lms`). The org’s `routing.json` maps each to a policy key so the right policy runs per source. Same `learner_reference` across systems still merges into one state and one decision history.

---

## Access & environment

### Why do I get 401 on `/v1/signals`?

**`api_key_required`** — the `x-api-key` header is missing. Send it on every `/v1/*` request.  
**`api_key_invalid`** — the key does not match the server’s configured `API_KEY`. Confirm the value with 8P3P and check for copy/paste or extra spaces.

### Does the server override our `org_id`?

When **`API_KEY_ORG_ID`** is set (typical single-tenant pilot), the server replaces the request’s `org_id` with that value. You cannot access another org. You can still send `org_id` in the body or query as a placeholder; the server will use the key’s org. When `API_KEY_ORG_ID` is not set (e.g. local dev), the server uses the `org_id` you send.

### Where is the API schema and how do I try the API?

Interactive docs: **`GET /docs`** on your host (Swagger UI). OpenAPI source: `docs/api/openapi.yaml`. Use `/docs` to inspect request/response schemas and try requests with your API key.

---

## Related

- [Customer Onboarding Quick Start](customer-onboarding-quickstart.md) — first 15 minutes
- [Pilot Integration Guide (v1)](pilot-integration-guide.md) — full integration flow
- [Get all learner decisions from org](get-all-learner-decisions-from-org.md) — org-wide export pattern
