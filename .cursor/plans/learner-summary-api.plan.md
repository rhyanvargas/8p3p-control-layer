---
name: Learner Summary API
overview: Read-only GET /v1/learners/{learner_reference}/summary endpoint that aggregates current state, recent decisions, field trajectories, active policy, and signal counts from existing stores. Adds two read-only repo methods, exports trajectory summary helpers, and wires Fastify + Lambda + CDK + OpenAPI with no new tables or write paths.
todos:
  - id: TASK-001
    content: Export buildSummary and buildVersions from trajectory-handler-core
    status: completed
  - id: TASK-002
    content: Extend DecisionRepository interface with getRecentDecisionsByLearner
    status: completed
  - id: TASK-003
    content: Implement getRecentDecisionsByLearner in SqliteDecisionRepository
    status: completed
  - id: TASK-004
    content: Implement getRecentDecisionsByLearner in DynamoDbDecisionRepository
    status: completed
  - id: TASK-005
    content: Extend SignalLogRepository interface with getSignalSummary
    status: completed
  - id: TASK-006
    content: Implement getSignalSummary in SqliteSignalLogRepository
    status: completed
  - id: TASK-007
    content: Implement getSignalSummary in DynamoDbSignalLogRepository
    status: completed
  - id: TASK-008
    content: Create summary-handler-core with validation, aggregation, and trajectory paging loop
    status: completed
  - id: TASK-009
    content: Create learners handler.ts and routes.ts
    status: completed
  - id: TASK-010
    content: Wire registerLearnerRoutes into Fastify server
    status: completed
  - id: TASK-011
    content: Wire Lambda InspectFunction routing for learner summary with parallel fetches
    status: completed
  - id: TASK-012
    content: Add CDK API Gateway resource and IAM grants for InspectFunction
    status: completed
  - id: TASK-013
    content: Document GET /v1/learners/{learner_reference}/summary in OpenAPI
    status: completed
  - id: TASK-014
    content: Add contract tests SUM-001 through SUM-008
    status: completed
  - id: TASK-015
    content: Add unit tests for summary-handler-core
    status: completed
  - id: TASK-016
    content: Add unit tests for new repo methods
    status: completed
  - id: TASK-017
    content: Update spec status notes to reflect dependencies completed and deviations
    status: completed
isProject: false
---

# Learner Summary API

**Spec**: `docs/specs/learner-summary-api.md`

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase. Update this section only if the spec itself changes.

### From spec § Endpoint — Path Parameters

```
| Parameter | Description |
|-----------|-------------|
| `learner_reference` | Learner identifier (pseudonymous — no PII) |
```

### From spec § Endpoint — Query Parameters

```
| Parameter | Required | Description |
|-----------|----------|-------------|
| `org_id` | Yes | Organization ID |
| `recent_decisions_limit` | No | Number of recent decisions to include (1–50, default 10) |
| `trajectory_fields` | No | Comma-separated list of canonical fields for trajectory summary (default: all numeric fields present in current state; max 10) |
```

### From spec § Endpoint — Response (200)

```json
{
  "org_id": "springs",
  "learner_reference": "learner_001",
  "generated_at": "2026-03-28T15:00:00Z",

  "current_state": {
    "state_id": "springs:learner_001:v3",
    "state_version": 3,
    "updated_at": "2026-03-28T14:45:00Z",
    "fields": {
      "stabilityScore": 0.28,
      "masteryScore": 0.75,
      "timeSinceReinforcement": 172800,
      "stabilityScore_delta": -0.27,
      "stabilityScore_direction": "declining",
      "masteryScore_delta": 0.05,
      "masteryScore_direction": "improving"
    }
  },

  "recent_decisions": [
    {
      "decision_id": "a1b2c3d4-...",
      "decision_type": "intervene",
      "decided_at": "2026-03-28T14:45:30Z",
      "matched_rule_id": "rule-decay-intervene",
      "rationale": "Rule rule-decay-intervene fired: stabilityScore_delta (-0.27) lt -0.1 AND stabilityScore (0.28) lt 0.6",
      "policy_version": "1.1.0"
    }
  ],
  "recent_decisions_count": 1,

  "field_trajectories": {
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

  "active_policy": {
    "policy_id": "springs:learner",
    "policy_key": "learner",
    "policy_version": "1.1.0",
    "description": "Springs Charter School — learner policy v1.1",
    "rule_count": 5
  },

  "signals_summary": {
    "total_count": 3,
    "first_signal_at": "2026-03-01T10:00:00Z",
    "last_signal_at": "2026-03-28T14:44:00Z"
  }
}
```

### From spec § Endpoint — Response (404)

```json
{ "code": "state_not_found", "message": "No state found for learner 'learner_001' in org 'springs'" }
```

> Spec note: `Error envelope is flat ({ code, message, field_path? }), matching all other /v1/state* and /v1/decisions endpoints and the OpenAPI StateError schema. Aligned with learner-trajectory-api.md.`

### From spec § Response Shape Details — recent_decisions field sources

```
| Field | Source |
|-------|--------|
| `decision_id` | `Decision.decision_id` |
| `decision_type` | `Decision.decision_type` |
| `decided_at` | `Decision.decided_at` |
| `matched_rule_id` | `Decision.trace.matched_rule_id` |
| `rationale` | `Decision.trace.rationale` |
| `policy_version` | `Decision.trace.policy_version` |
```

> PII exclusion: `state_snapshot` from `Decision.trace` is **not** included. Only the listed fields appear.

### From spec § Response Shape Details — field_trajectories single-version semantics

```
Single-version semantics (aligned with trajectory core): When the learner has only 1 state version (or only 1 version where the field is non-null and numeric), the field's entry is { first_value: <value>, latest_value: <value>, overall_direction: null, version_count: 1 }. Direction is null (not "stable") because direction is undefined with a single data point. This matches buildSummary in src/state/trajectory-handler-core.ts.
```

### From spec § Response Shape Details — field_trajectories default

```
"All numeric fields" default (when `trajectory_fields` omitted): Inspect `current_state.fields` and pick keys where `typeof value === 'number'`, excluding any keys that end in `_delta` (companion fields are not trajectory targets). Cap at 10 fields to honor the same limit as `learner-trajectory-api.md`.
```

### From spec § Response Shape Details — field_trajectories pagination scope

```
Pagination scope: Summary computes `field_trajectories` across **all** versions in `[1, current_state.state_version]` by looping `getStateVersionRange` until `nextCursor === null` (typical learner has < 100 versions in v1.1; bounded loop with safety cap). Trajectory's per-page summary semantics do not apply here.
```

### From spec § Response Shape Details — active_policy userType resolution

```ts
const userType = loadRoutingConfigForOrg(orgId)?.default_policy_key ?? 'learner';
```

> Spec note: `This matches the decision engine's fallback (src/decision/engine.ts) when no source_system is supplied.`

### From spec § Response Shape Details — active_policy composition

```
| Field | Source |
|-------|--------|
| `policy_id` | `PolicyDefinition.policy_id` |
| `policy_key` | The resolved `userType` argument passed to `loadPolicyForContext` (pass-through; not a field on `PolicyDefinition`) |
| `policy_version` | `PolicyDefinition.policy_version` |
| `description` | `PolicyDefinition.description` |
| `rule_count` | `PolicyDefinition.rules.length` |
```

### From spec § Response Shape Details — active_policy null behavior

```
loadPolicyForContext throws an Error with code: 'policy_not_found' (from src/shared/error-codes.ts) when no filesystem candidate exists. The handler MUST catch only that specific code and set active_policy: null. Any other error code rethrows (do not swallow unrelated failures).
```

### From spec § Response Shape Details — signals_summary fields

```
| Field | Description |
|-------|-------------|
| `total_count` | Total signals received for this learner in this org |
| `first_signal_at` | Timestamp of the earliest accepted signal |
| `last_signal_at` | Timestamp of the most recent accepted signal |
```

### From spec § Constraints

```
- Aggregation only — no new tables, no write paths.
- PII exclusion is mandatory — state_snapshot from decision trace must not appear in the response. Follows DEF-DEC-008-PII (PII forbidden keys + canonical snapshot).
- trajectory_fields max 10 — reuses the same 10-field limit from learner-trajectory-api.md.
- recent_decisions max 50 — prevents large response payloads for high-frequency learners.
- No per-request freshness guarantee — data reflects whatever is in the stores at query time.
```

### From spec § Dependencies — new repo methods required

```
getRecentDecisionsByLearner(orgId, learnerRef, limit) — DESC by decided_at
getSignalSummary(orgId, learnerRef) — { total_count, first_signal_at, last_signal_at }
buildSummary — Spec'd — MUST be exported from src/state/trajectory-handler-core.ts (currently file-internal)
```

### From spec § Notes — concurrency

```
The Lambda handler MUST use Promise.all([statePromise, recentDecisionsPromise, signalSummaryPromise, trajectorySummaryPromise]) (with policy resolved synchronously after state is in hand) to hit DynamoDB tables concurrently.
```

---

## Prerequisites

- [x] PREREQ-001 `state-delta-detection.md` implemented — `{field}_direction` persisted at apply time (`src/state/engine.ts:129–171, 270`)
- [x] PREREQ-002 `getStateVersionRange()` on `StateRepository` (`src/state/repository.ts:38–45`, `src/state/store.ts:496–505`, `src/state/dynamodb-repository.ts:165–200`)
- [x] PREREQ-003 `getState()` and `loadPolicyForContext()` available (`src/state/store.ts:388–395`, `src/decision/policy-loader.ts:671–693`)
- [x] PREREQ-004 `loadRoutingConfigForOrg()` available (`src/decision/policy-loader.ts:549–574`)
- [x] PREREQ-005 API key middleware enforces `org_id` isolation on `/v1/*` (`src/auth/api-key-middleware.ts:33–68`)
- [x] PREREQ-006 PII forbidden-keys hardening complete (`src/ingestion/forbidden-keys.ts`)
- [x] PREREQ-007 DynamoDB `DecisionsTable` GSI `gsi1-learner-time` exists with `learner_decided_at` SK (`infra/lib/control-layer-stack.ts:102–106`)
- [x] PREREQ-008 DynamoDB `SignalsTable` GSI `gsi1-learner-time` exists with `learner_timestamp` SK (`infra/lib/control-layer-stack.ts:71–75`)

---

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Export buildSummary and buildVersions from trajectory-handler-core

- **Files**: `src/state/trajectory-handler-core.ts`
- **Action**: Modify
- **Details**: Spec § Dependencies states verbatim: `buildSummary — Spec'd — MUST be exported from src/state/trajectory-handler-core.ts (currently file-internal)`. Add the `export` keyword to the existing `buildSummary` (line 166) and `buildVersions` (line 143) functions, plus the supporting types `Direction`, `TrajectoryVersion`, and `FieldSummary` (lines 17–31). The implementations are already spec-aligned with the single-version semantics from Spec Literals § field_trajectories single-version semantics — no behavior change. This export is required so `src/learners/summary-handler-core.ts` and `src/lambda/inspect.ts` reuse a single source of truth instead of duplicating the loop (the Lambda already duplicates it at `src/lambda/inspect.ts:130–165` and TASK-011 will refactor that path to call the new exports).
- **Depends on**: none
- **Verification**: `npm run typecheck` passes; `grep -E "^export (function|interface|type) (buildSummary|buildVersions|Direction|TrajectoryVersion|FieldSummary)" src/state/trajectory-handler-core.ts` shows all five exports.

### TASK-002: Extend DecisionRepository interface with getRecentDecisionsByLearner

- **Files**: `src/decision/repository.ts`, `src/decision/store.ts`
- **Action**: Modify
- **Details**: Spec § Dependencies states verbatim: `getRecentDecisionsByLearner(orgId, learnerRef, limit) — DESC by decided_at`. Add to the `DecisionRepository` interface:
  ```typescript
  getRecentDecisionsByLearner(orgId: string, learnerRef: string, limit: number): Decision[];
  ```
  Add a module-level export in `src/decision/store.ts` mirroring the existing `getDecisions` / `getDecisionById` delegation pattern (`src/decision/store.ts:269–292`):
  ```typescript
  export function getRecentDecisionsByLearner(orgId: string, learnerRef: string, limit: number): Decision[] {
    if (!repository) {
      throw new Error('Decision store not initialized. Call initDecisionStore first.');
    }
    return repository.getRecentDecisionsByLearner(orgId, learnerRef, limit);
  }
  ```
  JSDoc: returns at most `limit` decisions for the learner, ordered by `decided_at` DESC then `id` DESC; no pagination (callers must respect the 50-row cap from Spec Literals § Constraints). SQLite is synchronous; the DynamoDB counterpart in `DynamoDbDecisionRepository` is async (TASK-004) — same parity pattern as `getState` / `DynamoDbStateRepository.getState`.
- **Depends on**: none
- **Verification**: `npm run typecheck` passes; TypeScript flags `SqliteDecisionRepository` as missing the method until TASK-003 lands.

### TASK-003: Implement getRecentDecisionsByLearner in SqliteDecisionRepository

- **Files**: `src/decision/store.ts`
- **Action**: Modify
- **Details**: Add method on `SqliteDecisionRepository` (alongside `getDecisions` at `src/decision/store.ts:126–188`). SQL:
  ```sql
  SELECT id, org_id, decision_id, learner_reference, decision_type, decided_at,
         decision_context, trace_state_id, trace_state_version, trace_policy_id, trace_policy_version, trace_matched_rule_id,
         trace_state_snapshot, trace_matched_rule, trace_rationale, trace_educator_summary, output_metadata
  FROM decisions
  WHERE org_id = ? AND learner_reference = ?
  ORDER BY decided_at DESC, id DESC
  LIMIT ?
  ```
  Cap `limit` defensively at `Math.min(Math.max(1, limit), 50)` per Spec Literals § Constraints (`recent_decisions max 50`). Map rows via the existing `rowToDecision` helper. Uses the existing `idx_decisions_query ON (org_id, learner_reference, decided_at)` index for both predicates and ordering.
- **Depends on**: TASK-002
- **Verification**: TASK-016 unit tests pass; manual `EXPLAIN QUERY PLAN` shows index use.

### TASK-004: Implement getRecentDecisionsByLearner in DynamoDbDecisionRepository

- **Files**: `src/decision/dynamodb-repository.ts`
- **Action**: Modify
- **Details**: Add async method to `DynamoDbDecisionRepository` (alongside `getDecisions` at `src/decision/dynamodb-repository.ts:54–94`). Use the existing `gsi1-learner-time` GSI (PK `org_id`, SK `learner_decided_at` = `learner_reference#decided_at`) via `QueryCommand`:
  - `IndexName: 'gsi1-learner-time'`
  - `KeyConditionExpression: 'org_id = :org AND begins_with(learner_decided_at, :lr)'`
  - `ExpressionAttributeValues: marshall({ ':org': orgId, ':lr': \`${learnerRef}#\` })`
  - `ScanIndexForward: false` (DESC)
  - `Limit: Math.min(Math.max(1, limit), 50)`

  Map items via existing `unmarshallDecision` (`src/decision/dynamodb-repository.ts:108–132`). No pagination token surfaced — single page, capped at 50. Return type: `Promise<Decision[]>`.

  Note: this does NOT implement `DecisionRepository` (parallel async API, same pattern as `DynamoDbStateRepository` which does not implement `StateRepository` — see `src/state/dynamodb-repository.ts:21`).
- **Depends on**: TASK-002
- **Verification**: `npm run typecheck` passes. DynamoDB integration validated post-deploy; correctness exercised indirectly via SQLite contract tests (TASK-014) since both paths share the handler-core (Fastify) or are mirrored in the Lambda dispatcher.

### TASK-005: Extend SignalLogRepository interface with getSignalSummary

- **Files**: `src/signalLog/repository.ts`, `src/signalLog/store.ts`
- **Action**: Modify
- **Details**: Spec § Dependencies states verbatim: `getSignalSummary(orgId, learnerRef) — { total_count, first_signal_at, last_signal_at }`. Add to interface:
  ```typescript
  getSignalSummary(orgId: string, learnerRef: string): {
    total_count: number;
    first_signal_at: string | null;
    last_signal_at: string | null;
  };
  ```
  Add module-level export in `src/signalLog/store.ts` mirroring `querySignals` delegation (`src/signalLog/store.ts:288–294`):
  ```typescript
  export function getSignalSummary(orgId: string, learnerRef: string): {
    total_count: number;
    first_signal_at: string | null;
    last_signal_at: string | null;
  } {
    if (!repository) {
      throw new Error('Signal Log store not initialized. Call initSignalLogStore first.');
    }
    return repository.getSignalSummary(orgId, learnerRef);
  }
  ```
  JSDoc: `total_count` is the count of accepted signals for the learner in this org; `first_signal_at` / `last_signal_at` are the MIN / MAX of `accepted_at` (the column already indexed at `src/signalLog/store.ts:48–51`). Returns `{ total_count: 0, first_signal_at: null, last_signal_at: null }` when the learner has zero signals.
- **Depends on**: none
- **Verification**: `npm run typecheck` passes; TypeScript flags `SqliteSignalLogRepository` as missing the method until TASK-006 lands.

### TASK-006: Implement getSignalSummary in SqliteSignalLogRepository

- **Files**: `src/signalLog/store.ts`
- **Action**: Modify
- **Details**: Add method on `SqliteSignalLogRepository` (alongside `querySignals` at `src/signalLog/store.ts:84–151`). Single SQL aggregate (one row, no pagination):
  ```sql
  SELECT COUNT(*) AS total_count,
         MIN(accepted_at) AS first_signal_at,
         MAX(accepted_at) AS last_signal_at
  FROM signal_log
  WHERE org_id = ? AND learner_reference = ?
  ```
  When no rows match, SQLite returns one row with `total_count = 0` and `MIN`/`MAX` as `null` — coerce both timestamp fields to `null` explicitly in TypeScript (better-sqlite3 returns `null` for SQL NULL, but be defensive). Uses the existing `idx_signal_log_query ON (org_id, learner_reference, accepted_at)` index for both predicates and the MIN/MAX scan.
- **Depends on**: TASK-005
- **Verification**: TASK-016 unit tests pass.

### TASK-007: Implement getSignalSummary in DynamoDbSignalLogRepository

- **Files**: `src/signalLog/dynamodb-repository.ts`
- **Action**: Modify
- **Details**: Add async method to `DynamoDbSignalLogRepository` (alongside `querySignals` at `src/signalLog/dynamodb-repository.ts:75–110`). DynamoDB has no native MIN/MAX/COUNT aggregate, so use three parallel `QueryCommand`s on the existing `gsi1-learner-time` GSI (PK `org_id`, SK `learner_timestamp` = `learner_reference#accepted_at`):

  1. **Count query**:
     - `IndexName: 'gsi1-learner-time'`
     - `KeyConditionExpression: 'org_id = :org AND begins_with(learner_timestamp, :lr)'`
     - `Select: 'COUNT'`
     - Loop with `ExclusiveStartKey` until `LastEvaluatedKey` is undefined to get the full count (one page if learner < ~1MB of items).
  2. **First signal query** (oldest): same KeyConditionExpression, `ScanIndexForward: true`, `Limit: 1`, `ProjectionExpression: 'accepted_at'`.
  3. **Last signal query** (newest): same KeyConditionExpression, `ScanIndexForward: false`, `Limit: 1`, `ProjectionExpression: 'accepted_at'`.

  Run all three via `Promise.all`. Return `{ total_count, first_signal_at, last_signal_at }`. When zero signals exist, `total_count = 0`, both timestamps `null`.

  Return type: `Promise<{ total_count: number; first_signal_at: string | null; last_signal_at: string | null }>`. This class does NOT implement `SignalLogRepository` (parallel async API; the interface stays sync per existing pattern at `src/signalLog/dynamodb-repository.ts:34`).
- **Depends on**: TASK-005
- **Verification**: `npm run typecheck` passes.

### TASK-008: Create summary-handler-core with validation, aggregation, and trajectory paging loop

- **Files**: `src/learners/summary-handler-core.ts` (new)
- **Action**: Create
- **Details**: Framework-agnostic core matching `src/state/trajectory-handler-core.ts` style (manual validation, no Zod). Export `handleLearnerSummaryCore(params: { learner_reference: string } & Record<string, unknown>): Promise<HandlerResult<LearnerSummaryResponse | StateErrorResponse>>`.

  **Imports:**
  - `getState`, `getStateVersionRange` from `../state/store.js`
  - `buildSummary`, `buildVersions`, type `FieldSummary` from `../state/trajectory-handler-core.js` (exported in TASK-001)
  - `getRecentDecisionsByLearner` from `../decision/store.js` (TASK-002)
  - `getSignalSummary` from `../signalLog/store.js` (TASK-005)
  - `loadPolicyForContext`, `loadRoutingConfigForOrg` from `../decision/policy-loader.js`
  - `ErrorCodes` from `../shared/error-codes.js`

  **Validation (manual, matches `validateTrajectoryParams` style at `src/state/trajectory-handler-core.ts:50–141`):**
  - `learner_reference` (path param): required, non-empty, 1–256 chars → `missing_required_field` or `invalid_length`
  - `org_id` (query): required, non-empty, 1–128 chars → `org_scope_required` or `invalid_length`
  - `recent_decisions_limit`: optional, integer 1–50, default 10 → `invalid_type` on parse failure or `invalid_format` on out-of-range with `field_path: 'recent_decisions_limit'` (the spec literal cap of 50 comes from § Constraints)
  - `trajectory_fields`: optional, comma-split, trimmed, deduplicated. If present, validate each token:
    - Reject any containing `.` → 400 `invalid_format` with message `Dot-path fields are not supported in v1.1. Use top-level canonical field names.` (matches trajectory's literal)
    - Reject empty token or > 128 chars per field → 400 `invalid_format`
    - If count > 10 → 400 `invalid_format` with message `Maximum 10 fields per trajectory request. Got {count}.` (matches trajectory's literal; the 10-field cap is required by Spec Literals § Constraints `trajectory_fields max 10`)

  **Step 1 — Load current state:**
  ```typescript
  const currentState = getState(orgId, learnerRef);
  if (!currentState) {
    return {
      statusCode: 404,
      body: {
        code: ErrorCodes.STATE_NOT_FOUND,
        message: `No state found for learner '${learnerRef}' in org '${orgId}'`,
      },
    };
  }
  ```
  The 404 message is verbatim from Spec Literals § Endpoint — Response (404).

  **Step 2 — Resolve trajectory fields:** If `trajectory_fields` query param was supplied, use that list. Otherwise derive per Spec Literals § field_trajectories default:
  ```typescript
  const fieldsToTrack = explicitFields ?? Object.entries(currentState.state)
    .filter(([k, v]) => typeof v === 'number' && !k.endsWith('_delta'))
    .map(([k]) => k)
    .slice(0, 10);
  ```

  **Step 3 — Loop getStateVersionRange across all pages (per Spec Literals § field_trajectories pagination scope):**
  ```typescript
  const PAGE_SIZE = 100;
  const SAFETY_CAP_PAGES = 10; // 1000 versions max — well above v1.1 expectations
  const allStates: LearnerState[] = [];
  let cursor: number | undefined = undefined;
  for (let page = 0; page < SAFETY_CAP_PAGES; page++) {
    const { states, nextCursor } = getStateVersionRange(
      orgId, learnerRef, 1, currentState.state_version, PAGE_SIZE, cursor
    );
    allStates.push(...states);
    if (nextCursor === null) break;
    cursor = nextCursor;
  }
  ```
  If `fieldsToTrack.length > 0` and we collected versions: `const fieldTrajectoryVersions = buildVersions(allStates, fieldsToTrack);` then `const fieldTrajectories = buildSummary(fieldTrajectoryVersions, fieldsToTrack);`. If no fields to track, `fieldTrajectories = {}`.

  **Step 4 — Recent decisions:** `const decisions = getRecentDecisionsByLearner(orgId, learnerRef, recentDecisionsLimit);` Project to spec shape per Spec Literals § recent_decisions field sources — ONLY the six listed fields (decision_id, decision_type, decided_at, matched_rule_id, rationale, policy_version). The `policy_version` comes from `trace.policy_version`, `matched_rule_id` from `trace.matched_rule_id`, `rationale` from `trace.rationale`. The `state_snapshot` is excluded (PII).

  **Step 5 — Signals summary:** `const signalsSummary = getSignalSummary(orgId, learnerRef);` Pass-through to response.

  **Step 6 — Active policy (per Spec Literals § active_policy userType resolution + null behavior):**
  ```typescript
  const userType = loadRoutingConfigForOrg(orgId)?.default_policy_key ?? 'learner';
  let activePolicy: ActivePolicyResponse | null = null;
  try {
    const policy = loadPolicyForContext(orgId, userType);
    activePolicy = {
      policy_id: policy.policy_id,
      policy_key: userType,
      policy_version: policy.policy_version,
      description: policy.description,
      rule_count: policy.rules.length,
    };
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    if (code !== ErrorCodes.POLICY_NOT_FOUND) throw err;
    // else activePolicy stays null
  }
  ```
  The `policy_key` field is the resolved `userType` (pass-through, not on `PolicyDefinition`) per Spec Literals § active_policy composition.

  **Step 7 — Assemble response:**
  ```typescript
  return {
    statusCode: 200,
    body: {
      org_id: orgId,
      learner_reference: learnerRef,
      generated_at: new Date().toISOString(),
      current_state: {
        state_id: currentState.state_id,
        state_version: currentState.state_version,
        updated_at: currentState.updated_at,
        fields: currentState.state,
      },
      recent_decisions: projectedDecisions,
      recent_decisions_count: projectedDecisions.length,
      field_trajectories: fieldTrajectories,
      active_policy: activePolicy,
      signals_summary: signalsSummary,
    },
  };
  ```

  **Error envelope:** Flat `{ code, message, field_path? }` (spec § Endpoint Error Envelope note).

  **Out of scope for this task:** Lambda async parallelism. The Fastify path is purely synchronous against SQLite — no `Promise.all` is meaningful here; TASK-011 handles concurrency on the DynamoDB path.

  Export response and supporting types so OpenAPI doc and tests stay in sync:
  ```typescript
  export interface ActivePolicyResponse { policy_id: string; policy_key: string; policy_version: string; description: string; rule_count: number; }
  export interface SignalsSummary { total_count: number; first_signal_at: string | null; last_signal_at: string | null; }
  export interface RecentDecisionItem { decision_id: string; decision_type: string; decided_at: string; matched_rule_id: string | null; rationale: string; policy_version: string; }
  export interface LearnerSummaryResponse { org_id: string; learner_reference: string; generated_at: string; current_state: { state_id: string; state_version: number; updated_at: string; fields: Record<string, unknown> }; recent_decisions: RecentDecisionItem[]; recent_decisions_count: number; field_trajectories: Record<string, FieldSummary>; active_policy: ActivePolicyResponse | null; signals_summary: SignalsSummary; }
  ```
- **Depends on**: TASK-001, TASK-002, TASK-005
- **Verification**: TASK-015 unit tests pass.

### TASK-009: Create learners handler.ts and routes.ts

- **Files**: `src/learners/handler.ts` (new), `src/learners/routes.ts` (new)
- **Action**: Create
- **Details**: Thin Fastify wrapper mirroring `src/state/handler.ts` style (`src/state/handler.ts:12–37`).

  `src/learners/handler.ts`:
  ```typescript
  import type { FastifyRequest, FastifyReply } from 'fastify';
  import { handleLearnerSummaryCore } from './summary-handler-core.js';

  export async function handleLearnerSummary(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<unknown> {
    const { learner_reference } = request.params as { learner_reference: string };
    const params = { ...(request.query as Record<string, unknown>), learner_reference };
    const result = await handleLearnerSummaryCore(params);
    reply.status(result.statusCode);
    return result.body;
  }
  ```

  `src/learners/routes.ts`:
  ```typescript
  import type { FastifyInstance } from 'fastify';
  import { handleLearnerSummary } from './handler.js';

  export function registerLearnerRoutes(app: FastifyInstance): void {
    app.get('/learners/:learner_reference/summary', handleLearnerSummary);
  }
  ```

  Path-param shape (`:learner_reference`) matches Fastify convention used by feedback routes (`/decisions/:decision_id/feedback`, `src/feedback/routes.ts`). Auth is inherited from the parent `/v1/*` scope (`apiKeyPreHandler` at `src/server.ts:328`).
- **Depends on**: TASK-008
- **Verification**: TASK-014 contract tests pass against the Fastify app.

### TASK-010: Wire registerLearnerRoutes into Fastify server

- **Files**: `src/server.ts`
- **Action**: Modify
- **Details**: Import and register inside the existing `/v1` scope (`src/server.ts:326–336`):
  ```typescript
  import { registerLearnerRoutes } from './learners/routes.js';
  // ...
  server.register(async (v1) => {
    v1.addHook('preHandler', apiKeyPreHandler);
    registerIngestionRoutes(v1);
    registerStateRoutes(v1);
    registerSignalLogRoutes(v1);
    registerDecisionRoutes(v1);
    registerFeedbackRoutes(v1);
    registerPolicyInspectionRoutes(v1);
    registerWebhookRoutes(v1);
    registerLearnerRoutes(v1);
  }, { prefix: '/v1' });
  ```
  Place after `registerWebhookRoutes` for visual grouping (other read inspection routes are higher in the list, but ordering does not affect Fastify route matching for static + parametric paths in different namespaces).
- **Depends on**: TASK-009
- **Verification**: `npm run dev` starts; `GET /v1/learners/learner_001/summary?org_id=springs` (after seeding) returns the structured response (manual smoke).

### TASK-011: Wire Lambda InspectFunction routing for learner summary with parallel fetches

- **Files**: `src/lambda/inspect.ts`
- **Action**: Modify
- **Details**: Per Spec Literals § Notes — concurrency, the Lambda path MUST use `Promise.all([statePromise, recentDecisionsPromise, signalSummaryPromise, trajectorySummaryPromise])`.

  **Step 1 — Add new Dynamo repos to `init()`** (`src/lambda/inspect.ts:16–25`):
  ```typescript
  import { DynamoDbDecisionRepository } from '../decision/dynamodb-repository.js';
  import { DynamoDbSignalLogRepository } from '../signalLog/dynamodb-repository.js';
  // module-scope:
  let decisionRepo: DynamoDbDecisionRepository;
  let signalLogRepo: DynamoDbSignalLogRepository;
  // in init():
  decisionRepo = new DynamoDbDecisionRepository(process.env.DECISIONS_TABLE!);
  signalLogRepo = new DynamoDbSignalLogRepository(process.env.SIGNALS_TABLE!);
  ```
  `DECISIONS_TABLE` and `SIGNALS_TABLE` are already in `commonEnv` (`infra/lib/control-layer-stack.ts:165–168`); the only blocker is IAM (TASK-012).

  **Step 2 — Add `handleGetLearnerSummary(params, learnerRef)`** matching the style of existing Lambda handlers. Reuse validation by importing the new exports from TASK-008:
  - Parse + validate `org_id`, `recent_decisions_limit`, `trajectory_fields` inline (cannot call the Fastify handler-core because it uses synchronous SQLite `getState` / `getStateVersionRange` / `getRecentDecisionsByLearner` / `getSignalSummary` — same duplication pattern as `handleGetStateTrajectory` at `src/lambda/inspect.ts:61–175`).
  - Step 1 (state): `const currentState = await stateRepo.getState(orgId, learnerRef);` 404 if null.
  - Step 2 (resolve fields): Same default logic as TASK-008 Step 2.
  - Step 3 (kick off independent fetches in parallel — per Spec Literals § Notes — concurrency):
    ```typescript
    const collectTrajectoryStates = async () => {
      const PAGE_SIZE = 100;
      const SAFETY_CAP_PAGES = 10;
      const all: LearnerState[] = [];
      let cursor: number | undefined = undefined;
      for (let i = 0; i < SAFETY_CAP_PAGES; i++) {
        const { states, nextCursor } = await stateRepo.getStateVersionRange(orgId, learnerRef, 1, currentState.state_version, PAGE_SIZE, cursor);
        all.push(...states);
        if (nextCursor === null) break;
        cursor = nextCursor;
      }
      return all;
    };
    const [decisions, signalsSummary, trajectoryStates] = await Promise.all([
      decisionRepo.getRecentDecisionsByLearner(orgId, learnerRef, recentDecisionsLimit),
      signalLogRepo.getSignalSummary(orgId, learnerRef),
      collectTrajectoryStates(),
    ]);
    ```
  - Step 4 (compute trajectory): `const trajectoryVersions = buildVersions(trajectoryStates, fieldsToTrack);` `const fieldTrajectories = buildSummary(trajectoryVersions, fieldsToTrack);` — both imported from `'../state/trajectory-handler-core.js'` thanks to TASK-001.
  - Step 5 (active policy — synchronous, no parallel benefit since it depends only on `orgId`):
    ```typescript
    const userType = loadRoutingConfigForOrg(orgId)?.default_policy_key ?? 'learner';
    let activePolicy = null;
    try {
      const policy = loadPolicyForContext(orgId, userType);
      activePolicy = { policy_id: policy.policy_id, policy_key: userType, policy_version: policy.policy_version, description: policy.description, rule_count: policy.rules.length };
    } catch (err) {
      if ((err as Error & { code?: string }).code !== ErrorCodes.POLICY_NOT_FOUND) throw err;
    }
    ```
  - Step 6 (project decisions): same six-field projection as TASK-008.
  - Step 7 (assemble + return): Match the exact LearnerSummaryResponse shape from Spec Literals § Endpoint — Response (200).

  **Step 3 — Route dispatch** in the `handler` function (`src/lambda/inspect.ts:259–289`). Add a regex match BEFORE the generic catch-all (after the existing parametric `/v1/policies/{key}` match so it doesn't shadow):
  ```typescript
  const learnerSummaryMatch = path.match(/\/v1\/learners\/([^/]+)\/summary$/);
  if (learnerSummaryMatch) return handleGetLearnerSummary(params, learnerSummaryMatch[1]!);
  ```
  This regex precedence is the same shape as `policyDetailMatch` at `src/lambda/inspect.ts:286–287`.

  **Step 4 — Update file header doc comment** at `src/lambda/inspect.ts:1–5` to add `/v1/learners/{learner_reference}/summary` to the list.

- **Depends on**: TASK-001, TASK-004, TASK-007, TASK-008
- **Verification**: `npm run typecheck` passes; manual review confirms the regex precedence is correct (the `learner_reference` path segment is non-greedy and bounded by `[^/]+`). Functional verification deferred to deployed environment.

### TASK-012: Add CDK API Gateway resource and IAM grants for InspectFunction

- **Files**: `infra/lib/control-layer-stack.ts`
- **Action**: Modify
- **Details**: Two changes:

  **A. API Gateway resource** — insert after the `stateTrajectory` block (`infra/lib/control-layer-stack.ts:396–398`) and before the `ingestion` block (line 400):
  ```typescript
  // GET /v1/learners/{learner_reference}/summary → InspectFunction
  const learners = v1.addResource('learners');
  const learnersByRef = learners.addResource('{learner_reference}');
  const learnersSummary = learnersByRef.addResource('summary');
  learnersSummary.addMethod('GET', new apigateway.LambdaIntegration(this.inspectFunction));
  ```

  **B. IAM grants** — InspectFunction currently has `stateTable`, `ingestionLogTable`, `policiesTable` only (`infra/lib/control-layer-stack.ts:281–284`). Add:
  ```typescript
  this.signalsTable.grantReadData(this.inspectFunction);
  this.decisionsTable.grantReadData(this.inspectFunction);
  ```
  These grant read access on the SignalsTable GSI (used by TASK-007) and DecisionsTable GSI (used by TASK-004). Without these grants, the Lambda would return AWS SDK access denied at runtime.

  **C. Update InspectFunction description** at `infra/lib/control-layer-stack.ts:228, 230`:
  ```typescript
  description: 'Inspection API — GET /v1/state, /v1/state/list, /v1/state/trajectory, /v1/learners/{learner_reference}/summary, /v1/ingestion',
  ```
  And the section comment at line 223.

- **Depends on**: TASK-011
- **Verification**: `cd infra && npm run build` succeeds; `cdk synth` shows new API Gateway resource `/v1/learners/{learner_reference}/summary` and the IAM policy now includes signals/decisions table ARNs.

### TASK-013: Document GET /v1/learners/{learner_reference}/summary in OpenAPI

- **Files**: `docs/api/openapi.yaml`
- **Action**: Modify
- **Details**:
  1. **Add new tag** in the `tags:` list (`docs/api/openapi.yaml:24`):
     ```yaml
     - name: Learner
       description: Learner-centric aggregation endpoints. Combines state, decisions, trajectories, policy, and signal counts in a single read.
     ```
  2. **Add new path** after `/v1/state/trajectory` (the trajectory block sits roughly at `docs/api/openapi.yaml:518` per existing tag groupings):
     ```yaml
     /v1/learners/{learner_reference}/summary:
       parameters:
         - name: learner_reference
           in: path
           required: true
           schema:
             type: string
             minLength: 1
             maxLength: 256
       get:
         tags: [Learner]
         operationId: getLearnerSummary
         summary: Get a single aggregated summary for a learner
         description: |
           **What it does:** Returns current state, recent decisions, field trajectories, active policy, and signal-log counts for a learner in a single response. Read-only, no side effects.
           See docs/specs/learner-summary-api.md.
         parameters:
           - name: org_id
             in: query
             required: true
             schema: { type: string, minLength: 1, maxLength: 128 }
           - name: recent_decisions_limit
             in: query
             required: false
             schema: { type: integer, minimum: 1, maximum: 50, default: 10 }
           - name: trajectory_fields
             in: query
             required: false
             style: form
             explode: false
             schema: { type: string }
             description: Comma-separated list of canonical fields for trajectory summary (max 10). Defaults to all numeric fields in current state.
         responses:
           '200':
             description: Aggregated learner summary
             content:
               application/json:
                 schema:
                   $ref: '#/components/schemas/LearnerSummaryResponse'
           '400':
             description: Validation error (bad org_id, bad recent_decisions_limit, dot-path or too-many trajectory_fields)
             content:
               application/json:
                 schema:
                   $ref: '#/components/schemas/StateError'
           '401':
             description: Missing or invalid x-api-key
             content:
               application/json:
                 schema:
                   type: object
                   properties:
                     code: { type: string, enum: [api_key_required, api_key_invalid] }
                     message: { type: string }
           '404':
             description: No state found for the learner
             content:
               application/json:
                 schema:
                   $ref: '#/components/schemas/StateError'
     ```
  3. **Add `LearnerSummaryResponse`, `ActivePolicy`, `RecentDecisionItem`, `SignalsSummary` schemas** in `components.schemas` (near the existing `StateError` at line 1873). Match the field types and shapes from Spec Literals § Endpoint — Response (200). `field_trajectories` reuses the existing `TrajectoryFieldSummary` schema (`docs/api/openapi.yaml:~1888+` `FieldSummary` from trajectory) — or define an inline `additionalProperties` map of `{ first_value, latest_value, overall_direction, version_count }` for clarity.

  4. **Note on 4xx envelope:** All errors reuse the flat `StateError` schema per spec § Endpoint Error Envelope note.

- **Depends on**: TASK-010
- **Verification**: `npm run dev` then open `http://localhost:3000/docs` and confirm the new `Learner` tag and endpoint render without YAML parse errors.

### TASK-014: Add contract tests SUM-001 through SUM-008

- **Files**: `tests/contracts/learner-summary-api.test.ts` (new)
- **Action**: Create
- **Details**: Pattern from `tests/contracts/learner-trajectory-api.test.ts:1–306`. Setup:
  ```typescript
  beforeAll(async () => {
    initStateStore(':memory:');
    initDecisionStore(':memory:');
    initSignalLogStore(':memory:');
    app = Fastify({ logger: false });
    app.register(async (v1) => {
      registerLearnerRoutes(v1);
    }, { prefix: '/v1' });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    closeStateStore();
    closeDecisionStore();
    closeSignalLogStore();
  });
  beforeEach(() => {
    clearStateStore();
    clearDecisionStore();
    clearSignalLogStore();
    clearRoutingConfigCache(); // src/decision/policy-loader.ts:616
  });
  ```

  Seeding helpers (local to file):
  - `seedState(version, stateObj)` calls `saveState(createState({ state_version, state: stateObj, ... }))`
  - `seedDecision(overrides)` calls `saveDecision({ org_id: 'springs', learner_reference: 'learner_001', ..., trace: { state_id, state_version, policy_id, policy_version: '1.1.0', matched_rule_id, state_snapshot: { stabilityScore: 0.28 }, ... }, ... })`
  - `seedSignal(timestamp)` calls `appendSignal({ org_id: 'springs', signal_id, source_system, learner_reference: 'learner_001', timestamp, schema_version: 'v1', payload: {} }, acceptedAt)`

  For the `active_policy` resolution to succeed, the tests load a real policy file via `loadPolicy('default.json')` in `beforeAll` (matches `tests/contracts/inspection-api.test.ts` pattern). For SUM-006 (active policy null), point `process.cwd()` to an empty policies tree OR (simpler) use an `org_id` for which no policy file exists (e.g. `org_id: 'no_policy_org'`) — `loadPolicyForContext` will throw `policy_not_found`, the handler swallows it, and the response includes `active_policy: null`.

  Tests:
  - **SUM-001 (full summary)**: Seed 3 state versions, 2 decisions, 3 signals for `springs:learner_001`. `GET /v1/learners/learner_001/summary?org_id=springs` → 200. Assert all 5 top-level sections present: `current_state`, `recent_decisions` (length ≤ 10), `field_trajectories`, `active_policy`, `signals_summary`. Assert `generated_at` is a valid ISO 8601 string.
  - **SUM-002 (`recent_decisions_limit=2`)**: Seed 5 decisions at increasing `decided_at`. `?recent_decisions_limit=2` → `recent_decisions.length === 2`; first item is the most-recent `decided_at`.
  - **SUM-003 (learner not found)**: `learner_reference=nobody` (no state seeded) → 404 with `body.code === 'state_not_found'` and message verbatim `No state found for learner 'nobody' in org 'springs'` (per Spec Literals § Endpoint — Response (404)).
  - **SUM-004 (auth required)**: Separate `authApp` with `apiKeyPreHandler` registered, `process.env.API_KEY` set. Request without `x-api-key` via `contractHttp(authApp, { ..., auth: false })` → 401 `api_key_required`.
  - **SUM-005 (PII not leaked)**: Seed a decision whose `trace.state_snapshot` includes canonical fields only (no PII keys — engine guarantees this, but we assert at the API layer). Assert that EACH item in `body.recent_decisions` does NOT have a `state_snapshot` key. Assert that `body.current_state.fields` does not contain any forbidden key from `FORBIDDEN_KEYS` (import from `src/ingestion/forbidden-keys.js`) — `for (const key of FORBIDDEN_KEYS) expect(Object.keys(body.current_state.fields)).not.toContain(key);`.
  - **SUM-006 (active policy null)**: Use `org_id` for which no policy file exists. `active_policy: null`; assert the other 4 sections are still populated and statusCode is 200.
  - **SUM-007 (delta fields in current_state)**: Seed v1 with `stabilityScore: 0.72`, v2 with `stabilityScore: 0.55, stabilityScore_delta: -0.17, stabilityScore_direction: 'declining'`. `body.current_state.fields.stabilityScore_direction === 'declining'`. (Delta companions pass through verbatim because `current_state.fields = currentState.state`.)
  - **SUM-008 (overall_direction consistent)**: Seed v1=0.72, v2=0.55, v3=0.28 for `stabilityScore`. Assert `body.field_trajectories.stabilityScore.overall_direction === 'declining'` AND `first_value === 0.72`, `latest_value === 0.28`, `version_count === 3`.

  Use `contractHttp(app, {...})` from `tests/helpers/contract-http.ts`.

- **Depends on**: TASK-010
- **Verification**: `npm test -- tests/contracts/learner-summary-api.test.ts` — all 8 tests pass.

### TASK-015: Add unit tests for summary-handler-core

- **Files**: `tests/unit/learner-summary-handler-core.test.ts` (new)
- **Action**: Create
- **Details**: Mock `getState`, `getStateVersionRange` from `src/state/store.js`; mock `getRecentDecisionsByLearner` from `src/decision/store.js`; mock `getSignalSummary` from `src/signalLog/store.js`; mock `loadPolicyForContext`, `loadRoutingConfigForOrg` from `src/decision/policy-loader.js`. Pattern mirrors `tests/unit/trajectory-handler-core.test.ts`.

  Test cases:
  - **Validation: missing org_id** → 400 `org_scope_required`, `field_path: 'org_id'`.
  - **Validation: missing learner_reference** (path param empty) → 400 `missing_required_field`, `field_path: 'learner_reference'`.
  - **Validation: recent_decisions_limit = 0** → 400 `invalid_format`, `field_path: 'recent_decisions_limit'`.
  - **Validation: recent_decisions_limit = 51** → 400 `invalid_format`, `field_path: 'recent_decisions_limit'`.
  - **Validation: trajectory_fields with 11 fields** → 400 `invalid_format` with message `Maximum 10 fields per trajectory request. Got 11.`
  - **Validation: trajectory_fields with dot-path** → 400 `invalid_format` with message `Dot-path fields are not supported in v1.1. Use top-level canonical field names.`
  - **404: getState returns null** → 404 `state_not_found` with verbatim message `No state found for learner 'X' in org 'Y'`.
  - **Default trajectory_fields derivation**: stub state with `{ stabilityScore: 0.5, masteryScore: 0.7, stabilityScore_delta: 0.1, stabilityScore_direction: 'improving', nonNumeric: 'foo' }` → derived fields = `['stabilityScore', 'masteryScore']` (filters out delta companion and non-numeric).
  - **Default trajectory_fields cap at 10**: stub state with 15 numeric non-delta fields → derived fields length = 10.
  - **Paging loop**: stub `getStateVersionRange` to return one page with `nextCursor: 50` then a second call with `nextCursor: null` → both pages' states are concatenated and passed to `buildVersions` + `buildSummary`.
  - **Active policy null on policy_not_found**: stub `loadPolicyForContext` to throw `{ code: 'policy_not_found' }` → response has `active_policy: null`, all other sections populated, statusCode 200.
  - **Active policy rethrows other errors**: stub `loadPolicyForContext` to throw `{ code: 'invalid_policy_structure' }` → the handler should rethrow (test asserts `await expect(...).rejects.toThrow()`).
  - **Recent decisions projection**: stub repo to return decisions with full `trace` including `state_snapshot` → response `recent_decisions` items only contain the 6 listed keys (`decision_id`, `decision_type`, `decided_at`, `matched_rule_id`, `rationale`, `policy_version`). Assert `Object.keys(item).sort()` equals the sorted spec list.
  - **`recent_decisions_count` matches array length** when 3 are returned.
  - **Signals summary pass-through**: stub returns `{ total_count: 7, first_signal_at: '2026-03-01T00:00:00Z', last_signal_at: '2026-03-28T00:00:00Z' }` → response `signals_summary` equals input.
  - **`generated_at` is ISO 8601**: assert `new Date(body.generated_at).toISOString() === body.generated_at`.
- **Depends on**: TASK-008
- **Verification**: `npm test -- tests/unit/learner-summary-handler-core.test.ts` passes.

### TASK-016: Add unit tests for new repo methods

- **Files**: `tests/unit/decision-store.test.ts` (modify if exists, create if not), `tests/unit/signal-log-store.test.ts` (modify if exists, create if not)
- **Action**: Modify or Create
- **Details**:

  **Decision store tests** — append a `describe('getRecentDecisionsByLearner')` block:
  - Seed 5 decisions for one learner across 5 timestamps; query `(orgId, learnerRef, 10)` → 5 decisions in DESC `decided_at` order.
  - Query `(orgId, learnerRef, 2)` → 2 decisions, most recent first.
  - Query `(orgId, learnerRef, 100)` defensively → capped at 50 (verify by seeding 60 decisions; assert returned length === 50).
  - Org isolation: seed 3 decisions for `org_a`, 3 for `org_b` with same `learner_reference`; query for `org_a` → only `org_a` decisions.
  - Empty learner: query non-existent `learner_reference` → empty array.

  **Signal log store tests** — append a `describe('getSignalSummary')` block:
  - Seed 3 signals at `accepted_at` `2026-03-01T00:00:00Z`, `2026-03-15T00:00:00Z`, `2026-03-28T00:00:00Z` → `{ total_count: 3, first_signal_at: '2026-03-01T00:00:00Z', last_signal_at: '2026-03-28T00:00:00Z' }`.
  - Zero signals → `{ total_count: 0, first_signal_at: null, last_signal_at: null }`.
  - Org isolation: seed 2 signals for `org_a`, 2 for `org_b` with same `learner_reference`; query `org_a` → `total_count: 2`.
  - Cross-learner: seed 2 signals for `learner_001` and 1 for `learner_002` in `org_a`; query `(org_a, learner_001)` → `total_count: 2`.

  If these test files do not yet exist, create them following the `tests/unit/state-store.test.ts` pattern (init with `:memory:`, `beforeEach` clear, helper to insert rows).
- **Depends on**: TASK-003, TASK-006
- **Verification**: `npm test -- tests/unit/decision-store.test.ts tests/unit/signal-log-store.test.ts` passes.

### TASK-017: Update spec status notes to reflect dependencies completed and deviations

- **Files**: `docs/specs/learner-summary-api.md`
- **Action**: Modify
- **Details**: Two surgical edits (do this AFTER TASK-016 so spec reflects implemented reality):
  1. **§ Dependencies — Required from Other Specs table**: After implementation, update three status cells from spec'd-MUST-be-added to `**Complete**`:
     - `buildSummary` row → `**Complete** — exported from src/state/trajectory-handler-core.ts (TASK-001)`
     - `getRecentDecisionsByLearner` row → `**Complete** — src/decision/store.ts (TASK-003), src/decision/dynamodb-repository.ts (TASK-004)`
     - `getSignalSummary` row → `**Complete** — src/signalLog/store.ts (TASK-006), src/signalLog/dynamodb-repository.ts (TASK-007)`
  2. **Add a one-paragraph note** under `## Notes` recording the safety cap on the trajectory paging loop (Deviation #1 below): `Implementation note: The handler walks getStateVersionRange in pages of 100 with a hard cap of 10 iterations (1000 versions maximum). This bounds the worst-case Lambda runtime and matches v1.1 traffic expectations; revisit when median learner exceeds ~500 versions.`
- **Depends on**: TASK-016
- **Verification**: `git diff docs/specs/learner-summary-api.md` shows only the two listed edits; spec status cells match the actual implementation paths.

---

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| `src/learners/summary-handler-core.ts` | TASK-008 | Framework-agnostic validation + aggregation core |
| `src/learners/handler.ts` | TASK-009 | Thin Fastify wrapper around core |
| `src/learners/routes.ts` | TASK-009 | Registers `GET /learners/:learner_reference/summary` |
| `tests/contracts/learner-summary-api.test.ts` | TASK-014 | SUM-001 through SUM-008 contract tests |
| `tests/unit/learner-summary-handler-core.test.ts` | TASK-015 | Validation + projection + paging unit tests |
| `tests/unit/decision-store.test.ts` | TASK-016 | New `getRecentDecisionsByLearner` unit tests (file may already exist; append) |
| `tests/unit/signal-log-store.test.ts` | TASK-016 | New `getSignalSummary` unit tests (file may already exist; append) |

### To Modify

| File | Task | Changes |
|------|------|---------|
| `src/state/trajectory-handler-core.ts` | TASK-001 | Export `buildSummary`, `buildVersions`, and supporting types |
| `src/decision/repository.ts` | TASK-002 | Add `getRecentDecisionsByLearner` to interface |
| `src/decision/store.ts` | TASK-002, TASK-003 | Module-level export + `SqliteDecisionRepository.getRecentDecisionsByLearner` |
| `src/decision/dynamodb-repository.ts` | TASK-004 | Async `getRecentDecisionsByLearner` on `DynamoDbDecisionRepository` |
| `src/signalLog/repository.ts` | TASK-005 | Add `getSignalSummary` to interface |
| `src/signalLog/store.ts` | TASK-005, TASK-006 | Module-level export + `SqliteSignalLogRepository.getSignalSummary` |
| `src/signalLog/dynamodb-repository.ts` | TASK-007 | Async `getSignalSummary` on `DynamoDbSignalLogRepository` |
| `src/server.ts` | TASK-010 | Import + register `registerLearnerRoutes` |
| `src/lambda/inspect.ts` | TASK-011 | Add `handleGetLearnerSummary` with `Promise.all`; init decision + signal Dynamo repos; route dispatch |
| `infra/lib/control-layer-stack.ts` | TASK-012 | API Gateway `/v1/learners/{learner_reference}/summary` + IAM grants (signals, decisions) on InspectFunction |
| `docs/api/openapi.yaml` | TASK-013 | New `Learner` tag + path + `LearnerSummaryResponse` / `ActivePolicy` / `RecentDecisionItem` / `SignalsSummary` schemas |
| `docs/specs/learner-summary-api.md` | TASK-017 | Mark three dependency rows Complete; add safety-cap note |

---

## Requirements Traceability

> Every `- [ ]` bullet under the spec's `## Requirements` and every `Given/When/Then` under `## Acceptance Criteria` maps to at least one TASK here.

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| `GET /v1/learners/:learner_reference/summary` returns the full aggregated summary in a single response | spec § Requirements — Functional | TASK-008, TASK-009, TASK-010, TASK-014 (SUM-001) |
| `current_state.fields` contains the complete latest `LearnerState.state` object including delta companion fields | spec § Requirements — Functional | TASK-008, TASK-014 (SUM-007) |
| `recent_decisions` contains the last N decisions ordered by `decided_at` DESC; N configurable via `recent_decisions_limit` (1–50, default 10) | spec § Requirements — Functional | TASK-002, TASK-003, TASK-004, TASK-008, TASK-014 (SUM-002), TASK-016 |
| `field_trajectories` summary computed via `getStateVersionRange()` across all versions; defaults to all numeric fields when `trajectory_fields` omitted | spec § Requirements — Functional | TASK-001, TASK-008, TASK-014 (SUM-008), TASK-015 |
| `active_policy` resolves via `loadPolicyForContext(org_id, userType)` with the same chain as the decision engine | spec § Requirements — Functional | TASK-008, TASK-014 (SUM-006), TASK-015 |
| `signals_summary` returns total signal count + date range from the signal log | spec § Requirements — Functional | TASK-005, TASK-006, TASK-007, TASK-008, TASK-014 (SUM-001), TASK-016 |
| Response does not contain PII — `state_snapshot` excluded; `learner_reference` is the pseudonymous identifier | spec § Requirements — Functional | TASK-008 (decision projection), TASK-014 (SUM-005) |
| Auth: `x-api-key` required (not admin-only) | spec § Requirements — Functional | TASK-010 (inherits `apiKeyPreHandler` from `/v1/*`), TASK-014 (SUM-004) |
| Read-only — no mutations, no side effects | spec § Requirements — Functional | TASK-008 (uses only `get*` reads), TASK-009 (only `app.get` registered) |
| `generated_at` is the server timestamp when the summary was assembled | spec § Requirements — Functional | TASK-008, TASK-015 |
| If learner has no state, returns 404 `state_not_found` | spec § Requirements — Functional | TASK-008, TASK-014 (SUM-003), TASK-015 |
| If active policy cannot be resolved, `active_policy` is `null` with no error (200) | spec § Requirements — Functional | TASK-008 (try/catch on `policy_not_found`), TASK-014 (SUM-006), TASK-015 |
| Given learner_001 in springs with 3 versions and 5 decisions, summary includes all 5 sections | spec § Acceptance Criteria | TASK-014 (SUM-001) |
| Given `recent_decisions_limit=3`, exactly 3 (or fewer) decisions appear | spec § Acceptance Criteria | TASK-014 (SUM-002) |
| Given `stabilityScore_direction` is "declining" in current state, `field_trajectories.stabilityScore.overall_direction` is "declining" | spec § Acceptance Criteria | TASK-014 (SUM-007, SUM-008) |
| Given no state, 404 `state_not_found` is returned | spec § Acceptance Criteria | TASK-014 (SUM-003) |
| Given a valid call without `x-api-key`, 401 is returned | spec § Acceptance Criteria | TASK-014 (SUM-004) |
| Given `active_policy` cannot be resolved, `active_policy: null` and rest of summary still returned (200) | spec § Acceptance Criteria | TASK-014 (SUM-006) |

---

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| SUM-001 | contract | Full summary for learner with history (5 top-level sections) | TASK-014 |
| SUM-002 | contract | `recent_decisions_limit` respected (DESC order) | TASK-014 |
| SUM-003 | contract | Learner not found → 404 `state_not_found` | TASK-014 |
| SUM-004 | contract | Auth required — no `x-api-key` → 401 | TASK-014 |
| SUM-005 | contract | PII not leaked (`state_snapshot` excluded; no forbidden keys) | TASK-014 |
| SUM-006 | contract | Active policy null when no policy for org | TASK-014 |
| SUM-007 | contract | Delta fields in `current_state.fields` (direction passes through) | TASK-014 |
| SUM-008 | contract | `field_trajectories.overall_direction` consistent across versions | TASK-014 |
| UNIT-CORE-01 | unit | Validation rejects missing/invalid params with correct error codes | TASK-015 |
| UNIT-CORE-02 | unit | Default `trajectory_fields` derivation (numeric non-delta, cap 10) | TASK-015 |
| UNIT-CORE-03 | unit | Trajectory paging loop concatenates pages until `nextCursor === null` | TASK-015 |
| UNIT-CORE-04 | unit | `active_policy: null` on `policy_not_found`; rethrows other errors | TASK-015 |
| UNIT-CORE-05 | unit | `recent_decisions` projection contains only the 6 spec-listed keys | TASK-015 |
| UNIT-CORE-06 | unit | `generated_at` is a valid ISO 8601 string | TASK-015 |
| UNIT-DEC-01 | unit | `getRecentDecisionsByLearner` returns rows DESC by `decided_at` | TASK-016 |
| UNIT-DEC-02 | unit | `getRecentDecisionsByLearner` caps limit at 50 | TASK-016 |
| UNIT-DEC-03 | unit | `getRecentDecisionsByLearner` org isolation | TASK-016 |
| UNIT-SIG-01 | unit | `getSignalSummary` returns total + first/last accepted_at | TASK-016 |
| UNIT-SIG-02 | unit | `getSignalSummary` returns `{ 0, null, null }` for zero signals | TASK-016 |
| UNIT-SIG-03 | unit | `getSignalSummary` org + learner isolation | TASK-016 |

---

## Deviations from Spec

> Every divergence from spec literals must appear here.

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| § Response Shape Details — `field_trajectories` pagination scope | Loop until `nextCursor === null` with "bounded loop with safety cap" (cap not specified) | Plan pins cap to **10 pages of 100 = 1000 versions max** to bound worst-case Lambda runtime | Implementation detail — spec silent on the exact cap (note added to spec in TASK-017) |
| § Dependencies — Required from Other Specs | `InspectFunction Lambda routing` listed as Spec'd (v1.1) with no mention of IAM | Plan adds explicit `signalsTable.grantReadData` + `decisionsTable.grantReadData` grants to InspectFunction in TASK-012 (current grants are state/ingestion-log/policies only — confirmed at `infra/lib/control-layer-stack.ts:281–284`) | Implementation detail — spec silent on IAM (deployment correctness requirement, not a wire-contract change) |
| § Constraints — `trajectory_fields` max 10 | "reuses the same 10-field limit from learner-trajectory-api.md" — does not specify error code/message | Plan emits the verbatim trajectory-API error message and `invalid_format` code for consistency: `Maximum 10 fields per trajectory request. Got {count}.` | Implementation detail — spec defers to trajectory spec; plan keeps wording identical for client predictability |
| § Constraints — `recent_decisions` max 50 | "prevents large response payloads for high-frequency learners" — does not specify behavior when caller passes 51 | Plan returns 400 `invalid_format` with `field_path: 'recent_decisions_limit'` (does NOT silently cap) | Implementation detail — spec silent on rejection vs silent cap; plan picks explicit rejection for caller clarity |
| § Response Shape Details — `field_trajectories` default | "Cap at 10 fields" when deriving from `current_state.fields` | Plan applies `.slice(0, 10)` after filtering numeric non-delta fields (insertion order from `Object.entries`); plan does NOT sort or randomize | Implementation detail — spec silent on which 10 fields when more than 10 numeric non-delta keys exist; plan documents insertion order, which is stable in v8 |

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Lambda route ordering: regex `/v1/learners/{ref}/summary` could shadow or be shadowed by adjacent paths | Medium | TASK-011 places the regex match in the same precedence band as `policyDetailMatch`; reviewer verifies the regex is anchored (`$`) and uses `[^/]+` to bound the segment |
| `loadPolicyForContext` rethrows non-`policy_not_found` errors (e.g. malformed JSON) and would 500 the whole summary | Medium | TASK-008 explicitly catches ONLY `code === 'policy_not_found'`; UNIT-CORE-04 asserts other codes rethrow. Operationally, malformed policy JSON is a deploy-time defect, not a per-request error |
| DynamoDB `getSignalSummary` is 3 queries + a count-pagination loop; high-frequency learners may incur higher latency or throttling | Medium | TASK-007 uses `Select: 'COUNT'` (no item payloads); `gsi1-learner-time` is already provisioned PAY_PER_REQUEST so throttling is unlikely in pilot. Cache opportunity for v1.2 (note in spec) |
| Aggregation across all trajectory pages can be expensive for learners with many versions | Medium | Safety cap of 10 pages × 100 versions (1000 versions max) per Deviation #1; v1.1 expected median is < 50 versions per learner |
| InspectFunction's IAM did not include signals/decisions tables — easy to miss in CDK diff review | High | TASK-012 explicitly grants `grantReadData` on both tables; CDK synth diff will surface the new IAM policy entries |
| Decisions in DynamoDB use a String GSI SK (`learner_decided_at`) but our query uses `begins_with` not `BETWEEN` (no time range) | Low | TASK-004 uses `begins_with(learner_decided_at, '<learner>#')` with `ScanIndexForward: false` + `Limit: N` — same access pattern as existing `getDecisions` but without the time-range constraint |
| Spec lists `policy_id` as `springs:learner` in the example but `PolicyDefinition.policy_id` is whatever the policy file declares | Low | TASK-008 passes `policy.policy_id` through verbatim. SUM-006 already uses an org without a policy, so the exact format of `policy_id` is not asserted in tests. The spec example is illustrative; the spec literal table says "`PolicyDefinition.policy_id`" which is what the implementation returns |

---

## Verification Checklist

- [x] All tasks TASK-001 through TASK-017 completed
- [x] All contract tests SUM-001..SUM-008 pass (`npx vitest run tests/contracts/learner-summary-api.test.ts`)
- [x] All unit tests pass (`npx vitest run tests/unit/learner-summary-handler-core.test.ts tests/unit/learners/summary-handler-core.test.ts tests/unit/decision-store.test.ts tests/unit/signal-log-store.test.ts`)
- [x] Linter passes (`npm run lint`)
- [x] Type check passes (`npm run typecheck`)
- [ ] `cd infra && npm run build` passes; `cdk synth` shows new API Gateway resource and IAM grants
- [ ] Swagger UI renders `/v1/learners/{learner_reference}/summary` correctly at local `/docs` under the new `Learner` tag
- [x] Spec status updates in TASK-017 committed alongside implementation (no doc drift)
- [ ] Local manual smoke: seed 3 versions + 2 decisions + 3 signals via test harness, curl summary endpoint, verify response shape matches Spec Literals § Endpoint — Response (200)

---

## Implementation Order

```
TASK-001 (export buildSummary/buildVersions)
TASK-002 (DecisionRepository interface) ──┬── TASK-003 (SQLite impl) ──┐
                                          └── TASK-004 (DynamoDB impl) │
TASK-005 (SignalLogRepository interface) ─┬── TASK-006 (SQLite impl) ──┼── TASK-008 (handler-core)
                                          └── TASK-007 (DynamoDB impl) │       │
                                                                       │       ├── TASK-009 (Fastify wrappers)
                                                                       │       │       │
                                                                       │       │       └── TASK-010 (server wiring)
                                                                       │       │                │
                                                                       │       │                ├── TASK-014 (contract tests)
                                                                       │       │                └── TASK-013 (OpenAPI)
                                                                       │       │
                                                                       │       └── TASK-015 (handler-core unit tests)
                                                                       │
                                                                       └── TASK-011 (Lambda wiring) ── TASK-012 (CDK + IAM)

TASK-016 (repo unit tests) — runs after TASK-003 + TASK-006
TASK-017 (spec status update) — runs LAST, after all implementation
```
