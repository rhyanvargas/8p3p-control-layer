---
name: Signal Ingestion
overview: Implement POST /signals endpoint as Stage 1 of the control layer lifecycle. Validates signal envelopes structurally, enforces idempotency, rejects forbidden semantic keys, and forwards accepted signals downstream. Must pass 11 contract tests (SIG-API-001 through SIG-API-011).
todos:
  - id: PREREQ-001
    content: Install Ajv dependency
    status: completed
  - id: TASK-001
    content: Create Shared Types
    status: completed
  - id: TASK-002
    content: Create Error Codes
    status: completed
  - id: TASK-003
    content: Create JSON Schema
    status: completed
  - id: TASK-004
    content: Create Ajv Validator
    status: completed
  - id: TASK-005
    content: Create Forbidden Keys Detector
    status: completed
  - id: TASK-006
    content: Create Forbidden Keys Unit Tests
    status: completed
  - id: TASK-007
    content: Create Idempotency Store
    status: completed
  - id: TASK-008
    content: Create Idempotency Unit Tests
    status: completed
  - id: TASK-009
    content: Create Ingestion Handler
    status: completed
  - id: TASK-010
    content: Create Fastify Routes
    status: completed
  - id: TASK-011
    content: Integrate Routes with Server
    status: completed
  - id: TASK-012
    content: Create Contract Tests
    status: completed
  - id: TASK-013
    content: Final Verification
    status: completed
isProject: false
---

# Signal Ingestion

**Spec**: `docs/specs/signal-ingestion.md`

## Prerequisites

Before starting implementation:

- PREREQ-001: Install Ajv dependency (`npm install ajv`)

## Tasks

### PREREQ-001: Install Ajv Dependency

- **Status**: completed
- **Files**: `package.json`
- **Action**: Install
- **Details**: Run `npm install ajv` to add JSON Schema validation library
- **Depends on**: none
- **Verification**: `ajv` appears in `dependencies`

---

### TASK-001: Create Shared Types

- **Status**: completed
- **Files**: `src/shared/types.ts`
- **Action**: Create
- **Details**: Define TypeScript interfaces:
  - `SignalEnvelope` - Input signal structure with all required/optional fields
  - `SignalIngestResult` - Response structure with status, received_at, rejection_reason
  - `RejectionReason` - Error details with code, message, field_path
  - `SignalStatus` - Union type: `'accepted' | 'rejected' | 'duplicate'`
- **Depends on**: PREREQ-001
- **Verification**: `npm run typecheck` passes

---

### TASK-002: Create Error Codes

- **Status**: completed
- **Files**: `src/shared/error-codes.ts`
- **Action**: Create
- **Details**: Define canonical error codes as string constants:
  - `MISSING_REQUIRED_FIELD = 'missing_required_field'`
  - `INVALID_TYPE = 'invalid_type'`
  - `INVALID_FORMAT = 'invalid_format'`
  - `INVALID_TIMESTAMP = 'invalid_timestamp'`
  - `INVALID_LENGTH = 'invalid_length'`
  - `INVALID_CHARSET = 'invalid_charset'`
  - `INVALID_SCHEMA_VERSION = 'invalid_schema_version'`
  - `PAYLOAD_NOT_OBJECT = 'payload_not_object'`
  - `FORBIDDEN_SEMANTIC_KEY_DETECTED = 'forbidden_semantic_key_detected'`
  - `DUPLICATE_SIGNAL_ID = 'duplicate_signal_id'`
  - `ORG_SCOPE_REQUIRED = 'org_scope_required'`
  - `REQUEST_TOO_LARGE = 'request_too_large'`
- **Depends on**: none
- **Verification**: All codes from spec are present, `npm run typecheck` passes

---

### TASK-003: Create JSON Schema

- **Status**: completed
- **Files**: `src/contracts/schemas/signal-envelope.json`
- **Action**: Create
- **Details**: Define JSON Schema for SignalEnvelope:
  - Required: `org_id`, `signal_id`, `source_system`, `learner_reference`, `timestamp`, `schema_version`, `payload`
  - `org_id`: string, minLength 1, maxLength 128
  - `signal_id`: string, minLength 1, maxLength 256, pattern `^[A-Za-z0-9._:-]+$`
  - `source_system`: string, minLength 1, maxLength 256
  - `learner_reference`: string, minLength 1, maxLength 256
  - `timestamp`: string (RFC3339 validated in code)
  - `schema_version`: string, pattern `^v[0-9]+$`
  - `payload`: type object
  - Optional `metadata`: object with `correlation_id`, `trace_id` strings
- **Depends on**: none
- **Verification**: Schema is valid JSON, can be parsed

---

### TASK-004: Create Ajv Validator

- **Status**: completed
- **Files**: `src/contracts/validators/signal-envelope.ts`
- **Action**: Create
- **Details**: 
  - Import and compile JSON schema with Ajv
  - Export `validateSignalEnvelope(data): ValidationResult`
  - Map Ajv errors to spec error codes
  - Add custom RFC3339 timestamp validation with timezone requirement
  - Return `{ valid: boolean, errors: RejectionReason[] }`
- **Depends on**: TASK-001, TASK-002, TASK-003
- **Verification**: Validator compiles, `npm run typecheck` passes

---

### TASK-005: Create Forbidden Keys Detector

- **Status**: completed
- **Files**: `src/ingestion/forbidden-keys.ts`
- **Action**: Create
- **Details**:
  - Define `FORBIDDEN_KEYS` set: `ui`, `screen`, `view`, `page`, `route`, `url`, `link`, `button`, `cta`, `workflow`, `task`, `job`, `assignment`, `assignee`, `owner`, `status`, `step`, `stage`, `completion`, `progress_percent`, `course`, `lesson`, `module`, `quiz`, `score`, `grade`, `content_id`, `content_url`
  - Export `detectForbiddenKeys(obj: unknown, basePath: string): ForbiddenKeyResult | null`
  - Recursive scan at all depths
  - Return `{ key: string, path: string }` for first forbidden key, or `null` if clean
- **Depends on**: TASK-001
- **Verification**: Unit tests pass

---

### TASK-006: Create Forbidden Keys Unit Tests

- **Status**: completed
- **Files**: `tests/unit/forbidden-keys.test.ts`
- **Action**: Create
- **Details**:
  - Test top-level key detection (`payload.ui`)
  - Test deeply nested key detection (`payload.x.y.workflow`)
  - Test clean payloads return null
  - Test each forbidden key is detected
  - Test non-object values are handled
- **Depends on**: TASK-005
- **Verification**: `npm run test:unit` passes

---

### TASK-007: Create Idempotency Store

- **Status**: completed
- **Files**: `src/ingestion/idempotency.ts`
- **Action**: Create
- **Details**:
  - Use better-sqlite3 for synchronous operations
  - Initialize table: `CREATE TABLE IF NOT EXISTS signal_ids (org_id TEXT, signal_id TEXT, received_at TEXT, PRIMARY KEY (org_id, signal_id))`
  - Export `initIdempotencyStore(dbPath: string): void`
  - Export `checkAndStore(orgId: string, signalId: string): IdempotencyResult`
  - Return `{ isDuplicate: boolean, receivedAt?: string }`
  - Initialize at module load for determinism
- **Depends on**: TASK-001
- **Verification**: Unit tests pass

---

### TASK-008: Create Idempotency Unit Tests

- **Status**: completed
- **Files**: `tests/unit/idempotency.test.ts`
- **Action**: Create
- **Details**:
  - Test first submission returns `isDuplicate: false`
  - Test second submission (same org_id + signal_id) returns `isDuplicate: true`
  - Test different org_id allows same signal_id
  - Test different signal_id in same org_id is accepted
  - Use in-memory SQLite for test isolation
- **Depends on**: TASK-007
- **Verification**: `npm run test:unit` passes

---

### TASK-009: Create Ingestion Handler

- **Status**: completed
- **Files**: `src/ingestion/handler.ts`
- **Action**: Create
- **Details**:
  - Export `handleSignalIngestion(request, reply): Promise<SignalIngestResult>`
  - Orchestrate validation pipeline in order:
    1. Structural validation with Ajv
    2. Forbidden key detection in payload
    3. Idempotency check
    4. Return result with `received_at` timestamp
  - **Determinism**: Same input always produces same output (except received_at)
  - Map all errors to proper `SignalIngestResult` format
- **Depends on**: TASK-004, TASK-005, TASK-007
- **Verification**: Handler compiles, `npm run typecheck` passes

---

### TASK-010: Create Fastify Routes

- **Status**: completed
- **Files**: `src/ingestion/routes.ts`
- **Action**: Create
- **Details**:
  - Export `registerIngestionRoutes(app: FastifyInstance): void`
  - Register `POST /signals` with handler
  - Set `bodyLimit` for request size control
  - Add appropriate content-type handling
- **Depends on**: TASK-009
- **Verification**: Route registers without errors

---

### TASK-011: Integrate Routes with Server

- **Status**: completed
- **Files**: `src/server.ts`
- **Action**: Modify
- **Details**:
  - Import `registerIngestionRoutes` from `./ingestion/routes.js`
  - Import and call `initIdempotencyStore` with DB path from env
  - Call `registerIngestionRoutes(server)` after Fastify init
  - Ensure graceful error handling
- **Depends on**: TASK-010
- **Verification**: Server starts, `POST /signals` responds

---

### TASK-012: Create Contract Tests

- **Status**: completed
- **Files**: `tests/contracts/signal-ingestion.test.ts`
- **Action**: Create
- **Details**: Implement all 11 contract tests:
  - `SIG-API-001`: Accept valid signal → `status=accepted`
  - `SIG-API-002`: Missing required field → `rejected`, `missing_required_field`
  - `SIG-API-003`: Invalid type (payload=[]) → `rejected`, `payload_not_object`
  - `SIG-API-004`: Invalid timestamp format → `rejected`, `invalid_timestamp`
  - `SIG-API-005`: Missing timezone → `rejected`, `invalid_timestamp`
  - `SIG-API-006`: Invalid schema_version → `rejected`, `invalid_schema_version`
  - `SIG-API-007`: Forbidden key (top-level) → `rejected`, `forbidden_semantic_key_detected`
  - `SIG-API-008`: Forbidden key (nested) → `rejected`, `forbidden_semantic_key_detected`
  - `SIG-API-009`: Invalid signal_id charset → `rejected`, `invalid_charset`
  - `SIG-API-010`: Duplicate signal_id → First: `accepted`, Second: `duplicate`
  - `SIG-API-011`: Deterministic rejection → Same error on repeat
- **Depends on**: TASK-011
- **Verification**: `npm run test:contracts` passes all 11 tests

---

### TASK-013: Final Verification

- **Status**: completed
- **Files**: none
- **Action**: Verify
- **Details**:
  - Run `npm run lint` - must pass
  - Run `npm run typecheck` - must pass
  - Run `npm test` - all tests must pass
  - Manual test: `curl -X POST http://localhost:3000/signals` with valid payload
  - Verify determinism: same invalid input produces same error twice
- **Depends on**: TASK-012
- **Verification**: All checks pass

---

## Files Summary

### To Create


| File                                          | Task     | Purpose                           |
| --------------------------------------------- | -------- | --------------------------------- |
| `src/shared/types.ts`                         | TASK-001 | TypeScript interfaces             |
| `src/shared/error-codes.ts`                   | TASK-002 | Canonical error code constants    |
| `src/contracts/schemas/signal-envelope.json`  | TASK-003 | JSON Schema definition            |
| `src/contracts/validators/signal-envelope.ts` | TASK-004 | Ajv validator wrapper             |
| `src/ingestion/forbidden-keys.ts`             | TASK-005 | Recursive forbidden key detector  |
| `tests/unit/forbidden-keys.test.ts`           | TASK-006 | Forbidden key unit tests          |
| `src/ingestion/idempotency.ts`                | TASK-007 | SQLite-backed duplicate detection |
| `tests/unit/idempotency.test.ts`              | TASK-008 | Idempotency unit tests            |
| `src/ingestion/handler.ts`                    | TASK-009 | Request handler orchestration     |
| `src/ingestion/routes.ts`                     | TASK-010 | Fastify route registration        |
| `tests/contracts/signal-ingestion.test.ts`    | TASK-012 | Contract tests (SIG-API-*)        |


### To Modify


| File            | Task       | Changes                              |
| --------------- | ---------- | ------------------------------------ |
| `package.json`  | PREREQ-001 | Add `ajv` dependency                 |
| `src/server.ts` | TASK-011   | Import and register ingestion routes |


## Test Plan


| Test ID     | Type     | Description                         | Task     |
| ----------- | -------- | ----------------------------------- | -------- |
| SIG-API-001 | contract | Accept valid signal                 | TASK-012 |
| SIG-API-002 | contract | Missing required field rejection    | TASK-012 |
| SIG-API-003 | contract | Invalid payload type rejection      | TASK-012 |
| SIG-API-004 | contract | Invalid timestamp format rejection  | TASK-012 |
| SIG-API-005 | contract | Missing timezone rejection          | TASK-012 |
| SIG-API-006 | contract | Invalid schema_version rejection    | TASK-012 |
| SIG-API-007 | contract | Forbidden key (top-level) rejection | TASK-012 |
| SIG-API-008 | contract | Forbidden key (nested) rejection    | TASK-012 |
| SIG-API-009 | contract | Invalid signal_id charset rejection | TASK-012 |
| SIG-API-010 | contract | Duplicate signal_id handling        | TASK-012 |
| SIG-API-011 | contract | Deterministic rejection             | TASK-012 |
| FK-UNIT-001 | unit     | Top-level forbidden key detection   | TASK-006 |
| FK-UNIT-002 | unit     | Nested forbidden key detection      | TASK-006 |
| FK-UNIT-003 | unit     | Clean payload returns null          | TASK-006 |
| ID-UNIT-001 | unit     | First submission not duplicate      | TASK-008 |
| ID-UNIT-002 | unit     | Second submission is duplicate      | TASK-008 |
| ID-UNIT-003 | unit     | Different org allows same signal_id | TASK-008 |


## Risks


| Risk                                   | Impact | Mitigation                                                          |
| -------------------------------------- | ------ | ------------------------------------------------------------------- |
| RFC3339 timezone validation edge cases | Medium | Use explicit regex for timezone requirement, test various formats   |
| SQLite initialization timing           | Medium | Initialize at module load, not on first request                     |
| Ajv error message mapping              | Medium | Create explicit mapping from Ajv error keywords to spec error codes |
| Performance of recursive key scan      | Low    | Current spec has no depth/size limits; can add later if needed      |


## Verification Checklist

- `POST /signals` accepts valid SignalEnvelope
- All required field validations work correctly
- Timestamp validation requires RFC3339 with timezone
- `schema_version` matches `^v[0-9]+$` only
- `signal_id` charset validation works
- Forbidden semantic keys rejected at any depth
- Idempotency: duplicates return `duplicate` status
- All SIG-API-001 through SIG-API-011 tests pass
- Determinism: same input always produces same output
- `npm run lint` passes
- `npm run typecheck` passes

## Implementation Order

```
PREREQ-001 (npm install ajv)
     │
     ├── TASK-001 (types) ────┬── TASK-004 (validator) ──┐
     │                        │                          │
     ├── TASK-002 (errors) ───┘                          │
     │                                                   │
     └── TASK-003 (schema) ──────────────────────────────┤
                                                         │
     TASK-005 (forbidden-keys) ── TASK-006 (fk tests) ───┤
                                                         │
     TASK-007 (idempotency) ── TASK-008 (id tests) ──────┤
                                                         │
                                                         ▼
                                                    TASK-009 (handler)
                                                         │
                                                         ▼
                                                    TASK-010 (routes)
                                                         │
                                                         ▼
                                                    TASK-011 (server)
                                                         │
                                                         ▼
                                                    TASK-012 (contract tests)
                                                         │
                                                         ▼
                                                    TASK-013 (final verification)
```

## Next Steps

After plan approval:

1. Run `/implement-spec docs/specs/signal-ingestion.md` to execute this plan
2. Agent will track progress through each task using the todos in frontmatter
3. Or implement manually, updating task status as you complete each step

