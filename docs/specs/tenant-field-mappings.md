# Tenant-Scoped Payload Field Mappings (DEF-DEC-006 + v1.1)

## Overview

This spec defines an **opt-in, per-tenant payload normalization + enforcement layer** during signal ingestion. v1 (implemented) adds alias normalization, required-field enforcement, and primitive type checks **without** changing the `POST /v1/signals` contract shape.

**v1.1 extension (pilot — Canvas):** Pilot customers need to POST **raw LMS payloads** (e.g. Canvas webhook JSON) and have 8P3P derive canonical fields (`stabilityScore`, `masteryScore`, `timeSinceReinforcement`, etc.). v1.1 adds:

1. **Declarative computed transforms** — safe arithmetic expressions over source fields (no arbitrary code).
2. **DynamoDB-backed mapping config** — `FieldMappingsTable`, keyed by `org_id` + `source_system`, with in-memory cache + TTL (same pattern as policy cache).
3. **Admin API** — upload/list mappings with `ADMIN_API_KEY` (same auth model as `docs/specs/policy-management-api.md`).
4. **Local-dev fallback** — `TENANT_FIELD_MAPPINGS_PATH` static JSON remains supported when DynamoDB mapping is absent or for offline dev.

Domain knowledge stays **tenant-owned**; the control layer executes mappings it does not invent. See `internal-docs/foundation/ip-defensibility-and-value-proposition.md` §Canonical Fields.

---

## Access Patterns (FieldMappingsTable)

Per [DynamoDB modeling guidance](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-modeling-nosql.html).

| # | Access Pattern | DynamoDB Operation |
|---|----------------|-------------------|
| 1 | Load mapping for org + `source_system` at ingestion | `GetItem(PK=org_id, SK=source_system)` |
| 2 | List all mappings for one org (admin) | `Query(PK=org_id)` |
| 3 | Admin upsert mapping for one source system | `PutItem` with `ConditionExpression` optional for version |
| 4 | Operator list all orgs’ mappings (optional pilot shortcut) | `Scan` on `FieldMappingsTable` (admin-only, low frequency) |

Table is defined in `docs/specs/aws-deployment.md` (`FieldMappingsTable`).

---

## Ingestion Pipeline Order

1. Structural validation (`SignalEnvelope`).
2. Forbidden semantic key detection (PII / UI keys).
3. **Tenant mapping** (this spec):  
   a. Resolve config: DynamoDB `GetItem(org_id, source_system)` → on miss, try file `TENANT_FIELD_MAPPINGS_PATH` for `org_id` → on miss, skip mapping (Phase 1 behavior).  
   b. Alias normalization (copy alias → canonical key; non-destructive).  
   c. **Computed transforms** (v1.1): evaluate each transform in order; write `target` keys into payload.  
   d. Required-field enforcement.  
   e. Primitive type enforcement.
4. Idempotency persistence and remainder of ingestion.

Transforms run **after** aliases, **before** required fields, so a transform may produce a required canonical field.

---

## Requirements

### Functional (v1 — existing)

- [x] **Opt-in per tenant**: When no mapping exists for `org_id` (and v1.1: no DynamoDB item and no file entry), ingestion behaves as Phase 1 (opaque payload except structural + forbidden keys).
- [x] **Pipeline placement**: As above.
- [x] **Alias normalization**: If canonical missing and exactly one alias candidate present → copy into canonical path; do not remove alias keys.
- [x] **Required field enforcement**: After normalization/transforms, configured required fields must be present (non-null; strings non-blank) or `rejected` / `missing_required_field`.
- [x] **Primitive type enforcement**: Configured `types` must match or `rejected` / `invalid_type`.
- [x] **File config**: `TENANT_FIELD_MAPPINGS_PATH` — load at startup; missing/invalid → fail open + warning.

### Functional (v1.1 — new)

- [x] **Computed transforms**: For each rule in `transforms[]`, read `source` from payload (dot-path allowed, e.g. `submission.score`), evaluate `expression` in a restricted grammar, write result to `target` (top-level canonical key unless spec says otherwise).
- [x] **DynamoDB config**: If `FIELD_MAPPINGS_TABLE` env is set and `GetItem` returns an item, use embedded mapping document; merge semantics = DynamoDB wins over file for same org+source_system when both exist (implementation: try DynamoDB first).
- [x] **Cache**: In-memory cache per `(org_id, source_system)` with TTL (default 300s, configurable); invalidate on admin `PUT` success for that key.
- [x] **Admin API**: `PUT /v1/admin/mappings/:org_id/:source_system` (body: full mapping JSON; optional `template_id` and `template_version` metadata), `GET /v1/admin/mappings/:org_id` (list SKs + metadata for that org, including template provenance when present). Auth: `ADMIN_API_KEY` only. Routed via `AdminFunction` (`docs/specs/aws-deployment.md`).
- [x] **Expression validation at upload**: Invalid expression → 400 at `PUT` time (admin API), never at runtime-only failure for pilot.

### Acceptance Criteria (v1 — unchanged)

- Given mapping requires `stabilityScore`, signal without it and without alias → `rejected`, `missing_required_field`, `field_path=payload.stabilityScore`.
- Given alias `stability_score` → `stabilityScore`, payload has alias only → `accepted`; stored payload has both.
- Given two aliases for same canonical without canonical → `rejected`, `invalid_format`.
- Given `types.level=number` and `level="5"` → `rejected`, `invalid_type`.

### Acceptance Criteria (v1.1)

- Given DynamoDB mapping with transform `target=stabilityScore`, `source=raw_score`, `expression=value/100`, payload `{ "raw_score": 65 }` → after mapping, `stabilityScore===0.65` and signal accepted if other requirements pass.
- Given admin `PUT` with expression `eval('process')` or forbidden token → 400 with validation error (SIG-API-017).
- Given DynamoDB item for `springs` + `canvas-lms`, ingestion with `source_system=canvas-lms` uses DynamoDB mapping (SIG-API-018).
- Given DynamoDB unreachable (simulated) and valid file mapping for org → fallback to file mapping; log warning (SIG-API-019).

---

## Restricted Transform Expression Grammar

Expressions are **not** arbitrary JavaScript. Implementations MUST use a whitelist approach (e.g. small parser or `expr-eval`-style AST with only allowed nodes).

**Allowed:**

- Literals: numbers.
- Variable: `value` — bound to the numeric (or coerced numeric) read from `source` path.
- Operators: `+`, `-`, `*`, `/`, parentheses.
- Functions: `Math.min`, `Math.max`, `Math.round` (fixed arity; no `Function`, no `import`, no property access on globals except `Math.*` listed).

**Forbidden:** `eval`, `new`, identifiers other than `value` and `Math`, bracket access, strings except as documented edge cases, ternary optional in v1.1.1 if needed.

Each transform:

```json
{
  "target": "stabilityScore",
  "source": "submission.score",
  "expression": "value / 100"
}
```

`source` uses dot-path into the **payload** object (after envelope unwrap). Missing `source` at runtime → transform skipped or rejection per tenant config flag `strict_transforms` (default: reject with `missing_required_field` on target if required).

---

## DynamoDB Item Shape (FieldMappingsTable)

| Attribute | Type | Description |
|-----------|------|-------------|
| `org_id` | S | PK |
| `source_system` | S | SK — must match `SignalEnvelope.source_system` (e.g. `canvas-lms`) |
| `mapping_version` | N | Optimistic locking / audit |
| `mapping` | M | Nested map: `required`, `aliases`, `types`, `transforms` (same shape as file JSON below) |
| `template_id` | S | (Optional) ID of the integration template this mapping was created from (e.g. `canvas-lms-v1`). Null/absent when mapping was manually created via admin `PUT`. Used by the Connector Layer (`docs/specs/integration-templates.md`) to track which tenant mappings are template-sourced vs. custom, enabling upgrade detection when 8P3P ships updated templates. |
| `template_version` | S | (Optional) Semantic version of the template at activation time (e.g. `1.0.0`). Compared against the registry's current version to surface upgrade prompts. |
| `updated_at` | S | ISO 8601 |
| `updated_by` | S | Admin key prefix |

---

## Configuration Shapes

### File shape (`TENANT_FIELD_MAPPINGS_PATH`) — extended v1.1

Top-level adds optional `source_system` per tenant entry when using file (for multi-source file); preferred v1.1 path is DynamoDB per `source_system` as SK.

```json
{
  "version": 2,
  "tenants": {
    "org-A": {
      "canvas-lms": {
        "payload": {
          "required": ["stabilityScore", "timeSinceReinforcement"],
          "aliases": {
            "stabilityScore": ["stability_score"],
            "timeSinceReinforcement": ["time_since_reinforcement_seconds"]
          },
          "types": {
            "stabilityScore": "number",
            "timeSinceReinforcement": "number"
          },
          "transforms": [
            {
              "target": "stabilityScore",
              "source": "grade",
              "expression": "value / 100"
            }
          ]
        }
      }
    }
  }
}
```

For backward compatibility, v1 shape `tenants.org-A.payload` without `source_system` nesting remains valid and applies to **all** `source_system` values for that org (implementation-defined: treat as `*` or default mapping).

### Canvas proof-of-concept (illustrative)

Canvas assignment / submission webhooks vary by account. Example mapping **illustration** (fields must be validated against real Canvas JSON from the pilot):

| Canvas path (example) | Canonical target | Transform |
|----------------------|------------------|-----------|
| `assignment.points_possible` + `submission.score` | `masteryScore` | `value` = `submission.score / assignment.points_possible` (clamp 0–1) |
| `submission.submitted_at` + server `now` | `timeSinceReinforcement` | `Math.round((now - submitted_at_ms) / 1000)` — may require two-source transform: v1.1.1 may add `expression` with multiple inputs or a `sources` array; **pilot MVP:** single `source` + expression only, or pre-normalize in receiver until multi-source is spec’d |

> **Note:** Multi-field transforms (e.g. numerator/denominator from two paths) may need a follow-up micro-spec or `sources: { num: "a", den: "b" }` with `expression: "num / den"`. For TASK-016 minimum, document as **Out of Scope** if single-source only — plan said Canvas example; I'll add Out of Scope line for multi-source v1.1.2.

---

## Out of Scope

- Per-tenant OpenAPI generation for payload (payload remains `object` in OpenAPI).
- Arbitrary code / user-defined functions in transforms.
- **Multi-source transforms** in v1.1.0 (two JSON paths in one expression) — defer to v1.1.1; pilot may use alias + single-source transform or thin receiver pre-normalization.
- Real-time EventBridge-driven mapping reload (cache TTL is sufficient for pilot).

---

## Constraints

- Mappings remain **declarative**; the platform does not embed Canvas-specific code — only tenant-stored config.
- **Vendor-agnostic:** Table and APIs are generic; Canvas is the first **documented example**, not a hardcoded branch in application code.
- **Contract stability:** No change to `SignalEnvelope` top-level shape; only `payload` contents are normalized.

---

## Dependencies

| Dependency | Source | Status |
|------------|--------|--------|
| `POST /v1/signals` pipeline | `docs/specs/signal-ingestion.md` | Defined |
| CDK stack + `FieldMappingsTable` | `docs/specs/aws-deployment.md` | Spec'd |
| Admin auth model | `docs/specs/policy-management-api.md` | Spec'd |
| DynamoDB patterns | `docs/specs/policy-storage.md` | Spec'd (reference) |

### Provides to

| Capability | Used By |
|------------|---------|
| `normalizeAndValidateTenantPayload()` extended | Signal ingestion |
| Admin mapping routes | `AdminFunction` |
| `template_id` / `template_version` on mapping items | `docs/specs/integration-templates.md` (Connector Layer — activation seeds these fields; upgrade detection reads them) |

---

## Error Codes

| Code | When |
|------|------|
| `missing_required_field` | Required canonical missing after aliases + transforms |
| `invalid_type` | Type mismatch |
| `invalid_format` | Alias conflict |
| `invalid_mapping_expression` | (v1.1) Runtime guard if expression fails safe-eval (should be rare if admin validation is correct) |

---

## Contract Tests

| Test ID | Description |
|---------|-------------|
| SIG-API-012 | Required canonical enforced |
| SIG-API-013 | Alias normalization |
| SIG-API-014 | Alias conflict |
| SIG-API-015 | Type enforcement |
| SIG-API-016 | Computed transform produces canonical field |
| SIG-API-017 | Invalid expression rejected at admin `PUT` |
| SIG-API-018 | DynamoDB mapping loaded for org + source_system |
| SIG-API-019 | Fallback to file when DynamoDB miss/unavailable |

---

## Notes

- **Cache TTL:** Default 300s; align with `policy-storage.md` cache discussion; document env override `FIELD_MAPPINGS_CACHE_TTL_MS`.
- **Partition key:** `org_id` on `FieldMappingsTable` matches pilot scale; same caveats as `PoliciesTable` if cross-org listing grows.
- **Security:** Admin mapping `PUT` must validate expression grammar server-side before `PutItem`.

---

*Spec updated: 2026-04-06 — v1.1.1 adds `template_id` / `template_version` optional metadata to DynamoDB item shape for Connector Layer forward-compatibility. v1.1 Canvas mapper, DynamoDB, transforms, admin API. Original DEF-DEC-006 v1 behavior retained.*
