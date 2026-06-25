# Document Extraction Service (Upstream)

> **Separate service, not part of this repository's core pipeline.** The Document Extraction Service (DES) ingests **unstructured or semi-structured documents** (PDF, scanned images, Office files, faxed scans) and emits **structured `SignalEnvelope` submissions** into the 8P3P Control Layer via the existing public API. The control layer's contract (`POST /v1/signals`, `POST /v1/webhooks/:source_system`) is **unchanged**.

## Overview

Today the control layer assumes callers can produce a fully-formed `SignalEnvelope` (or raw LMS webhook JSON that matches a configured envelope mapping). A growing class of customers (and any vertical that ingests forms, letters, or case files) sends **documents** rather than API events: PDFs, photographs of handwritten forms, faxed pages, Office docs, email attachments.

DES is a **pre-ingestion** service that:

1. Accepts an **uploaded document** (object in object storage, or direct HTTP upload).
2. Runs **classification + OCR + structured extraction** (AWS Textract / Tesseract / LLM-assisted extraction as configured).
3. Emits an **ExtractionRecord** and, if extraction passes confidence + policy gates, constructs a `SignalEnvelope` and submits it to the control layer through the **existing public ingestion surface** using a tenant API key the service holds for that org.
4. Persists **provenance** (document hash, OCR output, extraction prompt, model id, human review decisions) so every resulting signal has an audit trail back to the originating document.

DES stays **domain-neutral**: the *extraction template* (which fields to pull, where, with what type) is uploaded by the operator per document type, the same way `FieldMappingsTable` is populated today. The control layer still treats incoming signals as opaque payloads, still enforces forbidden-key rules, still runs through `tenant-field-mappings.md`. DES is an **adapter**, not an architectural change.

**Deployment relationship:**

```
[Uploads] → [DES]  -- POST /v1/signals (x-api-key) -->  [Control Layer]
             │
             └── persists ExtractionRecord + provenance in DES storage
```

DES is intended to run as a **separate repository / separate deployable** (its own AWS account or stack), authenticated to the control layer as a normal tenant API key. No shared database, no shared code, no private endpoints.

---

## Requirements

### Functional

#### Intake

- [ ] Accept a document via one of two paths:
  - [ ] **Object-storage trigger:** S3 `PutObject` on a per-tenant prefix emits an event to DES (SQS/SNS/EventBridge), carrying `{ bucket, key, org_id, document_type, source_system, optional learner_reference / user_id, optional correlation_id }`.
  - [ ] **Direct upload API:** `POST /extractions` multipart form upload with metadata JSON; returns `{ extraction_id, status: "accepted" }`.
- [ ] Reject documents above a configurable size limit per tenant (default 25 MB; see Concrete Values).
- [ ] Reject unsupported MIME types per the allowed list (default `application/pdf`, `image/png`, `image/jpeg`, `image/tiff`).
- [ ] Generate an immutable `extraction_id` (ULID) and persist the original document bytes in a DES-controlled bucket with server-side encryption (CMK).

#### Classification + OCR + structured extraction

- [ ] Resolve the **extraction template** for `(org_id, document_type)` from `ExtractionTemplatesTable`. If none → `rejected`, `no_extraction_template`.
- [ ] Run OCR using the template-declared engine (default **AWS Textract** for PDFs/images with tabular structure; pluggable for Tesseract or a Textract-compatible adapter).
- [ ] Run structured field extraction using the template-declared strategy:
  - **Textract Forms/Queries:** use native `AnalyzeDocument` query features.
  - **LLM extraction:** bounded prompt via the configured provider (Bedrock model id or equivalent), with **JSON-schema-constrained output** tied to the template; no free-form text in the emitted signal payload.
- [ ] Produce a `FieldResult` per field: `{ name, value, confidence, source_page, bbox?, extractor: "textract" | "llm" | "regex" }`.
- [ ] Apply template-declared **confidence thresholds** per field. Fields below threshold mark the document as `needs_review`.

#### Human review (HITL)

- [ ] Documents with any `needs_review` field land in a review queue. No signal is emitted until a human approves (or rejects) the extraction.
- [ ] Reviewer API (admin-scoped): `GET /extractions?status=needs_review`, `POST /extractions/:id/approve` (with optional field overrides), `POST /extractions/:id/reject` (with reason).
- [ ] Reviewer actions are **append-only audit events** on the extraction record.

#### Emission

- [ ] On **auto-approval** (all fields ≥ threshold) or **human approval**, DES constructs:
  - `signal_id` = deterministic function of `(org_id, document_hash, template_version)` so re-processing the same document with the same template is idempotent at the control layer.
  - `learner_reference` = mapped from an extraction template field (defaults to a tenant-configured primary subject field; see §Contract Evolution for eventual rename to `user_id`).
  - `source_system` = template-declared (e.g. `document-intake:medicaid-app-v1`).
  - `timestamp` = the document's declared event time if extracted, otherwise `received_at`.
  - `schema_version` = template-declared.
  - `payload` = the canonical field bag from `FieldResult`s. Forbidden/PII handling per §Security.
- [ ] Submit to control layer via `POST /v1/signals` with `x-api-key`. On 5xx, exponential backoff with jitter; on 4xx, mark extraction `emission_failed` with the control layer's rejection reason recorded verbatim.
- [ ] Persist control-layer response (including `signal_id`, `status`) on the extraction record.

#### Security / PII posture

- [ ] Raw document bytes and OCR text are **not** sent to the control layer — only the **extracted canonical fields** the template defines. This preserves the control layer's existing PII posture for pilot deployments that are pseudonymous-only.
- [ ] Tenants that are **permitted** to send sensitive attributes must be gated by the [Tiered Data Classification spec](tiered-data-classification.md); DES MUST consult the configured classification for `(org_id, canonical_field)` before emission and refuse to emit disallowed fields (`rejected`, `classification_forbidden_for_emission`).
- [ ] Raw documents are retained in DES storage only; retention windows are tenant-configurable and default to 30 days with KMS encryption (see Concrete Values).

#### Provenance / audit

- [ ] Every `ExtractionRecord` includes: `extraction_id`, `document_sha256`, `template_id`, `template_version`, `ocr_engine` + version, `extractor_model` + version, `review_events[]`, `emitted_signal_id?`, `control_layer_response?`.
- [ ] DES exposes `GET /extractions/:id` (admin-scoped) for full record replay.

### Acceptance Criteria

- Given a valid PDF uploaded to the configured bucket for `org_id=acme` and `document_type=intake-v1`, when all fields extract with confidence ≥ threshold, then a `SignalEnvelope` is constructed with deterministic `signal_id` and accepted by the control layer (`status: accepted`), and the `ExtractionRecord` stores the returned `signal_id`.
- Given the same document re-uploaded, when the template version is unchanged, then the constructed `signal_id` is identical and the control layer returns `status: duplicate` (idempotency preserved end-to-end).
- Given a document with one field below confidence threshold, when no human has reviewed it, then no signal is emitted and the record is in `needs_review`.
- Given a reviewer approves the extraction (optionally overriding a field), when the emission retry runs, then a signal is emitted and the review trail is part of the persisted record.
- Given a template is not configured for `(org_id, document_type)`, when a document arrives, then extraction is `rejected` with `no_extraction_template`.
- Given a field is classified `reject` by the active classification policy, when extraction produces it, then the field is stripped before emission and a warning is logged; if the template marks the field `required`, extraction is `rejected` with `classification_forbidden_for_emission`.

## Constraints

- **Control-layer contract is frozen** by this spec. `POST /v1/signals`, `SignalEnvelope`, forbidden-key behavior, and tenant field mappings do not change.
- **Separate deployable.** DES has its own repo, its own IAM, its own storage, its own on-call surface. No DB shared with the control layer.
- **Extraction templates, not code.** LMS/vertical-specific logic lives in declarative templates in `ExtractionTemplatesTable`, mirroring the `FieldMappingsTable` pattern (see [`tenant-field-mappings.md`](tenant-field-mappings.md)).
- **Determinism.** Re-processing the same `(document, template_version)` must produce the same `signal_id`.
- **PII minimization.** Only canonical fields are emitted; raw OCR text and document bytes never leave DES.

## Out of Scope

- Any changes to the control layer's signal ingestion, state engine, decision engine, or receipts APIs.
- Real-time document collaboration / editing.
- Fax-line hosting (DES accepts files that *arrived* via fax-to-email; the fax gateway itself is a separate concern).
- E-signature workflows.
- Non-document structured feeds (those already use `POST /v1/signals` or `POST /v1/webhooks/:source_system`).

## Dependencies

### Required from Other Specs
| Dependency | Source Document | Status |
|------------|-----------------|--------|
| `POST /v1/signals` (public ingestion) | [`docs/specs/signal-ingestion.md`](signal-ingestion.md) | Defined ✓ |
| `SignalEnvelope` schema | [`src/contracts/schemas/signal-envelope.json`](../../src/contracts/schemas/signal-envelope.json) | Defined ✓ |
| Tenant API key auth (`x-api-key`) | [`docs/specs/api-key-middleware.md`](api-key-middleware.md) | Defined ✓ |
| Forbidden-key categorization (PII vs semantic) | [`docs/specs/ingestion-preflight.md`](ingestion-preflight.md) | Spec'd |
| Per-field classification (reject / tokenize / encrypt / allow) | [`docs/specs/tiered-data-classification.md`](tiered-data-classification.md) | **GAP** — draft in the same pass as this spec |
| Tenant field mapping pattern (template-in-DynamoDB precedent) | [`docs/specs/tenant-field-mappings.md`](tenant-field-mappings.md) | Defined ✓ |

### Provides to Other Specs
| Function | Used By |
|----------|---------|
| Canonical field emission via public `POST /v1/signals` | Signal Ingestion (Stage 1) |
| `extraction_id` provenance referenced in signal metadata | Any downstream using `metadata.correlation_id` |

## Error Codes

### Existing (reuse at control layer)
Control-layer-side rejections (`missing_required_field`, `invalid_type`, `forbidden_semantic_key_detected`, `duplicate_signal_id`) are surfaced **verbatim** from the control layer onto the `ExtractionRecord.control_layer_response`.

### New (DES-scoped — distinct namespace, not added to `src/shared/error-codes.ts`)
| Code | Description |
|------|-------------|
| `unsupported_mime_type` | Uploaded document's MIME type is not in the per-tenant allow list |
| `document_too_large` | Document exceeds the per-tenant size limit |
| `no_extraction_template` | No `ExtractionTemplate` exists for `(org_id, document_type)` |
| `ocr_failed` | OCR engine returned a hard failure after retries |
| `extraction_low_confidence` | All or required fields below confidence threshold and template disallows `needs_review` |
| `classification_forbidden_for_emission` | Extracted field is classified `reject` for the target org |
| `control_layer_rejected` | Control layer returned 4xx; inspect `control_layer_response.rejection_reason` |
| `control_layer_unavailable` | Control layer returned 5xx after all retries |

## Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| DES-001 | Happy path, all fields above threshold | Valid PDF + configured template | `SignalEnvelope` constructed; control layer returns `accepted`; record stores `signal_id` |
| DES-002 | Idempotency end-to-end | Same document re-processed, same template version | Deterministic `signal_id`; control layer returns `duplicate` |
| DES-003 | Missing template | Valid PDF, no template for `(org_id, document_type)` | `rejected`, `no_extraction_template` |
| DES-004 | Needs review (field below threshold) | PDF with one sub-threshold required field | No emission; record status `needs_review` |
| DES-005 | Human approval path | DES-004 record + reviewer approves with override | Emission fires; record stores reviewer event, `signal_id` |
| DES-006 | Forbidden classification | Field `classification=reject` present in extraction | Stripped if optional; if required, `rejected`, `classification_forbidden_for_emission` |
| DES-007 | Control layer 4xx | Control layer returns `invalid_timestamp` | Record status `emission_failed`; `control_layer_response.rejection_reason.code == "invalid_timestamp"` |
| DES-008 | Control layer 5xx with retry exhaustion | Simulated 5xx loop | Record status `emission_failed`, `control_layer_unavailable` |
| DES-009 | MIME type rejection | `.docx` not in allow list | `rejected`, `unsupported_mime_type` |
| DES-010 | Size rejection | 30 MB PDF, 25 MB limit | `rejected`, `document_too_large` |

> **Test strategy note:** DES-001, DES-002, DES-005, DES-007, DES-008 are **end-to-end** against a deployed sandbox control layer. DES-003, DES-004, DES-006, DES-009, DES-010 are **component tests** on the DES extractor/emitter directly — they do not require a running control layer.

## Concrete Values Checklist

### Wire formats

- `extraction_id` — ULID (Crockford base32, 26 chars), lowercase.
- `signal_id` derivation — `${template_id}:${document_sha256_first_16_hex}` (lowercase hex, `:` separator). This yields deterministic, URL-safe IDs that match the control layer's `signal_id` charset rule (`^[A-Za-z0-9._:-]+$`).
- Document hash — SHA-256, lowercase hex.

### HTTP behavior

| Transition | Status | Content-Type | Required headers |
|------------|--------|--------------|------------------|
| Direct upload accepted (async processing) | 202 | `application/json` | `Location: /extractions/:id` |
| Direct upload rejected (MIME / size / auth) | 400 / 401 / 413 | `application/json` | — |
| Read extraction record | 200 | `application/json` | — |
| Admin approve / reject | 200 | `application/json` | — |

### Cookies (if applicable)

N/A — DES uses `x-api-key` tenant auth (public ingestion) and `x-admin-api-key` for reviewer/admin surface. No browser sessions in scope for v1.

### Env vars

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `CONTROL_LAYER_BASE_URL` | yes | — | string | Base URL for the target control-layer API (e.g. `https://api.8p3p.dev`) |
| `CONTROL_LAYER_API_KEY` | yes | — | string | Tenant `x-api-key` DES uses for `POST /v1/signals` |
| `DES_DOCUMENT_BUCKET` | yes | — | string | S3 bucket name for raw document storage |
| `DES_TEMPLATES_TABLE` | yes | — | string | DynamoDB `ExtractionTemplatesTable` name |
| `DES_RECORDS_TABLE` | yes | — | string | DynamoDB `ExtractionRecordsTable` name |
| `DES_KMS_KEY_ARN` | yes | — | string | CMK ARN for document and record encryption |
| `DES_MAX_DOC_BYTES` | no | `26214400` (25 MiB) | number | Hard upper bound enforced before storage |
| `DES_DOC_RETENTION_DAYS` | no | `30` | number | Raw-document lifecycle policy in S3 |
| `DES_OCR_ENGINE_DEFAULT` | no | `textract` | enum | `textract` \| `tesseract` \| `llm` |
| `DES_LLM_MODEL_ID` | no | *(unset)* | string | Bedrock model id when template declares `llm` extraction |
| `ADMIN_API_KEY` | yes | — | string | Admin surface (review queue, templates CRUD) |

### Constants / limits

- Default MIME allow list: `application/pdf`, `image/png`, `image/jpeg`, `image/tiff`.
- Default per-field confidence threshold if template omits one: `0.85` (Textract native score) or `0.90` (LLM self-reported confidence where available). Templates override.
- Control-layer retry: 5 attempts, exponential backoff base 500 ms, max 30 s, jitter full.
- Review queue SLA (informational, not enforced): 2 business days.
- Document retention: 30 days default; tenants must explicitly opt in to longer with a signed retention agreement referenced by `ExtractionTemplate.retention_override_days`.

### Routes registered

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/extractions` | `x-api-key` (tenant) | Direct upload (multipart) |
| `GET` | `/extractions/:id` | `x-admin-api-key` | Full record |
| `GET` | `/extractions` | `x-admin-api-key` | List, filter by `status` |
| `POST` | `/extractions/:id/approve` | `x-admin-api-key` | HITL approval |
| `POST` | `/extractions/:id/reject` | `x-admin-api-key` | HITL rejection |
| `PUT` | `/extraction-templates/:template_id` | `x-admin-api-key` | Upsert template |
| `GET` | `/extraction-templates/:template_id` | `x-admin-api-key` | Inspect |
| `GET` | `/healthz` | none | Liveness |

## Production Correctness Notes

- **Proxy / `trustProxy`**: If DES runs behind API Gateway / ALB / CloudFront, enable Fastify `trustProxy` so per-tenant rate limiting sees real client IPs.
- **CORS**: `N/A — DES is a backend-to-backend service; browser clients are not supported in v1.` Admin UIs (if any) should call through an authenticated BFF.
- **CSP / security headers**: Admin surface MUST send `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. Content pages MUST NOT render raw OCR text (to avoid stored-XSS on malicious PDFs).
- **Cookie prefix vs Path scoping**: N/A — header-based auth only.
- **Content-type parsing**: Use `@fastify/multipart` for upload; reject files whose magic bytes disagree with claimed MIME.
- **Body size limits**: JSON request body cap 1 MiB; multipart upload cap `DES_MAX_DOC_BYTES`.
- **Rate-limit storage scope**: DynamoDB-backed token bucket keyed by `org_id`; in-process Map is **not** safe for multi-instance DES deployments.
- **Error-code surface**: DES-prefixed codes are the only values exposed to tenants. Control-layer rejection reasons are echoed under `control_layer_response` without rewriting, so support can copy/paste them.
- **Subprocessors**: AWS Textract and the configured LLM provider (e.g. Bedrock) are processors of tenant content. They MUST appear in the subprocessor list referenced by the BAA / DPA before any regulated data is processed. See the internal compliance posture doc (local only).

## Notes

- **Why a separate service, not another module in this repo?** Three reasons: (1) the blast radius of OCR/LLM failures should not touch the deterministic control layer; (2) DES carries heavy AWS dependencies (Textract, Bedrock, S3, KMS) that would balloon the control-layer Lambda bundles and cold-start times; (3) compliance boundaries (e.g. HIPAA BAA on a DES stack) can be drawn without putting the entire control layer under the same regime.
- **Library / service candidates** (document in §Dependencies during `/plan-impl`):
  - **AWS Textract** for OCR + forms/queries — first-class integration on AWS, no custom ML ops.
  - **Tesseract** (open source) as offline fallback or for on-prem deployments.
  - **AWS Bedrock** (Claude / Titan) or equivalent provider for LLM-assisted extraction with JSON-schema constrained output; preferred over raw OpenAI for regulated deployments because it stays inside the tenant's AWS account.
  - **`@aws-sdk/client-textract`** and **`@aws-sdk/client-bedrock-runtime`** for TypeScript integration — no custom HTTP plumbing.
  - **`@fastify/multipart`** for upload handling — consistent with the control-layer Fastify toolkit.
- **Contract evolution**: When the control layer renames `learner_reference` → `user_id` (see internal compliance posture doc (local only) §5), DES updates the envelope it constructs. No template change required if templates refer to the subject field by its DES-template name (e.g. `primary_subject_id`) rather than by the control-layer wire name.
- **Not yet specified:** multi-page correlation (one claim packet containing N sub-forms), fax gateway ingress, and webhook callback on emission (for customers who want push notifications after extraction completes).
