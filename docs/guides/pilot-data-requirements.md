# Pilot Data Requirements

**Audience:** Pilot customer IT administrators, data teams, and 8P3P solutions  
**Purpose:** Single reference for what data to provide, how to send it, and the IT discovery questions to answer before go-live.  
**Related gates:** [Pilot Readiness Gates § Integration](operators/pilot-readiness-gates.md) · [Ingestion preflight spec](../specs/ingestion-preflight.md)

Send this document to customer IT as-is during onboarding. Solutions should not need to rewrite it per school.

---

## Choose your ingestion branch

| Branch | Who uploads | When to pick |
|--------|-------------|--------------|
| **Customer self-serve** | Customer admin via dashboard | IT has a de-identified export and wants to validate the loop themselves |
| **8P3P-assisted** | 8P3P solutions/engineering | Customer cannot export yet, or prefers 8P3P to run preflight and first ingest |

Both branches must pass **`POST /v1/admin/ingestion/preflight`** on a raw sample before the live feed is enabled. See [Pilot Readiness Gates § Integration](operators/pilot-readiness-gates.md).

---

## Branch A — Customer uploads (dashboard wizard)

### Where to upload

Authenticated dashboard route: **`/signals/upload`** (linked from **Signals → Upload** in the sidebar).

### Canonical fields (upload wizard)

Each row in CSV or JSON must map to a signal with these fields:

| Field | Required | Format | Notes |
|-------|----------|--------|-------|
| `signal_id` | Yes | Unique string per event | Stable idempotency key; resubmitting the same id is a duplicate, not a double-write |
| `learner_reference` | Yes | Opaque string | **No PII** — use SIS student ID, LMS internal ID, or other stable pseudonym agreed with 8P3P |
| `source_system` | Yes | String | Identifies the LMS or export source (e.g. `canvas-lms`, `i-ready`, `district-sftp`) |
| `timestamp` | Yes | ISO 8601 UTC | Event time (e.g. `2026-06-25T14:30:00Z`) |
| `schema_version` | Yes | String | Use `v1` unless 8P3P specifies otherwise |
| Score fields | At least one | Number **0–1** | Canonical names: `masteryScore`, `stabilityScore`, `complianceScore`, `riskSignal`, etc. Values must be normalized to 0–1 before upload unless a tenant field mapping is registered |

Optional context fields (skill labels, assessment type) may be included when your policy uses them. See [Pilot Integration Guide § 4](../customers/pilot-integration-guide.md#4-quick-start--direct-api-path).

### CSV expectations

- Header row with column names matching wizard mapping step
- UTF-8 encoding
- One signal per row
- No columns containing PII (names, email, phone, SSN, DOB, address, etc.)
- Scores as decimals (`0.75`) or percentages only if the mapping step converts them to 0–1

### No-PII rule (non-negotiable)

The control layer **rejects** signals containing forbidden PII keys. Preflight returns `verdict: "pii_blocking"` when PII is detected. Remove PII at the source export — do not send names, emails, or other direct identifiers.

Run preflight on a representative row before bulk upload:

```bash
curl -sS -X POST "https://<api-host>/v1/admin/ingestion/preflight" \
  -H "content-type: application/json" \
  -H "x-admin-api-key: <admin_key>" \
  -d '{"org_id":"<org_id>","source_system":"<source>","payload":{ ... one raw row ... }}'
```

**Pass criteria:** `forbidden_pii: []` and `verdict` is `clean` or `semantic_resolvable_by_mapping` after field mapping is registered. Full spec: [ingestion-preflight.md](../specs/ingestion-preflight.md).

### After upload

1. Open **Attention** — new decisions should appear for learners with matched policy rules  
2. **Approve** or **Reject** decisions to confirm educator feedback persists  
3. Use **Send feedback** (footer) for product feedback anytime

---

## Branch B — 8P3P uploads for you

Use this branch when the customer cannot self-serve yet or prefers 8P3P to run the first ingest.

### What to request from customer IT

| Deliverable | Description |
|-------------|-------------|
| **LMS export sample** | De-identified JSON or CSV (minimum ~20 learners, **≥ 3 months** history if efficacy metrics are in scope) |
| **Source system identifier** | Agreed `source_system` string for this feed |
| **`learner_reference` scheme** | Document how IDs are assigned and that they are stable across exports |
| **Field dictionary** | Column / JSON path → meaning (especially score fields) |
| **De-identification attestation** | Written confirmation that PII was removed before transfer to 8P3P |

### 8P3P intake workflow

1. Receive raw sample via secure channel (not email attachment with PII)  
2. Run **`POST /v1/admin/ingestion/preflight`** — must be clean or mapping-resolvable  
3. If raw fields are vendor-specific, register tenant mapping per [Onboarding field mappings](../customers/onboarding-field-mappings.md)  
4. Re-run preflight until `forbidden_semantic_after_mapping: []`  
5. Ingest via `POST /v1/signals` (script) or dashboard upload on customer's behalf  
6. Confirm decisions visible in **Attention** before customer login

### Training fallback

If customer sample is unavailable, 8P3P may seed demo personas for training only:

```bash
node examples/springs/seed-springs-demo.mjs \
  --host "<API_URL>" \
  --api-key "<PILOT_KEY>" \
  --admin-key "<ADMIN_API_KEY>" \
  --org "<org_id>"
```

Demo seed does **not** replace production preflight on the customer's actual LMS shape.

---

## IT discovery questionnaire

Complete during sales handoff or week −1 onboarding call. Record answers in the onboarding ticket (vault).

### LMS and export capability

1. Which LMS platform(s) are in scope? (Canvas, Blackboard, i-Ready, Branching Minds, custom, multiple)  
2. Can IT export assessment or progress data on a schedule? (hourly / daily / weekly / ad hoc)  
3. Does the vendor support webhooks, API pull, SFTP drop, or file export only?  
4. Who has admin access to configure integrations or exports?

### Identity and privacy

5. What **`learner_reference`** will you use? (Recommended: stable SIS student ID — not name or email)  
6. Who owns FERPA / data-use compliance for this pilot?  
7. Who de-identifies exports before they reach 8P3P? (Customer data team vs 8P3P)  
8. Are there district policies on cloud storage or third-party processors we must acknowledge?

### Cadence and scope

9. Preferred data refresh cadence during pilot? (Independent of 8P3P processing — we accept on your schedule)  
10. How many learners and subjects are in pilot scope?  
11. Retrospective depth available? (≥ 3 months required if MC-C01..C03 efficacy metrics are in scope — see [Pilot Readiness Gates § Customer Readiness](operators/pilot-readiness-gates.md))

### Integration path selection

12. Which ingestion path applies? (Template webhook / generic webhook + mapping / SFTP drop / direct API — see [Pilot Readiness Gates § Integration paths](operators/pilot-readiness-gates.md))  
13. Can IT trigger a test event in the LMS for end-to-end verification?

---

## TEKS / STAAR standards (contract hedge — not built in pilot)

Texas Essential Knowledge and Skills (TEKS) and STAAR alignment may become a sales requirement if the charter deal closes. **No engine change is required** for a fast follow:

- Standards map to **skill label / metadata** on signals or policy config — a lookup layer, not a decision-engine rewrite  
- Estimate: **days, not weeks**, once export field names and district standard codes are agreed  
- **Timeline:** TBD on contract close — do not pre-build until gated  
- Pilot proceeds with domain skill labels in policy rules; standards overlay is Phase 2+

If TEKS becomes a contract gate, solutions should open a scoped mapping task referencing `policies/<org_id>/` config — not a new ingestion protocol.

---

## Verification checklist (solutions)

Before inviting customer login, confirm:

- [ ] Preflight clean on raw sample ([ingestion-preflight.md](../specs/ingestion-preflight.md))  
- [ ] Field mapping registered if needed ([onboarding-field-mappings.md](../customers/onboarding-field-mappings.md))  
- [ ] At least one signal ingested → decision in **Attention**  
- [ ] Approve/Reject persists ([educator-feedback-api.md](../specs/educator-feedback-api.md))  
- [ ] **Send feedback** returns 201 ([customer-feedback-loop.md](../specs/customer-feedback-loop.md))  
- [ ] `GET /v1/admin/feedback` lists the product feedback row (CS triage)

Automated dry-run against hosted pilot: `npm run pilot:dry-run` — see [AWS Pilot Runbook § 4.2](operators/aws-pilot-runbook.md#42-dashboard-gate).

---

## Related documentation

| Doc | Use |
|-----|-----|
| [Customer Onboarding Quick Start](customers/customer-onboarding-quickstart.md) | First 15 minutes — one signal, one decision |
| [Pilot Integration Guide](customers/pilot-integration-guide.md) | Full API integration reference |
| [Onboarding field mappings](customers/onboarding-field-mappings.md) | Tenant mapping deep dive |
| [Launch a pilot customer](scenarios/launch-pilot-customer.md) | Ordered onboarding path |
| [AWS Pilot Runbook](operators/aws-pilot-runbook.md) | Deploy and smoke gates |
