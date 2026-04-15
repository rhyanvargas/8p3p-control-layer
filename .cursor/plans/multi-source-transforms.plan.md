---
name: Multi-Source Transforms (v1.1.1)
overview: |
  Extends the restricted transform expression grammar to support multiple source fields per transform rule. A new `sources: Record<string, string>` field (mutually exclusive with `source`) enables declarative two-operand computations like `score / total` by binding named variables into the expression. The tokenizer replaces TT.VALUE with a generic TT.IDENTIFIER token, the parser resolves identifiers against a variable map, and all four touch-point files are updated — transform-expression.ts, tenant-field-mappings.ts, field-mappings-dynamo.ts, admin-field-mappings.ts — plus three test files covering all 12 contract tests.
todos:
  - id: TASK-001
    content: "Refactor tokenizer: TT.VALUE → TT.IDENTIFIER + generic identifier matching"
    status: completed
  - id: TASK-002
    content: "Refactor parser: variable Map instead of single value"
    status: completed
  - id: TASK-003
    content: "Extend public API: validateTransformExpression + evaluateTransform overloads"
    status: completed
  - id: TASK-004
    content: "Update TransformRule type: add optional sources field"
    status: completed
  - id: TASK-005
    content: Update runtime transform loop for multi-source evaluation
    status: completed
  - id: TASK-006
    content: Update parseMappingFromItem for sources field
    status: completed
  - id: TASK-007
    content: "Update validateMappingBody: mutual exclusivity + sources validation"
    status: completed
  - id: TASK-008
    content: "Unit tests: transform-expression.test.ts (MST-001, MST-002, MST-010, MST-012)"
    status: completed
  - id: TASK-009
    content: "Unit tests: field-mappings-resolve.test.ts (MST-003, MST-004, MST-011)"
    status: completed
  - id: TASK-010
    content: "Contract tests: admin-field-mappings.test.ts (MST-005 through MST-009)"
    status: completed
isProject: false
---

# Multi-Source Transforms (v1.1.1)

**Spec**: `docs/specs/multi-source-transforms.md`

## Prerequisites

Before starting implementation:
- [x] `TransformRule` type + `evaluateTransform()` implemented (v1.1)
- [x] `validateTransformExpression()` implemented in `src/config/transform-expression.ts`
- [x] `parseMappingFromItem()` implemented in `src/config/field-mappings-dynamo.ts`
- [x] Admin `PUT` validation implemented in `src/routes/admin-field-mappings.ts`
- [x] `normalizeAndValidateTenantPayload()` runtime transform loop implemented

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

### TASK-001: Refactor tokenizer — TT.VALUE → TT.IDENTIFIER + generic identifier matching

- **Files**: `src/config/transform-expression.ts`
- **Action**: Modify
- **Details**:
  1. Replace `TT.VALUE` enum member with `TT.IDENTIFIER`
  2. In `tokenize()`, replace the `value` keyword check (lines 78–82) with a generic identifier regex: `/^[a-zA-Z_][a-zA-Z0-9_]*/`. Must check for `Math.min`, `Math.max`, `Math.round` first (already done — no change needed there).
  3. The identifier match emits `{ type: TT.IDENTIFIER, raw: <matched_text> }`.
  4. Remove the old "Anything else is forbidden" catch-all that fires on unknown alpha — the identifier regex will now capture it, and the *parser* rejects unknowns.
  5. Keep the catch-all for truly unexpected characters (symbols like `@`, `#`, etc.).
- **Depends on**: none
- **Verification**: Existing unit tests in `transform-expression.test.ts` continue to pass (since `value` is now matched as a generic identifier). The "rejects unknown identifier 'score'" test will fail temporarily until TASK-002 wires the parser to reject unknowns — that's expected.

### TASK-002: Refactor parser — variable Map instead of single value

- **Files**: `src/config/transform-expression.ts`
- **Action**: Modify
- **Details**:
  1. Change `Parser` constructor from `(tokens: Token[], value: number)` to `(tokens: Token[], variables: Map<string, number>)`.
  2. In `parsePrimary()`, replace the `TT.VALUE` branch with: when token is `TT.IDENTIFIER`, look up `token.raw` in `this.variables`. If found, return the bound numeric value. If not found, throw `Error("Unknown variable '<name>' — not bound in sources or not 'value'")`.
  3. This preserves the whitelist security model: only explicitly bound identifiers resolve.
- **Depends on**: TASK-001
- **Verification**: All existing single-source tests pass when the caller passes `new Map([['value', numericValue]])`. Unknown identifiers are rejected with a descriptive error.

### TASK-003: Extend public API — validateTransformExpression + evaluateTransform overloads

- **Files**: `src/config/transform-expression.ts`
- **Action**: Modify
- **Details**:
  1. **Reserved identifiers list**: Export a `const RESERVED_IDENTIFIERS: ReadonlySet<string>` containing: `eval`, `new`, `function`, `return`, `import`, `export`, `this`, `class`, `var`, `let`, `const`, `Math`, `undefined`, `null`, `true`, `false`, `Infinity`, `NaN`, `process`, `require`, `window`, `document`, `globalThis`.
  2. **`validateTransformExpression` signature change**:
     ```typescript
     validateTransformExpression(
       expression: string,
       allowedVariables?: string[]  // defaults to ['value']
     ): ValidateResult
     ```
     When `allowedVariables` is provided, build `Map` from `allowedVariables` with all values `1` (non-zero avoids spurious division-by-zero during validation). When omitted, default to `['value']` for backward compat.
  3. **`evaluateTransform` overload**: Add a second signature:
     ```typescript
     evaluateTransform(expression: string, variables: Map<string, number>): number
     ```
     The existing `evaluateTransform(expression: string, value: number): number` wraps into `new Map([['value', value]])` internally.
     Implementation: single function body that checks `typeof arg2 === 'number'` vs `arg2 instanceof Map`.
- **Depends on**: TASK-002
- **Verification**: `validateTransformExpression('score / total', ['score', 'total'])` returns `{ ok: true }`. `validateTransformExpression('value / total', ['total'])` returns `{ ok: false }` (unknown variable `value`). `evaluateTransform('score / total', new Map([['score', 68], ['total', 100]]))` returns `0.68`.

### TASK-004: Update TransformRule type — add optional sources field

- **Files**: `src/config/tenant-field-mappings.ts`
- **Action**: Modify
- **Details**:
  1. Change `TransformRule` interface:
     ```typescript
     export interface TransformRule {
       target: string;
       source?: string;              // now optional (single-source mode)
       sources?: Record<string, string>; // NEW (multi-source mode)
       expression: string;
     }
     ```
  2. No runtime behavior change in this task — just the type.
- **Depends on**: none
- **Verification**: TypeScript compiles. Existing code that reads `rule.source` gets a type narrowing note but no compile error (they already guard on undefined).

### TASK-005: Update runtime transform loop for multi-source evaluation

- **Files**: `src/config/tenant-field-mappings.ts`
- **Action**: Modify
- **Details**:
  1. Import `evaluateTransform` with the Map overload (already imported, just the signature expanded in TASK-003).
  2. In `normalizeAndValidateTenantPayload`, replace the existing transform loop (lines ~201–226) with:
     ```
     for each rule in transforms:
       if rule.sources:
         // Multi-source path
         let variables = new Map<string, number>();
         let skipTransform = false;
         for each (varName, dotPath) in rule.sources:
           const val = getAtPath(normalized, dotPath);
           if val is missing/null:
             if strict: push missing_required_field error for dotPath
             skipTransform = true; break;
           coerce to number → variables.set(varName, numeric)
         if skipTransform: continue
         try: result = evaluateTransform(rule.expression, variables)
              setAtPath(normalized, rule.target, result)
         catch: push invalid_mapping_expression error
       else if rule.source:
         // Single-source path (unchanged v1.1 behavior)
         ... existing code ...
     ```
  3. The single-source path remains identical to current implementation.
- **Depends on**: TASK-003, TASK-004
- **Verification**: Multi-source transform with `{ score: 68, total: 100 }` produces `masteryScore = 0.68`. Missing source with `strict=false` skips. Missing source with `strict=true` rejects.

### TASK-006: Update parseMappingFromItem for sources field

- **Files**: `src/config/field-mappings-dynamo.ts`
- **Action**: Modify
- **Details**:
  1. In `parseMappingFromItem` (lines 76–84), update the transform filter to accept rules with *either* `source` (string) or `sources` (object with string values):
     ```typescript
     out.transforms = mapping.transforms.filter(
       (x): x is TransformRule =>
         x !== null &&
         typeof x === 'object' &&
         typeof (x as Record<string, unknown>).target === 'string' &&
         typeof (x as Record<string, unknown>).expression === 'string' &&
         (
           typeof (x as Record<string, unknown>).source === 'string' ||
           (typeof (x as Record<string, unknown>).sources === 'object' &&
            (x as Record<string, unknown>).sources !== null &&
            !Array.isArray((x as Record<string, unknown>).sources))
         ),
     );
     ```
  2. This ensures items stored with `sources` are parsed correctly from DynamoDB.
- **Depends on**: TASK-004
- **Verification**: A DynamoDB item with `sources: { score: "submission.score", total: "assignment.points_possible" }` is correctly parsed into a `TransformRule`. Items with `source` (string) continue to parse.

### TASK-007: Update validateMappingBody — mutual exclusivity + sources validation

- **Files**: `src/routes/admin-field-mappings.ts`
- **Action**: Modify
- **Details**:
  1. In `validateMappingBody`, replace the single-source-only validation of each transform rule (lines 76–99) with:
     ```
     for each rule at index i:
       - target must be non-empty string (unchanged)
       - expression must be non-empty string (unchanged)
       - Mutual exclusivity: if both source and sources present → 400 invalid_format
       - Neither present → 400 invalid_format
       - If source (single-source): validate source is non-empty string, then
         validateTransformExpression(expression) — no allowedVariables (defaults to ['value'])
       - If sources (multi-source):
         - Must be non-empty object
         - Max 10 keys
         - Each key matches ^[a-zA-Z_][a-zA-Z0-9_]*$ (JS identifier)
         - Each key not in RESERVED_IDENTIFIERS
         - Each value is non-empty string (dot-path)
         - Call validateTransformExpression(expression, Object.keys(sources))
     ```
  2. Import `RESERVED_IDENTIFIERS` from `transform-expression.ts`.
- **Depends on**: TASK-003, TASK-004
- **Verification**: Admin PUT with both `source` and `sources` → 400. Admin PUT with `sources: { eval: "x" }` → 400. Admin PUT with valid multi-source → 200. Admin PUT with expression using unknown variable → 400.

### TASK-008: Unit tests — transform-expression.test.ts (MST-001, MST-002, MST-010, MST-012)

- **Files**: `tests/unit/transform-expression.test.ts`
- **Action**: Modify
- **Details**:
  Add new `describe` blocks:
  1. **MST-001** (`evaluateTransform` with Map): `evaluateTransform('score / total', new Map([['score', 68], ['total', 100]]))` → `0.68`
  2. **MST-002** (`evaluateTransform` with Math.min clamp): `evaluateTransform('Math.min(score / Math.max(total, 1), 1)', new Map([['score', 150], ['total', 100]]))` → `1`
  3. **MST-010** (backward compat): `evaluateTransform('value / 100', 65)` → `0.65` (existing test, but add explicit regression assertion that the refactored tokenizer still produces `TT.IDENTIFIER` for `value` and parser resolves it)
  4. **MST-012** (division by zero multi-source): `evaluateTransform('score / total', new Map([['score', 5], ['total', 0]]))` → throws
  5. **validateTransformExpression with allowedVariables**: `validateTransformExpression('score / total', ['score', 'total'])` → ok. `validateTransformExpression('value / total', ['total'])` → not ok (unknown `value`).
  6. Update existing "rejects unknown identifier 'score'" test to verify it still rejects when no allowedVariables override is given.
- **Depends on**: TASK-003
- **Verification**: `npm test -- tests/unit/transform-expression.test.ts` passes all new and existing tests.

### TASK-009: Unit tests — field-mappings-resolve.test.ts (MST-003, MST-004, MST-011)

- **Files**: `tests/unit/field-mappings-resolve.test.ts`
- **Action**: Modify
- **Details**:
  Add new `describe` block for multi-source transforms:
  1. **MST-003**: Multi-source, one source missing, `strict_transforms=false` → transform skipped, target not set.
  2. **MST-004**: Multi-source, one source missing, `strict_transforms=true` → rejected with `missing_required_field`.
  3. **MST-011**: Mixed single + multi in same mapping → both execute correctly.
  4. Additional: Multi-source happy path (score/total = 0.68) via `normalizeAndValidateTenantPayload`.
- **Depends on**: TASK-005
- **Verification**: `npm test -- tests/unit/field-mappings-resolve.test.ts` passes all new and existing tests.

### TASK-010: Contract tests — admin-field-mappings.test.ts (MST-005 through MST-009)

- **Files**: `tests/contracts/admin-field-mappings.test.ts`
- **Action**: Modify
- **Details**:
  Add new `describe` block for multi-source admin validation:
  1. **MST-005**: PUT with `sources: { eval: "x" }` → 400 `invalid_format`
  2. **MST-006**: PUT with both `source` and `sources` → 400 `invalid_format`
  3. **MST-007**: PUT with neither `source` nor `sources` → 400 `invalid_format`
  4. **MST-008**: PUT with multi-source expression using `value` (not in sources keys) → 400 `invalid_mapping_expression`
  5. **MST-009**: PUT with valid multi-source `{ a: "x", b: "y" }`, expression `a + b` → 200
- **Depends on**: TASK-007
- **Verification**: `npm test -- tests/contracts/admin-field-mappings.test.ts` passes all new and existing tests.

## Files Summary

### To Create

| File | Task | Purpose |
|------|------|---------|
| (none) | — | All changes are modifications to existing files |

### To Modify

| File | Task | Changes |
|------|------|---------|
| `src/config/transform-expression.ts` | TASK-001, TASK-002, TASK-003 | Replace TT.VALUE with TT.IDENTIFIER, parser takes variable Map, add allowedVariables to validate, add Map overload to evaluate, export RESERVED_IDENTIFIERS |
| `src/config/tenant-field-mappings.ts` | TASK-004, TASK-005 | Add `sources?` to TransformRule, multi-source runtime evaluation loop |
| `src/config/field-mappings-dynamo.ts` | TASK-006 | parseMappingFromItem accepts transforms with `sources` |
| `src/routes/admin-field-mappings.ts` | TASK-007 | validateMappingBody: mutual exclusivity, sources key validation, reserved identifiers, allowedVariables |
| `tests/unit/transform-expression.test.ts` | TASK-008 | MST-001, MST-002, MST-010, MST-012 + allowedVariables validation tests |
| `tests/unit/field-mappings-resolve.test.ts` | TASK-009 | MST-003, MST-004, MST-011 + multi-source happy path |
| `tests/contracts/admin-field-mappings.test.ts` | TASK-010 | MST-005, MST-006, MST-007, MST-008, MST-009 |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| MST-001 | unit | Multi-source transform produces canonical field (`score / total` → 0.68) | TASK-008 |
| MST-002 | unit | Multi-source with Math.min clamp (`score=150, total=100` → 1) | TASK-008 |
| MST-003 | unit | Multi-source missing one source (strict=false) → skip | TASK-009 |
| MST-004 | unit | Multi-source missing one source (strict=true) → reject | TASK-009 |
| MST-005 | contract | Admin PUT with reserved sources key `eval` → 400 | TASK-010 |
| MST-006 | contract | Admin PUT with both `source` and `sources` → 400 | TASK-010 |
| MST-007 | contract | Admin PUT with neither `source` nor `sources` → 400 | TASK-010 |
| MST-008 | contract | Admin PUT: multi-source expression uses unknown variable → 400 | TASK-010 |
| MST-009 | contract | Admin PUT: valid multi-source expression → 200 | TASK-010 |
| MST-010 | unit | Single-source backward compatibility (no regression) | TASK-008 |
| MST-011 | unit | Mixed single + multi in same mapping → both execute | TASK-009 |
| MST-012 | unit | Division by zero in multi-source → error | TASK-008 |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tokenizer refactor (TT.VALUE → TT.IDENTIFIER) breaks existing expressions | High | TASK-001 + TASK-002 are atomic; all existing tests run after both. The `value` identifier resolves via the same Map mechanism. MST-010 explicitly verifies backward compat. |
| `evaluateTransform` overload ambiguity (number vs Map) | Low | Runtime type check (`typeof arg2 === 'number'`) is unambiguous. TypeScript overload signatures guide callers. |
| DynamoDB items stored before v1.1.1 lack `sources` | Low | `parseMappingFromItem` accepts either `source` or `sources`; old items with `source` parse unchanged. |
| Reserved identifiers list incomplete | Medium | List matches spec verbatim. New reserved words can be added in a follow-up without breaking existing configs (additive). |
| Expression complexity abuse with 10 sources | Low | Max 10 enforced at admin PUT. Practical use is 2–3. Expression parser is O(n) in tokens, not exponential. |

## Verification Checklist

- [x] All tasks completed
- [x] All tests pass (`npm test`)
- [x] Linter passes (`npm run lint`)
- [x] Type check passes (`npm run typecheck`)
- [x] Matches spec requirements
- [x] Existing single-source transforms unaffected (MST-010)
- [x] All 12 contract test IDs (MST-001 through MST-012) covered

## Implementation Order

```
TASK-001 → TASK-002 → TASK-003 → TASK-008
                                ↘
TASK-004 ──────────→ TASK-005 → TASK-009
                  ↘
               TASK-006
                  ↘
               TASK-007 → TASK-010
```
