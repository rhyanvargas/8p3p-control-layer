# Educator Feedback API

> Captures educator Approve / Reject / Ignore actions on decisions surfaced in the Decision Panel. Provides the teacher-workflow evidence layer that `docs/specs/program-metrics.md` depends on (MC-B01..MC-B06, MC-C02, MC-C05, MC-C06).

## Overview

The Decision Panel mockup defines **Approve / Reject** buttons on the *What To Do?* panel (`docs/specs/decision-panel-ui.md` § Reference Design). Today those buttons have no backing endpoint, so we cannot measure teacher engagement, agreement rate, override rate, or decision-to-action latency — the three headline "how helpful is this to educators" numbers for the ED/IES SBIR narrative.

This spec adds:

1. A **feedback write endpoint** — `POST /v1/decisions/:decision_id/feedback`
2. A **feedback read endpoint** — `GET /v1/decisions/:decision_id/feedback`
3. A **lightweight view log** — `POST /v1/decisions/:decision_id/view` (records that an authenticated educator session opened this decision)
4. A **soft-prompt state** — `GET /v1/feedback/pending` returning the count of unreviewed decisions ≥ N days old for the calling session (drives a gentle "You have 12 unreviewed decisions" nudge in the panel; not a hard gate)

All writes are **append-only** (immutability mirror of signal log). An educator can submit a second feedback row for the same decision (e.g. they change their mind); the latest row is authoritative for MC-B* aggregates.

---

## Scope

| In scope | Out of scope |
|----------|--------------|
| Capturing educator action + structured reason + free-text notes | Role-based access control (educator vs. admin distinction — Phase 2) |
| Per-session view logging with 1-minute dedup | Push notifications / email reminders |
| Soft-prompt count endpoint | Hard-gating the dashboard on unreviewed decisions |
| Feedback aggregation in `/v1/admin/program-metrics` (via `program-metrics.md`) | Per-educator leaderboards / performance scoring |

---

## Data Model

### `decision_feedback` table

| Column | Type | Description |
|--------|------|-------------|
| `feedback_id` | string (UUID) | PK |
| `decision_id` | string | FK → `decisions.decision_id` (no DB-level FK in DynamoDB; validated at write time) |
| `org_id` | string | Tenant scope (same value as `decisions.org_id`) |
| `learner_reference` | string | Denormalized from the decision for cheap filtering |
| `session_id` | string (opaque) | From the passphrase-gate session cookie; see `docs/specs/dashboard-passphrase-gate.md`. This is **not** an educator identity — the pilot uses shared passphrase access. |
| `action` | string | One of: `approve`, `reject`, `ignore`. Closed set. |
| `reason_category` | string or null | Optional structured reason. Closed set per action (see below). |
| `reason_text` | string or null | Optional free-text (≤ 2000 chars). Never contains PII by policy; no enforcement (educators could paste PII — mitigated by pilot training + de-identification at export time per `pilot-research-export.md`). |
| `created_at` | string (RFC3339) | Server-assigned |

**`reason_category` closed set** (per action):

| Action | Allowed `reason_category` values |
|--------|-----------------------------------|
| `approve` | `agree_primary`, `agree_after_review`, `agree_would_have_missed` (supports MC-C05) |
| `reject`  | `not_at_risk`, `wrong_skill`, `wrong_timing`, `data_stale`, `other` |
| `ignore`  | `not_applicable_now`, `duplicate`, `deferred`, `other` |

### `decision_view_log` table

| Column | Type | Description |
|--------|------|-------------|
| `view_id` | string (UUID) | PK |
| `decision_id` | string | FK → `decisions.decision_id` |
| `org_id` | string | Tenant scope |
| `session_id` | string (opaque) | Same session cookie |
| `viewed_at` | string (RFC3339) | Server-assigned |

**Dedup:** writes for the same `(decision_id, session_id)` within 60 seconds are coalesced server-side (return 200 but do not insert). Keeps view counts meaningful without burdening clients.

### Storage

- **SQLite (local / pilot host):** two tables above with `(org_id, created_at)` and `(org_id, viewed_at)` indexes.
- **DynamoDB (AWS path):** one table `FeedbackTable` with a composite key (`PK = org_id`, `SK = feedback|view#<timestamp>#<uuid>`) — follows the existing `PoliciesTable` pattern.
- **Repository pattern:** `FeedbackRepository` interface + `SqliteFeedbackRepository` + `DynamoDbFeedbackRepository`, wired via `setFeedbackRepository()` / `getFeedbackRepository()`. Mirrors `docs/specs/liu-usage-meter.md` § Implementation Notes.

---

## Endpoints

### `POST /v1/decisions/:decision_id/feedback`

**Auth:** `x-api-key` (tenant) **AND** valid dashboard session cookie (per `docs/specs/dashboard-passphrase-gate.md`). Both are required — the API key scopes the org, the session cookie is the proxy for "a human educator in the gated dashboard submitted this." Server-to-server integrations cannot submit feedback.

**Body:**

```json
{
  "action": "approve | reject | ignore",
  "reason_category": "agree_primary",
  "reason_text": "Matches what I saw in today's exit ticket"
}
```

**Validation:**

- `action` is required and must be in the closed set
- `reason_category` is optional; if present, must be in the closed set for the provided `action`
- `reason_text` ≤ 2000 chars
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

### `GET /v1/decisions/:decision_id/feedback`

**Auth:** `x-api-key` (tenant). No session cookie needed — this is a read, useful for the panel to display prior feedback.

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
      "created_at": "2026-04-20T19:12:04Z"
    }
  ],
  "latest_action": "approve"
}
```

`latest_action` is `null` when the feedback array is empty.

### `POST /v1/decisions/:decision_id/view`

**Auth:** `x-api-key` (tenant) **AND** valid dashboard session cookie. Same rule as feedback write.

**Body:** none.

**Response (200):**

```json
{ "recorded": true, "viewed_at": "2026-04-20T19:10:00Z" }
```

Or `{ "recorded": false, "reason": "dedup_window" }` if within the 60-second coalesce window.

### `GET /v1/feedback/pending`

**Auth:** `x-api-key` (tenant) **AND** valid dashboard session cookie. Session cookie is required because this drives the educator UX nudge.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `older_than_days` | No | Only count decisions ≥ N days old. Default 3. |

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

---

## Integration Points

1. **Decision Panel (`dashboard/src`).** The *What To Do?* panel's existing Approve / Reject buttons wire to `POST /v1/decisions/:id/feedback`. A new `POST /v1/decisions/:id/view` is called automatically when a card is scrolled into the viewport for ≥ 2 seconds (debounced). A toast appears when `GET /v1/feedback/pending` returns `pending_count ≥ 10` — non-blocking, dismissible.
2. **Program-metrics composition.** `GET /v1/admin/program-metrics` (per `program-metrics.md`) reads `decision_feedback` + `decision_view_log` to compute MC-B01..MC-B06, MC-C02 (action-confirmed intervene outcomes), MC-C05 (early-identification), MC-C06 (false-positive rate).
3. **Research export.** `pilot-research-export.md` includes feedback rows (de-identified) alongside decisions and state deltas.

---

## Requirements

### Functional

- [ ] `POST /v1/decisions/:id/feedback` persists a row to `decision_feedback` and returns the created row
- [ ] `POST /v1/decisions/:id/view` is idempotent within 60 s per `(decision_id, session_id)`
- [ ] `GET /v1/decisions/:id/feedback` returns all feedback rows for that decision in `created_at ASC` order
- [ ] `GET /v1/feedback/pending` returns counts that match a direct `SELECT` on the data
- [ ] Feedback and views are strictly org-scoped — a caller cannot read or write feedback for another org's decision
- [ ] Session cookie is required for writes; API-key-only requests to write endpoints return 401 `session_required`

### Acceptance Criteria

- Given a decision exists for `org_springs`, when a gated educator submits `{action: "approve"}`, then a row is persisted and the decision's `GET /v1/decisions/:id/feedback` response includes it
- Given 3 feedback rows exist for one decision with actions `[reject, reject, approve]`, then `latest_action == "approve"`
- Given an educator calls `POST .../view` twice within 10 s, then the second call returns `{recorded: false, reason: "dedup_window"}` and only one `decision_view_log` row exists
- Given an API-key-only request (no session cookie) to `POST .../feedback`, then response is 401 `session_required`
- Given 5 decisions in `org_A` and 3 in `org_B`, when `GET /v1/feedback/pending` is called with `org_A`'s key, then response counts only `org_A` decisions

---

## Constraints

- **Append-only writes.** No `UPDATE`/`DELETE` on feedback rows. Changes-of-mind produce a new row; aggregates use `latest_action`.
- **No PII validation.** `reason_text` is free-form; the pilot training + the de-identification step in `pilot-research-export.md` are the defense. We do not run content-classification on feedback text.
- **Session cookie is the "educator" proxy.** The pilot uses a shared passphrase, so we cannot identify *which* educator submitted feedback. This is documented in the SBIR narrative as a Phase I limitation; true educator identity is a Phase II add (requires per-educator auth).
- **No write rate limiting beyond the dashboard passphrase gate.** Educators submitting 100 feedback rows in a minute is vanishingly rare; we do not build rate limits for it.

---

## Out of Scope

| Item | Rationale | Revisit |
|------|-----------|---------|
| Per-educator identity | Pilot uses shared passphrase per `dashboard-passphrase-gate.md`; true identity is a Phase II add | Phase II (post-SBIR Phase I) |
| Feedback edit / delete | Append-only mirrors signal log immutability | Never |
| Push / email reminders | Observability layer, not product | Post-pilot |
| Rich-text / attachments in `reason_text` | Minimal-viable evidence capture | Post-pilot if educators ask |
| Webhook-out on feedback | External enforcement is out of 8P3P's boundary | Phase II workflow automation |

---

## Dependencies

### Required from other specs

| Dependency | Source | Status |
|------------|--------|--------|
| Decision records (`decision_id`, `org_id`, `learner_reference`) | `docs/specs/decision-engine.md` | **Complete** |
| Session cookie model (`HttpOnly`, signed with `COOKIE_SECRET`) | `docs/specs/dashboard-passphrase-gate.md` | **Complete** |
| API key middleware + org scoping | `docs/specs/api-key-middleware.md` | **Complete** |
| Repository + DynamoDB patterns | `docs/specs/policy-storage.md`, `docs/specs/liu-usage-meter.md` | **Complete / promoted** |

### Provides to other specs

| Capability | Used by |
|------------|---------|
| `decision_feedback` rows | `docs/specs/program-metrics.md` (MC-B02..B06, MC-C02, MC-C05, MC-C06), `docs/specs/pilot-research-export.md` |
| `decision_view_log` rows | `docs/specs/program-metrics.md` (MC-B01, MC-B06) |
| Soft-prompt UX | `docs/specs/decision-panel-ui.md` (Panel 3 + header nudge) |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `api_key_required` / `api_key_invalid` | `api-key-middleware.md` |
| `org_scope_required` | Shared |
| `invalid_request_body` | Shared |

### New

| Code | HTTP | Description |
|------|------|-------------|
| `session_required` | 401 | Missing or invalid dashboard session cookie on a write endpoint |
| `decision_not_found` | 404 | `decision_id` does not exist or belongs to a different org |
| `invalid_action` | 400 | `action` not in `{approve, reject, ignore}` |
| `invalid_reason_category` | 400 | `reason_category` not in the closed set for the given `action` |
| `reason_text_too_long` | 400 | `reason_text` > 2000 chars |

---

## Contract Tests

| Test ID | Type | Description | Expected |
|---------|------|-------------|----------|
| FEEDBACK-001 | integration | Happy path approve with valid session + API key | 201; row persisted; `GET .../feedback` shows it |
| FEEDBACK-002 | integration | Reject with `reason_category=not_at_risk` + `reason_text` | 201; values round-trip |
| FEEDBACK-003 | contract | No session cookie → 401 `session_required` | 401 |
| FEEDBACK-004 | contract | Wrong-org decision_id → 404 `decision_not_found` | 404 |
| FEEDBACK-005 | contract | Invalid action value → 400 `invalid_action` | 400 |
| FEEDBACK-006 | contract | Mismatched `reason_category` for action → 400 `invalid_reason_category` | 400 |
| FEEDBACK-007 | contract | `reason_text` > 2000 chars → 400 `reason_text_too_long` | 400 |
| FEEDBACK-008 | integration | Two views within 30 s → second returns `{recorded:false, dedup}` | 200 |
| FEEDBACK-009 | integration | 5 decisions, 2 with feedback, `GET /v1/feedback/pending?older_than_days=0` → `pending_count == 3` | 200 |
| FEEDBACK-010 | integration | Multiple feedback rows on one decision; `latest_action` reflects most recent | 200 |
| FEEDBACK-011 | contract | Cross-org isolation on `GET /v1/feedback/pending` | 200; no cross-org data |
| FEEDBACK-012 | unit | Append-only: attempted update returns `405 method_not_allowed` or no route exists | 404/405 |

---

## File Structure

```
src/
├── feedback/
│   ├── repository.ts              # FeedbackRepository interface
│   ├── sqlite-repository.ts       # SqliteFeedbackRepository (local dev)
│   ├── dynamodb-repository.ts     # DynamoDbFeedbackRepository (AWS)
│   ├── handler-core.ts            # Framework-agnostic logic (validation, dedup)
│   ├── handler.ts                 # Fastify route handlers
│   └── routes.ts                  # Route registration under /v1/decisions/:id/feedback, /v1/decisions/:id/view, /v1/feedback/pending
```

---

*Spec created: 2026-04-20 | Phase: v1.1 (pre-Month 0) / SBIR evidence layer | Depends on: `decision-engine.md`, `dashboard-passphrase-gate.md`, `api-key-middleware.md` | Feeds: `program-metrics.md`, `pilot-research-export.md`*
