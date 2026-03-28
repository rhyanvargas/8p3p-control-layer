# User Stories — v1.2 Backlog

> Approved user stories for features that build on the v1.1 infrastructure (CDK, DynamoDB, policy management API). These are **not yet spec'd** — each story should produce a spec in `docs/specs/` via `/draft-spec` before implementation planning.

*Created: 2026-02-24 | Source: architectural alignment review + pilot customer feedback*

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

---

## US-TRAJECTORY-001: Learner state trajectory API

**As an** educator reviewing a learner's progress over the semester,
**I want to** retrieve a trajectory view showing how specific state fields (e.g., `stabilityScore`, `skills.fractions.masteryScore`) have changed across state versions over a time range,
**so that** I can see whether the learner's understanding is improving, plateauing, or decaying — without manually diffing state snapshots.

### Acceptance criteria

1. `GET /v1/state/trajectory?org_id={org}&learner_reference={ref}&fields=stabilityScore,skills.fractions.masteryScore&from_version={v1}&to_version={v2}` returns an ordered array of `{ state_version, updated_at, values: { stabilityScore: 0.28, ... } }` for each version in range.
2. Missing fields in earlier versions are returned as `null` (field didn't exist yet).
3. Response includes `direction` per field: `"improving"`, `"declining"`, or `"stable"` based on simple first-to-last delta. Algorithm is pluggable — v1 uses simple delta, future versions may use linear regression or rolling average.
4. Pagination supported via `page_token` for learners with many state versions.
5. Respects tenant isolation — only returns data for the authenticated org.

### Implementation notes

- `getStateByVersion` already exists in `StateRepository`.
- Requires: (a) new `getStateVersionRange(orgId, learnerRef, fromVersion, toVersion)` method, (b) new route handler, (c) field extraction with dot-path resolver (reuse from US-SKILL-001).

### Dependencies

- US-SKILL-001 (dot-path resolver for nested field extraction).

---

## US-HANDOFF-001: Learner summary report for educator handoff

**As a** 3rd-grade teacher receiving a student from 2nd grade,
**I want to** retrieve a summary of the learner's record — their current skill-level standings, recent decision history, and trend direction for key metrics —
**so that** I understand where this student's knowledge stands, which areas need attention, and what interventions have already been recommended, without reading raw API responses.

### Acceptance criteria

1. `GET /v1/learners/:learner_reference/summary?org_id={org}` returns a structured JSON summary containing:
   - `current_state`: latest state snapshot (full, with skill-level breakdown if present)
   - `recent_decisions`: last N decisions (default 10) with `decision_type`, `matched_rule_id`, `decided_at`, and `rationale`
   - `field_trajectories`: for each canonical field present in the state, the direction (`improving` / `declining` / `stable`) and the value at first and latest state versions
   - `active_policy`: the policy currently applied to this learner (`policy_id`, `policy_version`, `description`)
   - `signals_count`: total signals received and date range
2. The summary does not include PII (inherits existing PII hardening — DEF-DEC-008-PII).
3. Accessible via tenant API key (read-only; not admin-only).
4. Response is a single JSON document suitable for rendering in a teacher dashboard or exporting as a PDF by the client.

### Implementation notes

- This is a **projection/aggregation endpoint** — reads from existing stores, introduces no new data.
- Reuses: `GET /v1/state` (current state), `GET /v1/decisions` (decision history), trajectory logic from US-TRAJECTORY-001, policy inspection API from v1.1 alignment plan.

### Dependencies

- US-TRAJECTORY-001 (field trajectory logic).
- v1.1 policy inspection API (`GET /v1/policies`).

---

## Sequencing

```
US-SKILL-001  (dot-path resolver — prerequisite)
     │
     ├── US-TRAJECTORY-001  (trajectory API — depends on dot-path for nested fields)
     │        │
     │        └── US-HANDOFF-001  (summary report — depends on trajectory + decisions + state)
```

---

## Mission alignment

These three stories directly address claims in the 8P3P value statement:

| Story | Mission claim |
|---|---|
| US-SKILL-001 | "detecting **where** understanding is breaking down" |
| US-TRAJECTORY-001 | "whether that knowledge is **improving or decaying**" |
| US-HANDOFF-001 | "what the **next grade-level teacher** needs to know" |

The v1.1 infrastructure (DynamoDB, CDK, policy management API, policy inspection API) provides the foundational architecture these stories build on. No data model changes are required — these extend the read path only.
