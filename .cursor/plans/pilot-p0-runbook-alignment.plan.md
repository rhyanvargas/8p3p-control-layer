---
name: Pilot P0 Runbook Alignment (No-Match, Pause Copy, Educator Summary)
overview: |
  Close the three P0 gaps between the 2026-04-18 Pilot Runbook and the current
  control-layer implementation before the Springs Saturday dry run. The gaps are
  all client-visible: (1) the Decision Engine still emits a fallback decision
  when no rule matches, in direct violation of the runbook's "if no rule matches,
  no decision is created and no LIU is counted" directive; (2) the `pause`
  decision type is described as "Temporary hold" across README and canonical
  specs, which the runbook explicitly forbids in client-facing materials; (3)
  receipts carry only an engineering `rationale` string, but the runbook's
  § What a receipt should show requires "Any explanation text shown to the
  school" — the teacher-facing plain-language sentence for the decision type.
  This plan is behavior-change scoped: engine semantics, three policy JSON
  files, schema + type definitions, ingestion sync-trigger handlers, dashboard
  copy, tests, and the canonical docs that state the contract. No new features,
  no new endpoints, no infra changes. Spec-literal discipline is applied: the
  runbook's decision-definition table, receipt-field list, and no-default rule
  are reproduced verbatim in § Spec Literals and quoted by every task that
  consumes them.
todos:
  - id: TASK-000
    content: Import runbook into repo as internal-docs/pilot-operations/pilot-runbook.md (stable spec anchor)
    status: completed
  - id: TASK-001
    content: Extend EvaluateDecisionOutcome with { ok true, matched false } variant and update PolicyEvaluationResult to allow no-match
    status: completed
  - id: TASK-002
    content: Rewrite evaluatePolicy() in policy-loader.ts to return no-match sentinel when no rule fires (ignore default_decision_type)
    status: completed
  - id: TASK-003
    content: Rewrite evaluateState() in engine.ts — on no-match, return { ok true, matched false } and skip saveDecision
    status: completed
  - id: TASK-004
    content: Mirror TASK-003 in engine-async.ts (evaluateStateAsync)
    status: completed
  - id: TASK-005
    content: Remove default_decision_type from all three policy JSON files (default, springs/learner, springs/staff)
    status: completed
  - id: TASK-006
    content: Update policy-loader validation — default_decision_type accepted but deprecated (parsed if present, never used)
    status: completed
  - id: TASK-007
    content: Add educator-summaries.ts with teacher-facing short labels keyed by DecisionType
    status: completed
  - id: TASK-008
    content: Add trace.educator_summary field to Decision type, JSON schema, OpenAPI Decision + Receipt schemas, and Ajv validator
    status: completed
  - id: TASK-009
    content: Populate trace.educator_summary in evaluateState() and evaluateStateAsync() from the educator-summaries map
    status: completed
  - id: TASK-010
    content: Update ingestion sync trigger (handler-core.ts + handler-core-async.ts) to handle matched=false outcome without log.warn
    status: completed
  - id: TASK-011
    content: Pause copy sweep — fix "Temporary hold" in README, terminology.md, decision-engine.md, openapi.yaml descriptions, dashboard WhoNeedsAttention helper
    status: completed
  - id: TASK-012
    content: Surface educator_summary in dashboard Decision Trace / Decision Stream / WhatToDo panels
    status: completed
  - id: TASK-013
    content: Update LIU usage meter spec § What Counts as an LIU to cross-link the runbook no-default rule (text already correct, add cross-reference only)
    status: completed
  - id: TASK-014
    content: Update decision-engine spec § Core Constraints + § Policy Evaluation Semantics — "no rule match = no decision emitted"; mark default_decision_type deprecated
    status: completed
  - id: TEST-001
    content: Update DEC-008 vectors 8h + 8i — expected outcome flips from decision_type=reinforce to matched=false (no decision)
    status: completed
  - id: TEST-002
    content: New contract test — DEC-009 "no rule match emits no decision and no saveDecision call" (engine-level, covers both sync + async)
    status: completed
  - id: TEST-003
    content: New unit test — trace.educator_summary matches DECISION_TYPE_TO_EDUCATOR_SUMMARY[decision_type] for all 4 types
    status: completed
  - id: TEST-004
    content: Update unit tests that assumed default fallthrough — policy-loader.test.ts (lines 478-490, 535), decision-engine.test.ts (tests expecting reinforce default)
    status: completed
  - id: TEST-005
    content: Update integration test tests/integration/springs-pilot.test.ts — ensure seed states do not rely on default fallthrough, or if they do, assert matched=false
    status: completed
  - id: TEST-006
    content: Receipt projection test — GET /v1/receipts includes trace.educator_summary for all stored decisions (RCPT-API-005 extension)
    status: completed
  - id: TEST-007
    content: Pause-copy grep test — repo contains zero occurrences of "Temporary hold" or "temporary hold" except in .cursor/plans/ and historical reports
    status: completed
isProject: false
---

# Pilot P0 Runbook Alignment

**Spec (de facto):** `internal-docs/pilot-operations/pilot-runbook.md` (imported in TASK-000 from the CEO's draft at `~/Downloads/Pilot Runbook Rough Draft.md`)
**Note on spec shape:** This is a behavior-change plan driven by an operations spec (a runbook), not a product spec. There is no `docs/specs/pilot-p0-runbook-alignment.md` and none is needed — the runbook is the normative source. The `/plan-impl` skill's spec-literal discipline is still applied: the runbook's decision-definition table, receipt-field list, and default-decision rule are reproduced verbatim in § Spec Literals and quoted by every task that consumes them.

## Spec Literals

> Verbatim copies of normative blocks from the runbook and from the existing decision-engine spec that constrains the rewrite. TASK details MUST quote from this section rather than paraphrase. Update this section only if the runbook itself changes.

### From runbook § Executive decisions to lock now — Policy rule

```
Remove any default decision that fires when no rule matches. If no policy rule
matches, no decision is created and no LIU is counted.
```

### From runbook § Teacher-friendly decision definitions (table)

```
| Decision   | Plain meaning for educators                                                                                                                                                                 | Shortest version                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Advance    | The student is ready to move forward. The system sees enough evidence that the student is understanding the skill well enough to continue to the next step.                                | Ready to move on                             |
| Reinforce  | The student needs more practice so the learning sticks. The student may understand it somewhat, but the skill is not strong enough yet or needs strengthening before moving too far ahead. | Needs more practice                          |
| Intervene  | The student needs stronger support now. The system sees a more serious issue, so this is the point where a teacher, specialist, or support team may need to step in more directly.         | Needs stronger support now                   |
| Pause      | Possible risk: watch closely. The system sees signs that the learning may be fading or becoming less reliable, so the teacher should monitor closely and confirm the student is still ready before moving ahead. | Possible learning decay detected; watch closely |
```

### From runbook § Teacher-friendly decision definitions — internal note

```
Internal note: on the backend, "Pause" can still map to possible risk or decay,
but in client conversations it should never be explained as "do nothing" or
"temporary hold."
```

### From runbook § Policy configuration workflow — Important control

```
Important control: if no rule matches, no decision should be emitted.
```

### From runbook § What a receipt should show

```
• Learner ID or safe identifier.
• Policy version.
• Timestamp.
• Source signals used.
• State values used for the decision.
• Rule or threshold that fired.
• Decision produced.
• Any explanation text shown to the school.
```

### From runbook § LIU billing rule for pilot and beyond

```
A Learning Intelligence Unit should equal one governed learning decision, not
one raw signal.

School-facing explanation: "Our system reads many signals, but you are only
charged when a policy rule produces a governed decision. If no rule matches, no
decision is created."
```

### From existing spec § docs/specs/decision-engine.md §4.3 (EvaluateDecisionOutcome)

> Quoted so the plan's proposed discriminated-union extension is a superset of today's contract, not a replacement.

```json
{
  "ok": true,
  "result": "Decision (see 4.1)"
}
```

```json
{
  "ok": false,
  "errors": [
    { "code": "string", "message": "string", "field_path": "string | undefined" }
  ]
}
```

### From existing spec § docs/specs/decision-engine.md §Trace Required

```
Every decision must include trace with state_id, state_version, policy_version,
matched_rule_id, and (for v1 pilot) state_snapshot, matched_rule, rationale
```

### From existing spec § docs/specs/liu-usage-meter.md § What Counts as an LIU

> LIU spec already aligns with the runbook's no-default rule — this table is preserved verbatim so TASK-013 is a cross-link only, not a text change.

```
| POST /v1/signals → decision produced (any type: reinforce, advance, intervene, pause) | Yes | Full pipeline completed |
| POST /v1/signals → signal accepted but no decision (e.g., state update only, no policy matched) | No | No governed decision was produced |
```

## Prerequisites

Before starting implementation:
- [ ] PREREQ-001: Pilot Runbook draft exists at `~/Downloads/Pilot Runbook Rough Draft.md` (CEO's copy). TASK-000 imports it into the repo.
- [x] PREREQ-002: Decision Engine spec exists at `docs/specs/decision-engine.md`
- [x] PREREQ-003: Receipts API spec exists at `docs/specs/receipts-api.md`
- [x] PREREQ-004: LIU usage meter spec exists at `docs/specs/liu-usage-meter.md`
- [x] PREREQ-005: Terminology doc exists at `docs/foundation/terminology.md`
- [x] PREREQ-006: Dashboard Decision Panel components exist under `dashboard/src/components/panels/`
- [x] PREREQ-007: Sync-trigger call sites identified: `src/ingestion/handler-core.ts:192` and `src/ingestion/handler-core-async.ts:201`

## Tasks

> **Status tracking**: Task status lives **only** in the YAML frontmatter `todos` list to prevent drift. Do not duplicate per-task status inside the task bodies.

> **Existing-solutions check** (per `.cursor/rules/prefer-existing-solutions/RULE.md`): No new SDK/library introductions. All work extends existing modules: discriminated-union pattern already used by `ApplySignalsOutcome` / `EvaluateDecisionOutcome`; Ajv validator pattern already used by `src/contracts/validators/decision.ts`; static enum-keyed map pattern already used by `DECISION_TYPES` constant. No need for templating, i18n, or policy-expression languages for the educator-summary map — a `Record<DecisionType, string>` is the minimum sufficient abstraction and matches how the runbook table is structured (one short string per decision type).

---

### TASK-000: Import runbook into repo
- **Files**: `internal-docs/pilot-operations/pilot-runbook.md` (new)
- **Action**: Create
- **Details**: Copy `~/Downloads/Pilot Runbook Rough Draft.md` verbatim into `internal-docs/pilot-operations/pilot-runbook.md` so the plan has a stable, version-controlled spec anchor. Do not edit the content — the rough-draft status is intentional; clean-ups happen in the CEO's source doc, not in this plan. Add a one-line front-matter note: `Source: CEO draft 2026-04-18; any edits belong in the source doc and re-imported here.`
- **Depends on**: none
- **Verification**: File exists and byte-matches the source; `rg -n 'Remove any default decision' internal-docs/pilot-operations/pilot-runbook.md` returns exactly one hit.

---

### TASK-001: Extend EvaluateDecisionOutcome + PolicyEvaluationResult to admit no-match
- **Files**: `src/shared/types.ts`
- **Action**: Modify
- **Details**: Replace today's binary discriminated union with a ternary one that forces callers to branch on match/no-match. Quote **Spec Literals § existing decision-engine.md §4.3** verbatim in a JSDoc block above the new type so the superset relationship is explicit.

  Today (from Spec Literals):
  ```typescript
  export type EvaluateDecisionOutcome =
    | { ok: true; result: Decision }
    | { ok: false; errors: RejectionReason[] };
  ```

  Target:
  ```typescript
  export type EvaluateDecisionOutcome =
    | { ok: true; matched: true; result: Decision }
    | { ok: true; matched: false }
    | { ok: false; errors: RejectionReason[] };
  ```

  Rationale (quote the runbook literal in the JSDoc): *"Remove any default decision that fires when no rule matches. If no policy rule matches, no decision is created and no LIU is counted."* The third variant is how the engine reports this to its caller. Discriminating on `matched` (not on nullability of `result`) is forced at the type-system level so TypeScript will flag every existing consumer that currently assumes success = decision.

  Also widen `PolicyEvaluationResult.decision_type` to `DecisionType | null` (with a required `matched_rule_id: string | null` companion): when `matched_rule_id === null`, `decision_type === null`. Add a type-level comment that the two fields move together. `evaluated_fields` and `matched_rule` remain optional as today.

  **Backward compat note for callers:** The `{ ok: true; matched: true; result: Decision }` shape is what today's `{ ok: true; result: Decision }` callers get at the type level (extra `matched: true` narrows correctly if they check `ok` first and then access `result`). Existing test assertions like `expect(outcome.ok).toBe(true); expect(outcome.result.decision_type).toBe('advance')` will still compile **but** TypeScript will now warn that `outcome.result` is possibly undefined unless `matched` is also narrowed. TEST-004 absorbs this churn.
- **Depends on**: TASK-000
- **Verification**: `npm run typecheck` surfaces the expected list of call-sites to update (drives TASK-003, TASK-004, TASK-010). Compile-fail list is an input to those tasks, not a blocker.

### TASK-002: Rewrite evaluatePolicy — no-match returns sentinel, default_decision_type ignored
- **Files**: `src/decision/policy-loader.ts`
- **Action**: Modify
- **Details**: In `evaluatePolicy(state, policy)`:
  - Preserve today's first-match-wins rule iteration.
  - When a rule matches → return `{ decision_type, matched_rule_id, matched_rule, evaluated_fields }` exactly as today.
  - When **no** rule matches → return `{ decision_type: null, matched_rule_id: null }` (no `matched_rule`, no `evaluated_fields`). Do **not** consult `policy.default_decision_type` under any circumstance.
  - The field `policy.default_decision_type` stays on the `PolicyDefinition` type (loaded and parsed for schema back-compat) but the evaluator must not read it. Add a single-line code comment citing the runbook literal: `// Per runbook § Policy rule: "If no policy rule matches, no decision is created and no LIU is counted."`
- **Depends on**: TASK-001
- **Verification**: `rg -n 'default_decision_type' src/decision/policy-loader.ts` shows only the load/validate path (TASK-006), not the evaluate path. Unit tests in TEST-004 update the expected no-match shape.

### TASK-003: Rewrite evaluateState — skip saveDecision and build educator_summary
- **Files**: `src/decision/engine.ts`
- **Action**: Modify
- **Details**: Apply three edits:
  1. **buildRationale**: remove the fallback branch. The function should only be called when a rule matched; when called on a match, produce today's rule-matched string. A `/* istanbul ignore next */` or explicit precondition check is fine; calling it for no-match is a programming error now.
  2. **evaluateState flow**: after `evaluatePolicy(...)` (Step 5 in the spec's Evaluation Flow), branch:
     - If `evalResult.decision_type === null` (no match): return `{ ok: true, matched: false }`. Do **not** call `extractCanonicalSnapshot`, do **not** call `saveDecision`, do **not** construct a Decision object. This is the runbook's "no decision is created" contract.
     - Else: today's flow — build snapshot, rationale, decision object, persist, return `{ ok: true, matched: true, result: decision }`.
  3. **educator_summary**: when a decision is built, populate `trace.educator_summary` from `DECISION_TYPE_TO_EDUCATOR_SUMMARY[decision.decision_type]` (TASK-007). Inline the map access; no fallback — if the key is missing the caller has a broken policy and we want the type error.

  Preserve the DEF-DEC-007 canonical-snapshot behavior exactly. Do not touch `extractCanonicalSnapshot`.
- **Depends on**: TASK-001, TASK-002, TASK-007
- **Verification**: `rg -n 'default_decision_type' src/decision/engine.ts` returns zero matches after the edit. `rg -n 'saveDecision' src/decision/engine.ts` still shows exactly one call, inside the matched branch. `outcome.matched === false` path is exercised by TEST-002.

### TASK-004: Mirror TASK-003 in the async engine
- **Files**: `src/decision/engine-async.ts`
- **Action**: Modify
- **Details**: Apply the same three edits as TASK-003 to `evaluateStateAsync`. The async version is used by the Lambda path (per `src/ingestion/handler-core-async.ts:19`) and must behave identically to the sync version for deterministic cross-environment results (decision-engine spec § Core Constraints — Determinism: *"Same `(state_id, state_version, policy_version)` → same `decision_type`"*). A no-match in sync **must** be a no-match in async for the same state.
- **Depends on**: TASK-003
- **Verification**: Diff `src/decision/engine.ts` and `src/decision/engine-async.ts` — post-match-branch logic is identical modulo `await`; no-match branch is identical.

### TASK-005: Remove default_decision_type from policy JSON files
- **Files**:
  - `src/decision/policies/default.json`
  - `src/decision/policies/springs/learner.json`
  - `src/decision/policies/springs/staff.json`
- **Action**: Modify (3 files)
- **Details**: Delete the trailing `"default_decision_type": "reinforce"` line from each file. Runbook § Executive decisions table (quoted verbatim in Spec Literals) is explicit: *"Remove any default decision that fires when no rule matches."* Removal at the data level (not just the code path) makes the contract legible to anyone reading the policy file.

  Note: this does not change the decision outcomes for any seeded Springs case that currently matches a rule. It only changes cases that previously fell through to the default — those cases now produce no decision, which is the intended runbook behavior.
- **Depends on**: TASK-002
- **Verification**: `rg -n 'default_decision_type' src/decision/policies/ -F` returns zero matches.

### TASK-006: Policy-loader validation accepts-but-ignores default_decision_type
- **Files**: `src/decision/policy-loader.ts`
- **Action**: Modify
- **Details**: In the structural validation path (today it requires `default_decision_type` to exist and be a valid `DecisionType`):
  - Change to: field is **optional**; if present, must still be a valid `DecisionType` (keep the closed-set check for callers still writing it via admin PUT). If absent, pass.
  - Add a warning log: `log.warn?.({ policy_id }, 'default_decision_type is deprecated and ignored (runbook 2026-04-18 §Policy rule); remove from policy JSON')`. One-time per load is sufficient (cached policies won't spam).
  - Do **not** fail admin PUT /v1/admin/policies when the field is present — see TASK-006's relationship to `openapi.yaml` in TASK-014.
- **Depends on**: TASK-002
- **Verification**: `tests/unit/policy-loader.test.ts` "invalid_decision_type when default_decision_type is invalid" case still passes (invalid value rejected) AND a new case proves a policy with no `default_decision_type` at all loads without error.

### TASK-007: Educator-summary lookup map
- **Files**: `src/decision/educator-summaries.ts` (new)
- **Action**: Create
- **Details**: Single-file module exporting a closed-set map keyed by `DecisionType`. Values are the **Shortest version** column from the runbook's decision-definition table, quoted verbatim from Spec Literals § Teacher-friendly decision definitions:

  ```typescript
  import type { DecisionType } from '../shared/types.js';

  /**
   * Teacher-facing short labels for each decision type.
   * Source: internal-docs/pilot-operations/pilot-runbook.md
   *         § Teacher-friendly decision definitions (Shortest version column).
   *
   * These strings land in Decision.trace.educator_summary and are what a
   * school sees. Never describe "pause" as "temporary hold" or "do nothing"
   * — runbook internal note is explicit on this.
   */
  export const DECISION_TYPE_TO_EDUCATOR_SUMMARY: Record<DecisionType, string> = {
    advance: 'Ready to move on',
    reinforce: 'Needs more practice',
    intervene: 'Needs stronger support now',
    pause: 'Possible learning decay detected; watch closely',
  };
  ```

  Do not parameterize per-org yet. The runbook presents these as 8P3P-standard teacher-facing definitions, not per-school strings. Per-policy override is future scope; log it as a deferred item in TASK-014.
- **Depends on**: TASK-000
- **Verification**: File exists; `TypeScript` narrows the map to exactly 4 keys; no other module owns this string table (`rg -n "'Needs more practice'"` returns exactly one hit).

### TASK-008: Add trace.educator_summary to Decision type, JSON schema, OpenAPI, Ajv validator
- **Files**:
  - `src/shared/types.ts` (Decision.trace interface)
  - `src/contracts/schemas/decision.json` (JSON Schema)
  - `docs/api/openapi.yaml` (Decision schema × 2 locations: lines ~1389 and ~1464, plus any Receipt schema that pass-throughs trace)
  - `src/contracts/validators/decision.ts` (Ajv compiled validator — automatic if schema updates)
- **Action**: Modify (4 files)
- **Details**: Add a **required** string field `trace.educator_summary` (min length 1). Placement inside `trace` is deliberate: receipts (`docs/specs/receipts-api.md` § Requirements — "Receipt projection: each Receipt MUST include … trace (same semantics and fields as Decision.trace)") flow through trace, so adding the field to trace lights up the receipt projection with no endpoint code changes.

  **JSON schema diff** (cite against the verbatim block in `src/contracts/schemas/decision.json` lines 37–86):
  - Add to `trace.required`: `"educator_summary"`
  - Add to `trace.properties`: `"educator_summary": { "type": "string", "minLength": 1, "description": "Teacher-facing short label for this decision type. Source: runbook § Teacher-friendly decision definitions (Shortest version)." }`

  **TypeScript diff** (against `src/shared/types.ts` lines ~339-352, `Decision.trace`):
  - Add `educator_summary: string;` to the `trace` inline type.

  **OpenAPI diff**:
  - Both inline `trace:` schemas in the Decision definitions get the new required property.
  - If the Receipt response schema inlines `trace`, update it too. If it `$ref`s the Decision trace, no change needed beyond Decision.
- **Depends on**: TASK-001, TASK-007
- **Verification**: `scripts/validate-schemas.ts`, `scripts/validate-contracts.ts`, and `scripts/validate-api.sh` (Redocly) all pass. Ajv `validateDecision` rejects a decision missing `trace.educator_summary` with a clear error.

### TASK-009: Populate trace.educator_summary in both engines
- **Files**: `src/decision/engine.ts`, `src/decision/engine-async.ts`
- **Action**: Modify
- **Details**: In the matched-branch Decision construction (TASK-003, TASK-004), set:
  ```typescript
  educator_summary: DECISION_TYPE_TO_EDUCATOR_SUMMARY[evalResult.decision_type]
  ```
  `evalResult.decision_type` is non-null in the matched branch (narrowed by TASK-001 + TASK-002). Lookup is total by construction of the map.
- **Depends on**: TASK-003, TASK-004, TASK-007, TASK-008
- **Verification**: TEST-003 asserts the four expected strings; contract test `tests/contracts/decision-engine.test.ts` DEC-001 happy path asserts presence.

### TASK-010: Ingestion sync-trigger handles matched=false cleanly
- **Files**: `src/ingestion/handler-core.ts`, `src/ingestion/handler-core-async.ts`
- **Action**: Modify (2 files)
- **Details**: Today both handlers check `if (!decisionOutcome.ok) log.warn(...)`. After TASK-001, three states exist: `ok=true & matched=true` (decision saved), `ok=true & matched=false` (no decision — NORMAL per runbook), `ok=false` (rejection — still a warn).

  Update the branching to:
  - `ok=true && matched=true`: unchanged — decision was saved silently.
  - `ok=true && matched=false`: `log.info?.({ org_id, signal_id }, 'no policy rule matched; no decision emitted (runbook §Policy rule)')`. **Not** a warn. This is a first-class pilot outcome, not an error.
  - `ok=false`: unchanged warn.

  Critical: the ingestion handler must **still return `accepted`** to the client in all three cases. The runbook's LIU rule (Spec Literals § LIU billing) is explicit: the signal is accepted, we just don't count it. Do not change the HTTP status or the ingestion outcome entry.
- **Depends on**: TASK-003, TASK-004
- **Verification**: `tests/contracts/signal-ingestion.test.ts` — ingest a payload known not to match any rule; assert HTTP 200 with `status: 'accepted'` and no decision row appears for that learner in `GET /v1/decisions`.

### TASK-011: Pause copy sweep — kill "Temporary hold" everywhere
- **Files**:
  - `README.md` (line 91: `| \`pause\` | Temporary hold |`)
  - `docs/foundation/terminology.md` (line 47: `| \`pause\` | Insufficient confidence to act — hold | |`)
  - `docs/specs/decision-engine.md` (line 203: `| \`pause\` | Temporary hold; reroute or compliance block |`)
  - `docs/api/openapi.yaml` (wherever pause has a `description:` other than enum listing — confirm with grep)
  - `dashboard/src/components/panels/WhoNeedsAttention.tsx` (line 13: `if (decisionType === 'pause') return 'high decay risk';` — already aligned with runbook; keep as-is, just verify)
- **Action**: Modify (3–4 files)
- **Details**: Quote Spec Literals § Teacher-friendly decision definitions verbatim in each location. Specifically:

  README § Decision Types table — new row:
  ```
  | `pause` | Possible learning decay detected; watch closely |
  ```

  terminology.md § Decision Types — new row:
  ```
  | `pause` | Possible learning decay detected; monitor closely before advancing | |
  ```

  decision-engine.md § 4.5 Decision Types (Closed Set) — new row:
  ```
  | `pause` | Possible learning decay detected; watch closely (hold/reroute internally) |
  ```

  Rationale note to add once (in decision-engine.md § 4.5): *"Per runbook internal note (2026-04-18): on the backend, 'pause' can still map to possible risk or decay, but in client conversations it must never be explained as 'do nothing' or 'temporary hold.' The column above is the client-facing description."*

  Do **not** touch:
  - Historical artifacts under `.cursor/plans/`, `docs/testing/qa-test-pocv1.md`, or dated `docs/reports/` — these are frozen records of what was true at that time.
  - Grep match in `.agents/skills/fastify-best-practices/rules/websockets.md` — unrelated library copy.
- **Depends on**: TASK-000
- **Verification**: TEST-007 — `rg -n 'Temporary hold|temporary hold' --glob '!.cursor/plans/**' --glob '!docs/reports/**' --glob '!docs/testing/qa-test-poc*.md' --glob '!.agents/**' .` returns zero matches.

### TASK-012: Surface educator_summary in the dashboard
- **Files**:
  - `dashboard/src/api/types.ts` (extend `Decision.trace` type to include `educator_summary: string`)
  - `dashboard/src/components/panels/WhatToDo.tsx` (render educator_summary under the decision badge)
  - `dashboard/src/components/shared/DecisionBadge.tsx` or sibling (where the short label renders today)
  - Decision Trace panel (`src/panels/panel-decision-stream.js` if the static panel surfaces trace text; confirm with grep)
- **Action**: Modify
- **Details**: Minimum viable surface: the `WhatToDo` panel (Panel 3) and the Decision Trace panel render `decision.trace.educator_summary` directly below (or instead of) the raw decision-type label. No copy logic lives in the dashboard — the string comes from the backend, which sourced it from the runbook table. This is what closes Block 5 of the dry-run script ("Can an educator narrate without our translation?").

  Existing dashboard copy to verify:
  - `WhoNeedsAttention.tsx:13` already returns "high decay risk" for pause — keep as the *category* label; the educator_summary is the *decision sentence*. Two distinct fields; no conflict.
  - `DecisionBadge` shows the 4-letter type badge (`INTERVENE`, `PAUSE`, etc.) — keep as-is for color coding; educator_summary renders as body text, not badge text.
- **Depends on**: TASK-008, TASK-009
- **Verification**: Dashboard build succeeds; manual smoke (Block 5 of dry-run script) shows the plain-language sentence; E2E test (if the dashboard has one for this panel) asserts the sentence renders.

### TASK-013: LIU usage meter spec — cross-link the no-default rule
- **Files**: `docs/specs/liu-usage-meter.md`
- **Action**: Modify (minor — 1–2 lines)
- **Details**: The spec's `§ What Counts as an LIU` table (quoted verbatim in Spec Literals) already says "signal accepted but no decision … No." No text change needed. Add a one-line cross-reference under the table: *"This aligns with `internal-docs/pilot-operations/pilot-runbook.md` § Policy rule: 'If no policy rule matches, no decision is created and no LIU is counted.' The engine enforces this behavior — see `src/decision/engine.ts` evaluateState()."*
- **Depends on**: TASK-000, TASK-003
- **Verification**: `rg -n 'pilot-runbook.md' docs/specs/liu-usage-meter.md` returns exactly one hit.

### TASK-014: Decision-engine spec — codify no-match rule; deprecate default_decision_type
- **Files**: `docs/specs/decision-engine.md`
- **Action**: Modify
- **Details**: Three targeted edits:
  1. **§4.3 (EvaluateDecisionOutcome)**: add the third variant with a quoted-runbook-literal rationale. Keep the existing two JSON blocks verbatim (Spec Literals references them); append the new one:
     ```json
     {
       "ok": true,
       "matched": false
     }
     ```
     Prose: *"When no rule in the resolved policy matches, `evaluateState()` returns `{ ok: true, matched: false }` — no Decision is constructed, no persistence occurs, no LIU is counted. Source: runbook § Policy rule (2026-04-18). The earlier behavior (fall through to `default_decision_type`) is removed."*
  2. **§4.6 (PolicyDefinition)**: mark `default_decision_type` as **Deprecated** with a note: *"Accepted for back-compat of existing admin API payloads but ignored by the evaluator. Scheduled for removal after the first enterprise contract signs (v1.2). New policies should omit the field."*
  3. **§Policy Evaluation Semantics** — rule 4: change *"If no rules match, return `{ decision_type: default_decision_type, matched_rule_id: null }`"* to *"If no rules match, return `{ decision_type: null, matched_rule_id: null }`; `evaluateState()` translates this into `{ ok: true, matched: false }` and does not persist a Decision."*
  4. **§ Success Criteria** — add: `- [ ] No-match outcome: when no rule matches, no Decision row is created and evaluateState returns { ok: true, matched: false }.`
  5. **§ Out of Scope / Deferred items**: mention per-policy `educator_summary` override as a future item (defer to v1.2).
- **Depends on**: TASK-003, TASK-007
- **Verification**: `rg -n 'matched: false' docs/specs/decision-engine.md` returns at least 2 hits (§4.3, §Policy Evaluation Semantics); `Deprecated` appears near `default_decision_type`.

---

### TEST-001: Update DEC-008 vectors 8h and 8i
- **Files**: `tests/contracts/decision-engine.test.ts`
- **Action**: Modify
- **Details**: Today (from `docs/specs/decision-engine.md` §5 DEC-008 table):
  - 8h: `stabilityScore: 0.9, timeSinceReinforcement: 1000` → expected `reinforce` with `matched_rule_id: null` (default fallthrough)
  - 8i: `stabilityScore: 0.6, timeSinceReinforcement: 1000, confidenceInterval: 0.8` → same

  New expected behavior: both cases produce **no decision**. Assert `outcome.ok === true && outcome.matched === false`. Remove the `decision_type === 'reinforce'` and `matched_rule_id === null` assertions for these two cases only — all other 7 cases (8a–8g) keep today's assertions verbatim.

  Update the DEC-008 docstring in the test file and in `docs/specs/decision-engine.md` §5 to reflect the new 8h/8i semantics: these are now "no-match" proofs, not "default fallthrough" proofs.
- **Depends on**: TASK-003
- **Verification**: `npm test -- tests/contracts/decision-engine.test.ts` passes.

### TEST-002: New contract test — DEC-009 no-match no-save
- **Files**: `tests/contracts/decision-engine.test.ts`
- **Action**: Modify (append DEC-009)
- **Details**: New test `DEC-009 "no rule match emits no decision, no saveDecision call"`:
  - Set up state that matches no rule in `default.json` (reuse 8h canonical fields: `stabilityScore: 0.9, timeSinceReinforcement: 1000`).
  - Call `evaluateState(...)`.
  - Assert `outcome.ok === true && outcome.matched === false`.
  - Assert no decision row was persisted — `getDecisions({...learner, from_time, to_time})` returns an empty array.
  - Repeat the same assertions against `evaluateStateAsync` to prove parity (TASK-004).
- **Depends on**: TASK-003, TASK-004
- **Verification**: Both sync and async assertions green.

### TEST-003: Educator-summary unit test
- **Files**: `tests/unit/decision-engine.test.ts` (new `describe('educator_summary', ...)`)
- **Action**: Modify (append)
- **Details**: Parameterized over all 4 decision types. For each, drive state that triggers that type in the default policy, run `evaluateState`, and assert `outcome.result.trace.educator_summary === DECISION_TYPE_TO_EDUCATOR_SUMMARY[type]`. Quote the exact runbook strings inline (verbatim from Spec Literals) as the expected values — do not import from `educator-summaries.ts` in the test, so a drift between code and runbook is caught at the assertion level.

  Expected string matrix (verbatim from Spec Literals § Teacher-friendly decision definitions):
  ```
  advance    → "Ready to move on"
  reinforce  → "Needs more practice"
  intervene  → "Needs stronger support now"
  pause      → "Possible learning decay detected; watch closely"
  ```
- **Depends on**: TASK-007, TASK-009
- **Verification**: `npm test -- tests/unit/decision-engine.test.ts` — 4 new cases green.

### TEST-004: Update tests that assumed default fallthrough
- **Files**:
  - `tests/unit/policy-loader.test.ts` (cases around lines 478–490, 535)
  - `tests/unit/decision-engine.test.ts` (cases asserting `decision_type === 'reinforce'` for no-match states)
  - `tests/unit/skill-level-tracking.test.ts` (default_decision_type use)
  - `tests/integration/skill-level-tracking.test.ts`
- **Action**: Modify
- **Details**: For each test that presently relies on `default_decision_type` producing a `reinforce` decision from a no-match state, flip the assertion to the no-match outcome (`evaluatePolicy` returns `{ decision_type: null, matched_rule_id: null }`; `evaluateState` returns `{ ok: true, matched: false }`). Tests that drive a state matching a rule need no change.

  For tests that construct synthetic `PolicyDefinition` objects including `default_decision_type: 'reinforce'`: keep the field (TASK-006 allows it), but delete any assertion that relies on it firing. Add one new case that passes a policy **without** `default_decision_type` and proves it still loads (TASK-006 coverage).
- **Depends on**: TASK-002, TASK-006, TASK-003
- **Verification**: `npm test -- tests/unit/policy-loader.test.ts tests/unit/decision-engine.test.ts tests/unit/skill-level-tracking.test.ts tests/integration/skill-level-tracking.test.ts` green.

### TEST-005: Springs pilot integration regression sweep
- **Files**: `tests/integration/springs-pilot.test.ts`
- **Action**: Modify (if needed) / Verify
- **Details**: The Springs seed (`scripts/seed-springs-demo.mjs`) drives states that are engineered to match specific rules in `springs/learner.json` and `springs/staff.json`. After TASK-005 removes `default_decision_type` from both files, any seeded state that secretly relied on default-fallthrough will now produce no decision — breaking the demo. For each personas' expected decision in the existing test:
  - If the assertion expects a decision with `matched_rule_id !== null`: state was designed to match a rule → no change needed.
  - If the assertion expects `matched_rule_id === null`: state was relying on default → either retune the seed to match a rule, **or** flip the assertion to `matched: false`. Prefer retuning (a seed that produces no decision is a bad demo artifact).
  - If the `docs/guides/springs-pilot-demo.md` § Decision Distribution specifies N decisions and the new behavior produces fewer, the mismatch is a dry-run Block-4 finding — note in the PR body, retune seed if engineering time permits, otherwise update the guide.
- **Depends on**: TASK-005
- **Verification**: `npm test -- tests/integration/springs-pilot.test.ts` green. Seed-script dry run (`npm run seed:springs-demo` against a clean DB) produces the expected decision count per `docs/guides/springs-pilot-demo.md`.

### TEST-006: Receipt projection includes educator_summary
- **Files**: `tests/contracts/receipts-api.test.ts` (extend RCPT-API-005)
- **Action**: Modify
- **Details**: RCPT-API-005 today asserts `trace.state_snapshot`, `trace.matched_rule`, `trace.rationale` are present. Add `trace.educator_summary` to the required-present list and assert it is a non-empty string. Source: runbook § What a receipt should show — *"Any explanation text shown to the school"* — quoted verbatim in the test's describe block.
- **Depends on**: TASK-008, TASK-009
- **Verification**: `npm test -- tests/contracts/receipts-api.test.ts` green.

### TEST-007: Pause-copy grep guard
- **Files**: `tests/contracts/contract-drift.test.ts` (or a new `tests/contracts/pilot-copy-drift.test.ts`)
- **Action**: Modify (append) OR Create
- **Details**: One-shot assertion that canonical client-facing docs do not contain forbidden pause phrases. Run a filesystem-level grep for `Temporary hold|temporary hold|pause.*do nothing` across:
  - `README.md`
  - `docs/foundation/**/*.md`
  - `docs/specs/**/*.md`
  - `docs/guides/**/*.md`
  - `docs/api/openapi.yaml`
  - `dashboard/src/**/*.{ts,tsx}`

  Explicitly exclude:
  - `.cursor/plans/**` (historical plans may legitimately quote the old phrasing)
  - `docs/reports/**` (dated artifacts — frozen)
  - `docs/testing/qa-test-pocv*.md` (historical QA records)
  - `.agents/**` (third-party skill docs)

  Assert match count === 0. Cite the runbook internal-note literal in the test description so future readers understand why it exists.
- **Depends on**: TASK-011
- **Verification**: New test green; deliberately regress by putting "Temporary hold" into `README.md` and confirm test fails.

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `internal-docs/pilot-operations/pilot-runbook.md` | TASK-000 | Stable spec anchor imported from CEO draft |
| `src/decision/educator-summaries.ts` | TASK-007 | Closed-set map `DecisionType → teacher-facing short label` |
| `tests/contracts/pilot-copy-drift.test.ts` (optional) | TEST-007 | Grep guard for forbidden pause phrasing |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `src/shared/types.ts` | TASK-001 | Extend `EvaluateDecisionOutcome` with `matched: false` variant; widen `PolicyEvaluationResult.decision_type` to `DecisionType \| null`; add `trace.educator_summary: string` |
| `src/decision/policy-loader.ts` | TASK-002, TASK-006 | `evaluatePolicy` returns null on no-match; validator tolerates missing `default_decision_type` |
| `src/decision/engine.ts` | TASK-003, TASK-009 | No-match short-circuit; populate `trace.educator_summary` |
| `src/decision/engine-async.ts` | TASK-004, TASK-009 | Mirror of engine.ts |
| `src/decision/policies/default.json` | TASK-005 | Remove `default_decision_type` line |
| `src/decision/policies/springs/learner.json` | TASK-005 | Remove `default_decision_type` line |
| `src/decision/policies/springs/staff.json` | TASK-005 | Remove `default_decision_type` line |
| `src/contracts/schemas/decision.json` | TASK-008 | Add `trace.educator_summary` (required, string, min-length 1) |
| `docs/api/openapi.yaml` | TASK-008, TASK-011 | Add `educator_summary` to Decision/Receipt trace; fix pause descriptions |
| `src/ingestion/handler-core.ts` | TASK-010 | Handle `matched: false` as info-level, not warn |
| `src/ingestion/handler-core-async.ts` | TASK-010 | Same |
| `README.md` | TASK-011 | Pause description → runbook phrasing |
| `docs/foundation/terminology.md` | TASK-011 | Pause description → runbook phrasing |
| `docs/specs/decision-engine.md` | TASK-011, TASK-014 | Pause description; §4.3 third outcome variant; §4.6 deprecate `default_decision_type`; §Policy Evaluation Semantics rule 4 |
| `docs/specs/liu-usage-meter.md` | TASK-013 | One-line cross-link to runbook |
| `dashboard/src/api/types.ts` | TASK-012 | Extend trace type |
| `dashboard/src/components/panels/WhatToDo.tsx` | TASK-012 | Render `educator_summary` |
| `dashboard/src/components/shared/DecisionBadge.tsx` | TASK-012 | Optional: supplement badge with educator_summary |
| `tests/contracts/decision-engine.test.ts` | TEST-001, TEST-002 | Flip 8h/8i assertions; add DEC-009 |
| `tests/contracts/receipts-api.test.ts` | TEST-006 | Assert `trace.educator_summary` on receipt |
| `tests/unit/decision-engine.test.ts` | TEST-003, TEST-004 | Educator-summary cases; flip default-fallthrough cases |
| `tests/unit/policy-loader.test.ts` | TEST-004 | Flip default-fallthrough cases; add missing-default load case |
| `tests/unit/skill-level-tracking.test.ts` | TEST-004 | Flip fallthrough cases |
| `tests/integration/skill-level-tracking.test.ts` | TEST-004 | Flip fallthrough cases |
| `tests/integration/springs-pilot.test.ts` | TEST-005 | Verify seed still produces expected decisions |

## Requirements Traceability

> Every normative rule in the Spec Literals section must map to ≥1 TASK. Unmapped = planning defect.

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| "Remove any default decision that fires when no rule matches" | runbook § Executive decisions — Policy rule | TASK-002, TASK-003, TASK-004, TASK-005, TASK-006 |
| "If no policy rule matches, no decision is created and no LIU is counted" | runbook § Executive decisions — Policy rule | TASK-003, TASK-004, TASK-010, TEST-002 |
| "Important control: if no rule matches, no decision should be emitted" | runbook § Policy configuration workflow | TASK-003, TASK-004, TEST-002 |
| Teacher-friendly definitions table — Advance "Ready to move on" | runbook § Teacher-friendly decision definitions | TASK-007, TASK-009, TEST-003 |
| Teacher-friendly definitions table — Reinforce "Needs more practice" | runbook § Teacher-friendly decision definitions | TASK-007, TASK-009, TEST-003 |
| Teacher-friendly definitions table — Intervene "Needs stronger support now" | runbook § Teacher-friendly decision definitions | TASK-007, TASK-009, TEST-003 |
| Teacher-friendly definitions table — Pause "Possible learning decay detected; watch closely" | runbook § Teacher-friendly decision definitions | TASK-007, TASK-009, TASK-011, TEST-003, TEST-007 |
| Internal note — "pause" never as "do nothing" or "temporary hold" in client conversation | runbook § Teacher-friendly decision definitions — internal note | TASK-011, TEST-007 |
| Receipt MUST show "Any explanation text shown to the school" | runbook § What a receipt should show | TASK-007, TASK-008, TASK-009, TEST-006 |
| Receipt MUST show Learner ID, Policy version, Timestamp, Source signals, State values, Rule/threshold, Decision | runbook § What a receipt should show | Already satisfied by existing `Decision.trace` (no-op verify in TEST-006); `receipts-api.md` ✓ |
| LIU billing — "one governed learning decision, not one raw signal" | runbook § LIU billing rule | TASK-013 (cross-link only; behavior already aligned post-TASK-003) |
| Dashboard must let educator narrate without 8P3P translation (Block 5 of dry-run script) | runbook § output review + dry-run-script.plan.md Block 5 | TASK-012 |
| Existing decision-engine spec §Trace Required fields preserved | docs/specs/decision-engine.md §Trace Required | TASK-008 (additive only — no field removed) |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| DEC-008 (modified 8h, 8i) | contract | No-match vectors return matched=false, not default reinforce | TEST-001 |
| DEC-009 (new) | contract | No-match emits no decision and does not persist — sync + async | TEST-002 |
| (new) educator_summary parameterized | unit | All 4 decision types carry the exact runbook Shortest-version string on `trace.educator_summary` | TEST-003 |
| (modified) policy-loader / decision-engine / skill-level-tracking | unit/integration | Flip default-fallthrough assertions to no-match; verify policy loads without `default_decision_type` | TEST-004 |
| (verify) springs-pilot | integration | Seed still produces expected decision distribution; no personas silently drop to no-match | TEST-005 |
| RCPT-API-005 (extended) | contract | Receipt projection includes non-empty `trace.educator_summary` | TEST-006 |
| pilot-copy-drift (new) | contract | Zero occurrences of "Temporary hold" / "temporary hold" in client-facing docs + dashboard | TEST-007 |

## Deviations from Spec

> The runbook is the spec. List every place the plan's literal values differ from the runbook or from the existing decision-engine spec. Resolution must be one of: `Update spec in same PR`, `Implementation detail — spec silent`, `Reverted — plan now matches spec`.

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| runbook § Teacher-friendly decision definitions | Pause plain meaning includes both "Possible risk: watch closely" (first sentence) and a longer explanation sentence | Plan exposes only the **Shortest version** (`"Possible learning decay detected; watch closely"`) on `trace.educator_summary`; longer form is not added as a second field in this plan | Implementation detail — spec silent on field count. Longer form may be added as `trace.educator_explanation` in a later plan if Block-5 feedback requests it. |
| docs/specs/decision-engine.md §4.3 EvaluateDecisionOutcome (existing 2-variant union) | Today's spec enumerates only `ok: true / result` and `ok: false / errors` | Plan adds a third variant `{ ok: true, matched: false }` | Update spec in same PR — TASK-014 edits §4.3 to include the third variant verbatim. |
| docs/specs/decision-engine.md §4.6 PolicyDefinition | `default_decision_type` listed as a regular field with fallback semantics | Plan marks it **Deprecated**, kept for admin-API back-compat only, never read by the evaluator | Update spec in same PR — TASK-014. |
| docs/specs/decision-engine.md §Policy Evaluation Semantics (rule 4) | "If no rules match, return `{ decision_type: default_decision_type, matched_rule_id: null }`" | Plan changes to "If no rules match, return `{ decision_type: null, matched_rule_id: null }`" | Update spec in same PR — TASK-014. |
| docs/api/openapi.yaml Decision schema | `trace` has 7 required fields, no `educator_summary` | Plan adds `educator_summary` as required string (min-length 1) | Update spec in same PR — TASK-008 edits OpenAPI + JSON Schema together. |
| docs/api/openapi.yaml Policy schema (`default_decision_type` in `required:` list, openapi.yaml:1543) | Currently required | Plan makes it optional | Update spec in same PR — TASK-008/TASK-014 (add openapi.yaml edit to remove from required list). |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Springs seed currently produces one or more personas that silently rely on default-fallthrough; removing the fallback breaks the demo distribution | High (Block 5 of dry-run script depends on the demo producing decisions for every persona) | TEST-005 is a required gate; any drop in decision count surfaces in the integration test before Saturday. If a persona regresses, retune the seed state (not the policy) so it matches a rule — per runbook § Best-practice data intake, pilot states should match real educator-scored rubrics anyway. |
| `trace.educator_summary` becoming required breaks legacy decision rows written before TASK-008 | Medium (receipts-api test will fail loading historical rows) | The local dev DB is wiped on seed; Springs pilot has no production data to migrate; if any environment has pre-existing rows, run `npm run seed:springs-demo` with the idempotent path (wipe-and-reseed documented in dry-run-script.md pre-flight). |
| Type-system churn from extending `EvaluateDecisionOutcome` surfaces hundreds of assertion updates across test files, blowing past Saturday | Medium | Scope is bounded: grep shows ~30 call-sites to `evaluateState(` and `outcome.result` across tests. TEST-004 handles in one sitting. If the compile-fail list exceeds ~50 files after TASK-001, pause and reconsider Approach A (`result: Decision \| null`) as a narrower alternative. |
| Pause copy sweep missed a location (e.g. dashboard tooltip text, panel PDF exports) | Medium (client sees forbidden phrasing during Block 5) | TEST-007 is a hard grep guard against a closed list of canonical paths. Add a manual walkthrough of `/dashboard/*` routes in Friday evening of the dry-run script (TASK-011 cross-links there). |
| Admin API payloads in the field that include `default_decision_type` (today required) start failing validation when the schema is loosened | Low (we control all admin callers; pilot is single-tenant) | TASK-006 keeps the field accepted (not rejected) on load and on admin PUT; only the semantics change. Back-compat preserved. |
| Future per-policy `educator_summary` override may require this plan's schema to change shape | Low | Flagged in TASK-014 as Deferred. A per-policy override can be added later as an optional `policy.educator_summaries` override map; today's global map remains the default. No lock-in. |

## Verification Checklist

- [ ] All TASK-001 through TASK-014 completed
- [ ] All TEST-001 through TEST-007 pass
- [ ] `npm test` — total count green; no regressions in the ~503-test baseline
- [ ] `npm run lint` — green
- [ ] `npm run typecheck` — green (confirms TASK-001 discriminated-union widened correctly)
- [ ] `npm run validate:schemas` and `npm run validate:contracts` — green (TASK-008 schema additions valid)
- [ ] `npm run seed:springs-demo` against a clean DB produces the decision distribution documented in `docs/guides/springs-pilot-demo.md` (TEST-005 check)
- [ ] `rg -n 'Temporary hold|temporary hold' --glob '!.cursor/plans/**' --glob '!docs/reports/**' --glob '!docs/testing/qa-test-poc*.md' --glob '!.agents/**' .` returns zero matches (TEST-007 gate)
- [ ] `rg -n 'default_decision_type' src/decision/policies/` returns zero matches (TASK-005 gate)
- [ ] `rg -n 'default_decision_type' src/decision/engine.ts src/decision/engine-async.ts` returns zero matches (TASK-003/TASK-004 gate)
- [ ] Dashboard manual smoke — WhatToDo panel and Decision Trace panel render the runbook Shortest-version string for a decision of each of the 4 types

## Implementation Order

```
TASK-000 ─┬─ TASK-001 ─┬─ TASK-002 ─┬─ TASK-005 ───────────────┐
          │            │            │                           │
          │            │            └─ TASK-006 ───────────┐    │
          │            │                                   │    │
          │            └─ TASK-007 ─┬─ TASK-008 ─┐          │    │
          │                         │            │          │    │
          │                         └─ TASK-003 ─┼─ TASK-004 ┤   │
          │                                      │           │   │
          │                                      └─ TASK-009 ┤   │
          │                                                  │   │
          │                                        TASK-010 ─┤   │
          │                                                  │   │
          ├─ TASK-011 ──────────────────────────────────────┤   │
          │                                                  │   │
          ├─ TASK-012 ──────────────────────────────────────┤   │
          │                                                  │   │
          ├─ TASK-013 ──────────────────────────────────────┤   │
          │                                                  │   │
          └─ TASK-014 ──────────────────────────────────────┴───┴─ TEST-001..TEST-007
```
