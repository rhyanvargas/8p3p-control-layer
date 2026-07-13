# Learner Status Explanation UX

> Gives educators a single **learner-level current-status** narrative on learner detail Overview, rendered through a **shared AI explanation block** that also carries an **explanation-quality** feedback loop (thumbs up / thumbs down + reason). Separates “is this *wording* accurate?” from existing Approve/Reject (“is this the right *action*?”) and forbids duplicate narrative/action surfaces across learner tabs.

## Overview

Educators opening `/learners/[ref]` today see structured Overview facts (Level, Focus skill, Signals) and per-decision Summary text in the Recent decisions table, but **no learner-level status narrative**. AI educator copy (`trace.educator_explanation`, resolved via `educatorBodyCopy()`) is decision-scoped and already used on home `EducatorInsights` / `FeaturedAction`, Attention sheets, and table cells — each with slightly different layout and **no shared quality-rating control**.

This spec closes that gap without inventing a second explanation system:

1. **Derive** the Overview “Current status” narrative from the learner summary’s newest recent decision + current-state chips (no new at-view LLM generation).
2. Extract one reusable **`EducatorExplanationBlock`** (context label, badges, narrative, expand, optional action slot, explanation-feedback strip).
3. Add **explanation-quality feedback** — thumbs up/down with structured reason on down — persisted on a **sibling** path to decision Approve/Reject so `latest_action` and pending-review queues stay authoritative for action review only.
4. Enforce **anti-redundancy**: one status narrative on Overview; table rows stay truncated previews; Struggles keep skill-level quotes; `AttentionReviewBar` remains the sole Approve/Reject focal write on learner detail (LPR-F08).

**Design authority:** `docs/specs/dashboard-design-requirements.md` (§2 educator journey, §8 learner detail — one concern per tab, single focal write action), `docs/specs/learner-pending-review-bar.md` (LPR-F08), `docs/specs/ai-educator-explanations.md` (cached decision-time narratives), `docs/specs/educator-feedback-api.md` (decision action feedback — do not overload), `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/designing-surveys/SKILL.md` (one variable per question; thumbs rate *accuracy*, not CSAT).

---

## Requirements

### Functional

#### Shared explanation block

- [ ] **LSX-F01** Introduce a shared dashboard component `EducatorExplanationBlock` (suggested path: `dashboard/components/shared/educator-explanation-block.tsx`) with this structure, in order:
  1. **Context label** (string) — e.g. `Current status`, `Why this recommendation`
  2. **Optional badges row** — `DecisionBadge`, `ProgressBadge`, and/or skill line
  3. **Narrative body** — text from `educatorBodyCopy()` / `resolveEducatorExplanation()`; default `line-clamp-3` with Read more / Show less when length > 160 characters (match `FeaturedAction`)
  4. **Optional `actionSlot`** — React node for Approve/Reject (or other write CTAs); omitted when not applicable
  5. **Explanation feedback strip** — thumbs up / thumbs down (LSX-F10–F14); always present when a `decision_id` subject is bound, unless `feedbackEnabled={false}`
- [ ] **LSX-F02** Narrative resolution MUST reuse `dashboard/lib/panel-helpers.ts` `educatorBodyCopy()` (prefer `educator_explanation` → `educator_summary` → `rationale`). Do not fork a second copy-resolution helper.
- [ ] **LSX-F03** Refactor these surfaces to consume `EducatorExplanationBlock` for narrative layout (content may differ; chrome must not):
  - `EducatorInsights` `FeaturedAction` (home)
  - Attention review sheet body copy (`attention-review-sheet.tsx`)
  - Learner Overview **Current status** (this spec)
  - Decision detail / row-detail surfaces that already show full educator narrative (when opened from Recent decisions)
- [ ] **LSX-F04** `FeaturedAction` Approve/Reject continue to live in `actionSlot` only — not duplicated in the feedback strip. Explanation thumbs MUST NOT call `executeReviewAction`.

#### Learner Overview — Current status

- [ ] **LSX-F05** On `/learners/[ref]` **Overview** tab, render **Current status** as the **first** content block (above structured facts / Skills breakdown / Recent decisions).
- [ ] **LSX-F06** **Subject selection:** bind the status block to the learner summary’s **newest** `recent_decisions[]` row by `decided_at` descending. If `recent_decisions` is empty, render muted empty copy: `No recent recommendation to summarize yet.` and omit thumbs.
- [ ] **LSX-F07** **Content (v1 — derive, do not generate):** narrative = `educatorBodyCopy(newestDecision)`; badges include that decision’s `DecisionBadge` plus existing Level / trend (`ProgressBadge`) / Focus skill chips derived from `current_state.fields` (same sources as today’s Summary `SheetSection`). Context label MUST be `Current status`.
- [ ] **LSX-F08** Replace the cold facts-only “SUMMARY” `SheetSection` as the primary status story: either fold Level / Focus skill / Signals into the status block’s badge/metadata row, or keep a compact facts row **immediately under** the narrative without a competing uppercase SUMMARY heading that implies a second status. Signals count may remain as a secondary fact.
- [ ] **LSX-F09** **Anti-redundancy on learner detail:**
  - Do **not** mount a second full Current status narrative on Struggles, State, or Trajectory.
  - Do **not** put Approve/Reject inside the Current status block (bar owns action writes — LPR-F08).
  - Recent decisions **Summary** column stays `line-clamp-2` preview; full narrative + thumbs open via row detail (sheet/drawer) using the same `EducatorExplanationBlock`.
  - Struggles tab keeps per-skill stability quotes (`buildStabilityRationale`); do not replace those with learner-status AI copy in this phase.

#### Explanation-quality feedback

- [ ] **LSX-F10** On every `EducatorExplanationBlock` with a bound `decision_id` and `feedbackEnabled`, show **thumbs up** and **thumbs down** controls labeled for accessibility (`Was this summary helpful?` group; buttons `Helpful` / `Not helpful`).
- [ ] **LSX-F11** **Thumbs up:** `POST /v1/decisions/:decision_id/explanation-feedback` with `{ "rating": "up" }`. No reason step. Optimistic UI + Sonner success toast (`Thanks — that helps improve summaries.`).
- [ ] **LSX-F12** **Thumbs down:** expand an **inline** reason step (same interaction pattern as `RejectReasonStep`, extract/reuse presentation where practical — not a blocking modal). Required `reason_category` from § Concrete Values; optional `reason_text` ≤ 2000 chars. Submit via same POST with `{ "rating": "down", "reason_category", "reason_text?" }`.
- [ ] **LSX-F13** Rating is **append-only**; latest rating for the session (or org+session) is authoritative for UI state (selected thumb). A second rating creates a new row; UI reflects latest. Must **not** change `GET /v1/decisions/:id/feedback` `latest_action` or pending-review membership.
- [ ] **LSX-F14** **One variable:** thumbs measure explanation *accuracy/helpfulness* only. Do not combine with CSAT, product “Send feedback”, or Approve/Reject on the same control.
- [ ] **LSX-F15** Extend the dashboard control proxy session bridge so paths matching `v1/decisions/*/explanation-feedback` inject `Cookie: fb_session=…` the same way as `v1/decisions/*/feedback` (`attention-review-ux.md` P2-F05).
- [ ] **LSX-F16** Persist explanation feedback in the existing Feedback store using a **distinct kind prefix** (SQLite table or DynamoDB `SK` — see § Data model). Do **not** add `up`/`down` to `decision_feedback.action` (`approve` | `reject` | `ignore`).

### Acceptance Criteria

- Given learner `stu-40123` with recent decisions, when Overview loads, then the first block is **Current status** with narrative matching `educatorBodyCopy` of the newest decision and Level/trend/Focus skill chips visible; Approve/Reject are absent from that block.
- Given the same learner has an unreviewed intervene decision, when Overview loads, then `AttentionReviewBar` still mounts for Approve/Reject and Overview does not add a second Approve/Reject pair (LPR-F08).
- Given `NEXT_PUBLIC_AI_EXPLANATIONS_DEMO=true` and empty `educator_explanation`, when Overview loads, then Current status shows the demo mock narrative (same resolver as decision panels).
- Given demo off and null `educator_explanation`, when Overview loads, then Current status falls back to `educator_summary` then `rationale` via `educatorBodyCopy`.
- Given empty `recent_decisions`, when Overview loads, then empty copy appears and thumbs are hidden.
- Given educator clicks thumbs up on Current status, when POST succeeds, then toast confirms and the up control shows selected state; `GET .../feedback` `latest_action` is unchanged.
- Given educator clicks thumbs down, selects `inaccurate_status`, and submits, when POST succeeds, then a row is stored with `rating: "down"` and that category; pending Attention queue membership is unchanged.
- Given Recent decisions Summary column, when the educator opens row detail, then the full `EducatorExplanationBlock` appears (not a third bespoke layout).
- Given home `EducatorInsights` FeaturedAction, when rendered after refactor, then narrative chrome matches learner Current status (shared component) while Approve/Reject remain in `actionSlot`.

## Constraints

- **Derive-only learner status in v1.** No on-demand / per-view LLM generation for a learner-level field (aligns with `ai-educator-explanations.md` Out of Scope: on-demand generation deferred).
- **Two feedback loops stay separate.** Decision review (`approve`/`reject`/`ignore`) vs explanation quality (`up`/`down`). UI and APIs must not conflate them.
- **LPR-F08 remains normative** on learner detail: sticky bar is the sole Approve/Reject focal write.
- **One concern per tab** (`dashboard-design-requirements.md` §8): Overview = status + history; Struggles = per-skill help/progress; State/Trajectory = inspection.
- **Shared passphrase pilot:** explanation-feedback session identity is `fb_session` (same limitation as educator-feedback-api — not per-educator identity).
- **PII:** explanation feedback `reason_text` follows the same non-enforcement + export de-ID policy as decision feedback (`educator-feedback-api.md`).

## Out of Scope

| Item | Rationale | Revisit |
|------|-----------|---------|
| New `trace.learner_status_explanation` (or summary-endpoint narrative field) generated by LLM | v1 derives from newest decision; generation would need ai-educator-explanations Phase 2 | If educators need a true cross-decision status paragraph |
| Thumbs on Struggles stability quotes | Those quotes are rule-built, not AI explanations | When Struggles consume `educator_explanation` |
| Putting explanation thumbs on `AttentionReviewBar` | Bar is for action review; clutter + mixed signals | Never for v1 |
| Extending `decision_feedback.action` with helpful/unhelpful | Would pollute `latest_action` / MC-B* / pending queue | Never — use sibling path |
| Routing explanation ratings through `POST /v1/feedback` (product) | Wrong taxonomy (product idea/problem vs explanation accuracy) | No |
| CSAT / NPS on the explanation block | designing-surveys: one variable; CSAT already exists post-task | No |
| Admin analytics UI for explanation ratings | Capture + admin list filter sufficient for pilot triage | Phase 1 analytics |
| Backfill historical decisions’ explanations | Unchanged from ai-educator-explanations | Separate backfill plan |
| Multi-language narratives | Pilot English | Post-pilot |

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|-----------------|--------|
| `trace.educator_explanation` + disabled → `null` | `docs/specs/ai-educator-explanations.md` | Defined ✓ |
| `educatorBodyCopy()` / `resolveEducatorExplanation()` / `NEXT_PUBLIC_AI_EXPLANATIONS_DEMO` | `dashboard/lib/panel-helpers.ts`, `dashboard/lib/ai/mock-explanations.ts` | Defined ✓ |
| `GET /v1/learners/:ref/summary` + `recent_decisions[]` | `docs/specs/learner-summary-api.md` | Defined ✓ |
| Decision Approve/Reject + `latest_action` + reason closed sets | `docs/specs/educator-feedback-api.md` | Defined ✓ |
| `AttentionReviewBar` + LPR-F08 no duplicate CTAs | `docs/specs/learner-pending-review-bar.md`, `docs/specs/attention-review-ux.md` | Defined ✓ |
| Proxy `fb_session` bridge for `/v1/decisions/*/feedback` | `docs/specs/attention-review-ux.md` P2-F05, `docs/specs/dashboard-passphrase-gate.md` | Defined ✓ |
| Product feedback taxonomy (do not reuse for ratings) | `docs/specs/customer-feedback-loop.md` | Defined ✓ |
| Overview Skills breakdown placement (below status facts, above Recent decisions) | `docs/specs/dashboard-design-requirements.md` §8.2 | Defined ✓ — status narrative sits **above** that section |
| `RejectReasonStep` inline reason UX pattern | `dashboard/app/(dashboard)/attention/_components/reject-reason-step.tsx` | Defined ✓ — reuse pattern for thumbs-down |
| `FeaturedAction` narrative chrome | `dashboard/components/panels/EducatorInsights.tsx` | Defined ✓ — extract into shared block |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| `EducatorExplanationBlock` | Home insights, Attention sheet, learner Overview, decision detail |
| `POST/GET .../explanation-feedback` | Pilot triage themes for AI copy quality; future program-metrics MC for explanation trust |
| Anti-redundancy placement rules | Future learner-tab narrative features |

### Existing solutions check (`prefer-existing-solutions`)

| Need | Chosen solution | Why (vs custom) |
|------|-----------------|-----------------|
| Icons for thumbs | `lucide-react` (`ThumbsUp` / `ThumbsDown`) already in `dashboard/package.json` | **Higher DX** — matches existing icon set (`Sparkles`, etc.) |
| Toasts | `sonner` already used by Attention review | **Less complex** — reuse success/error toast patterns |
| Inline reason chips | Reuse `RejectReasonStep` interaction pattern / extract shared chip-reason step | **Less complex** than a new modal system |
| Session + persistence | Extend `src/feedback/` repository with `explanation#` SK prefix (DynamoDB) / sibling SQLite table — same FeedbackTable pattern as `feedback#` / `view#` | **Cheaper + less complex** than a new DynamoDB table or product_feedback misuse; multi-table DynamoDB guidance favors single-table kind prefixes for related access patterns ([DynamoDB data modeling](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-general-nosql-design.html)) |
| Narrative text | Existing `educatorBodyCopy` — no new LLM client in the dashboard | **Cheaper** — generation stays at decision time per ai-educator-explanations |
| Data fetching | Existing `@tanstack/react-query` + `useLearnerSummary` | Already wired on Overview |

**Custom code justified:** `EducatorExplanationBlock` layout composition — no library provides this product-specific chrome; hand-rolled on shadcn `Button` is less complex than adopting a third-party “AI card” kit.

## Data model

### `explanation_feedback` (logical)

| Column | Type | Description |
|--------|------|-------------|
| `explanation_feedback_id` | string (UUID) | PK |
| `decision_id` | string | FK → decisions (validated at write) |
| `org_id` | string | Tenant scope |
| `learner_reference` | string | Denormalized from decision |
| `session_id` | string (opaque) | From `fb_session` (same as decision feedback) |
| `rating` | string | `up` \| `down` (closed set) |
| `reason_category` | string or null | Required when `rating == "down"`; null when `up` |
| `reason_text` | string or null | Optional; ≤ 2000 chars |
| `created_at` | string (RFC3339) | Server-assigned |

**Storage**

- **SQLite:** table `explanation_feedback` with indexes on `(org_id, created_at)` and `(decision_id, created_at)`.
- **DynamoDB:** reuse `FeedbackTable` (`PK = org_id`, `SK = explanation#<created_at>#<uuid>`). Do not store these rows under `feedback#` (keeps Query for decision actions clean).
- **Repository:** extend `FeedbackRepository` (or sibling port) with `saveExplanationFeedback` / `listExplanationFeedbackForDecision` — mirror existing pattern; do not redefine `FeedbackAction`.

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `session_required` | Educator Feedback API / passphrase gate |
| `decision_not_found` | Educator Feedback API |
| `invalid_request_body` | Shared validation |
| `org_mismatch` / tenant scoping codes as used by decision feedback | Educator Feedback API |

### New (add during implementation)

| Code | HTTP | Description |
|------|------|-------------|
| `invalid_rating` | 400 | `rating` missing or not in `{up, down}` |
| `reason_category_required` | 400 | `rating == "down"` without a valid `reason_category` |
| `invalid_explanation_reason_category` | 400 | `reason_category` not in the down closed set |
| `reason_forbidden_on_up` | 400 | `reason_category` or `reason_text` present when `rating == "up"` |

## Contract Tests

| Test ID | Strategy | Description | Input | Expected |
|---------|----------|-------------|-------|----------|
| LSX-001 | unit | Newest-decision subject picker | Summary with 3 decisions, unsorted | Picker returns max `decided_at` |
| LSX-002 | unit | Empty recent decisions | `recent_decisions: []` | Empty-state flag; no feedback controls |
| LSX-003 | component | Overview mounts Current status first | Mock summary with explanation | Heading/label `Current status`; narrative from `educatorBodyCopy`; no Approve in block |
| LSX-004 | component | LPR-F08 still holds | Pending intervene + status block | Approve/Reject only in review bar region |
| LSX-005 | component | Shared block expand | Narrative > 160 chars | Read more toggles full text |
| LSX-006 | contract | POST up happy path | `{ "rating": "up" }` | 201; stored row; GET latest rating `up` |
| LSX-007 | contract | POST down with category | `{ "rating": "down", "reason_category": "inaccurate_status" }` | 201 |
| LSX-008 | contract | Down without category | `{ "rating": "down" }` | 400 `reason_category_required` |
| LSX-009 | contract | Up with reason | `{ "rating": "up", "reason_category": "other" }` | 400 `reason_forbidden_on_up` |
| LSX-010 | contract | Invalid rating | `{ "rating": "helpful" }` | 400 `invalid_rating` |
| LSX-011 | contract | Isolation from decision feedback | POST explanation up, then GET `.../feedback` | `latest_action` unchanged (null or prior approve/reject only) |
| LSX-012 | unit | Proxy injects `fb_session` on explanation-feedback POST | Control proxy test | Cookie injected like feedback POST |
| LSX-013 | e2e | Learner Overview thumbs down flow | Seeded learner + demo explanations | Inline reason → submit → selected down state; bar still works for Approve |

> **Test strategy note:** LSX-001–002 pure helpers; LSX-003–005 React component tests with mocked hooks; LSX-006–011 API contract/integration beside existing FEEDBACK-* suite; LSX-012 proxy unit; LSX-013 Playwright on learner detail.

## Concrete Values Checklist

### Wire formats / signed payloads

- N/A — reuses existing `fb_session` signed cookie format from `dashboard-passphrase-gate.md` (no new cookie or payload byte order).

### HTTP behavior

| Transition | Status | Content-Type | Required headers / body |
|------------|--------|--------------|-------------------------|
| POST explanation-feedback success | **201** | `application/json` | Body: created row (`explanation_feedback_id`, `decision_id`, `rating`, `reason_category`, `reason_text`, `created_at`) |
| GET explanation-feedback | **200** | `application/json` | `{ "decision_id", "ratings": [...], "latest_rating": "up" \| "down" \| null }` |
| Unauthenticated POST | **401** | `application/json` | `{ "code": "session_required", ... }` |
| Unknown decision | **404** | `application/json` | `{ "code": "decision_not_found", ... }` |
| Validation failure | **400** | `application/json` | `{ "code": "<new or shared code>", "message": "..." }` |

**POST body (normative):**

```json
{
  "rating": "up | down",
  "reason_category": "inaccurate_status | wrong_skill | outdated | too_vague | other",
  "reason_text": "optional string ≤ 2000"
}
```

- `rating` **required**.
- When `rating == "up"`: `reason_category` and `reason_text` **must be omitted** (empty string treated as absent, then forbidden if still present after normalize — same empty-optional rule as educator-feedback-api).
- When `rating == "down"`: `reason_category` **required** and in closed set; `reason_text` optional.

**Down `reason_category` closed set:**

| Value | Meaning |
|-------|---------|
| `inaccurate_status` | Overall status/wording does not match what the educator sees |
| `wrong_skill` | Narrative focuses on the wrong skill |
| `outdated` | Status feels stale vs recent classroom evidence |
| `too_vague` | Not actionable / too generic |
| `other` | Free-text expected in `reason_text` when possible |

### Cookies

| Name | HttpOnly | Secure | SameSite | Path | Max-Age |
|------|----------|--------|----------|------|---------|
| `fb_session` (reuse) | true | true (prod) / false (dev) | Strict | `/v1/decisions` | Per `dashboard-passphrase-gate.md` |

No new cookies. Proxy continues to inject `fb_session` onto BFF-forwarded explanation-feedback POSTs.

### Env vars

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `NEXT_PUBLIC_AI_EXPLANATIONS_DEMO` | no | unset/false | string bool | Existing — fills empty `educator_explanation` with mock narrative in dashboard |
| *(none new for this feature)* | — | — | — | Backend generation flags remain owned by `ai-educator-explanations.md` |

### Constants / limits

- Narrative expand threshold: **160** characters (match FeaturedAction).
- Default Overview `recentDecisionsLimit`: **10** (unchanged).
- `reason_text` max length: **2000** characters.
- Thumbs toast undo: **not required** for v1 (ratings are soft signals; optional undo may reuse Attention undo patterns later).
- Sonner success copy (up): `Thanks — that helps improve summaries.`
- Sonner success copy (down): `Thanks — we captured why this was off.`
- Empty status copy: `No recent recommendation to summarize yet.`
- Feedback group accessible name: `Was this summary helpful?`
- DynamoDB SK prefix: `explanation#`
- SQLite table name: `explanation_feedback`

### Routes registered

| Method | Path | Auth |
|--------|------|------|
| POST | `/v1/decisions/:decision_id/explanation-feedback` | `fb_session` required (same gate as decision feedback POST) |
| GET | `/v1/decisions/:decision_id/explanation-feedback` | API key (dashboard proxy); session optional for read — match GET decision feedback behavior (x-api-key; no session required for read) |
| POST | `/api/control/v1/decisions/:decision_id/explanation-feedback` | Dashboard BFF — injects `fb_session` when `dp_session` present |
| GET | `/api/control/v1/decisions/:decision_id/explanation-feedback` | Dashboard BFF — x-api-key upstream; no cookie injection required |

### UI placement (normative)

```text
/learners/[ref]  (Overview tab)
├── Current status          ← EducatorExplanationBlock (LSX-F05) + thumbs
├── Compact facts / chips   ← Level, trend, focus skill, signals (folded or immediate under)
├── Skills breakdown        ← dashboard-design-requirements §8.2 (unchanged ownership)
└── Recent decisions        ← truncated Summary column; row detail → shared block
AttentionReviewBar (conditional) ← Approve/Reject only
```

## Production Correctness Notes

- **Proxy / `trustProxy`:** N/A for new behavior — explanation-feedback rides the existing Fastify + dashboard BFF path; ensure rate-limit IP behavior unchanged from decision feedback.
- **CORS:** N/A — same-origin dashboard → `/api/control/…` proxy; upstream is server-side with API key.
- **CSP / security headers:** N/A — no new script surfaces; thumbs are standard buttons.
- **Cookie prefix vs Path scoping:** Reuse `fb_session` `Path=/v1/decisions`; BFF injection required because browser will not send that cookie to `/api/control/…` (same as P2-F05). Widen path **must not** be used as a shortcut.
- **Content-type parsing:** JSON bodies only (`application/json`); no formbody plugin required for these routes.
- **Body size limits:** Enforce `reason_text` ≤ 2000 at validation; rely on existing Fastify body limit for the route class (default 1 MB is acceptable; do not raise).
- **Rate-limit storage scope:** Inherit decision-feedback rate limiting if present; otherwise N/A for pilot single-instance — document if a shared limiter is later added for horizontal scale.
- **Error-code surface:** Return only closed codes in this spec / shared feedback codes; never leak SQL/DynamoDB item shapes or stack traces to the dashboard toast (show `request_id` when available, matching Attention error toasts).

## Notes

- **Why derive from newest decision:** `ai-educator-explanations` already generates at decision time; the educator’s “where do they stand?” question on Overview is almost always answered by the latest recommendation plus current Level/trend chips. A true multi-decision synthesizer is a later product decision, not a blocker for the missing surface.
- **Why sibling API:** `latest_action` drives pending queues, review chips, and SBIR MC-B* metrics. Putting thumbs into `action` would silently “review” or overwrite Approve/Reject — a correctness bug, not a schema convenience.
- **Home vs learner:** Home `EducatorInsights` keeps **one** featured narrative (anti-duplication already documented there). Learner Overview is the deep-dive status home; do not also feature the same learner’s full status paragraph on home watch rows.
- **Implementation order suggestion for `/plan-impl`:** (1) shared block extract + Overview Current status (UI-only thumbs stub optional), (2) explanation-feedback API + proxy bridge, (3) wire thumbs + refactor FeaturedAction/Attention sheet/row detail, (4) e2e LSX-013.

## Next steps

After stakeholder review of requirements and test IDs, run:

```text
/plan-impl docs/specs/learner-status-explanation-ux.md
```
