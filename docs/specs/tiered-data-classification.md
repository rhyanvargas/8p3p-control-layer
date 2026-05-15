# Tiered Data Classification

> Replace the binary "reject all PII keys" posture with a **tenant-configurable classification policy** that, for each canonical field, declares one of four handling actions at ingestion and at read: **allow**, **tokenize**, **encrypt**, or **reject**. Presidio is evaluated as a candidate for value-level detection in the options section; no library is adopted by this spec.

## Overview

Today the control layer rejects inbound payloads that contain well-known PII key names (`src/ingestion/forbidden-keys.ts`, CEO directive 2026-02-24). That posture is correct for the current **pseudonymous pilot** and is complemented by the Ingestion Preflight spec ([`ingestion-preflight.md`](ingestion-preflight.md)) which splits `FORBIDDEN_KEYS` into PII vs semantic categories.

For any future customer class that **must store** sensitive or regulated attributes (health data, financial data, contact data) the blanket rejection is wrong. The auditable answer is to **classify** each canonical field and apply a policy at the boundaries. This spec defines that classification layer, leaves the existing pilot defaults intact, and is **opt-in per tenant** — a tenant that configures no classification continues to see today's behavior unchanged.

Scope of this spec:

- Define the **classification tiers** and their mandatory handling at ingestion, storage, and read.
- Define the **classification policy** data model (per-field or per-path rules, stored alongside or inside `FieldMappingsTable`).
- Define the **enforcement points** in the ingestion and read pipelines.
- Define the **Presidio evaluation framework** (and explicit alternatives) as an **options section** — a library decision is **not** finalized here.

Not in scope: key management (KMS) infrastructure, token vault implementation (if `tokenize` is adopted), and customer agreements (BAA/DPA). Those are referenced but live in `internal-docs/compliance-security-posture-and-migration-path.md`.

---

## Requirements

### Functional

#### Tier definitions (normative)

Each canonical field (or dot-path) in a signal `payload` is assigned exactly one tier:

| Tier | Ingestion behavior | Storage | Read behavior | Audit |
|------|--------------------|---------|---------------|-------|
| `allow` | Pass through unchanged. | Plaintext. | Plaintext. | No extra audit. |
| `tokenize` | Replace value with a **deterministic token** bound to `(org_id, canonical_path, value)`. The plaintext is written **only** to the token vault. | Token stored in signal log / state. | Plaintext returned **only** to principals with `detokenize` permission; otherwise token is returned. | Every detokenize call audited. |
| `encrypt` | Encrypt value with a per-org data key (KMS envelope). | Ciphertext stored in signal log / state. | Plaintext returned **only** to principals with `decrypt` permission (typically the org's own authenticated readers); otherwise the field is redacted to `{ "encrypted": true }`. | Decrypt calls audited at the access layer. |
| `reject` | Signal is rejected at ingestion (`rejected`, `classification_violation`). | — | — | Rejection logged with `classification_violation` and `field_path`. |

A field's **default tier** is `allow` when no classification entry exists, **except** that any key matching the existing `FORBIDDEN_PII_KEYS` set (see [`ingestion-preflight.md`](ingestion-preflight.md)) continues to be treated as `reject` unless the tenant has explicitly classified that canonical path as `tokenize` or `encrypt` **and** the org is flagged as `classification_override_enabled` in its tenant config. This preserves pilot safety while enabling regulated tenants to graduate.

#### Classification policy data model

- [ ] A `ClassificationPolicy` is a JSON document:
  ```json
  {
    "org_id": "acme",
    "version": "1.2.0",
    "updated_at": "2026-04-23T12:00:00Z",
    "rules": [
      { "path": "contactEmail", "tier": "tokenize", "required": false },
      { "path": "ssn",          "tier": "reject",   "required": false },
      { "path": "healthScore",  "tier": "encrypt",  "required": true  }
    ]
  }
  ```
- [ ] `path` is a dot-path relative to `payload` (same grammar as `src/shared/dot-path.ts`).
- [ ] `tier` is one of `allow | tokenize | encrypt | reject`.
- [ ] `required=true` means the field must be present post-normalization; missing → `rejected`, `classification_required_missing`.
- [ ] The policy is versioned; every decision trace and receipt that emits tokenized/encrypted data MUST record `classification_policy_version`.

#### Storage

- [ ] `ClassificationPolicy` is stored in **DynamoDB**:
  - Option A (preferred): extend the existing `FieldMappingsTable` with a `classification` attribute (policy document embedded) keyed by `(org_id, source_system="*")` so one policy applies to all sources unless overridden.
  - Option B: dedicated `ClassificationPoliciesTable` keyed by `org_id`.
- [ ] Local-dev fallback: file path env var (`TENANT_CLASSIFICATION_PATH`), mirroring `TENANT_FIELD_MAPPINGS_PATH`.
- [ ] Cache with TTL (default 300 s, configurable) with invalidation on admin PUT — same pattern as `tenant-field-mappings.md`.

#### Ingestion enforcement

- [ ] Enforcement runs **after** tenant field mapping (so classification applies to **canonical** fields, not raw aliases) and **before** idempotency + signal-log append.
- [ ] For each rule:
  - `allow` → no-op.
  - `reject` → reject signal (`rejected`, `classification_violation`, `field_path`).
  - `tokenize` → replace value with token; write plaintext to token vault keyed by `(org_id, path, sha256(plaintext))`.
  - `encrypt` → replace value with `{ "__enc__": 1, "kid": "<kms-key-id>", "ct": "<base64url>" }`.
- [ ] If a field is extracted / transformed by `tenant-field-mappings.md` into a classified path, the classification applies to the **post-transform** value.
- [ ] The existing `detectForbiddenKeys` call is preserved; a tenant whose classification explicitly covers a formerly-forbidden key can set `classification_override_enabled=true` at the tenant level to bypass the legacy rejection and fall through to classification enforcement. Default remains legacy behavior (reject).

#### Read enforcement

- [ ] The output layer (receipts, `/v1/state`, decisions) MUST consult the classification before returning a field:
  - `tokenize` paths return the token unless the principal has `detokenize` scope (admin role or explicit grant).
  - `encrypt` paths return `{ "encrypted": true, "kid": "<kms-key-id>" }` unless the principal has `decrypt` scope.
- [ ] Receipts API (audit projection) MUST redact by default. A separate admin-scoped endpoint `GET /v1/admin/receipts/:decision_id/unredacted` MAY return plaintext after classification grant is verified.
- [ ] No read path may return plaintext for a classified field without the classification check passing; a bypass is a failing contract test.

#### Admin API

- [ ] `PUT /v1/admin/classification/:org_id` (body: full `ClassificationPolicy`); validates schema + every `path` compiles against dot-path grammar; rejects conflicts (same path, different tier).
- [ ] `GET /v1/admin/classification/:org_id` returns the current policy plus `policy_version`.
- [ ] Auth: `x-admin-api-key`, same model as [`policy-management-api.md`](policy-management-api.md).
- [ ] `POST /v1/admin/classification/:org_id/validate` accepts a policy document and a sample payload; returns the classification decisions per path without persisting (mirrors `ingestion-preflight.md` UX).

### Acceptance Criteria

- Given an org with no classification policy, when a signal is ingested, then behavior is identical to today (forbidden-key rules apply; no encryption or tokenization occurs). *(Backward compatibility gate.)*
- Given a rule `{ path: "ssn", tier: "reject" }`, when a signal payload contains `ssn: "123-45-6789"`, then the signal is rejected with `classification_violation` and `field_path=payload.ssn`.
- Given a rule `{ path: "contactEmail", tier: "tokenize" }`, when a signal is ingested, then the stored signal contains a token (not the email) and the token vault contains the ciphertext; a subsequent identical ingestion produces the **same** token (deterministic under `(org_id, path)`).
- Given a rule `{ path: "healthScore", tier: "encrypt" }`, when a signal is ingested, then the stored payload contains `__enc__:1` envelope; `GET /v1/state` without `decrypt` scope returns the redacted form; with `decrypt` scope, plaintext is returned and the access is audited.
- Given a tenant with `classification_override_enabled=true` and a policy mapping `email` to `tokenize`, when an inbound payload contains top-level `email`, then the legacy forbidden-key rejection is bypassed and the field is tokenized per the policy. Without the override flag, legacy rejection wins.
- Given a policy with conflicting rules for the same path, when `PUT /v1/admin/classification/:org_id` is called, then admin receives 400 `invalid_classification_policy` with the conflict detail.

## Constraints

- **Additive, not replacive.** The pilot-safe default is unchanged.
- **Deterministic tokens.** Tokenize uses a per-org HMAC-SHA256 keyed by a KMS-derived secret (format `tok_<base32url(hmac)>`). This preserves idempotency at the control layer (same plaintext → same token → same derived state).
- **KMS scoping.** Encryption uses per-org data keys wrapped by a master KMS key; decrypting one tenant's data MUST NOT require access to another tenant's key.
- **Determinism of decisions.** Policy evaluation continues to run against the payload **as stored** (tokenized/encrypted forms); it MUST NOT implicitly decrypt. A field that decisions depend on cannot be `encrypt`-classified unless a sibling numeric projection is declared (see §Notes).

## Out of Scope

- HSM procurement, KMS key rotation schedules, BAA negotiation, and customer data-residency contracts. These live in ops / legal.
- Token vault **implementation** (DynamoDB with per-org partition, or a managed service like AWS Payment Cryptography). This spec requires *that it exists* and defines its contract, not how it is built.
- Retroactive re-classification of historical signals. Classification applies from the policy's effective version forward; reclassification of existing rows is a separate migration spec.
- Full DLP on free-form text (e.g. every string value scanned for PII). See §Options: Presidio — this is discussed but not required by v1 of this spec.

## Dependencies

### Required from Other Specs
| Dependency | Source Document | Status |
|------------|-----------------|--------|
| Tenant field mapping pipeline (enforcement point immediately after) | [`docs/specs/tenant-field-mappings.md`](tenant-field-mappings.md) | Defined ✓ |
| Forbidden-key categorization (legacy rejection behavior this spec extends) | [`docs/specs/ingestion-preflight.md`](ingestion-preflight.md) | Spec'd |
| Admin auth model | [`docs/specs/policy-management-api.md`](policy-management-api.md) | Defined ✓ |
| Receipts API (read-side enforcement target) | [`docs/specs/receipts-api.md`](receipts-api.md) | Defined ✓ |
| Compliance / security phased posture | [`internal-docs/compliance-security-posture-and-migration-path.md`](../../internal-docs/compliance-security-posture-and-migration-path.md) | Defined ✓ |

### Provides to Other Specs
| Function | Used By |
|----------|---------|
| `classifyField(orgId, path) → tier` | Ingestion, state read, receipts read |
| `tokenize(orgId, path, value) → token` / `detokenize(...)` | Any read surface needing plaintext |
| `encryptField(...)` / `decryptField(...)` | Same |

## Error Codes

### Existing (reuse)
| Code | Source |
|------|--------|
| `forbidden_semantic_key_detected` | Signal Ingestion (legacy; still fires when override flag is off) |
| `invalid_mapping_expression` | Tenant Field Mappings |

### New (add during implementation to `src/shared/error-codes.ts`)
| Code | Description |
|------|-------------|
| `classification_violation` | Ingested value hit a `reject` classification rule |
| `classification_required_missing` | Classified `required=true` field missing after normalization |
| `invalid_classification_policy` | Admin PUT body failed validation (conflict, bad path, invalid tier) |
| `classification_dynamo_degraded` | DynamoDB read failed; fell back to cache or default |

## Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| CLS-001 | No policy configured | Org with no classification | Behavior identical to today; forbidden-key tests still pass |
| CLS-002 | `reject` tier | Rule `{ path: "ssn", tier: "reject" }`, payload with `ssn` | Rejected, `classification_violation`, `field_path=payload.ssn` |
| CLS-003 | `tokenize` tier, determinism | Rule `{ path: "contactEmail", tier: "tokenize" }`, same payload twice | Both signals store the same token |
| CLS-004 | `encrypt` tier, storage shape | Rule `{ path: "healthScore", tier: "encrypt" }` | Stored payload contains `__enc__:1` envelope; plaintext absent from signal log |
| CLS-005 | Read redaction default | `GET /v1/state` without `decrypt` scope | Encrypted field rendered as redacted object |
| CLS-006 | Read allowed with scope | Admin reader with `decrypt` scope | Plaintext returned; access audit entry written |
| CLS-007 | Legacy override off | Tenant without `classification_override_enabled`, payload with `email` | Legacy rejection fires (forbidden PII) even if policy classifies `email` |
| CLS-008 | Legacy override on | Same as CLS-007 with override flag true | Tokenize per policy; legacy rejection bypassed |
| CLS-009 | Conflict in policy | PUT body with two rules for same path, different tiers | 400, `invalid_classification_policy` with conflict detail |
| CLS-010 | Required missing | `{ path: "healthScore", tier: "encrypt", required: true }`, payload missing `healthScore` | Rejected, `classification_required_missing` |
| CLS-011 | Validate endpoint | `POST /v1/admin/classification/:org_id/validate` with sample payload | Returns per-path decisions without persisting |
| CLS-012 | Policy version in trace | Any accepted signal under a classification policy | Decision trace includes `classification_policy_version` |

> **Test strategy note:** CLS-001, CLS-007 are **guard tests** that exercise the *non-classification* path and must sit alongside the existing forbidden-key suite so regressions are caught early. CLS-005/006 require an end-to-end harness with `x-admin-api-key` + decrypt-scope credentials. CLS-012 is verified by inspecting decision trace output.

## Concrete Values Checklist

### Wire formats

- Token format: `tok_<base32url(hmac-sha256(org_key, path + "\x1f" + value))[0..32]>`. `\x1f` is the ASCII unit separator (`0x1F`).
- Encryption envelope (stored in place of plaintext): `{ "__enc__": 1, "kid": "<kms-data-key-id>", "alg": "AES-256-GCM", "iv": "<base64url>", "ct": "<base64url>", "tag": "<base64url>" }`. The `__enc__` sentinel key is normatively reserved and MUST NOT appear in incoming payloads (enforced at ingestion; reject with `classification_violation`).
- Classification policy `version` follows semver `MAJOR.MINOR.PATCH`.

### HTTP behavior

| Transition | Status | Content-Type | Required headers |
|------------|--------|--------------|------------------|
| Admin PUT policy accepted | 200 | `application/json` | `ETag: "<policy_version>"` |
| Admin PUT policy invalid | 400 | `application/json` | — |
| Admin GET policy | 200 | `application/json` | `ETag: "<policy_version>"` |
| Validate endpoint | 200 | `application/json` | — |
| Ingestion rejection (`classification_violation`) | 400 | `application/json` | — |

### Cookies (if applicable)

N/A — header-based auth only.

### Env vars

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `CLASSIFICATION_ENABLED` | no | `false` | bool | Master switch; when false, classification is a pure no-op |
| `CLASSIFICATION_TABLE` | no | *(unset)* | string | DynamoDB table; when unset and `CLASSIFICATION_ENABLED=true`, falls back to file path below |
| `TENANT_CLASSIFICATION_PATH` | no | *(unset)* | string | File path for local-dev classification policy, per-org |
| `CLASSIFICATION_CACHE_TTL_MS` | no | `300000` | number | In-memory cache TTL |
| `CLASSIFICATION_KMS_KEY_ID` | if encrypt used | — | string | KMS CMK ARN for envelope encryption |
| `CLASSIFICATION_TOKEN_SECRET_ARN` | if tokenize used | — | string | Secrets Manager ARN storing the HMAC root secret |
| `CLASSIFICATION_OVERRIDE_DEFAULT` | no | `false` | bool | Global default for `classification_override_enabled` when tenant config is silent |

### Constants / limits

- Policy document size: ≤ 256 KB (DynamoDB item limit with margin).
- Max rules per policy: 1000.
- Max `path` length: 256 chars.
- Read audit log retention: ≥ 1 year (deployment-configurable).

### Routes registered

| Method | Path | Auth |
|--------|------|------|
| `PUT` | `/v1/admin/classification/:org_id` | `x-admin-api-key` |
| `GET` | `/v1/admin/classification/:org_id` | `x-admin-api-key` |
| `POST` | `/v1/admin/classification/:org_id/validate` | `x-admin-api-key` |
| `GET` | `/v1/admin/receipts/:decision_id/unredacted` | `x-admin-api-key` + `decrypt` scope |

## Production Correctness Notes

- **Proxy / `trustProxy`**: No change from existing admin surface.
- **CORS**: Admin-only endpoints; same-origin or restricted operator tooling. No wildcard CORS.
- **CSP / security headers**: Admin UIs (if any) rendering classified values MUST prevent caching (`Cache-Control: no-store`).
- **Cookie prefix vs Path scoping**: N/A.
- **Content-type parsing**: `application/json` only on admin endpoints; limit body to 512 KiB.
- **Body size limits**: Classification PUT capped at 512 KiB; validate endpoint samples capped at 256 KiB.
- **Rate-limit storage scope**: Admin endpoints share the existing admin rate limiter. Read-side classification checks are in-process; cache prevents per-request DynamoDB hit.
- **Error-code surface**: `classification_violation` and `classification_required_missing` are visible to tenants; `classification_dynamo_degraded` is internal-only (never returned to clients).
- **Subprocessors**: If tokenize/encrypt paths are enabled, the KMS key and Secrets Manager secret are handled exclusively in the tenant's AWS account; no third-party processor touches the classification-sensitive data in this spec. Presidio, if later adopted, is evaluated explicitly in §Options.

## Options — Library / service evaluation (for approval before implementation)

This section is **informative**. A library decision is **not** made by this spec; it feeds into `/plan-impl`.

### Option A — Keep structural, spec-defined rules only (no external DLP)

**What:** Classification is driven entirely by the per-tenant `ClassificationPolicy` (paths + tiers) plus the existing `FORBIDDEN_PII_KEYS` set. No runtime value scanning.

- **Pros:** Deterministic, fast, auditable. Matches today's engineering culture (contract-first, no ML in the hot path). Zero new subprocessors.
- **Cons:** Doesn't catch PII embedded in free-form text fields (e.g. a "notes" blob containing an SSN).
- **Recommendation:** Default v1 approach.

### Option B — Augment with Microsoft Presidio for value-level scanning

**What:** [Microsoft Presidio](https://github.com/microsoft/presidio) (Apache 2.0) scans **values** for recognizable entities (SSN, credit card, email, phone, names, etc.) using a pluggable recognizer pipeline (regex + NER). Add Presidio as a side-car (Python) or run its JS-callable service variant; invoke on tenants that opt in to DLP-class enforcement.

- **Pros:** Broad entity coverage out of the box; actively maintained; community-extensible recognizers; supports custom entities.
- **Cons:** Python service dependency (operational overhead for a TypeScript shop); latency impact (5–30 ms per field depending on value size and model); false positives require tuning; introduces a new subprocessor boundary if run as a managed service.
- **Recommendation:** Evaluate in a v1.1 spike gated by an explicit customer need (e.g. a vertical where free-form notes are ingested). Do not adopt blind.

### Option C — Augment with AWS Comprehend PII detection

**What:** Use `ComprehendClient.detectPiiEntities` as a managed alternative to Presidio; stays inside AWS trust boundary.

- **Pros:** Managed, no Python side-car, integrates with existing AWS IAM; good for HIPAA-aligned deployments already on AWS.
- **Cons:** Per-API-call cost at scale; regional availability; limited to AWS-supported entity types; less customization than Presidio.
- **Recommendation:** Preferred over Option B **if and only if** the deployment is already AWS-native and the tenant accepts Comprehend as a subprocessor (typical for pilots under AWS BAA).

### Decision framework

| Driver | Favor A | Favor B | Favor C |
|--------|---------|---------|---------|
| Free-form text fields in scope? | No | Yes | Yes |
| Python service tolerable operationally? | — | Yes | No |
| Already on AWS with BAA? | — | Neutral | Yes |
| Need for custom entity recognizers? | No | Yes | No (limited) |
| Per-call cost sensitivity? | — | Lower | Higher |

**Action:** Adopt Option A with this spec; re-open options B/C when a concrete customer requires free-form PII scanning. Do not block v1 on that decision.

## Notes

- **Why post-mapping enforcement?** Classification applies to **canonical** fields, not raw vendor aliases. If `vendor_ssn → ssn` is transformed first, the classification rule `{ path: "ssn", tier: "reject" }` fires consistently regardless of alias. Running classification on raw payloads would force every tenant to maintain a matching rule for each alias.
- **Why deterministic tokens?** The control layer's idempotency, decision determinism, and state deltas rely on stable inputs. Random tokens would produce different state rows for the same plaintext across retries. Deterministic HMAC tokens are resistant to brute force at reasonable value entropy, and the token vault still guards the plaintext.
- **Encryption vs decisions:** Fields that drive numeric policy rules (e.g. thresholds on `masteryScore`) must remain in plaintext or have a **sibling projection** (e.g. `masteryBucket: "high|mid|low"`) that policies consult. Otherwise decision determinism is lost. This constraint is surfaced at admin `PUT` validation: if a canonical path is referenced by any active policy's matched-field set **and** classified as `encrypt`, the admin API returns 400 unless a sibling projection is declared.
- **Test coverage crosswalk:** CLS-001 guards the pilot; CLS-007/008 guard the override; CLS-012 guards audit completeness. These three must sit in the merge-gate suite.
- **Downstream docs to update on adoption:**
  - [`internal-docs/compliance-security-posture-and-migration-path.md`](../../internal-docs/compliance-security-posture-and-migration-path.md) Phase B — point to this spec as the implementation vehicle.
  - [`ingestion-preflight.md`](ingestion-preflight.md) — cross-link to classification as the structured evolution of PII handling.
  - README roadmap — add entry under enterprise posture.

## Next Steps

After spec review:

- Run `/plan-impl docs/specs/tiered-data-classification.md`.
- Pair with a narrow customer scenario (one regulated field, `encrypt` tier, one tokenized contact field) to validate the admin surface and read redaction flow end-to-end.
