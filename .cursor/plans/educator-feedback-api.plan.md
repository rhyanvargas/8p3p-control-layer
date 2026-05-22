---
name: Educator Feedback API
overview: "Implements the teacher-workflow evidence layer (`docs/specs/educator-feedback-api.md`) that backs the Decision Panel's Approve/Reject/Ignore buttons and the soft \"unreviewed decisions\" nudge. Ships four endpoints — `POST /v1/decisions/:id/feedback`, `GET /v1/decisions/:id/feedback`, `POST /v1/decisions/:id/view`, `GET /v1/decisions/feedback/pending` — behind API key + `fb_session` cookie gating for writes, with append-only SQLite + DynamoDB repositories, CDK `FeedbackTable`, OpenAPI updates, and full contract/integration test coverage (FEEDBACK-001..014). Unblocks MC-B01..B06, MC-C02, MC-C05, MC-C06 in `program-metrics`. Lifecycle stage: v1.1 pre-Month 0 / SBIR evidence layer. **Auth design:** a sibling `fb_session` cookie (Path=`/v1/decisions`) is minted alongside `dp_session` at `/dashboard/login` so the dashboard SPA can authenticate educator-feedback writes **without widening `dp_session`** — preserving `dashboard-passphrase-gate.md` isolation from unscoped `/v1/*` traffic."
todos:
  - id: TASK-001
    content: Add feedback error codes to shared/error-codes.ts
    status: completed
  - id: TASK-002
    content: Add feedback types (action enum, reason sets, records, requests) to src/shared/types.ts
    status: completed
  - id: TASK-003
    content: Define FeedbackRepository interface in src/feedback/repository.ts
    status: completed
  - id: TASK-004
    content: Implement SqliteFeedbackRepository with decision_feedback + decision_view_log tables
    status: completed
  - id: TASK-005
    content: Implement DynamoDbFeedbackRepository on a single FeedbackTable using DynamoDBDocumentClient
    status: completed
  - id: TASK-006
    content: Add feedbackSessionPreHandler that enforces fb_session cookie on write routes
    status: completed
  - id: TASK-007
    content: Build framework-agnostic handler-core (validation, dedup, pending count)
    status: completed
  - id: TASK-008
    content: Build Fastify handlers for POST/GET feedback, POST view, GET pending
    status: completed
  - id: TASK-009
    content: Register feedback routes with per-route session preHandler on writes
    status: completed
  - id: TASK-010
    content: Wire feedback store init/close + route registration into src/server.ts
    status: completed
  - id: TASK-011
    content: Mint sibling fb_session cookie (Path=/v1/decisions) at /dashboard/login and clear on logout; update dashboard-passphrase-gate spec in same PR
    status: completed
  - id: TASK-012
    content: CDK — add FeedbackTable, IAM grants, FEEDBACK_TABLE env in control-layer-stack.ts
    status: completed
  - id: TASK-013
    content: Lambda wiring — extend Query Lambda for feedback routes + FEEDBACK_TABLE (Ingest unchanged)
    status: completed
  - id: TASK-014
    content: OpenAPI — document the four new endpoints and error codes in docs/api/openapi.yaml
    status: completed
  - id: TASK-015
    content: Unit tests — SqliteFeedbackRepository (dedup window, latest_action ordering, append-only, org scope)
    status: completed
  - id: TASK-016
    content: Contract tests — auth, wrong-org, validation, cross-org pending, method-not-allowed, suggested_decision_type (FEEDBACK-003..007, 011..014)
    status: completed
  - id: TASK-017
    content: Integration tests — happy paths, dedup, pending count, latest_action (FEEDBACK-001, 002, 008, 009, 010)
    status: completed
isProject: false
---

# Educator Feedback API

**Spec**: `docs/specs/educator-feedback-api.md`

## Repo parity (`/post-impl-doc-sync`)

**Implemented:** `src/feedback/*`, `src/auth/feedback-session-preHandler.ts`, sibling `fb_session` in `src/auth/dashboard-login.ts` + `session-cookie.ts`, `FeedbackTable` + lambda wiring, OpenAPI entries, and tests under `tests/contracts/educator-feedback-api.test.ts` and `tests/integration/educator-feedback.test.ts`. `src/shared/error-codes.ts` exports the feedback codes including **`not_implemented_on_cloud`** (501 pending on DynamoDB path). Keep this section aligned with `docs/specs/educator-feedback-api.md` on every `/post-impl-doc-sync` pass.

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase. Update this section only if the spec itself changes.

### From spec § Data Model — `decision_feedback` table

| Column | Type | Description |
|--------|------|-------------|
| `feedback_id` | string (UUID) | PK |
| `decision_id` | string | FK → `decisions.decision_id` (no DB-level FK in DynamoDB; validated at write time) |
| `org_id` | string | Tenant scope (same value as `decisions.org_id`) |
| `learner_reference` | string | Denormalized from the decision for cheap filtering |
| `session_id` | string (opaque) | Derived from the `fb_session` cookie (sibling of `dp_session`, minted at `/dashboard/login`, scoped to `Path=/v1/decisions`); see `docs/specs/dashboard-passphrase-gate.md` § "Sibling cookie: `fb_session`". This is **not** an educator identity — the pilot uses shared passphrase access. |
| `action` | string | One of: `approve`, `reject`, `ignore`. Closed set. |
| `reason_category` | string or null | Optional structured reason. Closed set per action (see below). |
| `reason_text` | string or null | Optional free-text (≤ 2000 chars). Never contains PII by policy; no enforcement (educators could paste PII — mitigated by pilot training + de-identification at export time per `pilot-research-export.md`). |
| `suggested_decision_type` | string or null | Optional. Closed set: `reinforce`, `advance`, `intervene`, `pause`. **Required** when `action == "reject"` and `reason_category == "wrong_decision_type"`; **must be omitted** otherwise. |
| `created_at` | string (RFC3339) | Server-assigned |

### From spec § Data Model — `reason_category` closed set (per action)

| Action | Allowed `reason_category` values |
|--------|-----------------------------------|
| `approve` | `agree_primary`, `agree_after_review`, `agree_would_have_missed` (supports MC-C05) |
| `reject`  | `not_at_risk`, `wrong_skill`, `wrong_timing`, `wrong_decision_type`, `data_stale`, `other` |
| `ignore`  | `not_applicable_now`, `duplicate`, `deferred`, `other` |

### From spec § Data Model — `decision_view_log` table

| Column | Type | Description |
|--------|------|-------------|
| `view_id` | string (UUID) | PK |
| `decision_id` | string | FK → `decisions.decision_id` |
| `org_id` | string | Tenant scope |
| `session_id` | string (opaque) | Derived from `fb_session` (same cookie as `decision_feedback.session_id`) |
| `viewed_at` | string (RFC3339) | Server-assigned |

**Dedup:** writes for the same `(decision_id, session_id)` within 60 seconds are coalesced server-side (return 200 but do not insert).

### From spec § Data Model — Storage

- **SQLite (local / pilot host):** two tables above with `(org_id, created_at)` and `(org_id, viewed_at)` indexes.
- **DynamoDB (AWS path):** one table `FeedbackTable` with a composite key (`PK = org_id`, `SK` is either `feedback#<timestamp>#<uuid>` or `view#<timestamp>#<uuid>` — the `|` in the spec denotes disjunction, not a literal character). Follows the existing `PoliciesTable` pattern.
- **Repository pattern:** `FeedbackRepository` interface + `SqliteFeedbackRepository` + `DynamoDbFeedbackRepository`, wired via `setFeedbackRepository()` / `getFeedbackRepository()`. Mirrors `docs/specs/liu-usage-meter.md` § Implementation Notes.

### From spec § Endpoints — `POST /v1/decisions/:decision_id/feedback`

**Auth:** `x-api-key` (tenant) **AND** valid `fb_session` cookie (per `docs/specs/dashboard-passphrase-gate.md` § sibling cookie).

**Body:**

```json
{
  "action": "approve | reject | ignore",
  "reason_category": "agree_primary",
  "reason_text": "Matches what I saw in today's exit ticket",
  "suggested_decision_type": "advance"
}
```

(`suggested_decision_type` is only valid with `reject` + `wrong_decision_type`; omit otherwise.)

**Validation:**

- `action` is required and must be in the closed set
- `reason_category` is optional; if present, must be in the closed set for the provided `action`
- `reason_text` ≤ 2000 chars
- When `action == "reject"` and `reason_category == "wrong_decision_type"`, `suggested_decision_type` is **required** and must be one of the four `DECISION_TYPES` values
- When `reason_category` is not `wrong_decision_type`, `suggested_decision_type` **must be omitted** (Ajv `if`/`then` / `else` pattern)
- The referenced `decision_id` must exist **and** belong to the caller's org (else `decision_not_found`)

**Response (201):**

```json
{
  "feedback_id": "uuid",
  "decision_id": "uuid",
  "action": "approve",
  "reason_category": "agree_primary",
  "created_at": "2026-04-20T19:12:04Z"
}
```

### From spec § Endpoints — `GET /v1/decisions/:decision_id/feedback`

**Auth:** `x-api-key` (tenant). No session cookie needed.

**Response (200):**

```json
{
  "decision_id": "uuid",
  "feedback": [
    {
      "feedback_id": "uuid",
      "action": "approve",
      "reason_category": "agree_primary",
      "reason_text": "...",
      "suggested_decision_type": null,
      "created_at": "2026-04-20T19:12:04Z"
    }
  ],
  "latest_action": "approve"
}
```

Each list item includes `suggested_decision_type` (JSON `null` when absent on the stored row). `latest_action` is `null` when the feedback array is empty.

### From spec § Endpoints — `POST /v1/decisions/:decision_id/view`

**Auth:** `x-api-key` (tenant) **AND** valid `fb_session` cookie (per `docs/specs/dashboard-passphrase-gate.md` § sibling cookie).

**Body:** none.

**Response (200):**

```json
{ "recorded": true, "viewed_at": "2026-04-20T19:10:00Z" }
```

Or `{ "recorded": false, "reason": "dedup_window" }` if within the 60-second coalesce window.

### From spec § Endpoints — `GET /v1/decisions/feedback/pending`

**Auth:** `x-api-key` (tenant) **AND** valid `fb_session` cookie.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `older_than_days` | No | Only count decisions ≥ N days old. Default 3. Non-finite or negative values are treated as the default (same as omitting the param). |

**Response (200):**

```json
{
  "org_id": "org_springs",
  "pending_count": 12,
  "pending_by_type": { "intervene": 4, "pause": 2, "reinforce": 6, "advance": 0 },
  "oldest_decided_at": "2026-04-10T14:00:00Z",
  "threshold_days": 3
}
```

Computed as: `decisions WHERE decided_at ≤ NOW - older_than_days AND NOT EXISTS (feedback WHERE decision_id = decisions.decision_id)`.

### From spec § Error Codes — New

| Code | HTTP | Description |
|------|------|-------------|
| `session_required` | 401 | Missing or invalid `fb_session` cookie on a write endpoint (`dp_session` alone is insufficient — path-scoped to `/dashboard` and never reaches `/v1/*`) |
| `decision_not_found` | 404 | `decision_id` does not exist or belongs to a different org |
| `invalid_action` | 400 | `action` missing or not in `{approve, reject, ignore}`; on `POST .../feedback`, a non-object JSON body (e.g. an array) also returns this code |
| `invalid_reason_category` | 400 | `reason_category` not in the closed set for the given `action`, or `suggested_decision_type` not one of the four decision types when `reason_category` is `wrong_decision_type` |
| `suggested_decision_type_required` | 400 | `reject` + `wrong_decision_type` without `suggested_decision_type` |
| `suggested_decision_type_forbidden` | 400 | `suggested_decision_type` present when `reason_category` is not `wrong_decision_type` |
| `reason_text_too_long` | 400 | `reason_text` > 2000 chars |
| `not_implemented_on_cloud` | 501 | `GET /v1/decisions/feedback/pending` on the DynamoDB deployment path (Phase 1); response body includes zeroed counts and `code` for machine clients |

### From spec § Contract Tests

| Test ID | Type | Description | Expected |
|---------|------|-------------|----------|
| FEEDBACK-001 | integration | Happy path approve with valid session + API key | 201; row persisted; `GET .../feedback` shows it |
| FEEDBACK-002 | integration | Reject with `reason_category=not_at_risk` + `reason_text` | 201; values round-trip |
| FEEDBACK-003 | contract | No `fb_session` cookie → 401 `session_required` (dp_session alone is also rejected) | 401 |
| FEEDBACK-004 | contract | Wrong-org decision_id → 404 `decision_not_found` | 404 |
| FEEDBACK-005 | contract | Invalid action value → 400 `invalid_action` | 400 |
| FEEDBACK-006 | contract | Mismatched `reason_category` for action → 400 `invalid_reason_category` | 400 |
| FEEDBACK-007 | contract | `reason_text` > 2000 chars → 400 `reason_text_too_long` | 400 |
| FEEDBACK-008 | integration | Two views within the 60 s dedup window (e.g. 10 s apart) → second returns `{recorded:false, reason: "dedup_window"}` | 200 |
| FEEDBACK-009 | integration | 5 decisions, 2 with feedback, `GET /v1/decisions/feedback/pending?older_than_days=0` → `pending_count == 3` | 200 |
| FEEDBACK-010 | integration | Multiple feedback rows on one decision; `latest_action` reflects most recent | 200 |
| FEEDBACK-011 | contract | Cross-org isolation on `GET /v1/decisions/feedback/pending` | 200; no cross-org data |
| FEEDBACK-012 | unit | Append-only: attempted update returns `405 method_not_allowed` or no route exists | 404/405 |
| FEEDBACK-013 | contract | `reject` + `wrong_decision_type` without `suggested_decision_type` → 400 | 400 |
| FEEDBACK-014 | contract | `suggested_decision_type` with `reason_category=not_at_risk` (or any non-`wrong_decision_type`) → 400 | 400 |

### From spec § File Structure

```
src/
├── feedback/
│   ├── repository.ts              # FeedbackRepository interface
│   ├── sqlite-repository.ts       # SqliteFeedbackRepository (local dev)
│   ├── dynamodb-repository.ts     # DynamoDbFeedbackRepository (AWS)
│   ├── handler-core.ts            # Framework-agnostic logic (validation, dedup)
│   ├── handler.ts                 # Fastify route handlers
│   └── routes.ts                  # Route registration under /v1/decisions/:id/feedback, /v1/decisions/:id/view, /v1/decisions/feedback/pending
```

### From spec § Constraints (normative)

- **Append-only writes.** No `UPDATE`/`DELETE` on feedback rows. Changes-of-mind produce a new row; aggregates use `latest_action`.
- **Session cookie is the "educator" proxy.** Shared passphrase — we cannot identify which educator submitted feedback.
- **No write rate limiting beyond the dashboard passphrase gate.**

---

## Prerequisites

Before starting implementation:

- [x] {PREREQ-001} `docs/specs/dashboard-passphrase-gate.md` implemented — `SESSION_COOKIE_NAME = 'dp_session'` and `verifySession()` exist at `src/auth/session-cookie.ts`.
- [x] {PREREQ-002} `docs/specs/api-key-middleware.md` implemented — `apiKeyPreHandler` applied to `/v1/*` scope in `src/server.ts`.
- [x] {PREREQ-003} `docs/specs/decision-engine.md` implemented — `getDecisionById(orgId, decisionId)` exists in `src/decision/store.ts`.
- [x] {PREREQ-004} Repository pattern reference plans reviewed — `src/decision/repository.ts` + `src/admin/policies-dynamodb.ts` are the closest existing analogues.

---

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Add feedback error codes to shared `ErrorCodes`
- **Files**: `src/shared/error-codes.ts`
- **Action**: Modify
- **Details**: Append a new `Educator Feedback API (v1.1)` section to the `ErrorCodes` object with all **eight** string constants from the spec (§ Error Codes — New), including deployment parity:
  - `SESSION_REQUIRED = 'session_required'` (401)
  - `DECISION_NOT_FOUND = 'decision_not_found'` (404)
  - `INVALID_ACTION = 'invalid_action'` (400)
  - `INVALID_REASON_CATEGORY = 'invalid_reason_category'` (400)
  - `REASON_TEXT_TOO_LONG = 'reason_text_too_long'` (400)
  - `SUGGESTED_DECISION_TYPE_REQUIRED = 'suggested_decision_type_required'` (400)
  - `SUGGESTED_DECISION_TYPE_FORBIDDEN = 'suggested_decision_type_forbidden'` (400)
  - `NOT_IMPLEMENTED_ON_CLOUD = 'not_implemented_on_cloud'` (501 — DynamoDB pending path only)
  HTTP status mapping is applied at the handler layer; the constants themselves carry no status. Reuse — do not redefine — `API_KEY_REQUIRED`, `API_KEY_INVALID`, `ORG_SCOPE_REQUIRED` per spec § Error Codes § Existing (reuse).
- **Depends on**: none
- **Verification**: `rg "session_required|decision_not_found|invalid_action|invalid_reason_category|reason_text_too_long|suggested_decision_type_required|suggested_decision_type_forbidden|not_implemented_on_cloud" src/shared/error-codes.ts` shows all eight; `npm run typecheck` passes.

### TASK-002: Add feedback types to shared types
- **Files**: `src/shared/types.ts`
- **Action**: Modify
- **Details**: Add exported TypeScript types mirroring the spec data model (quote Spec Literals § `decision_feedback` and § `decision_view_log`):
  - `FeedbackAction = 'approve' | 'reject' | 'ignore'` (closed set, per spec § Data Model)
  - `FEEDBACK_REASON_CATEGORIES: Record<FeedbackAction, readonly string[]>` enumerating exactly the rows from Spec Literals § `reason_category` closed set — do not paraphrase the values.
  - `FeedbackRecord` with fields `feedback_id, decision_id, org_id, learner_reference, session_id, action, reason_category, reason_text, suggested_decision_type, created_at` — types exactly per Spec Literals § `decision_feedback` (nullable strings for optional fields).
  - `DecisionViewRecord` with `view_id, decision_id, org_id, session_id, viewed_at`.
  - Request/response DTOs: `SubmitFeedbackRequest` (includes optional `suggested_decision_type` per spec § Endpoints validation), `SubmitFeedbackResponse` (201 body), `GetFeedbackResponse` (200 body including `latest_action` nullable), `RecordViewResponse` (union of `{recorded: true, viewed_at}` and `{recorded: false, reason: 'dedup_window'}`), `PendingFeedbackResponse` (`org_id, pending_count, pending_by_type, oldest_decided_at|null, threshold_days`).
- **Depends on**: none
- **Verification**: `npm run typecheck` passes; other modules can `import type { FeedbackAction } from '../shared/types.js'`.

### TASK-003: Define `FeedbackRepository` interface
- **Files**: `src/feedback/repository.ts` (create)
- **Action**: Create
- **Details**: Declare the vendor-agnostic persistence contract, modeled on `src/decision/repository.ts`. Methods:
  - `saveFeedback(record: FeedbackRecord): Promise<void> | void`
  - `listFeedbackForDecision(orgId: string, decisionId: string): Promise<FeedbackRecord[]> | FeedbackRecord[]` — rows sorted `created_at ASC` per spec § Requirements FR3.
  - `recordView(record: DecisionViewRecord, dedupWindowSeconds: number): Promise<{ recorded: boolean; existing_viewed_at?: string }> | { recorded: boolean; existing_viewed_at?: string }` — dedup enforced at repository layer per Spec Literals § Data Model ("writes for the same `(decision_id, session_id)` within 60 seconds are coalesced server-side").
  - `countPendingByType(orgId: string, olderThanDays: number, nowIso: string): Promise<{ total: number; byType: Record<string, number>; oldestDecidedAt: string | null }>` — reads **both** decisions and feedback; see TASK-004 for SQL shape.
  - `close(): void`

  All methods are `Promise`-returning to accommodate the async DynamoDB adapter; the SQLite adapter may return synchronously with `await`-safe values. Prefer `async` uniformly to avoid dual signatures (matches `src/admin/policies-dynamodb.ts` style).
- **Depends on**: TASK-002
- **Verification**: File exports `FeedbackRepository`; `npm run typecheck` passes.

### TASK-004: Implement `SqliteFeedbackRepository`
- **Files**: `src/feedback/sqlite-repository.ts` (create)
- **Action**: Create
- **Details**: Implement `FeedbackRepository` backed by two `better-sqlite3` tables, matching Spec Literals § Storage — "SQLite: two tables above with `(org_id, created_at)` and `(org_id, viewed_at)` indexes".
  - Create tables if missing:
    - `decision_feedback (feedback_id TEXT PK, decision_id TEXT NOT NULL, org_id TEXT NOT NULL, learner_reference TEXT NOT NULL, session_id TEXT NOT NULL, action TEXT NOT NULL, reason_category TEXT, reason_text TEXT, suggested_decision_type TEXT, created_at TEXT NOT NULL)`
    - `decision_view_log (view_id TEXT PK, decision_id TEXT NOT NULL, org_id TEXT NOT NULL, session_id TEXT NOT NULL, viewed_at TEXT NOT NULL)`
  - Indexes: `idx_feedback_org_created ON decision_feedback(org_id, created_at)`, `idx_feedback_decision ON decision_feedback(decision_id, created_at)`, `idx_view_org_viewed ON decision_view_log(org_id, viewed_at)`, `idx_view_dedup ON decision_view_log(decision_id, session_id, viewed_at)`.
  - `saveFeedback`: append-only INSERT; no ON CONFLICT/UPDATE.
  - `listFeedbackForDecision`: `SELECT ... WHERE org_id = ? AND decision_id = ? ORDER BY created_at ASC`.
  - `recordView(record, dedupWindowSeconds = 60)`:
    1. Query the latest view for `(org_id, decision_id, session_id)`.
    2. If one exists and `viewed_at > nowIso - dedupWindowSeconds`, return `{ recorded: false, existing_viewed_at }`.
    3. Else INSERT and return `{ recorded: true }`.
  - `countPendingByType(orgId, olderThanDays, nowIso)`:
    - Uses the live decisions table (reachable via `getDecisionStoreDatabase()` from `src/decision/store.ts`) OR takes a `DecisionRepository` reference injected at construction time — pick the cleaner option: inject the already-constructed `SqliteDecisionRepository` pointer in `initFeedbackStore` (TASK-010) so the repository can issue joined SQL. SQL shape (computed cutoff = `nowIso - olderThanDays days`):
      ```sql
      SELECT d.decision_type, COUNT(*) AS c, MIN(d.decided_at) AS oldest
      FROM decisions d
      WHERE d.org_id = ? AND d.decided_at <= ?
        AND NOT EXISTS (
          SELECT 1 FROM decision_feedback f
          WHERE f.org_id = d.org_id AND f.decision_id = d.decision_id
        )
      GROUP BY d.decision_type
      ```
      Aggregate into `{ total, byType, oldestDecidedAt }`.
  - Provide `initFeedbackStore(dbPath)`, `setFeedbackRepository(repo)`, `getFeedbackRepository()`, `closeFeedbackStore()`, and a test-only `clearFeedbackStore()` — mirrors `src/decision/store.ts` module API.
- **Depends on**: TASK-002, TASK-003
- **Verification**: Unit tests in TASK-015 pass (dedup window, latest_action ordering via `listFeedbackForDecision`, pending count math).

### TASK-005: Implement `DynamoDbFeedbackRepository`
- **Files**: `src/feedback/dynamodb-repository.ts` (create)
- **Action**: Create
- **Details**: Implement `FeedbackRepository` against a single table whose key schema comes directly from Spec Literals § Storage: **`PK = org_id`, `SK = feedback|view#<timestamp>#<uuid>`** — where `feedback|view` literally means "the string `feedback` for feedback rows, the string `view` for view-log rows" — NOT the character `|`. Use `#` as the separator **inside** the SK to sort by timestamp within each row kind. SK encoding:
  - Feedback row: `SK = feedback#<created_at>#<feedback_id>`
  - View row: `SK = view#<viewed_at>#<view_id>`

  Prefer `DynamoDBDocumentClient` from `@aws-sdk/lib-dynamodb` (already in `package.json` — higher-level abstraction over `marshall/unmarshall`, removes the boilerplate seen in `src/decision/dynamodb-repository.ts`, aligns with `.cursor/rules/prefer-existing-solutions/RULE.md`).

  - `saveFeedback`: `PutCommand` with attributes `{ org_id, sk: 'feedback#<created_at>#<feedback_id>', record_kind: 'feedback', ...record }`.
  - `listFeedbackForDecision`: `QueryCommand` with `KeyConditionExpression = 'org_id = :o AND begins_with(sk, :p)'`, `ExpressionAttributeValues = { ':o': orgId, ':p': 'feedback#' }`, then `FilterExpression = 'decision_id = :d'` (decision_id isn't in the SK prefix). For read volume at pilot scale this is acceptable; a `GSI1 (org_id, decision_id#created_at)` can be added in Phase 2 if the filter becomes expensive.
  - `recordView`: since DynamoDB cannot easily perform a "last row within window" check in a single call, do a `QueryCommand` with `KeyConditionExpression = 'org_id = :o AND begins_with(sk, :p)'` where `:p = 'view#'`, then `FilterExpression = 'decision_id = :d AND session_id = :s'`, limit/scan-backward, and apply the 60-second check in code. Then `PutCommand` if not deduped. This mirrors the SQLite semantics exactly.
  - `countPendingByType`: DynamoDB path is **deferred** — in Phase 1 the endpoint is called only from the dashboard running against the SQLite pilot host; the Lambda path gets a stub that returns 501 `not_implemented_on_cloud` or reads from a materialized counter added in a later plan. Document this deferral in the Deviations table.
- **Depends on**: TASK-002, TASK-003
- **Verification**: `npm run typecheck` passes; integration smoke test in TASK-017 can swap via `setFeedbackRepository()` (in-memory stub acceptable for CI).

### TASK-006: Add `feedbackSessionPreHandler`
- **Files**: `src/auth/feedback-session-preHandler.ts` (create)
- **Action**: Create
- **Details**: A Fastify `preHandler` that enforces the **`fb_session`** cookie (sibling cookie minted alongside `dp_session` at login — see TASK-011) and extracts `session_id`. Behavior:
  1. Read `request.cookies?.[FEEDBACK_SESSION_COOKIE_NAME]` (import from `src/auth/session-cookie.ts` — the literal `FEEDBACK_SESSION_COOKIE_NAME = 'fb_session'` is added there by TASK-011; do not duplicate the string).
  2. Read `process.env.COOKIE_SECRET`. If unset / `< 32` chars, log an error and return 500 (same discipline as `dashboardGatePreHandler`). The same `COOKIE_SECRET` signs both `dp_session` and `fb_session` — no new env var.
  3. If the cookie is missing/invalid → return **401** with body `{ code: 'session_required', message: 'Dashboard session cookie required.' }` (literal code from Spec Literals § Error Codes § New).
  4. On success, attach an opaque `session_id` to `request` — use the signature hex (first 32 hex chars of the cookie's HMAC prefix) as the opaque `session_id` per spec § Data Model "From the passphrase-gate session cookie … opaque". Exposed via `request.feedbackSessionId: string` (declared via a module-augmentation `.d.ts` or ambient declaration in the same file).

  **Why a sibling cookie instead of reusing `dp_session`?** `dashboard-passphrase-gate.md` § Implementation Notes explicitly scopes `dp_session` to `Path=/dashboard` so it is **not** sent to `/v1/*` — a deliberate FERPA-safety isolation. Widening that cookie would undo the spec author's isolation choice. Minting a sibling `fb_session` scoped to `Path=/v1/decisions` preserves the isolation while enabling authenticated requests under `/v1/decisions/*` (feedback + pending routes).

  **Why not reuse `dashboardGatePreHandler`?** That preHandler **redirects** unauthenticated browser navigation to `/dashboard/login`. The feedback API must return a 401 JSON error (`session_required`). Two behaviors → two preHandlers.
- **Depends on**: TASK-001, TASK-011 (needs `FEEDBACK_SESSION_COOKIE_NAME` export)
- **Verification**: Contract test FEEDBACK-003 (TASK-016) returns 401 `session_required` when only `dp_session` is present (i.e. `fb_session` not sent because path doesn't match); a fresh login (that mints both cookies) followed by `fetch('/v1/decisions/:id/feedback', {credentials: 'include'})` returns 201.

### TASK-007: Build framework-agnostic handler-core
- **Files**: `src/feedback/handler-core.ts` (create)
- **Action**: Create
- **Details**: Pure validation + orchestration functions, no Fastify imports. Mirrors `src/decision/handler-core.ts`. Exports:

  - `handleSubmitFeedbackCore({ orgId, decisionId, sessionId, body, now })`:
    1. Validate body shape. If `action` missing or not in `{approve, reject, ignore}` → `{statusCode: 400, body: {code: 'invalid_action', ...}}` (literal from Spec Literals § Error Codes § New).
    2. If `reason_category` present and not in `FEEDBACK_REASON_CATEGORIES[action]` → `{statusCode: 400, body: {code: 'invalid_reason_category'}}`.
    3. If `reason_text` > 2000 chars → `{statusCode: 400, body: {code: 'reason_text_too_long'}}` (literal length cap from Spec Literals § `decision_feedback` — `Optional free-text (≤ 2000 chars)`).
    3b. **`suggested_decision_type` pairing (Literacy Pilot / spec § Validation):** If `action == "reject"` and `reason_category == "wrong_decision_type"` and `suggested_decision_type` is missing/empty → `{statusCode: 400, body: {code: 'suggested_decision_type_required'}}`. If `suggested_decision_type` is present and `reason_category` is not exactly `wrong_decision_type` → `{statusCode: 400, body: {code: 'suggested_decision_type_forbidden'}}`. When present, value must be one of `reinforce` / `advance` / `intervene` / `pause` (else treat as `invalid_reason_category` or a dedicated invalid code — pick one and document in OpenAPI).
    4. Look up decision via `getDecisionById(orgId, decisionId)`; if null → `{statusCode: 404, body: {code: 'decision_not_found'}}`.
    5. Build `FeedbackRecord { feedback_id: crypto.randomUUID(), decision_id, org_id: orgId, learner_reference: decision.learner_reference, session_id, action, reason_category ?? null, reason_text ?? null, suggested_decision_type ?? null, created_at: now }` (denormalize `learner_reference` from the decision row, per Spec Literals § `decision_feedback`).
    6. `await repo.saveFeedback(record)`.
    7. Return `{statusCode: 201, body: {feedback_id, decision_id, action, reason_category, created_at}}` — body shape is exactly the 201 example in Spec Literals § `POST /v1/decisions/:decision_id/feedback`.

  - `handleGetFeedbackCore({ orgId, decisionId })`:
    1. Verify decision exists (same 404 rule).
    2. `const rows = await repo.listFeedbackForDecision(orgId, decisionId)`.
    3. Compute `latest_action = rows.length === 0 ? null : rows[rows.length - 1].action` (rows are `created_at ASC`, so the last row is the newest — satisfies Spec Literals § `GET` — `latest_action is null when the feedback array is empty` and AC2 — `[reject, reject, approve] → latest_action == "approve"`).
    4. Map rows to list DTOs (include `suggested_decision_type` per stored row). Return `{statusCode: 200, body: {decision_id, feedback, latest_action}}`.

  - `handleRecordViewCore({ orgId, decisionId, sessionId, now })`:
    1. 404 if decision doesn't exist.
    2. Build `DecisionViewRecord { view_id: crypto.randomUUID(), decision_id, org_id: orgId, session_id: sessionId, viewed_at: now }`.
    3. `const { recorded, existing_viewed_at } = await repo.recordView(record, 60)` (60s literal from Spec Literals § Data Model — "writes for the same `(decision_id, session_id)` within 60 seconds are coalesced").
    4. Return either `{statusCode: 200, body: {recorded: true, viewed_at: now}}` or `{statusCode: 200, body: {recorded: false, reason: 'dedup_window'}}` — strings match Spec Literals § `POST view` response.

  - `handleGetPendingCore({ orgId, olderThanDays, now })`:
    1. Default `olderThanDays = 3` if missing/invalid (literal default from Spec Literals § `GET /v1/decisions/feedback/pending` query params).
    2. `const { total, byType, oldestDecidedAt } = await repo.countPendingByType(orgId, olderThanDays, now)`.
    3. Return `{statusCode: 200, body: {org_id: orgId, pending_count: total, pending_by_type: byType, oldest_decided_at: oldestDecidedAt, threshold_days: olderThanDays}}` — keys match Spec Literals § `GET /v1/decisions/feedback/pending` response exactly.
- **Depends on**: TASK-003, TASK-004, TASK-005
- **Verification**: Unit tests (TASK-015) directly invoke handler-core functions with an in-memory fake repo; all four paths produce the literal response shapes.

### TASK-008: Build Fastify handlers
- **Files**: `src/feedback/handler.ts` (create)
- **Action**: Create
- **Details**: Thin Fastify adapters over handler-core. Each handler:
  - Reads `orgId` from `process.env.API_KEY_ORG_ID` when the tenant API key middleware has overridden it (same discipline as existing routes) — else from `(request.body as any).org_id` or `request.query.org_id`.
  - Reads `decision_id` from `request.params`.
  - For write handlers, reads `sessionId` from `request.feedbackSessionId` (populated by TASK-006's preHandler).
  - Calls handler-core with `now = new Date().toISOString()`.
  - Sends `reply.status(result.statusCode).send(result.body)`.
  - Logs structured error body for 400/401/404 responses via `request.log.warn`.
- **Depends on**: TASK-006, TASK-007
- **Verification**: Integration tests in TASK-017 exercise each route through a full `app.inject({...})` request cycle.

### TASK-009: Register feedback routes
- **Files**: `src/feedback/routes.ts` (create)
- **Action**: Create
- **Details**: Export `registerFeedbackRoutes(app: FastifyInstance): void`. Register (paths relative to the `/v1` scope where it will be mounted in TASK-010):
  - `app.post('/decisions/:decision_id/feedback', { preHandler: feedbackSessionPreHandler }, handleSubmitFeedback)`
  - `app.get('/decisions/:decision_id/feedback', handleGetFeedback)` — no session preHandler; API-key-only read per Spec Literals § `GET /v1/decisions/:decision_id/feedback` (`Auth: x-api-key (tenant). No session cookie needed`).
  - `app.post('/decisions/:decision_id/view', { preHandler: feedbackSessionPreHandler }, handleRecordView)`
  - `app.get('/decisions/feedback/pending', { preHandler: feedbackSessionPreHandler }, handleGetPending)`

  Do **not** register any `PUT`/`PATCH`/`DELETE` on feedback rows — Spec Literals § Constraints: "Append-only writes. No `UPDATE`/`DELETE` on feedback rows." Fastify returns the default 404 for unregistered methods, which satisfies FEEDBACK-012 (`404/405`).
- **Depends on**: TASK-006, TASK-008
- **Verification**: `rg "POST.*feedback|POST.*view|GET.*pending" src/feedback/routes.ts` shows exactly the four registrations; `PUT/PATCH/DELETE` not present.

### TASK-010: Wire feedback store + routes into server
- **Files**: `src/server.ts`
- **Action**: Modify
- **Details**:
  - Import `initFeedbackStore, closeFeedbackStore` from `./feedback/sqlite-repository.js` and `registerFeedbackRoutes` from `./feedback/routes.js`.
  - Add `FEEDBACK_DB_PATH` env (default `./data/feedback.db`) — ensure data dir exists like the other stores.
  - Call `initFeedbackStore(feedbackDbPath)` after `initDecisionStore(...)` so the pending-count path can read `decisions.db` via the already-constructed `SqliteDecisionRepository` (TASK-004 relies on this ordering).
  - In the existing `server.register(async (v1) => { ... }, { prefix: '/v1' })` block, add `registerFeedbackRoutes(v1)` after `registerDecisionRoutes(v1)`.
  - In the `server.addHook('onClose', ...)` cleanup, call `closeFeedbackStore()` **before** `closeDecisionStore()` (reverse init order).
- **Depends on**: TASK-004, TASK-009
- **Verification**: `npm run build && curl localhost:3000/` lists `/v1/decisions/:id/feedback` under endpoints (optional but useful); `POST /v1/decisions/:id/feedback` returns 401 `session_required` without a session cookie.

### TASK-011: Mint sibling `fb_session` cookie at `/dashboard/login`
- **Files**: `src/auth/session-cookie.ts`, `src/auth/dashboard-login.ts`, `docs/specs/dashboard-passphrase-gate.md`
- **Action**: Modify
- **Details**: **`dp_session` is NOT changed** — its `Path=/dashboard` scope is preserved per `dashboard-passphrase-gate.md` § Implementation Notes (explicit FERPA-safety isolation from `/v1/*`). Instead, add a sibling cookie.

  **In `src/auth/session-cookie.ts`:**
  - Add export `FEEDBACK_SESSION_COOKIE_NAME = 'fb_session'`.
  - Add export `buildFeedbackCookieAttributes({ maxAgeSeconds, secure })` returning `{ path: '/v1/decisions', httpOnly: true, secure, sameSite: 'strict', maxAge: maxAgeSeconds }`. Same shape as `buildSetCookieAttributes` but with `path: '/v1/decisions'`.
  - Signing reuses the existing `signSession(secret, maxAgeSeconds)` — same `COOKIE_SECRET`, same HMAC-SHA256, same wire format.

  **In `src/auth/dashboard-login.ts`:**
  - On successful passphrase match (existing `reply.setCookie(SESSION_COOKIE_NAME, ...)` call), add a second `reply.setCookie(FEEDBACK_SESSION_COOKIE_NAME, signed, buildFeedbackCookieAttributes({ maxAgeSeconds, secure }))` using the **same `signed` value** (both cookies carry identical signatures so they expire together and `session_id` derivation stays stable across both).
  - On `GET /dashboard/logout`, add a matching `reply.clearCookie(FEEDBACK_SESSION_COOKIE_NAME, { path: '/v1/decisions' })` call next to the existing `dp_session` clear.

  `HttpOnly`, `Secure`, `SameSite=strict` apply to both cookies — CSRF and script exfiltration protections unchanged. `dp_session` continues not to be sent on `/v1/*` requests (isolation preserved).

  **In `docs/specs/dashboard-passphrase-gate.md`:** add a new § "Sibling cookie: `fb_session`" documenting that the login flow issues a second cookie scoped to `Path=/v1/decisions`, with the same signature, TTL, and attributes; cross-reference `educator-feedback-api.md`. Do **not** modify the `dp_session` cookie specification table.
- **Depends on**: none (parallelizable with TASK-001..010, but must land **before** TASK-006's preHandler is exercised by integration tests)
- **Verification**: `rg "FEEDBACK_SESSION_COOKIE_NAME" src/auth/` shows the new constant in `session-cookie.ts` and both set/clear sites in `dashboard-login.ts`. Existing `tests/integration/dashboard-gate.test.ts` still passes unchanged (dp_session scope and gate behavior are untouched). **GATE-002** asserts both cookies on login (`Path=/dashboard` + `Path=/v1/decisions`); **GATE-011** clears both on logout. `tests/integration/educator-feedback.test.ts` logs in, then `POST /v1/decisions/:id/feedback` with `fb_session` succeeds; `/dashboard/` works with `dp_session` only; `/v1/signals` receives neither cookie (isolation preserved).

### TASK-012: CDK — `FeedbackTable` + IAM + env
- **Files**: `infra/lib/control-layer-stack.ts`
- **Action**: Modify
- **Details**:
  - Add a new `dynamodb.Table` named `FeedbackTable` following the existing `PoliciesTable` block pattern:
    ```ts
    this.feedbackTable = new dynamodb.Table(this, 'FeedbackTable', {
      tableName: `control-layer-feedback-${stage}`,
      partitionKey: { name: 'org_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    ```
    Key schema literals come from Spec Literals § Storage — `PK = org_id`, `SK = feedback|view#<timestamp>#<uuid>` (encoded in TASK-005).
  - Grant `readWriteData` on `feedbackTable` to `queryFunction` (hosts GET feedback + POST feedback + POST view + GET pending) and to `ingestFunction` only if the ingest Lambda ends up co-hosting Feedback routes — in the current Lambda layout, feedback routes go to `queryFunction` (API-key + dashboard scope, reads + writes); revisit if the Lambda sharding changes.
  - Inject `FEEDBACK_TABLE: this.feedbackTable.tableName` into the relevant Lambda environment.
  - API Gateway routes under `/v1/*` already forward to the query function via the existing wildcard proxy — no per-route Gateway wiring is required.
- **Depends on**: TASK-005
- **Verification**: `npm run cdk:synth` succeeds; `npm run cdk:diff` shows the new `FeedbackTable` resource and updated IAM policies.

### TASK-013: Lambda wiring
- **Files**: `src/lambda/*.ts` (exact filenames per TASK-010 audit; likely `src/lambda/query.ts` and/or the handler bootstrap)
- **Action**: Modify
- **Details**: In the Lambda bootstrap that registers `/v1/*` routes, call `setFeedbackRepository(new DynamoDbFeedbackRepository(process.env.FEEDBACK_TABLE!))` before the server starts. Use the factory pattern already used for `DynamoDbDecisionRepository` (see `src/decision/dynamodb-repository.ts` + the Lambda wiring that injects it).

  If `initFeedbackStore(...)` is still being called unconditionally in `src/server.ts`, guard it with `if (!process.env.FEEDBACK_TABLE)` so the Lambda path skips the SQLite adapter.
- **Depends on**: TASK-005, TASK-010, TASK-012
- **Verification**: `AWS_LAMBDA_FUNCTION_NAME=... node dist/lambda/query.js` (or the equivalent invocation harness) starts cleanly; the `queryFunction` CloudWatch logs show `DynamoDbFeedbackRepository registered` on cold start.

### TASK-014: OpenAPI updates
- **Files**: `docs/api/openapi.yaml`
- **Action**: Modify
- **Details**: Document all four endpoints with request/response schemas matching Spec Literals verbatim. Key points:
  - Security: `x-api-key` for all four; add a new `feedbackSessionCookie` security scheme (cookie auth, `name: fb_session`) referenced on the three write/soft-prompt endpoints (`POST feedback`, `POST view`, `GET pending`). `GET /v1/decisions/:id/feedback` lists only `x-api-key`.
  - Responses: include `201` for `POST feedback`, `200` for `GET feedback` + `POST view` + `GET pending`, plus all eight feedback error codes from Spec Literals § Error Codes § New (incl. `suggested_decision_type_*` and `501 not_implemented_on_cloud` on pending).
  - Schemas: `SubmitFeedbackRequest`, `SubmitFeedbackResponse`, `GetFeedbackResponse` (include `latest_action` with `type: string, nullable: true, enum: [approve, reject, ignore]`), `RecordViewResponse` (oneOf the two variants), `PendingFeedbackResponse`.
- **Depends on**: TASK-001, TASK-002
- **Verification**: `npm run validate:api` (redocly lint) passes; `npm run validate:contracts` passes.

### TASK-015: Unit tests — `SqliteFeedbackRepository`
- **Files**: `tests/unit/feedback-store.test.ts` (create)
- **Action**: Create
- **Details**: Use an in-memory SQLite DB (`':memory:'`). Cover:
  - `saveFeedback` then `listFeedbackForDecision` returns the row with all fields round-tripped.
  - Sort order: three inserts with increasing `created_at` → list returns them in ASC order.
  - `recordView` dedup: two calls within 10s → second returns `{recorded: false}`; only one row persisted (FEEDBACK-008 unit-layer).
  - `recordView` past window: call at t=0, then t=65s → second returns `{recorded: true}`; two rows persisted.
  - `countPendingByType`: seed 5 decisions in `org_A`, 3 in `org_B`, leave feedback on 2 of `org_A`'s — `countPendingByType('org_A', 0, now)` returns `total=3, byType` summing to 3, `oldestDecidedAt` equals the earliest unreviewed `decided_at` (AC5 + FEEDBACK-009 unit-layer).
  - Append-only: no public API on the repository allows UPDATE/DELETE (no `updateFeedback`, no `deleteFeedback`).
- **Depends on**: TASK-004
- **Verification**: `npm test -- tests/unit/feedback-store.test.ts` passes.

### TASK-016: Contract tests
- **Files**: `tests/contracts/educator-feedback-api.test.ts` (create)
- **Action**: Create
- **Details**: Fastify `app.inject()` tests. Cover contract tests from spec § Contract Tests:
  - **FEEDBACK-003**: `POST /v1/decisions/:id/feedback` with valid API key but **no** `fb_session` cookie → status `401`, body `code === 'session_required'`. Separately assert that sending only a `dp_session` cookie (e.g. via a hand-crafted header) also returns `401`, proving the routes gate specifically on `fb_session`.
  - **FEEDBACK-004**: Submit feedback for a `decision_id` that exists only in `org_B` while authenticated as `org_A` → status `404`, body `code === 'decision_not_found'`.
  - **FEEDBACK-005**: Body `{ action: 'maybe' }` → `400` `invalid_action`.
  - **FEEDBACK-006**: Body `{ action: 'approve', reason_category: 'not_at_risk' }` (valid for `reject`, not `approve`) → `400` `invalid_reason_category`.
  - **FEEDBACK-007**: `reason_text` of length 2001 → `400` `reason_text_too_long`.
  - **FEEDBACK-011**: Seed decisions + feedback in `org_A` and `org_B`; `GET /v1/decisions/feedback/pending` with `org_B`'s key returns counts reflecting only `org_B`.
  - **FEEDBACK-012**: `PUT /v1/decisions/:id/feedback` and `DELETE /v1/decisions/:id/feedback/:feedback_id` → status `404` (Fastify default for unregistered route). Assert neither route is in `app.printRoutes()` output.
  - **FEEDBACK-013**: Body `{ action: 'reject', reason_category: 'wrong_decision_type' }` (no `suggested_decision_type`) → `400`, `code === 'suggested_decision_type_required'`.
  - **FEEDBACK-014**: Body `{ action: 'reject', reason_category: 'not_at_risk', suggested_decision_type: 'advance' }` → `400`, `code === 'suggested_decision_type_forbidden'`.
- **Depends on**: TASK-010
- **Verification**: `npm run test:contracts` passes; coverage for all eight feedback error codes (incl. `suggested_decision_type_*`).

### TASK-017: Integration tests
- **Files**: `tests/integration/educator-feedback.test.ts` (create)
- **Action**: Create
- **Details**: Boot the full Fastify app (same harness as `tests/integration/dashboard-gate.test.ts`), seed a decision, then exercise end-to-end:
  - **FEEDBACK-001**: POST a valid login → receive **both** `dp_session` (Path=/dashboard) and `fb_session` (Path=/v1/decisions) cookies. POST `{action: 'approve'}` with API key + `fb_session` → 201. Follow with `GET /v1/decisions/:id/feedback` → row present; `latest_action === 'approve'`. Additionally assert that `/v1/signals` (a non-feedback `/v1` endpoint) does not receive `fb_session` or `dp_session` (cookie isolation preserved).
  - **FEEDBACK-002**: POST `{action: 'reject', reason_category: 'not_at_risk', reason_text: 'teacher note'}` → 201; GET → reason fields round-trip.
  - **FEEDBACK-008**: POST `.../view` at t=0 → `{recorded: true}`. POST again at t=10s (mock `Date.now`) → `{recorded: false, reason: 'dedup_window'}`. Direct DB assertion: only one `decision_view_log` row.
  - **FEEDBACK-009**: Seed 5 decisions for `org_springs`; feedback on 2. `GET /v1/decisions/feedback/pending?older_than_days=0` → `pending_count === 3`.
  - **FEEDBACK-010**: Submit three feedback rows in order `reject, reject, approve`. `GET` → `feedback.length === 3`; `latest_action === 'approve'`.
- **Depends on**: TASK-010, TASK-011
- **Verification**: `npm run test:integration` passes; all five FEEDBACK-00x IDs asserted in test names.

---

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| `src/feedback/repository.ts` | TASK-003 | `FeedbackRepository` interface |
| `src/feedback/sqlite-repository.ts` | TASK-004 | SQLite adapter + module init/close API |
| `src/feedback/dynamodb-repository.ts` | TASK-005 | DynamoDB adapter using DocumentClient |
| `src/auth/feedback-session-preHandler.ts` | TASK-006 | Returns 401 `session_required` JSON (vs. gate's 302 redirect) |
| `src/fastify-augmentation.d.ts` | TASK-006 | `FastifyRequest.feedbackSessionId` module augmentation |
| `src/feedback/handler-core.ts` | TASK-007 | Framework-agnostic validation + orchestration |
| `src/feedback/handler.ts` | TASK-008 | Fastify adapter handlers |
| `src/feedback/routes.ts` | TASK-009 | Route registration for all four endpoints |
| `tests/unit/feedback-store.test.ts` | TASK-015 | Repository unit tests |
| `tests/contracts/educator-feedback-api.test.ts` | TASK-016 | Contract tests FEEDBACK-003..007, 011..014, 012 |
| `tests/integration/educator-feedback.test.ts` | TASK-017 | Integration tests FEEDBACK-001, 002, 008, 009, 010 |

### To Modify

| File | Task | Changes |
|------|------|---------|
| `src/shared/error-codes.ts` | TASK-001 | Add feedback `ErrorCodes` including `NOT_IMPLEMENTED_ON_CLOUD` |
| `src/shared/types.ts` | TASK-002 | Add `FeedbackAction`, `FEEDBACK_REASON_CATEGORIES`, `FeedbackRecord`, `DecisionViewRecord`, request/response DTOs |
| `src/server.ts` | TASK-010 | Init/close feedback store; register routes under `/v1` scope |
| `src/auth/session-cookie.ts` | TASK-011 | Add `FEEDBACK_SESSION_COOKIE_NAME = 'fb_session'` + `buildFeedbackCookieAttributes` (path=`/v1/decisions`); `dp_session` attributes unchanged |
| `src/auth/dashboard-login.ts` | TASK-011 | Set + clear sibling `fb_session` cookie alongside existing `dp_session` on login/logout |
| `docs/specs/dashboard-passphrase-gate.md` | TASK-011 | Add § "Sibling cookie: `fb_session`" documenting the second cookie; do not modify `dp_session` specification table |
| `infra/lib/control-layer-stack.ts` | TASK-012 | Add `FeedbackTable` + IAM grants + `FEEDBACK_TABLE` env |
| `src/lambda/*.ts` | TASK-013 | Inject `DynamoDbFeedbackRepository` via `setFeedbackRepository()` |
| `docs/api/openapi.yaml` | TASK-014 | Document four endpoints + new feedback error codes (incl. `not_implemented_on_cloud`) |

---

## Requirements Traceability

> Every `- [ ]` bullet under the spec's `## Requirements` and every `Given/When/Then` under `## Acceptance Criteria` maps to at least one TASK here.

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| `POST /v1/decisions/:id/feedback` persists a row to `decision_feedback` and returns the created row | spec § Requirements § Functional (FR1) | TASK-004, TASK-007, TASK-008, TASK-017 |
| `POST /v1/decisions/:id/view` is idempotent within 60 s per `(decision_id, session_id)` | spec § Requirements § Functional (FR2) | TASK-004, TASK-007, TASK-015, TASK-017 |
| `GET /v1/decisions/:id/feedback` returns all feedback rows for that decision in `created_at ASC` order | spec § Requirements § Functional (FR3) | TASK-004, TASK-007, TASK-015 |
| `GET /v1/decisions/feedback/pending` returns counts that match a direct `SELECT` on the data | spec § Requirements § Functional (FR4) | TASK-004, TASK-007, TASK-015, TASK-017 |
| Feedback and views are strictly org-scoped — a caller cannot read or write feedback for another org's decision | spec § Requirements § Functional (FR5) | TASK-004, TASK-007, TASK-016 |
| Session cookie is required for writes; API-key-only requests to write endpoints return 401 `session_required` | spec § Requirements § Functional (FR6) | TASK-006, TASK-009, TASK-016 |
| Given a decision exists for `org_springs`, when a gated educator submits `{action: "approve"}`, then a row is persisted and `GET /v1/decisions/:id/feedback` includes it | spec § Acceptance Criteria (AC1) | TASK-017 (FEEDBACK-001) |
| Given 3 feedback rows `[reject, reject, approve]`, then `latest_action == "approve"` | spec § Acceptance Criteria (AC2) | TASK-007, TASK-017 (FEEDBACK-010) |
| Given an educator calls `POST .../view` twice within 10 s, then second returns `{recorded:false, reason:"dedup_window"}` and only one row exists | spec § Acceptance Criteria (AC3) | TASK-004, TASK-015, TASK-017 (FEEDBACK-008) |
| Given API-key-only request (no session cookie) to `POST .../feedback`, response is 401 `session_required` | spec § Acceptance Criteria (AC4) | TASK-006, TASK-016 (FEEDBACK-003) |
| Given 5 decisions in `org_A` and 3 in `org_B`, `GET /v1/decisions/feedback/pending` with `org_A`'s key counts only `org_A` | spec § Acceptance Criteria (AC5) | TASK-004, TASK-016 (FEEDBACK-011) |
| Append-only writes; no `UPDATE`/`DELETE` on feedback rows | spec § Constraints | TASK-004, TASK-009, TASK-016 (FEEDBACK-012) |
| No PII validation on `reason_text` | spec § Constraints | TASK: DEFERRED — explicit non-requirement; no-op |
| No write rate limiting beyond dashboard passphrase gate | spec § Constraints | TASK: DEFERRED — explicit non-requirement; no-op |
| Session cookie is the "educator" proxy (shared passphrase) | spec § Constraints | TASK-006 (session_id = HMAC prefix, opaque) |

---

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| FEEDBACK-001 | integration | Happy path approve with valid session + API key; 201; row persisted; GET shows it | TASK-017 |
| FEEDBACK-002 | integration | Reject with `reason_category=not_at_risk` + `reason_text`; values round-trip | TASK-017 |
| FEEDBACK-003 | contract | No session cookie → 401 `session_required` | TASK-016 |
| FEEDBACK-004 | contract | Wrong-org `decision_id` → 404 `decision_not_found` | TASK-016 |
| FEEDBACK-005 | contract | Invalid action value → 400 `invalid_action` | TASK-016 |
| FEEDBACK-006 | contract | Mismatched `reason_category` for action → 400 `invalid_reason_category` | TASK-016 |
| FEEDBACK-007 | contract | `reason_text` > 2000 chars → 400 `reason_text_too_long` | TASK-016 |
| FEEDBACK-008 | integration | Two views within the 60 s dedup window (e.g. 10 s apart) → second returns `{recorded:false, reason:"dedup_window"}`; one log row | TASK-017 (also unit-level in TASK-015) |
| FEEDBACK-013 | contract | `reject` + `wrong_decision_type` without `suggested_decision_type` → 400 `suggested_decision_type_required` | TASK-016 |
| FEEDBACK-014 | contract | `suggested_decision_type` present with `reason_category=not_at_risk` → 400 `suggested_decision_type_forbidden` | TASK-016 |
| FEEDBACK-009 | integration | 5 decisions, 2 with feedback, `GET /v1/decisions/feedback/pending?older_than_days=0` → `pending_count == 3` | TASK-017 (also unit-level in TASK-015) |
| FEEDBACK-010 | integration | Multiple feedback rows; `latest_action` reflects most recent | TASK-017 |
| FEEDBACK-011 | contract | Cross-org isolation on `GET /v1/decisions/feedback/pending` | TASK-016 |
| FEEDBACK-012 | unit/contract | Append-only: `PUT`/`DELETE` on feedback → 404/405 | TASK-016 |
| FEEDBACK-013 | contract | `reject` + `wrong_decision_type` without `suggested_decision_type` → 400 `suggested_decision_type_required` | TASK-016 |
| FEEDBACK-014 | contract | `suggested_decision_type` present with `reason_category=not_at_risk` → 400 `suggested_decision_type_forbidden` | TASK-016 |

---

## Deviations from Spec

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| `dashboard-passphrase-gate.md` § Implementation Notes | `dp_session` is deliberately scoped to `Path=/dashboard` and not sent to `/v1/*` (FERPA isolation) | Plan **preserves** that isolation: `dp_session` is untouched. Instead, a **sibling `fb_session` cookie** (`Path=/v1/decisions`, same HMAC, same TTL, same `HttpOnly`/`Secure`/`SameSite=strict`) is minted at `/dashboard/login` and cleared on logout. | **Additive spec update** — `dashboard-passphrase-gate.md` gains a new § "Sibling cookie: `fb_session`" in the same PR. The original `dp_session` cookie specification table is NOT modified. This resolves the original structural conflict flagged during `/review` on 2026-04-23 (Option A per product decision). |
| Spec § Data Model § DynamoDB `SK = feedback\|view#<timestamp>#<uuid>` | `\|` is disjunction, not a literal delimiter | SK encoded as `feedback#<ts>#<uuid>` OR `view#<ts>#<uuid>` | **Resolved in spec 2026-04-23** — `educator-feedback-api.md` § Data Model now explicitly states the kind-prefix pattern and clarifies the disjunction. Plan literals match spec exactly. |
| Spec § Endpoints § `GET /v1/decisions/feedback/pending` | Endpoint works in all deployments | Phase 1 DynamoDB path returns `501 not_implemented_on_cloud` for `countPendingByType` (SQLite host only) | **Resolved in spec 2026-04-23** — `educator-feedback-api.md` § "Deployment Parity (Phase 1)" documents the 501, the Phase-1 mitigation (Decision Panel consumes pending only via SQLite; AWS dashboards read from export bundle), and the follow-up (`feedback-pending-counter.plan.md`, not blocking Wave 3). |
| OpenAPI updates | Not explicitly required in spec | Plan adds them (TASK-014) | **Implementation detail — spec silent** — OpenAPI is a repo convention, not a spec requirement |
| Plan § TASK-011 (2026-04-23) | `fb_session` Path=`/v1/feedback` cannot reach `POST /v1/decisions/:id/feedback` (browser cookie path rules) | `fb_session` Path=`/v1/decisions`; pending moved to `GET /v1/decisions/feedback/pending` | **Resolved 2026-05-14** — `dashboard-passphrase-gate.md` + `educator-feedback-api.md` updated in this PR; isolation test still ensures `/v1/signals` does not receive `dp_session`. |

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Sibling `fb_session` cookie doubles the login-flow surface area (two set-cookie headers to keep in sync on TTL/secret rotation) | Low | Both cookies share `signSession()` + `COOKIE_SECRET` + `maxAgeSeconds`; GATE-002 / GATE-011 integration tests assert both cookies are set and cleared atomically with identical signatures. |
| `countPendingByType` SQL joins against `decisions` table but `SqliteFeedbackRepository` and `SqliteDecisionRepository` are separate DB files | Medium | Accept `SqliteDecisionRepository` (or its DB handle) as a constructor argument so both tables are reachable from one connection, OR `ATTACH DATABASE` at init time. Pick one at TASK-004 kickoff. |
| DynamoDB `Query` with `begins_with(sk, 'feedback#')` + `FilterExpression decision_id = ...` scans all feedback rows for an org | Low at pilot scale | Add a `GSI1 (org_id, decision_id#created_at)` in a Phase 2 follow-up if latency exceeds p95 50ms. Note in plan, not built now. |
| `session_id` derived from HMAC prefix is **not** stable across cookie rotations | Low | Shared-passphrase pilot doesn't rotate within a session; documented as Phase II gap per spec § Constraints |
| Educators paste PII into `reason_text` | Medium (FERPA) | Spec § Constraints explicitly out-of-scope; de-identification happens in `pilot-research-export.md`. Plan enforces `≤ 2000 chars` only. |

---

## Verification Checklist

- [ ] All tasks completed
- [ ] `npm test` passes (unit + contracts + integration)
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run validate:api` (redocly) passes
- [ ] `npm run validate:contracts` passes
- [ ] `npm run cdk:synth` passes with `FeedbackTable` present
- [ ] All 14 `FEEDBACK-0xx` test IDs appear as named cases in the test suite
- [ ] Manual check: `POST /v1/decisions/:id/feedback` without `fb_session` cookie returns `{ code: "session_required" }` JSON, not a 302 redirect
- [ ] Manual check: `/dashboard/login` response contains two Set-Cookie headers — `dp_session; Path=/dashboard` and `fb_session; Path=/v1/decisions` — and `dp_session` is NOT sent when fetching `/v1/signals` (cookie isolation preserved)
- [ ] Manual check: `latest_action` reflects most recent row on a decision with 3+ feedback entries
- [ ] Manual check: `GET /v1/decisions/feedback/pending` numbers match a direct SQL count on `decisions.db`
- [ ] Deviations from spec § documented and resolved

---

## Implementation Order

```
TASK-001  ─┐
TASK-002  ─┼─► TASK-003 ─► TASK-004 ─┬─► TASK-007 ─► TASK-008 ─► TASK-009 ─► TASK-010 ─► TASK-016
           │                TASK-005 ─┤                                                    TASK-017
           └─► TASK-011                TASK-006 ─────────────────────────────┘
TASK-005  ─► TASK-012 ─► TASK-013
TASK-001/002 ─► TASK-014
TASK-004 ─► TASK-015
```

Parallelizable clusters:
- `TASK-001` + `TASK-002` + `TASK-011` can land in one PR-opening commit (no dependencies).
- `TASK-012` + `TASK-014` can proceed in parallel with the `TASK-003..010` core build.
- `TASK-015` can begin as soon as `TASK-004` compiles, before `TASK-007..010` land.
