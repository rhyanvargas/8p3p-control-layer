# Onboarding Field Mappings — LMS Integration Guide

This guide walks through configuring field mappings for new LMS integrations. Field mappings tell the system how to transform vendor-native payloads into canonical fields that the decision engine evaluates.

**Full specification**: `docs/specs/tenant-field-mappings.md`
**Multi-source transforms**: `docs/specs/multi-source-transforms.md`
**Existing integration guidance**: `docs/guides/pilot-integration-guide.md` §5 and §13

---

## 1. When You Need a Field Mapping

You need a field mapping when your LMS sends raw vendor-specific fields (e.g., `scoreGiven`, `overallScaleScore`, `progress`) instead of the canonical 0–1 scores the decision engine expects (e.g., `masteryScore`, `stabilityScore`, `complianceScore`).

Without a mapping, the signal payload passes through unchanged — the decision engine evaluates whatever field names the payload contains. With a mapping, the transform engine derives canonical fields from raw data before policy evaluation.

---

## 2. Mapping Anatomy

A `TenantPayloadMapping` has four optional sections:

```json
{
  "aliases": { ... },
  "transforms": [ ... ],
  "types": { ... },
  "required": [ ... ]
}
```

### `aliases`

Maps canonical field names to one or more dot-paths in the raw payload. The first matching path wins.

```json
"aliases": {
  "skill": ["group.courseNumber"],
  "assessment_type": ["extensions.bb_action_name"]
}
```

After alias resolution, `payload.skill` is set to the value at `payload.group.courseNumber`.

### `transforms`

Derive new fields from raw payload values using restricted JavaScript expressions.

**Single-source** (one input, accessed as `value`):

```json
{
  "target": "stabilityScore",
  "source": "percentile",
  "expression": "value / 100"
}
```

**Multi-source** (multiple inputs, accessed by name):

```json
{
  "target": "masteryScore",
  "sources": { "earned": "generated.scoreGiven", "possible": "generated.maxScore" },
  "expression": "Math.min(earned / possible, 1)"
}
```

Allowed in expressions: `Math.min`, `Math.max`, `Math.round`, `Math.floor`, `Math.ceil`, `Math.abs`, arithmetic operators, comparisons, ternary. No function calls, no variable assignment, no loops.

### `types`

Declares expected types for transformed fields. Used for runtime validation.

```json
"types": {
  "masteryScore": "number",
  "stabilityScore": "number",
  "skill": "string"
}
```

### `required`

Array of field names that must be present after transformation. If missing, the signal is rejected.

---

## 3. Step-by-Step: Canvas LMS

**Source shape**: Caliper 1.1 GradeEvent — the signal payload is the event body (not the full Caliper envelope).

**Raw payload example**:

```json
{
  "generated": { "scoreGiven": 92, "maxScore": 100 },
  "group": { "courseNumber": "MATH-301" },
  "object": {
    "extensions": {
      "com_instructure_canvas": { "submission_type": "online_quiz" }
    }
  },
  "extensions": { "timeSinceLastActivity": 30000 }
}
```

**Field mapping**:

```json
{
  "aliases": {
    "skill": ["group.courseNumber"],
    "assessment_type": ["object.extensions.com_instructure_canvas.submission_type"]
  },
  "transforms": [
    {
      "target": "masteryScore",
      "sources": { "earned": "generated.scoreGiven", "possible": "generated.maxScore" },
      "expression": "Math.min(earned / possible, 1)"
    },
    {
      "target": "stabilityScore",
      "sources": { "earned": "generated.scoreGiven", "possible": "generated.maxScore" },
      "expression": "Math.min(earned / possible, 1) * 0.9"
    },
    {
      "target": "timeSinceReinforcement",
      "source": "extensions.timeSinceLastActivity",
      "expression": "value"
    }
  ],
  "types": {
    "masteryScore": "number",
    "stabilityScore": "number",
    "skill": "string"
  }
}
```

**After transform**: `masteryScore: 0.92`, `stabilityScore: 0.828`, `skill: "MATH-301"`, `timeSinceReinforcement: 30000`.

**Design note**: `stabilityScore` uses `* 0.9` — a single high grade doesn't immediately trigger advance (stability threshold is 0.8). In production, stability would be computed from longitudinal data.

---

## 4. Step-by-Step: i-Ready Diagnostic

**Source shape**: JSON-ified CSV row from a CSV-to-webhook adapter. i-Ready has no native JSON API — a lightweight adapter script converts CSV exports to webhook calls.

**Raw payload example**:

```json
{
  "overallScaleScore": 380,
  "maxScaleScore": 800,
  "percentile": 22,
  "diagnosticGain": -15,
  "subject": "Reading",
  "normingWindow": "MOY"
}
```

**Field mapping**:

```json
{
  "aliases": {
    "skill": ["subject"],
    "assessment_type": ["normingWindow"]
  },
  "transforms": [
    {
      "target": "masteryScore",
      "sources": { "score": "overallScaleScore", "maxScore": "maxScaleScore" },
      "expression": "Math.min(score / maxScore, 1)"
    },
    {
      "target": "stabilityScore",
      "source": "percentile",
      "expression": "value / 100"
    },
    {
      "target": "riskSignal",
      "source": "diagnosticGain",
      "expression": "Math.max(1 - (value + 50) / 100, 0)"
    }
  ],
  "types": {
    "masteryScore": "number",
    "stabilityScore": "number",
    "riskSignal": "number",
    "skill": "string"
  }
}
```

**After transform**: `masteryScore: 0.475`, `stabilityScore: 0.22`, `riskSignal: 0.65`, `skill: "Reading"`.

**Adapter pattern**: The CSV-to-webhook adapter reads the i-Ready CSV export, maps column headers to JSON keys, and POSTs each row as a signal. The field mapping handles the score normalization.

---

## 5. Step-by-Step: Blackboard LMS

**Source shape**: Caliper 1.1 GradeEvent / AssignableEvent. Key difference from Canvas: `maxScore` lives at `object.assignable.maxScore` instead of `generated.maxScore`.

**Raw payload example**:

```json
{
  "generated": { "scoreGiven": 48 },
  "object": { "assignable": { "maxScore": 60 } },
  "group": { "courseNumber": "HIST-202" },
  "extensions": { "bb_action_name": "GradeSubmission", "timeSinceLastActivity": 40000 }
}
```

**Field mapping**:

```json
{
  "aliases": {
    "skill": ["group.courseNumber"],
    "assessment_type": ["extensions.bb_action_name"]
  },
  "transforms": [
    {
      "target": "masteryScore",
      "sources": { "earned": "generated.scoreGiven", "possible": "object.assignable.maxScore" },
      "expression": "Math.min(earned / possible, 1)"
    },
    {
      "target": "stabilityScore",
      "sources": { "earned": "generated.scoreGiven", "possible": "object.assignable.maxScore" },
      "expression": "Math.min(earned / possible, 1) * 0.85"
    },
    {
      "target": "timeSinceReinforcement",
      "source": "extensions.timeSinceLastActivity",
      "expression": "value"
    }
  ],
  "types": {
    "masteryScore": "number",
    "stabilityScore": "number",
    "skill": "string"
  }
}
```

**After transform**: `masteryScore: 0.80`, `stabilityScore: 0.68`, `skill: "HIST-202"`, `timeSinceReinforcement: 40000`.

**Design note**: Stability multiplier is `0.85` for Blackboard — a school might weight Blackboard assessments slightly differently. Per-source-system mappings can encode institutional knowledge.

---

## 6. Step-by-Step: Absorb LMS

**Source shape**: Absorb REST API v2 enrollment response.

**Raw payload example**:

```json
{
  "progress": 0.60,
  "score": 70,
  "maxScore": 100,
  "daysOverdue": 5,
  "certificationValid": true,
  "name": "Annual Compliance 2026",
  "enrollmentType": "required"
}
```

**Field mapping**:

```json
{
  "aliases": {
    "skill": ["name"],
    "assessment_type": ["enrollmentType"]
  },
  "transforms": [
    {
      "target": "complianceScore",
      "source": "progress",
      "expression": "value"
    },
    {
      "target": "trainingScore",
      "sources": { "score": "score", "maxScore": "maxScore" },
      "expression": "Math.min(score / maxScore, 1)"
    },
    {
      "target": "daysOverdue",
      "source": "daysOverdue",
      "expression": "value"
    },
    {
      "target": "certificationValid",
      "source": "certificationValid",
      "expression": "value"
    }
  ],
  "types": {
    "complianceScore": "number",
    "trainingScore": "number",
    "daysOverdue": "number",
    "certificationValid": "boolean"
  }
}
```

**After transform**: `complianceScore: 0.60`, `trainingScore: 0.70`, `daysOverdue: 5`, `certificationValid: true`, `skill: "Annual Compliance 2026"`.

**Design note**: `daysOverdue` and `certificationValid` are pass-through — Absorb doesn't natively provide these in all contexts. The webhook adapter computes them from `dateCompleted` and cert expiry. The seed payload includes them directly.

---

## 7. Registering via Admin API

Use `PUT /v1/admin/mappings/:org_id/:source_system` with the mapping JSON as the request body. The endpoint is idempotent — PUT overwrites any existing mapping for that org/source pair.

**Example — Canvas LMS**:

```bash
curl -sS -X PUT "http://localhost:3000/v1/admin/mappings/springs/canvas-lms" \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "aliases": {
      "skill": ["group.courseNumber"],
      "assessment_type": ["object.extensions.com_instructure_canvas.submission_type"]
    },
    "transforms": [
      {
        "target": "masteryScore",
        "sources": { "earned": "generated.scoreGiven", "possible": "generated.maxScore" },
        "expression": "Math.min(earned / possible, 1)"
      },
      {
        "target": "stabilityScore",
        "sources": { "earned": "generated.scoreGiven", "possible": "generated.maxScore" },
        "expression": "Math.min(earned / possible, 1) * 0.9"
      },
      {
        "target": "timeSinceReinforcement",
        "source": "extensions.timeSinceLastActivity",
        "expression": "value"
      }
    ],
    "types": {
      "masteryScore": "number",
      "stabilityScore": "number",
      "skill": "string"
    }
  }'
```

**List all mappings for an org**:

```bash
curl -sS "http://localhost:3000/v1/admin/mappings/springs" \
  -H "x-admin-api-key: $ADMIN_API_KEY"
```

Returns `{ "mappings": [...], "count": 4 }`.

---

## 8. Verifying the Mapping

After registering a mapping, verify the full pipeline:

**1. Send a test signal**:

```bash
curl -sS -X POST "http://localhost:3000/v1/signals" \
  -H "x-api-key: $API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "org_id": "springs",
    "signal_id": "test-canvas-001",
    "source_system": "canvas-lms",
    "learner_reference": "test-student",
    "timestamp": "2026-03-15T10:00:00Z",
    "schema_version": "v1",
    "payload": {
      "generated": { "scoreGiven": 85, "maxScore": 100 },
      "group": { "courseNumber": "MATH-301" },
      "extensions": { "timeSinceLastActivity": 50000 }
    }
  }'
```

**2. Check state** — verify canonical fields are present:

```bash
curl -sS "http://localhost:3000/v1/state?org_id=springs&learner_reference=test-student" \
  -H "x-api-key: $API_KEY"
```

Look for `masteryScore: 0.85`, `stabilityScore: 0.765`, `skill: "MATH-301"`.

**3. Check decision** — verify expected decision type:

```bash
curl -sS "http://localhost:3000/v1/decisions?org_id=springs&learner_reference=test-student&from_time=2026-03-15T00:00:00Z&to_time=2026-03-16T00:00:00Z" \
  -H "x-api-key: $API_KEY"
```

With `stabilityScore: 0.765` and `masteryScore: 0.85`, expect decision type `reinforce` (stability < 0.8, misses advance threshold).

---

## 9. Common Gotchas

### Dot-path key name conflicts

Keys with literal dots (e.g., `com.instructure.canvas`) break `getAtPath`/`setAtPath` because dots are interpreted as nesting separators. **Fix**: Flatten dotted extension keys in the signal payload using underscore substitution — `com_instructure_canvas` instead of `com.instructure.canvas`. Do this in the webhook adapter before sending the signal.

### `maxScore: 0` — division by zero

Some LMS platforms (especially Blackboard for ungraded assignments) may send `maxScore: 0`. The expression `earned / possible` would produce `Infinity`. The transform engine guards against `NaN`/`Infinity` — it returns `undefined` and skips the transform. This means the canonical field won't be set, and the decision engine falls through to the default decision. **Mitigation**: Filter or normalize zero `maxScore` in the webhook adapter. Document this in your adapter's README.

### Missing source fields — strict vs lenient

If a transform references a source field that doesn't exist in the payload (e.g., `extensions.timeSinceLastActivity` is absent), the transform engine resolves the source to `undefined` and the expression evaluates with `undefined` as the value. Arithmetic on `undefined` produces `NaN`, which is caught by the guard. **Best practice**: Only include transforms for fields you know the LMS always sends, or use the `required` array to reject signals missing critical fields.

### Transform cache TTL

Mappings are cached for 300 seconds (5 minutes). After updating a mapping via PUT, the cache is invalidated for that org/source pair immediately. But if you update mappings manually in the database, the cache won't reflect changes until the TTL expires. Always use the admin API for mapping updates.

### Multiple alias paths

Aliases support fallback paths: `"skill": ["group.courseNumber", "metadata.courseName"]`. The first path that resolves to a non-undefined value wins. Use this when the same vendor sends different payload shapes for different event types.

---

*Created: 2026-04-14 | Spec: docs/specs/tenant-field-mappings.md | Plan: .cursor/plans/springs-realistic-seed.plan.md*
