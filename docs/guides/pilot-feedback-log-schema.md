# Pilot feedback log schema

**Audience:** Customer success, product, engineering leadership  
**Authority:** [`docs/specs/customer-feedback-loop.md`](../specs/customer-feedback-loop.md) § Closed Loop  
**Local sink (gitignored):** `internal-docs/reports/pilot-feedback-log.md` on machines with the internal docs vault

The append-only pilot feedback log is the **closed-loop triage ledger**. In-product rows from `GET /v1/admin/feedback` are reviewed weekly; triaged items (plus interviews, email, and recurring decision-feedback themes) are appended here with the schema below.

---

## Row schema

Each row is one triage item. Use a markdown table or bullet block with these fields:

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `date` | ISO date (`YYYY-MM-DD`) | yes | When the signal was captured or first triaged |
| `customer` | string | yes | Pilot customer identifier (e.g. `southwest-charter`) |
| `summary` | string | yes | One-line human summary for roadmap sync |
| `category` | closed set | yes | Product area — see taxonomy below |
| `feedback_type` | closed set | yes | Signal kind — see taxonomy below |
| `proposed-roadmap-phase` | `Phase 1` \| `Phase 2+` | yes | When to review in roadmap ritual |
| `status` | lifecycle | yes | Triage state — see lifecycle below |

Optional notes (rationale for `declined` / `closed`, links to vault tickets) may follow the row as indented prose; do not add columns.

---

## Taxonomy (from customer-feedback-loop spec)

### `feedback_type`

| Value | Meaning |
| ----- | ------- |
| `idea` | Feature request / improvement |
| `problem` | Broken, confusing, or missing |
| `praise` | Positive signal to preserve |
| `question` | Needs help / clarity (docs signal) |

### `category`

| Value | Maps to |
| ----- | ------- |
| `decisions` | Decision Panel / explanations |
| `data_ingestion` | Upload / connectors / mappings |
| `dashboard_ux` | Navigation, layout, performance, a11y |
| `trust_privacy` | Data-leakage posture, auditability, FERPA |
| `policy_config` | Policy thresholds, rule tuning |
| `learning_gaps` | Gap surfacing, skill-level narrative |
| `roles_access` | Persona/role confusion, access boundaries |
| `other` | Uncategorized at capture; refine at triage |

### `status` lifecycle

`new` → `triaged` → (`planned` \| `declined`) → `shipped` → `closed`

`declined` and `closed` require a one-line rationale in the log.

### Roadmap routing

- **`Phase 1`** — Monday roadmap sync
- **`Phase 2+`** — Monthly review (hedges, nice-to-haves, contract-gated work)

---

## Mapping from `GET /v1/admin/feedback`

| API field | Log field | Notes |
| --------- | --------- | ----- |
| `created_at` | `date` | Use date portion in local timezone or UTC consistently |
| `org_id` | `customer` | Tenant scope |
| `message` | `summary` | CS lead may edit for clarity; never paste PII |
| `category` | `category` | Default `other` when absent on row |
| `feedback_type` | `feedback_type` | Null on `kind=csat` — infer from comment or use `question` |
| — | `proposed-roadmap-phase` | Assigned at triage |
| — | `status` | Starts as `new` when appended |

CSAT rows (`kind=csat`) contribute to satisfaction tracking via `csat_summary`; triage comments separately when actionable.

---

## Example rows (template only)

These illustrate schema shape. **Do not treat as live customer commitments** — copy into the gitignored local log when triaging real signal.

```markdown
| date | customer | summary | category | feedback_type | proposed-roadmap-phase | status |
| ---- | -------- | ------- | -------- | ------------- | ---------------------- | ------ |
| 2026-06-20 | southwest-charter | Align skill labels to TEKS/STAAR standards for teacher-facing copy | other | idea | Phase 2+ | new |
| 2026-06-20 | southwest-charter | Need clearer upload field mapping guidance for non-technical staff | data_ingestion | question | Phase 1 | new |
| 2026-06-22 | southwest-charter | Decision explanations helpful; want same narrative on learner overview | decisions | praise | Phase 1 | triaged |
```

---

## Ritual

1. Pull `GET /v1/admin/feedback?org_id=<pilot>` (admin key).
2. Normalize new rows; dedupe against existing log entries.
3. Append to `internal-docs/reports/pilot-feedback-log.md`.
4. Route `Phase 1` items to Monday sync; `Phase 2+` to monthly review.
5. Accepted items become specs or plan amendments; update status through the lifecycle.

Agent workflow: `/pilot-feedback-intake` (`.cursor/skills/pilot-feedback-intake/SKILL.md`).

---

## Related

- [`customer-feedback-loop.md`](../specs/customer-feedback-loop.md) — API, UX, and taxonomy authority
- [`internal-operations-stub.md`](operators/internal-operations-stub.md) — index of gitignored ops docs
