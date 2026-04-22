---
name: Ingestion Preflight (Forbidden-Key Categorization + Dry-Run Endpoint)
overview: Split FORBIDDEN_KEYS into PII and semantic subsets (keeping the union for backward compat), extend detectForbiddenKeys to return the matched category, add a structured-log category field to the existing /v1/signals rejection path, and ship POST /v1/admin/ingestion/preflight — an admin-only, side-effect-free dry-run endpoint that analyses a raw customer sample, optionally simulates tenant field-mapping via resolveTenantPayloadMappingForIngest + normalizeAndValidateTenantPayload, and returns { forbidden_pii, forbidden_semantic_raw, forbidden_semantic_after_mapping, mapping_suggestions, verdict } keyed to a static per-source-system suggestion catalog. Zero change to live /v1/signals rejection contract. Ships alongside the new error code preflight_missing_scope_pair, OpenAPI updates, Lambda/CDK wiring for AdminFunction, contract tests INGEST-PREFLIGHT-001–012, unit tests FORBIDDEN-KEYS-SPLIT-001–005, and a one-line pilot-readiness gate edit.
todos:
  - id: "TASK-001"
    content: Add preflight_missing_scope_pair error code
    status: "pending"
  - id: "TASK-002"
    content: Extend ForbiddenKeyResult with category field
    status: "pending"
  - id: "TASK-003"
    content: Split forbidden-keys.ts into PII + semantic sets (keep union)
    status: "pending"
  - id: "TASK-004"
    content: Update detectForbiddenKeys to return category
    status: "pending"
  - id: "TASK-005"
    content: Add category to /v1/signals rejection structured log (no contract change)
    status: "pending"
  - id: "TASK-006"
    content: Unit tests FORBIDDEN-KEYS-SPLIT-001..005
    status: "pending"
  - id: "TASK-007"
    content: Add ulid dependency for pf_<ulid> preflight IDs
    status: "pending"
  - id: "TASK-008"
    content: Create mapping suggestions catalog (static, per-source-system)
    status: "pending"
  - id: "TASK-009"
    content: Implement framework-agnostic preflight handler core (no side effects)
    status: "pending"
  - id: "TASK-010"
    content: Register POST /v1/admin/ingestion/preflight Fastify route
    status: "pending"
  - id: "TASK-011"
    content: Wire preflight route into src/server.ts admin scope
    status: "pending"
  - id: "TASK-012"
    content: Wire preflight route into src/lambda/admin-handler.ts
    status: "pending"
  - id: "TASK-013"
    content: Add API Gateway route /v1/admin/ingestion/preflight in CDK
    status: "pending"
  - id: "TASK-014"
    content: Document POST /v1/admin/ingestion/preflight in openapi.yaml
    status: "pending"
  - id: "TASK-015"
    content: Contract tests INGEST-PREFLIGHT-001..012
    status: "pending"
  - id: "TASK-016"
    content: Add pilot readiness gate row to pilot-readiness-definition.md
    status: "pending"
isProject: false
---

# Ingestion Preflight (Forbidden-Key Categorization + Dry-Run Endpoint)

**Spec**: `docs/specs/ingestion-preflight.md`

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase.

### From spec § Requirements — Forbidden-key categorization — PII set

```
FORBIDDEN_PII_KEYS: Set<string> — exactly the PII keys currently at lines 58–86
(firstName, lastName, first_name, last_name, fullName, full_name,
 email, emailAddress, email_address,
 phone, phoneNumber, phone_number,
 ssn, social_security, socialSecurity,
 birthdate, birthday, birth_date, date_of_birth, dateOfBirth, dob,
 address, streetAddress, street_address,
 zipCode, zip_code, postalCode, postal_code)
```

### From spec § Requirements — Forbidden-key categorization — semantic set

```
FORBIDDEN_SEMANTIC_KEYS: Set<string> — exactly the non-PII keys currently at lines 20–56
(ui, screen, view, page, route, url, link, button, cta,
 workflow, task, job, assignment, assignee, owner,
 status, step, stage, completion, progress_percent,
 course, lesson, module, quiz, score, grade,
 content_id, content_url)
```

### From spec § Requirements — Forbidden-key categorization — union

```
FORBIDDEN_KEYS: Set<string> — union `new Set([...FORBIDDEN_PII_KEYS, ...FORBIDDEN_SEMANTIC_KEYS])`.
Existing import sites must compile unchanged.
```

### From spec § Requirements — detectForbiddenKeys return shape

```
detectForbiddenKeys(obj, basePath) signature extended to return
ForbiddenKeyResult | null where ForbiddenKeyResult now includes
category: 'pii' | 'semantic' in addition to the existing key + path.
The category is resolved by set membership of the matched key.
```

### From spec § Requirements — handler-core.ts behaviour

```
handler-core.ts:91–:114 continues to call detectForbiddenKeys on the raw
payload before tenant mapping and continues to reject with
FORBIDDEN_SEMANTIC_KEY_DETECTED (no new error code surfaced to callers —
the v1 live behavior is preserved; category is used internally for logging
and by the preflight endpoint).

Structured log line emitted on rejection SHOULD include
forbidden_key_category: "pii" | "semantic" so operator dashboards can
distinguish.
```

### From spec § Requirements — Preflight request body shape

```json
{
  "org_id": "springs",            // optional; enables post-mapping analysis
  "source_system": "canvas-lms",  // optional; required if org_id is set
  "payload": { "...": "..." }     // required; the raw sample to inspect
}
```

### From spec § Requirements — Preflight response body shape

```json
{
  "preflight_id": "pf_<ulid>",        // stable id for log correlation
  "received_at": "<iso8601>",
  "forbidden_pii": [                  // hits in raw payload
    { "key": "email", "path": "payload.learner.email" }
  ],
  "forbidden_semantic_raw": [         // hits in raw payload
    { "key": "score", "path": "payload.submission.score" }
  ],
  "forbidden_semantic_after_mapping": [   // hits after simulated mapping; null if no mapping simulated
    // empty array if mapping resolves all semantic hits; null if org_id/source_system absent or mapping not found
  ],
  "mapping_suggestions": [
    {
      "raw_key": "score",
      "raw_path": "payload.submission.score",
      "suggested_canonical": "masteryScore",
      "rationale": "Most-common canvas-lms mapping: masteryScore = submission.score / submission.total. See docs/specs/tenant-field-mappings.md § Canvas template.",
      "source": "static-catalog"
    }
  ],
  "verdict": "clean" | "pii_blocking" | "semantic_blocking" | "semantic_resolvable_by_mapping"
}
```

### From spec § Requirements — MUST NOT side-effects

```
Endpoint performs only static analysis + (optional) mapping simulation. It MUST NOT:
- call validateSignalEnvelope (this is a payload-only inspection, not a full envelope),
- call checkAndStore (no idempotency touch),
- call appendSignal or appendIngestionOutcome (no writes),
- call applySignals or evaluateState (no state / decision side effects).
```

### From spec § Requirements — verdict rules (evaluated in order)

```
1. forbidden_pii.length > 0                                           → "pii_blocking"
2. forbidden_semantic_raw.length === 0                                → "clean"
3. forbidden_semantic_after_mapping !== null && .length === 0         → "semantic_resolvable_by_mapping"
4. Otherwise                                                          → "semantic_blocking"
```

### From spec § Requirements — Bad input handling

```
- Body not a JSON object, missing `payload`, or `payload` not an object
  → 400, payload_not_object (existing ErrorCodes.PAYLOAD_NOT_OBJECT).
- `org_id` present without `source_system` (or vice versa)
  → 400, new code preflight_missing_scope_pair.
- Body larger than the preflight-specific limit
  → 413, request_too_large (existing code).
- Missing / invalid x-admin-api-key
  → 401, admin_key_required (existing code; enforced by adminApiKeyPreHandler, not this handler).
```

### From spec § Mapping Suggestion Catalog — MappingSuggestion shape

```ts
export interface MappingSuggestion {
  raw_key: string;                  // matches forbidden-semantic key
  suggested_canonical: string;      // canonical field name
  rationale: string;                // one-line operator-facing explanation
  applies_to_source_systems: string[] | '*'; // e.g. ['canvas-lms'], or '*' for universal
}
```

### From spec § Mapping Suggestion Catalog — v1 seed entries

```
| raw_key          | suggested_canonical | applies_to_source_systems          | rationale                                                                  |
| score            | masteryScore        | ['canvas-lms']                     | Canvas submission.score ÷ submission.total → masteryScore ∈ [0,1]          |
| grade            | masteryScore        | ['canvas-lms']                     | Letter/numeric grade normalization required; operator picks scheme         |
| completion       | stabilityScore      | ['i-ready']                        | I-Ready lesson completion is a proxy for mastery stability                 |
| progress_percent | stabilityScore      | ['i-ready', 'branching-minds']     | Percent-complete → [0,1] stability                                         |
| status           | —                   | *                                  | No suggestion — operator must decide semantic meaning                      |
```

### From spec § Error Codes — new codes table

```
| Code                            | Description                                                                                                    |
| preflight_missing_scope_pair    | Preflight request includes org_id but not source_system, or vice versa. Both or neither must be present.       |
```

### From spec § Concrete Values — HTTP behavior

```
| Transition                                     | Method | Path                               | Status | Content-Type     |
| Successful preflight (any verdict)             | POST   | /v1/admin/ingestion/preflight      | 200    | application/json |
| Malformed body (payload missing / not object)  | POST   | /v1/admin/ingestion/preflight      | 400    | application/json |
| Scope pair incomplete                          | POST   | /v1/admin/ingestion/preflight      | 400    | application/json |
| Body too large                                 | POST   | /v1/admin/ingestion/preflight      | 413    | application/json |
| Missing / invalid admin key                    | POST   | /v1/admin/ingestion/preflight      | 401    | application/json |
```

### From spec § Concrete Values — Env vars

```
| Variable                    | Required             | Default      | Type   | Description                                                                                               |
| ADMIN_API_KEY               | yes (pilot/prod)     | undefined    | string | Admin key required for all /v1/admin/* routes including preflight. If unset, admin routes are 401 closed. |
| PREFLIGHT_MAX_BODY_BYTES    | no                   | 32768 (32 KB)| number | Override for preflight-only body size cap.                                                                |
| FIELD_MAPPINGS_TABLE        | conditional          | undefined    | string | Existing env; mapping simulation reads from DynamoDB via resolveTenantPayloadMappingForIngest.            |
| TENANT_FIELD_MAPPINGS_PATH  | conditional          | undefined    | string | Existing env; file-backed mapping fallback used by mapping simulation.                                    |
```

### From spec § Concrete Values — Constants / limits

```
- Preflight body size limit: 32 KB by default (PREFLIGHT_MAX_BODY_BYTES).
- Recursion depth for detectForbiddenKeys: bounded by existing function (no explicit cap; JS stack limit applies).
- Rate limit: none in v1 (admin-only endpoint, ADMIN_API_KEY auth, human-driven).
- Preflight ID format: pf_<ulid> — 26-char ULID prefixed with pf_, generated server-side. Not persisted; returned purely for log correlation.
```

### From spec § Concrete Values — Routes registered

```
| Method | Path                               | Auth exempt? | Auth required      |
| POST   | /v1/admin/ingestion/preflight      | no           | x-admin-api-key    |
```

### From spec § Notes — mapping simulation non-destructive

```
`normalizeAndValidateTenantPayload` is already non-destructive
(docs/specs/tenant-field-mappings.md § alias normalization:
 "Normalization only *adds* canonical fields"). Simulation inherits
that property for free.
```

### From spec § Acceptance Criteria — no-scope case

```
Given a raw payload
  { "learner": { "email": "a@b.c" }, "submission": { "score": 85, "total": 100 } }
submitted to preflight with no org_id, when the endpoint runs, then response has
  forbidden_pii:                    [{ key: "email", path: "payload.learner.email" }]
  forbidden_semantic_raw:           [{ key: "score", path: "payload.submission.score" }]
  forbidden_semantic_after_mapping: null
  verdict:                          "pii_blocking"
```

---

## Prerequisites

Before starting implementation:

- [ ] **PREREQ-001** `adminApiKeyPreHandler` + `ADMIN_API_KEY` env model exists (`src/auth/admin-api-key-middleware.ts`; spec `docs/specs/policy-management-api.md` §Auth). Implemented ✓.
- [ ] **PREREQ-002** `/v1/admin` Fastify scope is already registered in `src/server.ts` with `adminApiKeyPreHandler` as the only preHandler and hosts `registerAdminFieldMappingsRoutes` + `registerPolicyManagementRoutes`. Implemented ✓ (server.ts:302–306).
- [ ] **PREREQ-003** `resolveTenantPayloadMappingForIngest(orgId, sourceSystem)` and `normalizeAndValidateTenantPayload({ orgId, payload, mappingOverride })` are exported from `src/config/tenant-field-mappings.ts`. Implemented ✓ (:102, :143).
- [ ] **PREREQ-004** `AdminFunction` Lambda wrapper exists at `src/lambda/admin-handler.ts` and is already bundled by CDK; extending it with a second route module is the deployment mechanism (`infra/lib/control-layer-stack.ts`:213). Implemented ✓.

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Add `preflight_missing_scope_pair` error code
- **Files**: `src/shared/error-codes.ts`
- **Action**: Modify
- **Details**: Append a new constant to the `ErrorCodes` object under a `// Ingestion Preflight` section: `PREFLIGHT_MISSING_SCOPE_PAIR: 'preflight_missing_scope_pair'`. Quote verbatim from Spec Literals § Error Codes — new codes table: `"Preflight request includes org_id but not source_system, or vice versa. Both or neither must be present."` as the JSDoc on the constant. Do **not** add `forbidden_pii_key_detected` or any preflight-specific variant — spec § Constraints: the /v1/signals rejection code stays `forbidden_semantic_key_detected` regardless of category.
- **Depends on**: none
- **Verification**: `npm run typecheck` passes; `rg "preflight_missing_scope_pair" src/` shows one hit (the constant); no existing code path returns this code yet.

### TASK-002: Extend `ForbiddenKeyResult` with `category` field
- **Files**: `src/shared/types.ts`
- **Action**: Modify
- **Details**: Quote from Spec Literals § detectForbiddenKeys return shape — `ForbiddenKeyResult now includes category: 'pii' | 'semantic'`. Update the existing interface:

```ts
export interface ForbiddenKeyResult {
  key: string;
  path: string;
  category: 'pii' | 'semantic';
}
```

  Do **not** make `category` optional — spec § Requirements says "resolved by set membership of the matched `key`", so every return value has a category. Breaking this invariant into optional would force callers to handle an impossible `undefined` branch.
- **Depends on**: none (independent of TASK-001)
- **Verification**: `npm run typecheck` surfaces exactly the known call sites (`src/ingestion/forbidden-keys.ts`, `src/ingestion/handler-core.ts`) that need updates in TASK-004/TASK-005.

### TASK-003: Split `forbidden-keys.ts` into PII + semantic sets (keep union)
- **Files**: `src/ingestion/forbidden-keys.ts`
- **Action**: Modify
- **Details**: Replace the single `FORBIDDEN_KEYS` literal with three exported sets. Quote verbatim from Spec Literals § FORBIDDEN_PII_KEYS and § FORBIDDEN_SEMANTIC_KEYS for membership — do not paraphrase the lists; copy names exactly. `FORBIDDEN_KEYS` is then constructed as `new Set([...FORBIDDEN_PII_KEYS, ...FORBIDDEN_SEMANTIC_KEYS])` (Spec Literals § FORBIDDEN_KEYS union). Keep all three exports so the existing import in `handler-core.ts` (`FORBIDDEN_KEYS` / `detectForbiddenKeys`) and any test importing `FORBIDDEN_KEYS` continues to compile. File header comment should cite `docs/specs/ingestion-preflight.md § Requirements` and drop the obsolete "two categories handled identically at runtime" sentence.
- **Depends on**: none (data-only change; TASK-004 consumes it)
- **Verification**: Existing unit test `tests/unit/forbidden-keys.test.ts` describe block "All forbidden keys detection" (iterates `FORBIDDEN_KEYS`) still passes; TASK-006 adds explicit membership tests.

### TASK-004: Update `detectForbiddenKeys` to return `category`
- **Files**: `src/ingestion/forbidden-keys.ts`
- **Action**: Modify
- **Details**: At the point where a forbidden key is found (currently `if (FORBIDDEN_KEYS.has(key))` at line 125), resolve category by set membership and include it in the returned `ForbiddenKeyResult`. Quote from Spec Literals § detectForbiddenKeys return shape — category must be derived from set membership of the matched key, not hardcoded:

```ts
if (FORBIDDEN_PII_KEYS.has(key)) return { key, path: currentPath, category: 'pii' };
if (FORBIDDEN_SEMANTIC_KEYS.has(key)) return { key, path: currentPath, category: 'semantic' };
```

  (Use two independent `.has` checks in this order rather than a ternary on the union; makes the category resolution auditable and keeps the PII-first ordering that § Constraints treats as non-negotiable.) Update the JSDoc `@example` blocks so each returned object includes `category`.
- **Depends on**: TASK-002, TASK-003
- **Verification**: Unit test FORBIDDEN-KEYS-SPLIT-004 (TASK-006) asserts `{ key: 'email', path: 'payload.email', category: 'pii' }`. Existing unit tests (FK-UNIT-001, FK-UNIT-002, FK-PII-001) continue to pass because they only check `key` + `path` via optional chaining.

### TASK-005: Add `forbidden_key_category` to `/v1/signals` rejection structured log
- **Files**: `src/ingestion/handler-core.ts`
- **Action**: Modify
- **Details**: In the `if (forbiddenKey) { … }` block (lines 93–112), keep the `RejectionReason.code` as `ErrorCodes.FORBIDDEN_SEMANTIC_KEY_DETECTED` — quote from Spec Literals § handler-core.ts behaviour: *"continues to reject with FORBIDDEN_SEMANTIC_KEY_DETECTED (no new error code surfaced to callers — the v1 live behavior is preserved; category is used internally for logging and by the preflight endpoint)."* Before the `logIngestionOutcome` call, add a structured `log.warn?.({ org_id: signal.org_id, signal_id: signal.signal_id, forbidden_key: forbiddenKey.key, forbidden_key_path: forbiddenKey.path, forbidden_key_category: forbiddenKey.category }, 'forbidden key detected in payload')` so dashboards can filter by category. Do **not** mutate the response body or rejection_reason shape — the contract stays bit-identical (acceptance criterion 5).
- **Depends on**: TASK-004
- **Verification**: FORBIDDEN-KEYS-SPLIT-005 (existing `tests/contracts/signal-ingestion.test.ts` suite, unchanged) still passes; a spy on `log.warn` in a new unit fixture observes `forbidden_key_category` on rejection.

### TASK-006: Unit tests FORBIDDEN-KEYS-SPLIT-001..005
- **Files**: `tests/unit/forbidden-keys.test.ts`
- **Action**: Modify
- **Details**: Extend the existing file (do not create a new one — all forbidden-key unit tests live in this file). Add a new `describe('FORBIDDEN-KEYS-SPLIT', …)` block with:
  - **FORBIDDEN-KEYS-SPLIT-001**: import `FORBIDDEN_PII_KEYS`, assert `.size === 28` (count the spec § Requirements PII list literally: `firstName`, `lastName`, `first_name`, `last_name`, `fullName`, `full_name`, `email`, `emailAddress`, `email_address`, `phone`, `phoneNumber`, `phone_number`, `ssn`, `social_security`, `socialSecurity`, `birthdate`, `birthday`, `birth_date`, `date_of_birth`, `dateOfBirth`, `dob`, `address`, `streetAddress`, `street_address`, `zipCode`, `zip_code`, `postalCode`, `postal_code` = 28 keys — note spec § Requirements says "all 27 PII keys" in the test narrative but enumerates 28 literal entries; **deviation** tracked in § Deviations below), and assert every item from the semantic list is absent.
  - **FORBIDDEN-KEYS-SPLIT-002**: import `FORBIDDEN_SEMANTIC_KEYS`, assert `.size === 28` (spec § Requirements enumerates 28 keys), and assert every PII key is absent.
  - **FORBIDDEN-KEYS-SPLIT-003**: assert `FORBIDDEN_KEYS.size === FORBIDDEN_PII_KEYS.size + FORBIDDEN_SEMANTIC_KEYS.size` and that every member of each subset appears in the union.
  - **FORBIDDEN-KEYS-SPLIT-004**: `detectForbiddenKeys({ email: 'x' }, 'payload')` returns `{ key: 'email', path: 'payload.email', category: 'pii' }` and `detectForbiddenKeys({ score: 5 }, 'payload')` returns `{ key: 'score', path: 'payload.score', category: 'semantic' }`.
  - **FORBIDDEN-KEYS-SPLIT-005** is a **regression guarantee** rather than a new unit test; it is satisfied by leaving `tests/contracts/signal-ingestion.test.ts` unmodified. Add a short comment at the top of the new describe block pointing to that file and to the acceptance criterion in `docs/specs/ingestion-preflight.md` § Acceptance Criteria so reviewers can locate the proof.
- **Depends on**: TASK-003, TASK-004
- **Verification**: `npx vitest run tests/unit/forbidden-keys.test.ts` passes; `rg "FORBIDDEN-KEYS-SPLIT" tests/` shows exactly the five IDs above.

### TASK-007: Add `ulid` dependency for `pf_<ulid>` preflight IDs
- **Files**: `package.json`, `package-lock.json`
- **Action**: Modify
- **Details**: Quote from Spec Literals § Constants / limits: *"Preflight ID format: pf_<ulid> — 26-char ULID prefixed with pf_, generated server-side."* `crypto.randomUUID()` returns a 36-char UUIDv4, which would break the literal. Per `.cursor/rules/prefer-existing-solutions/RULE.md`, install the `ulid` npm package (zero deps, ~2 KB, standard lexicographic sortable 26-char encoding) rather than hand-rolling Crockford base32. Run `npm install ulid` pinned to the current latest; do not pick a version at plan time — the skill's principle is "don't make up dependency versions." Add one-line justification in the commit message.
- **Depends on**: none
- **Verification**: `npm ls ulid` shows the package; `node -e "console.log(require('ulid').ulid().length)"` prints `26`.

### TASK-008: Create mapping suggestions catalog (static, per-source-system)
- **Files**: `src/ingestion/mapping-suggestions-catalog.ts` (new)
- **Action**: Create
- **Details**: Quote the `MappingSuggestion` interface verbatim from Spec Literals § MappingSuggestion shape; do not rename fields. Seed the exported `const MAPPING_SUGGESTIONS_CATALOG: MappingSuggestion[]` array with the five rows from Spec Literals § v1 seed entries — literal `raw_key`, `suggested_canonical`, `applies_to_source_systems`, and `rationale` values. Export a pure lookup helper:

```ts
export function findMappingSuggestions(
  rawKey: string,
  sourceSystem: string | null
): MappingSuggestion[] {
  return MAPPING_SUGGESTIONS_CATALOG.filter((s) =>
    s.raw_key === rawKey &&
    (s.applies_to_source_systems === '*' ||
      (sourceSystem !== null && s.applies_to_source_systems.includes(sourceSystem)))
  );
}
```

  Keys with no entry return `[]` — quote spec § Mapping Suggestion Catalog: *"Keys with no catalog entry produce no suggestion (empty suggestion list for that hit). The `verdict` logic does not depend on the catalog."* The file must be pure data + one pure function; no imports from `./forbidden-keys` or `./handler-core`.
- **Depends on**: none (independent data module)
- **Verification**: `rg "findMappingSuggestions" src/` shows one hit (the export); catalog contains exactly 5 rows; `status` row has `suggested_canonical === null` or is represented via an omitted entry — plan uses explicit `suggested_canonical: null` + `applies_to_source_systems: '*'` but **deviates from spec literal** (spec shows `—`); see § Deviations.

### TASK-009: Implement framework-agnostic preflight handler core (no side effects)
- **Files**: `src/ingestion/preflight-handler-core.ts` (new)
- **Action**: Create
- **Details**: Mirror the `handleSignalIngestionCore`/`HandlerResult<T>` pattern (`src/ingestion/handler-core.ts`) for consistency with the Lambda + Fastify split the repo already uses. Export:

```ts
export interface PreflightRequest {
  org_id?: string;
  source_system?: string;
  payload: unknown;
}

export interface ForbiddenKeyHit { key: string; path: string; }

export interface PreflightResponse {
  preflight_id: string;
  received_at: string;
  forbidden_pii: ForbiddenKeyHit[];
  forbidden_semantic_raw: ForbiddenKeyHit[];
  forbidden_semantic_after_mapping: ForbiddenKeyHit[] | null;
  mapping_suggestions: Array<{
    raw_key: string;
    raw_path: string;
    suggested_canonical: string;
    rationale: string;
    source: 'static-catalog';
  }>;
  verdict: 'clean' | 'pii_blocking' | 'semantic_blocking' | 'semantic_resolvable_by_mapping';
  note?: string;
  mapping_error?: string;
}

export async function handlePreflightCore(
  body: unknown,
  log?: { warn?: (obj: unknown, msg: string) => void; info?: (obj: unknown, msg: string) => void }
): Promise<HandlerResult<PreflightResponse | { error: { code: string; message: string } }>>;
```

  Pipeline (each step quoted from spec where applicable):
  1. Validate `body` is a JSON object; validate `payload` is an object — on failure return `{ statusCode: 400, body: { error: { code: ErrorCodes.PAYLOAD_NOT_OBJECT, message: 'payload must be a JSON object' } } }`. Quote Spec Literals § Bad input handling row 1.
  2. If `org_id` XOR `source_system` is set → `{ statusCode: 400, body: { error: { code: ErrorCodes.PREFLIGHT_MISSING_SCOPE_PAIR, message: 'org_id and source_system must both be present or both absent' } } }`. Quote Spec Literals § Bad input handling row 2.
  3. Collect **all** hits (do not early-return on first match — existing `detectForbiddenKeys` returns only the first; implement a new local walker `collectAllForbiddenKeys(payload, 'payload')` that reuses `FORBIDDEN_PII_KEYS` / `FORBIDDEN_SEMANTIC_KEYS` membership checks and recurses with the same object-only / array-skip semantics as `detectForbiddenKeys`; see § Risks "walker duplication" for the rationale). Partition the result into `forbidden_pii: ForbiddenKeyHit[]` (category === 'pii') and `forbidden_semantic_raw: ForbiddenKeyHit[]` (category === 'semantic'). `ForbiddenKeyHit` omits `category` per spec response shape (Spec Literals § Preflight response body shape).
  4. Build `mapping_suggestions[]` by iterating `forbidden_semantic_raw` hits and calling `findMappingSuggestions(hit.key, source_system ?? null)` from TASK-008, flattening and annotating each with the original `raw_path` from the hit and `source: 'static-catalog'` (quote spec § Response body shape).
  5. If both `org_id` and `source_system` are present, call `const mapping = await resolveTenantPayloadMappingForIngest(org_id, source_system)` (Spec Literals § MUST NOT side-effects forbids `checkAndStore`/`appendSignal`/`appendIngestionOutcome`/`applySignals`/`evaluateState`/`validateSignalEnvelope` — `resolveTenantPayloadMappingForIngest` is explicitly allowed). If `mapping === null` → `forbidden_semantic_after_mapping = null`, `note = 'No mapping exists for (org_id, source_system). Register one via PUT /v1/admin/mappings/:org_id/:source_system.'` (Spec § Requirements preflight endpoint bullet: *"the response MAY include a `note` field pointing to PUT /v1/admin/mappings/:org_id/:source_system"*). Otherwise call `normalizeAndValidateTenantPayload({ orgId: org_id, payload, mappingOverride: mapping })` — on `ok === false` treat as mapping simulation failure (`forbidden_semantic_after_mapping = null`, `mapping_error = errors[0].message`). Quote spec § Production Correctness Notes: *"Mapping simulation errors (e.g. invalid expression in stored mapping) are caught, logged, and surfaced as `{ mapping_error: \"<message>\" }` in the response body — not raised to 500."*
  6. On mapping success, re-run the `collectAllForbiddenKeys` walker against the normalized payload and keep only the semantic hits for `forbidden_semantic_after_mapping`.
  7. Resolve `verdict` by applying Spec Literals § verdict rules in order.
  8. Generate `preflight_id = \`pf_\${ulid()}\`` (TASK-007). `received_at = new Date().toISOString()`. Emit one structured `log.info?.({ preflight_id, org_id: org_id ?? null, source_system: source_system ?? null, verdict, pii_hits: forbidden_pii.length, semantic_hits_raw: forbidden_semantic_raw.length }, 'preflight complete')` for correlation.
  9. Return `{ statusCode: 200, body: <PreflightResponse> }`.

  Module MUST NOT import `validateSignalEnvelope`, `checkAndStore`, `appendSignal`, `appendIngestionOutcome`, `applySignals`, or `evaluateState` — lint this by listing allowed imports at the top of the file in a comment and asserting absence via `rg` in the verification step.
- **Depends on**: TASK-001, TASK-003, TASK-004, TASK-007, TASK-008
- **Verification**: `npm run typecheck` passes; `rg -n "checkAndStore|appendSignal|appendIngestionOutcome|applySignals|evaluateState|validateSignalEnvelope" src/ingestion/preflight-handler-core.ts` returns **no matches**. INGEST-PREFLIGHT-011 (TASK-015) provides dynamic proof via spies.

### TASK-010: Register `POST /v1/admin/ingestion/preflight` Fastify route
- **Files**: `src/routes/admin-ingestion-preflight.ts` (new)
- **Action**: Create
- **Details**: Export `registerAdminIngestionPreflightRoutes(app: FastifyInstance): void` following the pattern of `src/routes/admin-field-mappings.ts`. Register `POST /ingestion/preflight` (the `/v1/admin` prefix is applied by the registering scope in TASK-011). Route config:

  ```ts
  app.post('/ingestion/preflight', {
    bodyLimit: parseInt(process.env.PREFLIGHT_MAX_BODY_BYTES ?? '32768', 10),
    handler: async (request, reply) => {
      const result = await handlePreflightCore(request.body, request.log);
      return reply.status(result.statusCode).send(result.body);
    },
  });
  ```

  Quote Spec Literals § Constants / limits: *"Preflight body size limit: 32 KB by default (PREFLIGHT_MAX_BODY_BYTES)."* Fastify returns `413 Fast_ERR_VALIDATION` / `FST_ERR_CTP_BODY_TOO_LARGE` automatically when the limit is exceeded — confirm in INGEST-PREFLIGHT-010 (TASK-015) that the resulting payload maps to `request_too_large` (existing `ErrorCodes.REQUEST_TOO_LARGE`). If Fastify's default body-too-large response does not carry the `request_too_large` code, add a tiny `setErrorHandler`-scoped mapping in this route file (not globally) that converts `FST_ERR_CTP_BODY_TOO_LARGE` → `{ statusCode: 413, body: { error: { code: ErrorCodes.REQUEST_TOO_LARGE, message: 'Preflight body exceeds size limit' } } }`. Quote spec § Bad input handling row 3. Do not add any additional preHandler — auth is the scope-level `adminApiKeyPreHandler` applied by `src/server.ts`.
- **Depends on**: TASK-009
- **Verification**: `npm run typecheck` passes; manual `curl -X POST http://localhost:3000/v1/admin/ingestion/preflight -H 'x-admin-api-key: …' -d '{"payload":{}}'` returns 200 with a `pf_<ulid>`-prefixed id.

### TASK-011: Wire preflight route into `src/server.ts` admin scope
- **Files**: `src/server.ts`
- **Action**: Modify
- **Details**: In the existing `server.register(async (admin) => { admin.addHook('preHandler', adminApiKeyPreHandler); … }, { prefix: '/v1/admin' })` block (lines 302–306), add `registerAdminIngestionPreflightRoutes(admin)` alongside `registerPolicyManagementRoutes` / `registerAdminFieldMappingsRoutes`. Import the new function at the top next to the other admin-route imports. Do **not** create a second admin scope — spec § Requirements: preflight uses the same `adminApiKeyPreHandler` that already gates `/v1/admin/*`. Do **not** add the route to the `server.get('/', …)` endpoints summary — admin endpoints are not advertised on the public index.
- **Depends on**: TASK-010
- **Verification**: `npm run dev` starts cleanly; `curl -i http://localhost:3000/v1/admin/ingestion/preflight` (no key) returns 401 `admin_key_required` from `adminApiKeyPreHandler`; with key returns 400 `payload_not_object` (body missing). Both prove scope wiring.

### TASK-012: Wire preflight route into `src/lambda/admin-handler.ts`
- **Files**: `src/lambda/admin-handler.ts`
- **Action**: Modify
- **Details**: Import `registerAdminIngestionPreflightRoutes` and call it inside the existing `app.register(async (admin) => { admin.addHook('preHandler', adminApiKeyPreHandler); … }, { prefix: '/v1/admin' })` block, alongside `registerPolicyManagementRoutes` and (if present) `registerAdminFieldMappingsRoutes`. **Check**: `admin-handler.ts` currently only registers `registerPolicyManagementRoutes` — `registerAdminFieldMappingsRoutes` is wired into the local server but the Lambda admin handler registers only the policy routes. If true, this TASK should register **both** `registerAdminFieldMappingsRoutes` and `registerAdminIngestionPreflightRoutes` so the Lambda matches the local server surface (otherwise pilots using AWS get 404 on preflight). Header comment (`Route coverage:` block) is updated to list:

  ```
  Route coverage:
    PUT    /v1/admin/policies/:org_id/:policy_key
    PATCH  /v1/admin/policies/:org_id/:policy_key
    POST   /v1/admin/policies/validate
    DELETE /v1/admin/policies/:org_id/:policy_key
    GET    /v1/admin/policies
    PUT    /v1/admin/mappings/:org_id/:source_system
    GET    /v1/admin/mappings/:org_id
    POST   /v1/admin/ingestion/preflight
  ```
- **Depends on**: TASK-011
- **Verification**: `npm run build` + `cd infra && npx cdk synth` succeeds; grep confirms both `registerAdminFieldMappingsRoutes` and `registerAdminIngestionPreflightRoutes` are imported in the admin Lambda entry.

### TASK-013: Add API Gateway route `/v1/admin/ingestion/preflight` in CDK
- **Files**: `infra/lib/control-layer-stack.ts`
- **Action**: Modify
- **Details**: After the existing `adminMappings` block (lines 365–368), add:

  ```ts
  const adminIngestion = admin.addResource('ingestion');
  const adminIngestionPreflight = adminIngestion.addResource('preflight');
  adminIngestionPreflight.addMethod('POST', new apigateway.LambdaIntegration(this.adminFunction));
  ```

  No new IAM grant is required — `AdminFunction` already has `fieldMappingsTable.grantReadWriteData` (line 251) which is sufficient for `resolveTenantPayloadMappingForIngest`'s DynamoDB GetItem reads. The preflight handler performs no writes. Do **not** add ReadWrite on other tables — spec § Constraints: *"No new mapping storage."*
- **Depends on**: TASK-012
- **Verification**: `cd infra && npx cdk synth` shows a new `AWS::ApiGateway::Method` at path `/v1/admin/ingestion/preflight` with method POST; no diff to IAM policies.

### TASK-014: Document `POST /v1/admin/ingestion/preflight` in `openapi.yaml`
- **Files**: `docs/api/openapi.yaml`
- **Action**: Modify
- **Details**: Add the new path under `/v1/admin/ingestion/preflight` with:
  - `security: [{ AdminApiKeyAuth: [] }]` (reuse the existing security scheme used by admin mapping routes; if the scheme is not yet defined, add it with `type: apiKey, in: header, name: x-admin-api-key`, quoting spec § Routes registered).
  - `requestBody` matching Spec Literals § Preflight request body shape exactly — field names `org_id`, `source_system`, `payload`; required: `['payload']`; `description` quotes spec inline.
  - `responses`:
    - `200` with `PreflightResponse` schema literal-equal to Spec Literals § Preflight response body shape (keep `forbidden_semantic_after_mapping` nullable; `verdict` enumerated as `clean | pii_blocking | semantic_blocking | semantic_resolvable_by_mapping`).
    - `400` with `{ error: { code, message } }` and `code` enumerated as `payload_not_object | preflight_missing_scope_pair`. Quote from Spec Literals § Bad input handling.
    - `401` referencing the existing shared admin-401 response (`admin_key_required`).
    - `413` referencing the existing shared `request_too_large` response.
  - Example request/response pair for the spec § Acceptance Criteria "no-scope case" payload.

  Do **not** document `forbidden_semantic_key_detected` as a preflight response code — quote spec § Error Codes: *"`forbidden_semantic_key_detected` is **not** returned by the preflight endpoint. Preflight always responds `200` on a well-formed request."*
- **Depends on**: TASK-010
- **Verification**: `npm run validate:api` passes (`redocly lint docs/api/openapi.yaml`).

### TASK-015: Contract tests INGEST-PREFLIGHT-001..012
- **Files**: `tests/contracts/ingestion-preflight.test.ts` (new)
- **Action**: Create
- **Details**: Follow the shape of `tests/contracts/admin-field-mappings.test.ts` — build a local Fastify instance, register one admin scope with `adminApiKeyPreHandler` + `registerAdminIngestionPreflightRoutes`, set `process.env.ADMIN_API_KEY = 'test-admin-key-abc'` for the suite, use `contractHttp(app, { … })` from `tests/helpers/contract-http.ts` so AWS-DEPLOY-CT coverage kicks in when `API_BASE_URL` is set. Spies required for INGEST-PREFLIGHT-011 — mock the modules at boundaries:

  - `vi.mock('../../src/ingestion/idempotency.js', () => ({ checkAndStore: vi.fn() }))`
  - `vi.mock('../../src/signalLog/store.js', () => ({ appendSignal: vi.fn() }))`
  - `vi.mock('../../src/ingestion/ingestion-log-store.js', () => ({ appendIngestionOutcome: vi.fn() }))`
  - Assert the DynamoDBDocumentClient mock (installed via `_setFieldMappingsDynamoClientForTesting`) received **no** `PutCommand` — only `GetCommand` for mapping reads is permitted.

  One test case per spec § Contract Tests row. Quote test inputs verbatim from the spec table — do not re-compose them. For INGEST-PREFLIGHT-004, seed a mapping via the `_setFieldMappingsDynamoClientForTesting` mock so `resolveTenantPayloadMappingForIngest('springs', 'canvas-lms')` returns a `TenantPayloadMapping` with `transforms: [{ target: 'masteryScore', sources: { score: 'submission.score', total: 'submission.total' }, expression: 'score / total' }]` — this is exactly the expression form validated in `tests/contracts/admin-field-mappings.test.ts`. Quote spec § Test strategy note on the asymmetry: *"forbidden_semantic_after_mapping reports hits against the **normalized** payload (which still contains the raw key alongside the new canonical key, since normalizeAndValidateTenantPayload is non-destructive per tenant-field-mappings.md § alias normalization)."* That means INGEST-PREFLIGHT-004 expects `forbidden_semantic_after_mapping: [{ key: 'score', path: 'payload.submission.score' }]` in the **hit list**; `verdict === 'semantic_blocking'` is the literal outcome from applying the verdict rules to that state, not `semantic_resolvable_by_mapping`. Spec § Acceptance Criteria bullet 2 agrees: *"the `forbidden_semantic_after_mapping` array includes `score` only if the mapping does NOT canonicalize it (so the operator sees the truth)."* This is **called out as a deviation below** so the spec table row "Expected" (`forbidden_semantic_after_mapping: []`) and the spec prose disagree; see § Deviations.
- **Depends on**: TASK-010, TASK-011
- **Verification**: `npx vitest run tests/contracts/ingestion-preflight.test.ts` — all 12 tests green; INGEST-PREFLIGHT-011 spy assertions show zero calls on `checkAndStore` / `appendSignal` / `appendIngestionOutcome` and zero `PutCommand` invocations on the DynamoDB mock.

### TASK-016: Add pilot readiness gate row to `pilot-readiness-definition.md`
- **Files**: `internal-docs/pilot-operations/pilot-readiness-definition.md`
- **Action**: Modify
- **Details**: Under the `§ Integration` subsection (or equivalent — confirm exact heading at implementation time), append one checkbox row: *"Raw sample payload preflight passes (no unresolved `forbidden_semantic` hits after mapping)."* Quote this sentence verbatim from spec § Overview bullet 3. Add a parenthetical reference to `docs/specs/ingestion-preflight.md` + the admin endpoint path. Do **not** expand the row into a runbook — that lives in `internal-docs/pilot-operations/pilot-runbook.md` and is out of scope for this plan (spec § Out of Scope is silent on runbook expansion; handle in a follow-up PR if CS asks).
- **Depends on**: TASK-010 (endpoint must at least exist in the codebase before the gate is published to CS)
- **Verification**: `rg "Raw sample payload preflight" internal-docs/pilot-operations/` returns exactly one hit; `docs/specs/README.md` (if it lists cross-refs) receives no change.

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| `src/ingestion/mapping-suggestions-catalog.ts` | TASK-008 | Static v1 catalog + pure lookup function |
| `src/ingestion/preflight-handler-core.ts` | TASK-009 | Framework-agnostic preflight pipeline; asserted side-effect-free |
| `src/routes/admin-ingestion-preflight.ts` | TASK-010 | Fastify route registration for POST /ingestion/preflight |
| `tests/contracts/ingestion-preflight.test.ts` | TASK-015 | INGEST-PREFLIGHT-001..012 |

### To Modify

| File | Task | Changes |
|------|------|---------|
| `src/shared/error-codes.ts` | TASK-001 | Add `PREFLIGHT_MISSING_SCOPE_PAIR` |
| `src/shared/types.ts` | TASK-002 | Extend `ForbiddenKeyResult` with `category: 'pii' \| 'semantic'` |
| `src/ingestion/forbidden-keys.ts` | TASK-003, TASK-004 | Split sets; return category in `detectForbiddenKeys` |
| `src/ingestion/handler-core.ts` | TASK-005 | Emit `forbidden_key_category` on rejection log; preserve response contract |
| `tests/unit/forbidden-keys.test.ts` | TASK-006 | Add FORBIDDEN-KEYS-SPLIT-001..005 describe block |
| `package.json` / `package-lock.json` | TASK-007 | Add `ulid` dependency |
| `src/server.ts` | TASK-011 | Register preflight routes in `/v1/admin` scope |
| `src/lambda/admin-handler.ts` | TASK-012 | Register preflight + mappings routes in Lambda admin app |
| `infra/lib/control-layer-stack.ts` | TASK-013 | Add API Gateway resource + method for preflight |
| `docs/api/openapi.yaml` | TASK-014 | Document new admin endpoint |
| `internal-docs/pilot-operations/pilot-readiness-definition.md` | TASK-016 | Add Integration-gate row |

## Requirements Traceability

> Every `- [ ]` bullet under the spec's `## Requirements` and every `Given/When/Then` under `## Acceptance Criteria` must map to at least one TASK here.

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| `src/ingestion/forbidden-keys.ts` exports `FORBIDDEN_PII_KEYS` / `FORBIDDEN_SEMANTIC_KEYS` / `FORBIDDEN_KEYS` union | spec § Requirements — Forbidden-key categorization | TASK-003 |
| `detectForbiddenKeys` signature extended to include `category` | spec § Requirements | TASK-002, TASK-004 |
| `handler-core.ts:91–:114` continues to reject with `FORBIDDEN_SEMANTIC_KEY_DETECTED` | spec § Requirements | TASK-005 |
| Structured log emits `forbidden_key_category` | spec § Requirements | TASK-005 |
| `POST /v1/admin/ingestion/preflight` registered on admin scope; auth via `adminApiKeyPreHandler` | spec § Requirements — Preflight endpoint | TASK-010, TASK-011 |
| Request body shape `{ org_id?, source_system?, payload }` | spec § Requirements | TASK-009 |
| Endpoint MUST NOT call `validateSignalEnvelope` / `checkAndStore` / `appendSignal` / `appendIngestionOutcome` / `applySignals` / `evaluateState` | spec § Requirements | TASK-009 (static); TASK-015 INGEST-PREFLIGHT-011 (dynamic) |
| Response body shape with `preflight_id`, `received_at`, `forbidden_pii`, `forbidden_semantic_raw`, `forbidden_semantic_after_mapping`, `mapping_suggestions`, `verdict` | spec § Requirements | TASK-009 |
| Mapping simulation via `resolveTenantPayloadMappingForIngest` + `normalizeAndValidateTenantPayload({ mappingOverride })` when scope pair present | spec § Requirements | TASK-009 |
| `forbidden_semantic_after_mapping: null` + `note` when scope pair is set but no mapping exists | spec § Requirements | TASK-009 |
| `mapping_suggestions[]` sourced from static catalog | spec § Requirements + § Mapping Suggestion Catalog | TASK-008, TASK-009 |
| `verdict` resolution rules 1–4 in order | spec § Requirements | TASK-009 |
| 400 `payload_not_object` on missing/non-object payload | spec § Requirements — Bad input handling | TASK-009 |
| 400 `preflight_missing_scope_pair` on mismatched scope | spec § Requirements — Bad input handling | TASK-001, TASK-009 |
| 413 `request_too_large` on oversize body | spec § Requirements — Bad input handling | TASK-010 |
| 401 `admin_key_required` on missing admin key | spec § Requirements | TASK-011 (scope wiring; handler not reached) |
| **AC-1** Payload with `learner.email` + `submission.score`, no `org_id` → `pii_blocking` with expected arrays | spec § Acceptance Criteria | TASK-009, TASK-015 (INGEST-PREFLIGHT-002 / 005) |
| **AC-2** Same payload with `(springs, canvas-lms)` scope — mapping preserves raw `score`; after-mapping hit list includes `score`; PII still blocks | spec § Acceptance Criteria | TASK-009, TASK-015 (INGEST-PREFLIGHT-004) |
| **AC-3** Clean payload → `verdict: "clean"` | spec § Acceptance Criteria | TASK-015 (INGEST-PREFLIGHT-001) |
| **AC-4** Preflight does not call `appendIngestionOutcome` / `appendSignal` / `checkAndStore`; no DynamoDB `PutItem` | spec § Acceptance Criteria | TASK-015 (INGEST-PREFLIGHT-011) |
| **AC-5** Live `/v1/signals` response shape/code is bit-identical before & after | spec § Acceptance Criteria | TASK-005 + FORBIDDEN-KEYS-SPLIT-005 regression (unchanged `tests/contracts/signal-ingestion.test.ts`) |
| **AC-6** Tenant key on `/v1/admin/ingestion/preflight` → 401 `admin_key_required` | spec § Acceptance Criteria | TASK-015 (INGEST-PREFLIGHT-007, 008) |
| Pilot readiness gate row added | spec § Overview bullet 3 + § Notes "Pilot readiness gate addition" | TASK-016 |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| FORBIDDEN-KEYS-SPLIT-001 | unit | `FORBIDDEN_PII_KEYS` exports with expected PII-only membership | TASK-006 |
| FORBIDDEN-KEYS-SPLIT-002 | unit | `FORBIDDEN_SEMANTIC_KEYS` exports with expected semantic-only membership | TASK-006 |
| FORBIDDEN-KEYS-SPLIT-003 | unit | `FORBIDDEN_KEYS` = union; size and membership | TASK-006 |
| FORBIDDEN-KEYS-SPLIT-004 | unit | `detectForbiddenKeys` returns `category` correctly | TASK-006 |
| FORBIDDEN-KEYS-SPLIT-005 | regression | Existing `signal-ingestion.test.ts` passes unchanged | TASK-005 (negative — file unchanged) |
| INGEST-PREFLIGHT-001 | contract | Clean payload, no scope → `verdict: "clean"` | TASK-015 |
| INGEST-PREFLIGHT-002 | contract | PII detected at depth → `verdict: "pii_blocking"` | TASK-015 |
| INGEST-PREFLIGHT-003 | contract | Semantic key, no mapping → `verdict: "semantic_blocking"` + suggestion | TASK-015 |
| INGEST-PREFLIGHT-004 | contract | Semantic key with mapping scope — after-mapping shape per § Test strategy note | TASK-015 |
| INGEST-PREFLIGHT-005 | contract | Both PII + semantic — PII precedence | TASK-015 |
| INGEST-PREFLIGHT-006 | contract | `org_id` without `source_system` → 400 `preflight_missing_scope_pair` | TASK-015 |
| INGEST-PREFLIGHT-007 | contract | No admin key → 401 `admin_key_required` | TASK-015 |
| INGEST-PREFLIGHT-008 | contract | Tenant key only → 401 `admin_key_required` | TASK-015 |
| INGEST-PREFLIGHT-009 | contract | `payload` non-object → 400 `payload_not_object` | TASK-015 |
| INGEST-PREFLIGHT-010 | contract | Body > 32 KB → 413 `request_too_large` | TASK-015 |
| INGEST-PREFLIGHT-011 | contract | No side effects (spies asserted zero calls) | TASK-015 |
| INGEST-PREFLIGHT-012 | contract | Scope pair with no mapping → `forbidden_semantic_after_mapping: null` + `note` | TASK-015 |

## Deviations from Spec

> List every place the plan's literal values differ from the spec. Deviations hidden in task bodies are treated as drift defects by `/review --spec`.

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| § Requirements — Forbidden-key categorization | "exactly the PII keys currently at lines 58–86" and test narrative "**all 27 PII keys** listed in § Requirements" | Plan tests assert `FORBIDDEN_PII_KEYS.size === 28` because the enumerated literal list contains 28 entries (`firstName, lastName, first_name, last_name, fullName, full_name, email, emailAddress, email_address, phone, phoneNumber, phone_number, ssn, social_security, socialSecurity, birthdate, birthday, birth_date, date_of_birth, dateOfBirth, dob, address, streetAddress, street_address, zipCode, zip_code, postalCode, postal_code`). The current `src/ingestion/forbidden-keys.ts` also lists 28 (lines 59–86). | **Update spec in same PR** — correct the test-narrative "27" to "28" in § Contract Tests FORBIDDEN-KEYS-SPLIT-001. |
| § Mapping Suggestion Catalog — `status` row | `suggested_canonical = —` (em dash) | Plan represents the `status` row with `suggested_canonical: null` in the `MappingSuggestion` interface (adds `| null` to the type) so the catalog stays a flat array and matches JSON serialisation in the endpoint response. Alternative was to simply omit the row — rejected because spec prose says *"preflight flags but does not auto-map"* for `status`, which only holds if the row is present and exposed to telemetry. | **Update spec in same PR** — amend § MappingSuggestion shape to `suggested_canonical: string \| null`. |
| § Contract Tests — INGEST-PREFLIGHT-004 "Expected" column | `forbidden_semantic_after_mapping: []` (mapping added `masteryScore` — the `score` key is still present but is a raw-layer concern) | § Acceptance Criteria bullet 2 and § Test strategy note both say the after-mapping array **includes** `score` because normalization is additive. The plan assertion follows § Test strategy note (the more specific guidance): expect `forbidden_semantic_after_mapping: [{ key: 'score', path: 'payload.submission.score' }]`, `verdict: 'semantic_blocking'`. The § Contract Tests row and § Acceptance Criteria disagree with each other inside the spec itself. | **Update spec in same PR** — align § Contract Tests row's "Expected" column with § Test strategy note + § Acceptance Criteria: hit list retains `score`, verdict is `semantic_blocking`. |
| § Concrete Values — Routes registered | `/v1/admin/ingestion/preflight` | Plan implements route path exactly as written. | **Reverted — plan now matches spec.** |
| § Requirements — response body `mapping_suggestions[]` entry shape | Each entry has `raw_key`, `raw_path`, `suggested_canonical`, `rationale`, `source` | Plan emits entries with exactly those five fields; when the catalog matches multiple suggestions for a raw key (e.g. future expansion), all are emitted — spec is silent on single-vs-multiple but v1 catalog has at most one match per `(raw_key, source_system)`. | Implementation detail — spec silent. |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Copy-paste from `handleSignalIngestionCore` introduces a side effect into preflight (idempotency write, signal log append) | High — violates the single most important correctness property (spec § Production Correctness Notes) | TASK-009 forbids the side-effecting imports at the top of the file via a comment-listed allowlist; TASK-015 INGEST-PREFLIGHT-011 enforces it dynamically with `vi.fn()` spies and a DynamoDB mock that rejects `PutCommand`. A `rg` in the verification step catches regressions in CI. |
| Walker duplication — introducing `collectAllForbiddenKeys` in preflight-handler-core parallel to `detectForbiddenKeys` drifts over time | Medium — membership + path rules could diverge, causing preflight to disagree with the live gate | TASK-009 explicitly imports `FORBIDDEN_PII_KEYS` / `FORBIDDEN_SEMANTIC_KEYS` from `forbidden-keys.ts` (single source of truth). Path and array-skip semantics mirror `detectForbiddenKeys`. A follow-up refactor can replace both with a single generator-style walker; out of scope because `detectForbiddenKeys` early-return behaviour is load-bearing for `/v1/signals` performance. |
| `ulid` package adds a supply-chain surface for a 26-char ID | Low — ~2 KB, zero-dep package, widely used | TASK-007 pins via `npm install`; `npm audit` runs in CI. If supply-chain concern elevates, a 20-line inline Crockford-base32 encoder can replace the import without changing the wire format — spec only requires the `pf_<ulid>` shape. |
| `AdminFunction` Lambda currently misses `registerAdminFieldMappingsRoutes` (local server registers it; Lambda does not) — adding preflight there while leaving mappings absent would be inconsistent | Low — pilot currently runs locally; Lambda gap was pre-existing | TASK-012 registers **both** `registerAdminFieldMappingsRoutes` and the new preflight routes so Lambda matches local surface. Called out explicitly in TASK-012 details with "Check" prefix so reviewers verify the pre-existing gap before accepting the fix. |
| Preflight reveals forbidden-key catalog by shape, functioning as an enumeration surface | Low — admin-only; not a real security boundary (spec § Constraints acknowledges this) | No mitigation beyond `ADMIN_API_KEY` + optional future rate-limit reuse (spec § Constants — v1.1). |
| Fastify default 413 response body may not carry `{ error: { code: 'request_too_large' } }`, breaking the spec error-body contract | Medium — INGEST-PREFLIGHT-010 would fail even though status is correct | TASK-010 adds a route-scoped `setErrorHandler` that maps `FST_ERR_CTP_BODY_TOO_LARGE` → `ErrorCodes.REQUEST_TOO_LARGE`. Verified by INGEST-PREFLIGHT-010. |
| Mapping simulation throws unexpectedly (e.g. stored mapping with invalid expression) and surfaces as 500 | Medium — spec § Production Correctness Notes forbids 500 on mapping errors | TASK-009 wraps `normalizeAndValidateTenantPayload` in try/catch, reports as `mapping_error` in 200 response, `forbidden_semantic_after_mapping: null`. |

## Verification Checklist

- [ ] All tasks completed
- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] OpenAPI lints clean (`npm run validate:api`)
- [ ] CDK synth succeeds (`cd infra && npx cdk synth`)
- [ ] `rg -n "checkAndStore|appendSignal|appendIngestionOutcome|applySignals|evaluateState|validateSignalEnvelope" src/ingestion/preflight-handler-core.ts` returns no matches
- [ ] `tests/contracts/signal-ingestion.test.ts` is **unchanged** on disk (regression guarantee for AC-5)
- [ ] Spec deviations (rows in § Deviations) resolved in the same PR via a follow-up spec edit or reverted

## Implementation Order

```
TASK-001 ─┐
TASK-002 ─┤
TASK-003 ─┼─▶ TASK-004 ─▶ TASK-005 ─▶ TASK-006
TASK-007 ─┤                              │
TASK-008 ─┘                              │
                                         ▼
                                     TASK-009 ─▶ TASK-010 ─▶ TASK-011 ─▶ TASK-012 ─▶ TASK-013
                                                                │
                                                                ├─▶ TASK-014
                                                                ├─▶ TASK-015
                                                                └─▶ TASK-016
```
