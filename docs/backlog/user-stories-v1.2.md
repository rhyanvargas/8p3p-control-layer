# User Stories — v1.2 Backlog

> Approved user stories for features that build on the v1.1 infrastructure. These are **not yet spec'd** — each story should produce a spec in `docs/specs/` via `/draft-spec` before implementation planning.

*Created: 2026-02-24 | Updated: 2026-03-28 | Source: architectural alignment review + pilot customer feedback*

---

> **Note — stories moved to v1.1 (spec'd):**
> US-TRAJECTORY-001 and US-HANDOFF-001 have been promoted from this backlog to v1.1 and are now spec'd:
> - `docs/specs/learner-trajectory-api.md` (from US-TRAJECTORY-001)
> - `docs/specs/learner-summary-api.md` (from US-HANDOFF-001)
>
> US-SKILL-001 remains in v1.2 because the v1.1 trajectory and summary specs intentionally scope to flat fields only (no dot-path dependency).

---

## US-SKILL-001: Skill-level signal ingestion and policy evaluation

**As a** pilot school administrator integrating with 8P3P,
**I want to** include a `skill` descriptor (e.g., "fractions", "reading-comprehension", "safety-compliance") in the signal payload alongside canonical scores,
**so that** the learner's state accumulates skill-level metrics over time and the decision engine can evaluate rules scoped to specific skills — telling me not just *that* a student needs intervention, but *which skill* needs it.

### Acceptance criteria

1. A signal payload containing `{ "skills": { "fractions": { "stabilityScore": 0.28 } } }` is accepted and deep-merged into the learner state.
2. Policy rules can reference nested fields via dot-path syntax: `{ "field": "skills.fractions.stabilityScore", "operator": "lt", "value": 0.5 }`.
3. The decision trace includes the evaluated nested field with its actual value, threshold, and operator.
4. `GET /v1/state` returns the full accumulated state including all skill-level entries.
5. Existing flat-field policies continue to work unchanged (backward compatible).

### Implementation notes

- State engine already deep-merges nested payloads — no change needed there.
- Core change: replace `state[node.field]` in `evaluateConditionCollecting` (`src/decision/policy-loader.ts` line 200) with a dot-path resolver (~10 LOC).
- Applies to any domain: education (skills), factory training (modules), LMS (courses).

### Dependencies

- None — can be implemented on v1.1 infrastructure or current v1.

### Unlocks (post-US-SKILL-001)

- `learner-trajectory-api.md` dot-path extension (nested field trajectory)
- `learner-summary-api.md` skill-level breakdown in `current_state.fields`
- `state-delta-detection.md` dot-path delta fields

---

## US-POLICY-BUILDER-001: AI-assisted policy generation

**As an** 8P3P operator or school administrator,
**I want to** describe intervention logic in plain language (e.g., "flag a student for intervention when their stability has been declining for two signals and falls below 40%"),
**so that** the system produces a valid `PolicyDefinition` JSON that I can review and upload — without requiring me to hand-write JSON.

### Acceptance criteria

1. `POST /v1/admin/policies/generate` accepts `{ "description": "<natural language policy requirement>" }` and returns a `PolicyDefinition` JSON draft plus a confidence score and any clarification prompts.
2. The generated policy passes `POST /v1/admin/policies/validate` with `{ "valid": true }` before being returned to the caller.
3. If the LLM cannot produce a valid policy after internal retry, a `policy_generation_failed` error is returned with a human-readable explanation.
4. The LLM call is made to an **external, decoupled policy generation service** — the core API delegates to this service via HTTP and does not embed LLM SDK code.
5. The endpoint requires `x-admin-api-key`.
6. The generated policy is not saved automatically — the operator must explicitly call `PUT /v1/admin/policies/:org_id/:policy_key` to commit it.

### Implementation notes

- **LLM service is decoupled:** The policy generation service is a separate HTTP microservice (or Lambda function) that the core API calls. It is not bundled with the core API. This preserves vendor-neutrality and keeps the core infrastructure layer free of ML dependencies.
- **Core API's responsibility:** validate the generated output via `validatePolicyStructure` before returning it to the caller. The LLM service is untrusted from the core API's perspective.
- **Prompt engineering:** The LLM is given the `PolicyDefinition` JSON schema and the closed set of decision types (`reinforce`, `advance`, `intervene`, `pause`) as context. It is instructed to output valid JSON only.
- The `POST /v1/admin/policies/validate` endpoint (already spec'd in `policy-management-api.md`) is the gate that ensures the generated policy is structurally correct before returning it.
- Decoupled service contract (to be spec'd): `POST /policy-generation/generate` with body `{ description, policy_schema, decision_types }` → `{ policy: PolicyDefinition, confidence: number, clarification_needed: string[] }`.

### Dependencies

- `docs/specs/policy-management-api.md` — `POST /v1/admin/policies/validate` (gate for generated policy)
- External LLM policy generation service (new — separate spec required: `policy-generation-service.md`)

---

## Sequencing

```
US-SKILL-001  (dot-path resolver — prerequisite for nested field support)
     │
     ├── learner-trajectory-api.md dot-path extension (nested fields in trajectory)
     │
     └── learner-summary-api.md skill-level breakdown

US-POLICY-BUILDER-001  (independent — requires LLM service spec first)
     │
     └── policy-generation-service.md (separate service spec)
```

---

## Mission alignment

| Story | Mission claim |
|---|---|
| US-SKILL-001 | "detecting **where** understanding is breaking down" (skill-level granularity) |
| US-POLICY-BUILDER-001 | "turn vague educator needs into deterministic policies" (product capability, not services) |

The v1.1 infrastructure (DynamoDB, CDK, policy management API, trajectory, summary) provides the foundational architecture these stories build on.
