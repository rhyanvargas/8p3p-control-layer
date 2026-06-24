# Learner Trajectory API

> Version-range view of how a learner's canonical state fields have changed over time — with per-field direction classification (`improving` / `declining` / `stable`).

## Overview

The decision engine evaluates learner state at a point in time, but educators and integration teams need to see *trend* — is `stabilityScore` improving across the semester, or did it peak and fall? This spec adds a read-only trajectory endpoint that returns ordered state snapshots across a version range, with the direction of change for each requested field.

For v1.1, flat fields only. The direction computation reuses the `{field}_direction` companion values written by `state-delta-detection.md` (which are stored per-version in the state object) — no additional computation at query time. The v1.2 extension (US-SKILL-001 dot-path support) will enable nested field paths like `skills.fractions.stabilityScore`.

**Sequential dependency:** `state-delta-detection.md` is implemented (PREREQ-001 satisfied). Direction data (`{field}_direction`) is read directly from stored state versions — if the companion delta fields are not present in stored state, trajectory responses will return `null` for `direction`.

---

## Endpoint

### `GET /v1/state/trajectory`

Return an ordered array of state snapshots for a learner, filtered to requested fields, across a version range.

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `org_id` | Yes | Organization ID |
| `learner_reference` | Yes | Learner identifier |
| `fields` | Yes | Comma-separated list of flat canonical field names to include (e.g., `stabilityScore,masteryScore`). Max 10 fields per request. |
| `from_version` | No | Starting state version (inclusive). Defaults to 1. |
| `to_version` | No | Ending state version (inclusive). Defaults to current (latest). |
| `page_token` | No | Opaque cursor for pagination |
| `page_size` | No | Results per page (1–100, default 50) |

**Response (200):**

```json
{
  "org_id": "springs",
  "learner_reference": "learner_001",
  "fields": ["stabilityScore", "masteryScore"],
  "versions": [
    {
      "state_version": 1,
      "updated_at": "2026-03-01T10:00:00Z",
      "values": {
        "stabilityScore": 0.72,
        "masteryScore": 0.65
      },
      "directions": {
        "stabilityScore": null,
        "masteryScore": null
      }
    },
    {
      "state_version": 2,
      "updated_at": "2026-03-08T14:30:00Z",
      "values": {
        "stabilityScore": 0.55,
        "masteryScore": 0.70
      },
      "directions": {
        "stabilityScore": "declining",
        "masteryScore": "improving"
      }
    },
    {
      "state_version": 3,
      "updated_at": "2026-03-15T09:15:00Z",
      "values": {
        "stabilityScore": 0.28,
        "masteryScore": 0.75
      },
      "directions": {
        "stabilityScore": "declining",
        "masteryScore": "improving"
      }
    }
  ],
  "summary": {
    "stabilityScore": {
      "first_value": 0.72,
      "latest_value": 0.28,
      "overall_direction": "declining",
      "version_count": 3
    },
    "masteryScore": {
      "first_value": 0.65,
      "latest_value": 0.75,
      "overall_direction": "improving",
      "version_count": 3
    }
  },
  "next_page_token": null
}
```

**Response (400) — missing required field:**

```json
{ "code": "missing_required_field", "message": "'learner_reference' is required", "field_path": "learner_reference" }
```

**Response (400) — too many fields:**

```json
{ "code": "invalid_format", "message": "Maximum 10 fields per trajectory request. Got 14." }
```

**Response (404) — learner not found:**

```json
{ "code": "state_not_found", "message": "No state found for learner 'learner_001' in org 'springs'" }
```

---

## Response Shape Details

### `versions` array

Each entry represents one stored state version within the requested range. Versions are ordered ascending (`state_version` 1 → N).

| Field | Type | Description |
|---|---|---|
| `state_version` | number | Version number |
| `updated_at` | string (ISO 8601) | When this state version was written |
| `values` | object | For each requested field: the field's value at this version, or `null` if the field was not present in state at this version |
| `directions` | object | For each requested field: the `{field}_direction` companion value stored in this version (`"improving"`, `"declining"`, `"stable"`, or `null` if not present — e.g. first version) |

### `summary` object

Provides a cross-version aggregate per field:

| Field | Description |
|---|---|
| `first_value` | Value at the earliest version in range where the field was non-null |
| `latest_value` | Value at the latest version in range where the field was non-null |
| `overall_direction` | `"improving"` if `latest_value > first_value`; `"declining"` if `latest_value < first_value`; `"stable"` if equal. `null` if field was only present in one version. |
| `version_count` | Number of versions in range where the field was non-null |

> **Pagination note:** When the response is paginated, `summary` is computed across the versions returned in the **current page only**, not the full version range. Consumers that need a global summary across all pages should aggregate page-level summaries client-side or use the forthcoming `learner-summary-api` endpoint.

---

## Requirements

### Functional

- [ ] `GET /v1/state/trajectory` returns ordered state version entries for the requested learner and fields
- [ ] `from_version` and `to_version` are inclusive bounds; when omitted, the full history is returned (up to pagination limit)
- [ ] For each version in range, the response includes the field value from `state` at that version (or `null` if absent) and the `{field}_direction` companion value (or `null` if absent — e.g. first version)
- [ ] `summary` object computes `first_value`, `latest_value`, and `overall_direction` across the requested range
- [ ] Maximum 10 fields per request; exceeding returns 400 `invalid_format`
- [ ] Pagination via `page_token` (keyset on `state_version` ASC); `page_size` default 50, max 100
- [ ] `org_id` isolation is enforced — tenant cannot retrieve another org's data
- [ ] Auth: `x-api-key` required (same as all `/v1/*` endpoints)
- [ ] Read-only — no mutations
- [ ] `StateRepository` gains a new method `getStateVersionRange(orgId, learnerRef, fromVersion, toVersion, limit, cursor)` returning an array of `LearnerState` records and a pagination token

### Acceptance Criteria

- Given learner with 3 state versions, when `GET /v1/state/trajectory?org_id=springs&learner_reference=learner_001&fields=stabilityScore` is called, then all 3 versions are returned in ascending order with `values.stabilityScore` populated and `directions.stabilityScore` reflecting the stored `stabilityScore_direction` from each version
- Given version 1 has no `stabilityScore_direction` (first signal, no prior state), then `directions.stabilityScore` is `null` for version 1
- Given learner does not exist, when the endpoint is called, then 404 `state_not_found` is returned
- Given `fields=a,b,c,...` with 11 fields, then 400 `invalid_format` is returned
- Given `from_version=2&to_version=3` on a learner with 5 versions, then only versions 2 and 3 are returned
- Given the `summary` for `stabilityScore` where first value is 0.72 and latest is 0.28, then `overall_direction: "declining"` is returned

---

## Constraints

- **Flat fields only in v1.1** — field names in `fields` parameter must be top-level keys. Dot-path fields (e.g., `skills.fractions.stabilityScore`) return 400 `invalid_format` with message "Dot-path fields are not supported in v1.1. Use top-level canonical field names." **v1.2 addendum scoped** — see §v1.2 Per-Skill Dot-Path Trajectory.
- **Direction data comes from stored state** — the endpoint reads `{field}_direction` companion values from each stored state version. It does not recompute direction at query time. If state-delta-detection was not yet deployed when those versions were written, `directions` will be `null` for those historical versions.
- **No real-time re-evaluation** — this is a historical read API only. It does not trigger new state or decision computation.
- **`page_size` max 100** — prevents large memory allocation for learners with many state versions.

---

## Out of Scope (v1.1)

| Item | Rationale | Revisit When |
|------|-----------|--------------|
| Dot-path nested field trajectory (`skills.fractions.stabilityScore`) | v1.1 shipped flat fields only; see **§v1.2** below | §v1.2 (scoped 2026-06-23, A3) |
| Smoothing / rolling average direction algorithm | Simple first-to-last delta sufficient for pilot | Customer requests more sophisticated trend analysis |
| Cross-learner trajectory comparison | Multi-learner aggregation is a separate analytics concern | Analytics API spec |
| Export (CSV, PDF) | Client-side rendering responsibility | SDK / export spec |
| Real-time streaming trajectory | Async pattern; not required for pilot | EventBridge / WebSocket spec |

---

## v1.2 — Per-Skill Dot-Path Trajectory (US-SKILL-001 Extension)

> **Status:** Scoped 2026-06-23 (roadmap P1 / CEO directive A3). **Not yet implemented.** Flat-field trajectory (v1.1) ships; nested delta companions and dot-path policy evaluation from `skill-level-tracking.md` (US-SKILL-001) also ship. This addendum closes the remaining read-path gap: trajectory queries over per-skill stored metrics.

### Problem

Educators and the AI explanation layer need to answer *"when did fractions stability start declining?"* — not only whether the dominant-skill mirror (`fields.stabilityScore`) moved. Stored state already carries per-skill metrics and `{metric}_direction` companions under `state.skills.{skillId}` (see `skill-level-tracking.md` §Change 3). The trajectory handler still rejects any `fields` value containing `.` and reads values/directions via top-level key lookup only (`trajectory-handler-core.ts`).

### Prerequisites (all satisfied)

| Prerequisite | Source | Status |
|--------------|--------|--------|
| `getAtPath()` dot-path resolver | `src/shared/dot-path.ts` | **Complete** |
| Nested `{metric}_delta` / `{metric}_direction` at write time | `src/state/engine.ts` `computeNestedDeltas()` (max depth 5) | **Complete** |
| `getStateVersionRange()` pagination | `src/state/store.ts` | **Complete** |
| v1.1 trajectory response shape + `buildSummary` semantics | This spec §Endpoint | **Complete** |

### In Scope (narrow)

1. **Accept dot-path field names** in `GET /v1/state/trajectory?fields=…` and in `GET /v1/learners/:ref/summary?trajectory_fields=…`.
2. **Allowed path pattern:** `skills.{skillId}.{metric}` where:
   - `{skillId}` matches `^[A-Za-z0-9_-]{1,64}$` (same charset as skill keys in seed/pilot data, e.g. `text_evidence`, `fractions`).
   - `{metric}` is a leaf numeric metric name (`stabilityScore`, `masteryScore`, or future numeric leaves written by signals) — **not** a companion suffix (`_delta`, `_direction`).
   - Total path depth ≤ 5 segments (aligned with `computeNestedDeltas` recursion cap).
3. **Read semantics unchanged:** for each version, return the numeric value at the path (or `null` if absent/non-numeric) and the stored direction companion — **no query-time recomputation**.
4. **Direction companion resolution:** for a requested field path `P`, the direction key is the sibling `{leaf}_direction` at the same parent object:
   - Flat (v1.1, unchanged): `stabilityScore` → `stabilityScore_direction`
   - Nested (v1.2): `skills.fractions.stabilityScore` → read direction at `skills.fractions.stabilityScore_direction` via `getAtPath(state, directionPath(P))` where `directionPath(P)` replaces the final segment `S` with `S_direction`.
5. **Limits unchanged:** max 10 fields per request; max 128 characters per field path; pagination and version-range filters unchanged.
6. **Error behavior:** paths outside the allowed pattern return 400 `invalid_format` with message `"Field path must match skills.{skillId}.{metric}"`. Paths containing `..`, empty segments, or companion-suffix leaves return 400 `invalid_format`.
7. **Remove v1.1 dot-path rejection** in `validateTrajectoryParams`, summary `trajectory_fields` validation, and Lambda `inspect.ts` mirrors — replace with pattern validation above.
8. **OpenAPI + contract tests:** extend OpenAPI `fields` / `trajectory_fields` descriptions; add TRAJ-009–TRAJ-012 (see below). Update TRAJ-006 from "rejected" to "accepted when pattern-valid" (or supersede with TRAJ-009).

### Explicitly Out of Scope (v1.2)

| Item | Rationale |
|------|-----------|
| Arbitrary dot paths (`aggregation.overall.masteryScore`, `object.extensions.*`) | Narrow extension targets per-skill CEO "where" story only; URS aggregation already exposes current snapshot |
| Auto-discovery of all skills/metrics when `fields` / `trajectory_fields` omitted | Summary default remains URS-projected flat numerics; callers pass explicit skill paths |
| Dashboard Trajectory tab redesign | API-first; dashboard may follow in a separate plan (group rows by skill from `mastery_breakdown` + explicit `trajectory_fields`) |
| Retroactive direction backfill for versions written before nested deltas | Same v1.1 rule: missing companions → `null` |
| New routes or response-shape breaking changes | Extend existing endpoints only |
| Smoothing / rolling average | Unchanged deferral |

### Response Shape

**No breaking changes.** Dot-path field names appear as keys in `fields`, `versions[].values`, `versions[].directions`, and `summary` exactly as requested (e.g. `"skills.fractions.stabilityScore"`).

Example request:

```
GET /v1/state/trajectory?org_id=springs&learner_reference=stu-30456&fields=skills.text_evidence.stabilityScore,skills.text_evidence.masteryScore
```

Example excerpt (version 2):

```json
{
  "values": {
    "skills.text_evidence.stabilityScore": 0.55,
    "skills.text_evidence.masteryScore": 0.70
  },
  "directions": {
    "skills.text_evidence.stabilityScore": "declining",
    "skills.text_evidence.masteryScore": "improving"
  }
}
```

### Implementation Touch Points

| Surface | File(s) | Change |
|---------|---------|--------|
| Trajectory validation + version build | `src/state/trajectory-handler-core.ts` | Replace dot rejection with pattern check; `getAtPath` for values/directions; export `directionPathForField()` helper |
| Summary trajectory fields | `src/learners/summary-handler-core.ts` | Same validation; `resolveTrajectoryFields` unchanged for default (flat URS keys only) |
| Lambda routing | `src/lambda/inspect.ts` | Align validation with core (two duplicate checks today) |
| OpenAPI | `docs/api/openapi.yaml` | Update `fields` / `trajectory_fields` param descriptions + examples |
| Learner summary spec cross-ref | `docs/specs/learner-summary-api.md` §Out of Scope | Move nested trajectory row to "implemented in trajectory §v1.2" when impl lands |

**Estimated blast radius:** ~4 production files, ~2 spec files, ~6 test files. No store/repository changes.

### Contract Tests (additions)

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| TRAJ-009 | Per-skill trajectory across 3 versions | Learner with nested `skills.fractions.stabilityScore` history (seed via `saveStateWithAppliedSignals`) | 200; ascending versions; values/directions from nested companions |
| TRAJ-010 | Direction `null` on first skill observation | Version 1 has metric but no `{metric}_direction` | `directions.skills…stabilityScore: null` for v1 |
| TRAJ-011 | Invalid path rejected | `fields=aggregation.overall.masteryScore` | 400 `invalid_format` with pattern message |
| TRAJ-012 | Companion suffix rejected as leaf | `fields=skills.fractions.stabilityScore_direction` | 400 `invalid_format` |

> **Test strategy:** Reuse SKL-014 integration fixture pattern (`tests/integration/skill-level-tracking.test.ts`) — nested state is already seedable; trajectory read path is the only new behavior under test.

### Controlled-Evaluation Posture

Per `docs/reports/2026-06-23-ceo-meeting-directives.md` §3, flat-field trajectory is **demonstrable today** for the "risk appeared earlier" story. v1.2 is **P1, not eval-blocking** — it sharpens the per-skill temporal narrative for the CEO "where" ask once the explanation layer (A1) lands. Do not budget v1.2 as net-new infrastructure.

### Next Step

Run `/plan-impl docs/specs/learner-trajectory-api.md` scoped to §v1.2 only (do not re-plan v1.1 — archived at `archive/plans/learner-trajectory-api.plan.md`).

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| `getStateByVersion()` — `StateRepository` interface | `docs/specs/state-engine.md` | **Complete** |
| **`{field}_direction` companion values in stored state** | `docs/specs/state-delta-detection.md` | **Complete** |
| `LearnerState` type with `state: Record<string, unknown>` | `src/shared/types.ts` | **Complete** |
| API key middleware + org_id isolation | `docs/specs/api-key-middleware.md` | **Complete** |
| `InspectFunction` Lambda (AWS deployment routing) | `docs/specs/aws-deployment.md` TASK-003 | Spec'd (v1.1) |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| `getStateVersionRange()` on `StateRepository` | `docs/specs/learner-summary-api.md` (v1.1) |
| Per-field trajectory + overall direction summary | `docs/specs/learner-summary-api.md` `field_trajectories` section |

---

## Implementation Notes

### `StateRepository` extension

A new method is required on the `StateRepository` interface:

```typescript
getStateVersionRange(
  orgId: string,
  learnerRef: string,
  fromVersion: number,
  toVersion: number,
  limit: number,
  cursor?: number   // state_version cursor for keyset pagination
): { states: LearnerState[]; nextCursor: number | null }
```

**SQLite implementation:** `SELECT ... FROM learner_state WHERE org_id = ? AND learner_reference = ? AND state_version >= ? AND state_version <= ? AND state_version > ? ORDER BY state_version ASC LIMIT ?`

**DynamoDB implementation:** `Query(PK=org_id#learner_ref, SK BETWEEN fromVersion AND toVersion)` using the composite SK pattern from the DynamoDB state table. Requires the state table's sort key to encode `state_version` numerically. Confirm alignment with `aws-deployment.md` `StateTable` key design before implementing.

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `missing_required_field` | Validation — `org_id` or `learner_reference` absent |
| `state_not_found` | State Engine — no state for given org + learner |
| `api_key_required` / `api_key_invalid` | Auth middleware |
| `invalid_format` | Validation — dot-path field or too many fields |

| `page_size_out_of_range` | Pagination — `page_size` outside 1–100 (`src/shared/error-codes.ts`) |
| `invalid_page_token` | Pagination — malformed or undecodable `page_token` (`src/shared/error-codes.ts`) |

### New (add during implementation)

None. All error cases map to existing codes.

---

## Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| TRAJ-001 | Full trajectory for learner with 3 versions | `org_id=springs, learner_reference=learner_001, fields=stabilityScore` | 200; 3 version entries, ascending; `directions.stabilityScore` populated from stored companion values |
| TRAJ-002 | Direction `null` for first version | Learner with delta fields absent in version 1 (no prior state) | Version 1 entry: `directions.stabilityScore: null`; later versions have values |
| TRAJ-003 | Version range filter | `from_version=2&to_version=3` on learner with 5 versions | Only versions 2 and 3 returned |
| TRAJ-004 | Learner not found | `learner_reference=nonexistent` | 404 `state_not_found` |
| TRAJ-005 | Too many fields | `fields=a,b,c,d,e,f,g,h,i,j,k` (11 fields) | 400 `invalid_format` |
| TRAJ-006 | Dot-path field rejected | `fields=skills.fractions.stabilityScore` | 400 `invalid_format` with v1.1 message |
| TRAJ-007 | Summary accuracy | Learner: `stabilityScore` 0.72 → 0.55 → 0.28 | `summary.stabilityScore.first_value: 0.72`, `latest_value: 0.28`, `overall_direction: "declining"` |
| TRAJ-008 | Auth required | No `x-api-key` | 401 |

> **Test strategy:** TRAJ-001 through TRAJ-008 use Fastify `inject` with SQLite in-process (same pattern as existing contract tests). State versions are seeded directly via `saveStateWithAppliedSignals` with explicit `state_version` values. No real signal processing needed for the read path.

---

## Notes

- **v1.1 scope rationale:** US-TRAJECTORY-001 in the backlog listed US-SKILL-001 (dot-path resolver) as a prerequisite. This spec intentionally scopes v1.1 to flat fields only, removing the US-SKILL-001 dependency and enabling the trajectory API to ship alongside the pilot. Dot-path support is the §v1.2 addendum (scoped 2026-06-23, A3); US-SKILL-001 write-path prerequisites are now complete.
- **Historical direction data:** Versions stored before `state-delta-detection.md` was deployed will have `null` direction values. This is expected and documented in the response. The trajectory API does not retroactively compute direction for historical versions.

---

*Spec created: 2026-03-28 | Phase: v1.1 | Derived from US-TRAJECTORY-001 (backlog) | Depends on: state-delta-detection.md (Complete), state-engine.md, aws-deployment.md*
