# Multi-Source Transforms (v1.1.1)

> Extends the restricted transform expression grammar to support multiple source fields per transform — enabling declarative two-operand computations like `submission.score / assignment.points_possible` without arbitrary code or pre-normalization shims.

## Overview

The v1.1 transform engine (`tenant-field-mappings.md`) supports single-source transforms: one `source` dot-path bound to the variable `value`, evaluated against an arithmetic expression. This is insufficient for real-world LMS integrations where canonical fields are derived from **two or more** source fields.

**Blocking example (Canvas pilot):**

| Canonical Field | Computation | Source Fields |
|----------------|-------------|---------------|
| `masteryScore` | `score / points_possible` (clamped 0–1) | `submission.score`, `assignment.points_possible` |
| `timeSinceReinforcement` | `(now - submitted_at) / 1000` | `submission.submitted_at`, server `now` |

v1.1 can only express `value / 100` (single source). The Canvas pilot requires `a / b` where `a` and `b` come from different payload paths. Without this spec, the pilot needs a pre-normalization shim in the webhook adapter — adding LMS-specific code to what should be a vendor-agnostic pipeline.

This spec adds a `sources` map (alternative to `source`) on `TransformRule`, binding multiple named variables in the expression. The existing single-source `source` + `value` syntax remains valid and unchanged (backward compatible).

---

## Transform Rule Extension

### Current Shape (v1.1 — unchanged)

```json
{
  "target": "stabilityScore",
  "source": "submission.score",
  "expression": "value / 100"
}
```

### New Shape (v1.1.1 — multi-source)

```json
{
  "target": "masteryScore",
  "sources": {
    "score": "submission.score",
    "total": "assignment.points_possible"
  },
  "expression": "Math.min(score / total, 1)"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `target` | string | Same as v1.1 — top-level canonical key to write the result into |
| `source` | string | **v1.1 (single-source)** — dot-path into payload; binds to variable `value` |
| `sources` | `Record<string, string>` | **v1.1.1 (multi-source)** — map of variable names to dot-paths; each key becomes a named variable in the expression |
| `expression` | string | Restricted arithmetic expression. v1.1: only `value` allowed. v1.1.1: `value` OR named keys from `sources` allowed. |

**Mutual exclusivity:** A transform rule must have exactly one of `source` or `sources` — not both, not neither. Validation rejects rules with both or neither.

### Variable Binding

| Mode | Variables Available | Example |
|------|-------------------|---------|
| Single-source (`source`) | `value` (bound to the numeric read from `source` path) | `value / 100` |
| Multi-source (`sources`) | Each key in `sources` map (bound to the numeric read from the corresponding path) | `score / total` with `sources: { score: "...", total: "..." }` |

In multi-source mode, the identifier `value` is **not** implicitly bound. Only explicitly named keys from `sources` are valid variables. This avoids ambiguity when a key happens to be named `value`.

---

## Expression Grammar Extension

The tokenizer (`src/config/transform-expression.ts`) currently recognises exactly one variable: `value`. v1.1.1 extends this to accept **any identifier** that matches a key in the `sources` map.

### Allowed Identifiers

| Mode | Allowed Identifiers |
|------|-------------------|
| Single-source | `value` only (unchanged) |
| Multi-source | Each key in `sources` map. Keys must match `^[a-zA-Z_][a-zA-Z0-9_]*$` (valid JS identifier, no reserved words). |

### Forbidden Identifier Names (reserved)

The following cannot be used as `sources` keys: `eval`, `new`, `function`, `return`, `import`, `export`, `this`, `class`, `var`, `let`, `const`, `Math`, `undefined`, `null`, `true`, `false`, `Infinity`, `NaN`, `process`, `require`, `window`, `document`, `globalThis`.

Validation at admin `PUT` time rejects any `sources` key in this list.

### Parser Changes

The recursive-descent parser gains a `variables: Map<string, number>` constructor parameter (replacing the single `value: number`). The `parsePrimary()` method checks the current token against this map instead of only checking for `TT.VALUE`.

**Backward compatibility:** When `source` (single-source) is used, the parser is called with `variables = new Map([['value', numericValue]])` — identical to current behavior.

### Tokenizer Changes

The tokenizer currently matches `value` as a special-cased keyword token (`TT.VALUE`). v1.1.1 replaces this with a generic `TT.IDENTIFIER` token type that matches `[a-zA-Z_][a-zA-Z0-9_]*` (excluding `Math.min`, `Math.max`, `Math.round` which are matched first). The parser then resolves identifiers against the `variables` map.

**Security:** Unknown identifiers (not in `variables` map and not `Math.*` functions) are rejected at parse time with a clear error message. The whitelist approach is preserved — only known variables and `Math.*` are allowed.

---

## Validation

### At Admin `PUT` Time

For multi-source transforms, `validateTransformExpression` gains an optional `allowedVariables: string[]` parameter:

```typescript
validateTransformExpression(
  expression: string,
  allowedVariables?: string[]  // NEW — defaults to ['value'] for backward compat
): ValidateResult
```

When `sources` is present, `allowedVariables` is set to `Object.keys(sources)`. The validator:

1. Tokenizes the expression
2. For each identifier token, checks it exists in `allowedVariables`
3. Evaluates with all variables bound to `0` (same as current validation pass)

### Sources Map Validation

At admin `PUT` time, `sources` is validated:

- Must be a non-empty object
- Each key must match `^[a-zA-Z_][a-zA-Z0-9_]*$`
- Each key must not be in the reserved identifier list
- Each value must be a non-empty string (dot-path)
- No duplicate keys (enforced by JSON object semantics)
- Max 10 sources per transform (prevents abuse)

---

## Runtime Evaluation

### Multi-Source Flow

For each transform rule with `sources`:

1. For each `(varName, dotPath)` in `sources`:
   - Read the value at `dotPath` from the normalized payload
   - If missing/null:
     - If `strict_transforms`: reject with `missing_required_field` for the source path
     - Else: skip this transform entirely (same as v1.1 single-source behavior)
   - Coerce to number (same as v1.1: `typeof val === 'number' ? val : Number(val)`)
2. Build `variables: Map<string, number>` from resolved values
3. Call `evaluateTransform(expression, variables)` (new overload)
4. Write result to `target` (same as v1.1)

### Division by Zero

Multi-source transforms make division-by-zero more likely (e.g., `score / total` where `total` is 0). The existing parser already throws on `/ 0`. This behavior is unchanged — division by zero produces an `invalid_mapping_expression` error for the transform. If the org wants to handle zero denominators gracefully, they should use `Math.max(total, 1)` in the expression: `score / Math.max(total, 1)`.

---

## Configuration Example (Canvas Pilot)

```json
{
  "version": 2,
  "tenants": {
    "springs": {
      "canvas-lms": {
        "payload": {
          "required": ["masteryScore", "stabilityScore"],
          "aliases": {
            "stabilityScore": ["stability_score"]
          },
          "types": {
            "masteryScore": "number",
            "stabilityScore": "number"
          },
          "transforms": [
            {
              "target": "masteryScore",
              "sources": {
                "score": "submission.score",
                "total": "assignment.points_possible"
              },
              "expression": "Math.min(score / Math.max(total, 1), 1)"
            },
            {
              "target": "stabilityScore",
              "source": "submission.score",
              "expression": "value / 100"
            }
          ]
        }
      }
    }
  }
}
```

The first transform uses multi-source (`sources`); the second uses single-source (`source`). Both are valid in the same mapping.

---

## Requirements

### Functional

- [ ] `TransformRule` type gains optional `sources: Record<string, string>` field (mutually exclusive with `source`)
- [ ] A transform rule must have exactly one of `source` or `sources`; validation rejects both-present and neither-present
- [ ] Multi-source expressions bind each key in `sources` to a named variable in the expression (not `value`)
- [ ] Single-source expressions continue to bind `source` value to `value` (backward compatible)
- [ ] Expression parser/tokenizer supports generic identifiers resolved against a variable map
- [ ] Unknown identifiers (not in variable map, not `Math.*`) are rejected at parse time
- [ ] `sources` keys are validated: match `^[a-zA-Z_][a-zA-Z0-9_]*$`, not in reserved list, max 10 per transform
- [ ] `validateTransformExpression` accepts optional `allowedVariables` parameter for multi-source validation
- [ ] At runtime, if any source in `sources` is missing: `strict_transforms=true` → reject; `strict_transforms=false` → skip the entire transform
- [ ] Admin `PUT` validates multi-source expressions against declared variable names
- [ ] Existing single-source transforms are unaffected (no behavioral change for v1.1 configs)
- [ ] DynamoDB `parseMappingFromItem` parses `sources` from stored mapping items

### Acceptance Criteria

- Given a mapping with `sources: { score: "submission.score", total: "assignment.points_possible" }` and `expression: "score / total"`, and a payload `{ submission: { score: 68 }, assignment: { points_possible: 100 } }`, then `masteryScore === 0.68`
- Given a mapping with `sources: { score: "submission.score", total: "assignment.points_possible" }` and `expression: "Math.min(score / Math.max(total, 1), 1)"`, and a payload with `score=150, total=100`, then `masteryScore === 1` (clamped)
- Given a multi-source transform where one source path is missing and `strict_transforms=false`, then the transform is skipped and the target field is not written
- Given a multi-source transform where one source path is missing and `strict_transforms=true`, then the signal is rejected with `missing_required_field`
- Given admin `PUT` with `sources: { eval: "..." }`, then 400 is returned (reserved identifier)
- Given admin `PUT` with both `source` and `sources` on the same rule, then 400 is returned
- Given an existing v1.1 single-source transform (`source` + `value` expression), then behavior is identical to v1.1 (no regression)
- Given admin `PUT` with a multi-source expression containing `value` (not in `sources` keys), then 400 is returned (unknown identifier)

---

## Constraints

- **Max 10 sources per transform** — prevents expression complexity abuse. Practical limit is 2–3 for real use cases.
- **No string variables** — all source values are coerced to number. String transforms are out of scope.
- **No cross-transform variable references** — each transform is independently evaluated. A transform cannot reference the output of a previous transform by variable name (it can read it via `sources` dot-path if the previous transform wrote to a known `target`).
- **Identifier token replaces `value` keyword token** — the tokenizer change means `value` is now a regular identifier, not a keyword. In single-source mode it's bound in the variables map; in multi-source mode it's only valid if explicitly named as a `sources` key.

---

## Out of Scope

| Item | Rationale | Revisit When |
|------|-----------|--------------|
| String/date variable types | All transform variables are numeric; string manipulation needs a different grammar | Customer needs string transforms |
| Conditional expressions (ternary `? :`) | Deferred from v1.1; reconsider if policy rules can't cover the branching cases | Customer requests conditional transform logic |
| Server `now` as a built-in variable | `timeSinceReinforcement = (now - submitted_at) / 1000` needs timestamp math, not just arithmetic. Defer to a `builtins` mechanism. | Timestamp transform spec |
| Cross-transform variable references | Each transform is independent. Chain via target → source path. | Complexity justifies it |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|----------------|--------|
| `TransformRule` type + `evaluateTransform()` | `docs/specs/tenant-field-mappings.md` | **Implemented** (v1.1) — extend |
| `validateTransformExpression()` | `src/config/transform-expression.ts` | **Implemented** (v1.1) — extend signature |
| `parseMappingFromItem()` — DynamoDB item parsing | `src/config/field-mappings-dynamo.ts` | **Implemented** — extend for `sources` |
| Admin `PUT` validation | `src/routes/admin-field-mappings.ts` | **Implemented** — extend `validateMappingBody()` |
| `normalizeAndValidateTenantPayload()` — runtime transform execution | `src/config/tenant-field-mappings.ts` | **Implemented** — extend transform loop |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| Multi-source transform (e.g., `score / total`) | `docs/specs/integration-templates.md` — Canvas template `masteryScore` |
| Named variables in expressions | Future templates for any LMS with multi-field derived metrics |

---

## Error Codes

### Existing (reuse)

| Code | Source |
|------|--------|
| `invalid_mapping_expression` | Transform expression validation failure (admin PUT or runtime) |
| `missing_required_field` | Source path not found when `strict_transforms=true` |
| `invalid_format` | Structural validation (both `source` and `sources`, invalid key names) |

### New (add during implementation)

None — all error cases map to existing codes. The `invalid_mapping_expression` message will include the unknown identifier name for clarity.

---

## Contract Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| MST-001 | Multi-source transform produces canonical field | `sources: { score: "submission.score", total: "assignment.points_possible" }`, expression `score / total`, payload `{ submission: { score: 68 }, assignment: { points_possible: 100 } }` | `masteryScore === 0.68` |
| MST-002 | Multi-source with Math.min clamp | Same sources, expression `Math.min(score / Math.max(total, 1), 1)`, payload `score=150, total=100` | `masteryScore === 1` |
| MST-003 | Multi-source missing one source (strict=false) | `total` path missing in payload, `strict_transforms=false` | Transform skipped; `masteryScore` not set |
| MST-004 | Multi-source missing one source (strict=true) | `total` path missing in payload, `strict_transforms=true` | Rejected with `missing_required_field` |
| MST-005 | Admin PUT with reserved sources key `eval` | `sources: { eval: "x" }` | 400 `invalid_format` |
| MST-006 | Admin PUT with both `source` and `sources` | Rule has both fields | 400 `invalid_format` |
| MST-007 | Admin PUT with neither `source` nor `sources` | Rule has only `target` and `expression` | 400 `invalid_format` |
| MST-008 | Admin PUT: multi-source expression uses unknown variable | Expression `value / total`, sources only has `total` | 400 `invalid_mapping_expression` |
| MST-009 | Admin PUT: valid multi-source expression | `sources: { a: "x", b: "y" }`, expression `a + b` | 200 accepted |
| MST-010 | Single-source backward compatibility | `source: "raw_score"`, expression `value / 100` | Identical to v1.1 behavior |
| MST-011 | Mixed single + multi in same mapping | Two transforms: one single-source, one multi-source | Both execute correctly in order |
| MST-012 | Division by zero in multi-source | `score / total` where `total=0` | `invalid_mapping_expression` error on transform |

> **Test strategy:** MST-001 through MST-004, MST-010 through MST-012 are unit tests in `tests/unit/transform-expression.test.ts` and `tests/unit/field-mappings-resolve.test.ts`. MST-005 through MST-009 are contract tests in `tests/contracts/admin-field-mappings.test.ts`. MST-010 specifically verifies no regression from the tokenizer change.

---

## Implementation Notes

- **Tokenizer refactor:** Replace the `TT.VALUE` token type with `TT.IDENTIFIER`. The tokenizer emits `TT.IDENTIFIER` for any `[a-zA-Z_][a-zA-Z0-9_]*` sequence that is not `Math.min`, `Math.max`, or `Math.round`. The parser resolves identifiers against the variables map. This is a modest refactor of `tokenize()` and `parsePrimary()`.
- **`evaluateTransform` overload:** Add `evaluateTransform(expression: string, variables: Map<string, number>): number` alongside the existing `evaluateTransform(expression: string, value: number): number`. The single-arg form wraps into `new Map([['value', value]])` internally.
- **File changes are localized:** `transform-expression.ts` (tokenizer + parser), `tenant-field-mappings.ts` (TransformRule type + runtime loop), `field-mappings-dynamo.ts` (parse `sources`), `admin-field-mappings.ts` (validate `sources`). No changes to the ingestion pipeline, state engine, or decision engine.

---

*Spec created: 2026-04-10 | Phase: v1.1.1 (pilot-critical for Canvas `masteryScore`) | Depends on: tenant-field-mappings.md (v1.1). Recommended next: `/plan-impl docs/specs/multi-source-transforms.md`*
