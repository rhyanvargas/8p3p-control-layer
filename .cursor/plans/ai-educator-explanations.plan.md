---
name: AI Educator Explanations
overview: "Add an optional Bedrock-generated trace.educator_explanation to every decision via an ExplanationGenerator port, fail-safe to the static template label, feature-flagged off by default, with one persisted decision write per evaluation."
todos:
  - id: TASK-001
    content: Add aws-sdk client-bedrock-runtime dependency
    status: pending
  - id: TASK-002
    content: Add optional trace.educator_explanation to types and decision schema
    status: pending
  - id: TASK-003
    content: Define ExplanationGenerator port and ExplanationInput type
    status: pending
  - id: TASK-004
    content: Implement TemplateExplanationGenerator fallback
    status: pending
  - id: TASK-005
    content: Build system prompt and PII-safe user prompt
    status: pending
  - id: TASK-006
    content: Implement guardrails truncate and PII echo and empty checks
    status: pending
  - id: TASK-007
    content: Implement BedrockExplanationGenerator with timeout and throttle handling
    status: pending
  - id: TASK-008
    content: Implement selectExplanationGenerator factory from env
    status: pending
  - id: TASK-009
    content: Integrate generator into sync engine and make evaluateState async
    status: pending
  - id: TASK-010
    content: Integrate generator into async Lambda engine with parity
    status: pending
  - id: TASK-011
    content: Update ingestion call sites to await evaluation
    status: pending
  - id: TASK-012
    content: Add new log-only error codes for degraded and guardrail
    status: pending
  - id: TASK-013
    content: Document env vars and Bedrock IAM least-privilege
    status: pending
  - id: TASK-014
    content: Contract tests EXPL-001 through EXPL-010
    status: pending
isProject: false
---

# AI Educator Explanations

**Spec**: `docs/specs/ai-educator-explanations.md`

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase.

### From spec § Concrete Values — Wire formats / model I/O

```
Bedrock call shape: ConverseCommand with { modelId, system: [{ text: <SYSTEM_PROMPT> }], messages: [{ role: "user", content: [{ text: <USER_PROMPT> }] }], inferenceConfig: { maxTokens, temperature } }.
Output extraction: response.output.message.content[0].text (trim, then guardrail post-process).
Disabled-mode value of trace.educator_explanation: null (the panel falls back to educator_summary / rationale).
```

### From spec § Concrete Values — Env vars

```
| Variable | Required | Default | Type | Description |
| BEDROCK_ENABLED | no | false | bool | Master toggle. false -> template generator only; Bedrock client never initialized. |
| BEDROCK_REGION | no | AWS_REGION then us-east-1 | string | Region for the Bedrock Runtime client. |
| BEDROCK_MODEL_ID | no | us.anthropic.claude-3-5-haiku-20241022-v1:0 | string | Model or inference-profile ID passed to ConverseCommand. |
| BEDROCK_MAX_TOKENS | no | 256 | number | inferenceConfig.maxTokens cap. |
| BEDROCK_TEMPERATURE | no | 0.2 | number | inferenceConfig.temperature (low -> consistent, grounded). |
| BEDROCK_TIMEOUT_MS | no | 4000 | number | Hard abort for the Converse call; on exceed -> template fallback. |
| EDUCATOR_EXPLANATION_MAX_CHARS | no | 480 | number | Post-process truncation limit (word-boundary). |
```

### From spec § Concrete Values — Constants / limits

```
- Explanation max length: EDUCATOR_EXPLANATION_MAX_CHARS (default 480 chars ~ 3-4 sentences).
- Request timeout: BEDROCK_TIMEOUT_MS (default 4000 ms).
- Max output tokens: BEDROCK_MAX_TOKENS (default 256).
- Retries: rely on the AWS SDK's default retry/backoff; a throttle that survives retries -> fallback (no custom retry loop).
```

### From spec § Error Codes (new)

```
| explanation_generation_degraded | log-only warning | Bedrock call failed, threw, was throttled, or exceeded BEDROCK_TIMEOUT_MS; engine fell back to the template educator_summary. Never returned to the caller. |
| explanation_guardrail_tripped | log-only warning | Post-processing detected a PII value or empty/invalid output and discarded the model result in favor of the template fallback. Never returned to the caller. |
```

### From spec § File Structure

```
src/decision/
├── explanations/
│   ├── generator.ts            # ExplanationGenerator port + ExplanationInput type
│   ├── bedrock-generator.ts    # BedrockExplanationGenerator (Converse API + timeout + throttle handling)
│   ├── template-generator.ts   # TemplateExplanationGenerator (DECISION_TYPE_TO_EDUCATOR_SUMMARY fallback)
│   ├── prompt.ts               # SYSTEM_PROMPT (guardrails/policies) + buildUserPrompt(input)
│   ├── guardrails.ts           # post-process: truncate, PII echo check, empty/invalid check
│   └── factory.ts              # selectExplanationGenerator(env) → Bedrock when BEDROCK_ENABLED, else Template
├── engine.ts                   # inject generator before building trace (sync path)
└── engine-async.ts             # inject generator before building trace (Lambda path)
```

### From spec § Notes — prompt/guardrail policy

```
(1) explain only what the provided signals support, (2) name the specific skill and whether the system's confidence/stability in that skill is rising or falling and why (using the deltas), (3) avoid grades, scores-as-grades, letter grades, or judgmental language about the student, (4) keep to <= 3 short sentences at a general-audience reading level, (5) never include names, IDs, or any PII, (6) if signals are insufficient, return the short template-style statement rather than speculate.
```

### From spec § Constraints — PII-safe prompt inputs (functional requirement)

```
Build the prompt from PII-safe inputs only: decision_type, decision_context.skill, trace.rationale, trace.matched_rule.evaluated_fields, and the canonical trace.state_snapshot (already PII-stripped per DEF-DEC-007). The learner reference must NOT be included in the prompt.
```

## Ground-Truth Notes (current code)

> Verified against the codebase to size integration precisely.

- `evaluateState()` is **synchronous** `(src/decision/engine.ts:99)`; it builds `trace.educator_summary` from `DECISION_TYPE_TO_EDUCATOR_SUMMARY` at `engine.ts:210` and persists once via `saveDecision` at `engine.ts:216`.
- `evaluateStateAsync()` already async `(src/decision/engine-async.ts:23)`; mirrors the same trace construction at `engine-async.ts:118-128` and persists via `port.saveDecision` at `engine-async.ts:132`.
- Sole sync call site: `src/ingestion/handler-core.ts:203` (`const decisionOutcome = evaluateState(evalRequest);`) — inside an **async** handler within a `try/catch`, so adding `await` is low-risk.
- Sole async call site: `src/ingestion/handler-core-async.ts:213` (already `await evaluateStateAsync(...)`).
- `Decision.trace` type `(src/shared/types.ts:443-458)` ends with `educator_summary: string;` — add the optional field after it.
- Shared helpers reused by the prompt: `extractCanonicalSnapshot`, `buildRationale` are exported from `engine.ts:65,31`.
- `@aws-sdk/client-bedrock-runtime` is **not** in `package.json` (new dependency, per spec Dependencies).

## Prerequisites

- [ ] PREREQ-001: Confirm Bedrock model access — `BEDROCK_MODEL_ID` (default `us.anthropic.claude-3-5-haiku-20241022-v1:0`) is enabled in `BEDROCK_REGION` for the target AWS account. **Live-path only**; all contract tests mock `ConverseCommand`, so this does not gate implementation or CI.
- [ ] PREREQ-002: Confirm the Lambda execution role can be granted `bedrock:InvokeModel` scoped to the model/inference-profile ARN (documented in `infra/` CDK — TASK-013). Pilot/local run `BEDROCK_ENABLED=false` and need nothing.

## Tasks

> Status tracking lives only in the YAML frontmatter `todos`.

### TASK-001: Add aws-sdk client-bedrock-runtime dependency
- **Files**: `package.json`
- **Action**: Modify
- **Details**: Add `@aws-sdk/client-bedrock-runtime` to `dependencies` (latest, aligns with existing `@aws-sdk/*` stack per spec Dependencies). Used only by `bedrock-generator.ts`; never imported when `BEDROCK_ENABLED=false` (lazy/dynamic import in the factory — see TASK-008). Do not add any other runtime dep (`AbortController` is native).
- **Depends on**: none
- **Verification**: `npm install` succeeds; `npm run build` clean; import resolves only within the explanations module.

### TASK-002: Add optional trace.educator_explanation to types and decision schema
- **Files**: `src/shared/types.ts`, `src/contracts/schemas/decision.json`
- **Action**: Modify
- **Details**: In `src/shared/types.ts` add to `Decision.trace` (after `educator_summary: string;` at line 457) an **optional** field: `educator_explanation?: string | null;` with a comment "AI narrative explanation (Bedrock); null when disabled/degraded — see ai-educator-explanations.md". In `src/contracts/schemas/decision.json`, add `educator_explanation` to the `trace` properties as `{ "type": ["string","null"] }` and **leave it out of `trace.required`** (backward-compatible — existing decisions/consumers unaffected). Do not touch `educator_summary` (stays deterministic + required).
- **Depends on**: none
- **Verification**: `npm run typecheck` clean; existing decision contract tests still pass (optional field, no breakage); schema validator accepts decisions with and without the field.

### TASK-003: Define ExplanationGenerator port and ExplanationInput type
- **Files**: `src/decision/explanations/generator.ts`
- **Action**: Create
- **Details**: Export `interface ExplanationGenerator { generate(input: ExplanationInput): Promise<string | null>; }` (async to support Bedrock; template impl resolves immediately). Define `ExplanationInput` carrying **PII-safe inputs only** per Spec Literal § Constraints: `{ decision_type: DecisionType; skill?: string; rationale: string; evaluated_fields: EvaluatedField[]; state_snapshot: Record<string, unknown>; }`. Reuse `DecisionType` and the evaluated-fields shape from `src/shared/types.ts` (do not redefine). The input MUST NOT include `learner_reference`.
- **Depends on**: none
- **Verification**: Type compiles; `ExplanationInput` exposes no `learner_reference`; both generators (TASK-004/007) implement the port.

### TASK-004: Implement TemplateExplanationGenerator fallback
- **Files**: `src/decision/explanations/template-generator.ts`
- **Action**: Create
- **Details**: `TemplateExplanationGenerator implements ExplanationGenerator`. Per spec EXPL-001 disabled-mode behavior, `generate()` returns the disabled-mode value. **Disabled-mode value of `trace.educator_explanation` is `null`** (Spec Literal § Wire formats). So the template generator returns `null` (the panel falls back to `educator_summary`/`rationale`). No Bedrock import. Pure/synchronous body wrapped in a resolved Promise.
- **Depends on**: TASK-003
- **Verification**: Returns `null`; constructs no Bedrock client; covered by EXPL-001.

### TASK-005: Build system prompt and PII-safe user prompt
- **Files**: `src/decision/explanations/prompt.ts`
- **Action**: Create
- **Details**: Export `SYSTEM_PROMPT` encoding the six guardrail policies verbatim-in-spirit (Spec Literal § Notes — prompt/guardrail policy): explain only supported signals; name the skill + whether confidence/stability is rising/falling and why (use deltas); no grades/letter-grades/judgmental language; <= 3 short sentences, general-audience reading level; never include names/IDs/PII; insufficient signals -> short template-style statement. Export `buildUserPrompt(input: ExplanationInput): string` assembling **only** PII-safe inputs (Spec Literal § Constraints): `decision_type`, `decision_context.skill`, `trace.rationale`, `trace.matched_rule.evaluated_fields`, canonical `trace.state_snapshot`. Never interpolate `learner_reference`.
- **Depends on**: TASK-003
- **Verification**: `buildUserPrompt` output contains no `learner_reference`; system prompt asserts confidence-not-grade framing; covered by EXPL-003, EXPL-009.

### TASK-006: Implement guardrails truncate and PII echo and empty checks
- **Files**: `src/decision/explanations/guardrails.ts`
- **Action**: Create
- **Details**: Export `postProcessExplanation(text: string, input: ExplanationInput, maxChars: number): { ok: true; value: string } | { ok: false; reason: 'empty' | 'pii_echo' }`. Steps: trim; if empty/whitespace -> `{ ok:false, reason:'empty' }`; PII-echo best-effort check — if the output contains any canonical PII-ish value present in the source state strings (best-effort per spec EXPL-008) -> `{ ok:false, reason:'pii_echo' }`; otherwise truncate to `maxChars` (default `EDUCATOR_EXPLANATION_MAX_CHARS` = 480) **at a word boundary** (no mid-word cut) and return `{ ok:true, value }`. Caller maps `empty`/`pii_echo` to `explanation_guardrail_tripped` + template fallback.
- **Depends on**: TASK-003
- **Verification**: Over-length truncates at word boundary (EXPL-007); PII echo discarded (EXPL-008); empty discarded.

### TASK-007: Implement BedrockExplanationGenerator with timeout and throttle handling
- **Files**: `src/decision/explanations/bedrock-generator.ts`
- **Action**: Create
- **Details**: `BedrockExplanationGenerator implements ExplanationGenerator` using `@aws-sdk/client-bedrock-runtime` `ConverseCommand` with the exact shape (Spec Literal § Wire formats): `{ modelId, system: [{ text: SYSTEM_PROMPT }], messages: [{ role: "user", content: [{ text: USER_PROMPT }] }], inferenceConfig: { maxTokens, temperature } }`. Construct the client with `BEDROCK_REGION`. Enforce a hard timeout via `AbortController` at `BEDROCK_TIMEOUT_MS` (default 4000). Extract `response.output.message.content[0].text`, then run `postProcessExplanation` (TASK-006). On any error/throttle (`ThrottlingException` instance check)/timeout/guardrail-trip -> return `null` and emit the appropriate **log-only** warning (`explanation_generation_degraded` for error/throttle/timeout; `explanation_guardrail_tripped` for guardrail). Rely on SDK default retry/backoff; no custom retry loop (Spec Literal § Constants). Never throw to the caller.
- **Depends on**: TASK-001, TASK-005, TASK-006, TASK-012
- **Verification**: Happy path returns grounded text (EXPL-002); error/timeout/throttle each return `null` + degraded warning (EXPL-004/005/006).

### TASK-008: Implement selectExplanationGenerator factory from env
- **Files**: `src/decision/explanations/factory.ts`
- **Action**: Create
- **Details**: Export `selectExplanationGenerator(env = process.env): ExplanationGenerator`. When `BEDROCK_ENABLED` is truthy, return a `BedrockExplanationGenerator` (use a **dynamic import** of `bedrock-generator.ts` / the AWS SDK so the client is never loaded when disabled — satisfies "Bedrock client never initialized", Spec Literal § Env vars). Otherwise return `TemplateExplanationGenerator`. Parse numeric/string env per the Spec Literal env table (defaults: model `us.anthropic.claude-3-5-haiku-20241022-v1:0`, region `AWS_REGION` then `us-east-1`, maxTokens 256, temperature 0.2, timeout 4000, maxChars 480).
- **Depends on**: TASK-004, TASK-007
- **Verification**: `BEDROCK_ENABLED=false` -> Template, no Bedrock import (EXPL-001); `BEDROCK_ENABLED=true` -> Bedrock generator.

### TASK-009: Integrate generator into sync engine and make evaluateState async
- **Files**: `src/decision/engine.ts`
- **Action**: Modify
- **Details**: Convert `evaluateState` to **async** (`export async function evaluateState(...): Promise<EvaluateDecisionOutcome>`). After Step 7 (rationale) and before constructing the Decision (Step 11, `engine.ts:194`), obtain a generator via `selectExplanationGenerator()` (default param injectable for tests) and call `const educatorExplanation = await generator.generate({ decision_type: evalResult.decision_type, skill: decisionContext['skill'] as string | undefined, rationale, evaluated_fields: evalResult.evaluated_fields ?? [], state_snapshot: stateSnapshot });`. Set `trace.educator_explanation: educatorExplanation` in the constructed Decision. **Single write preserved** — `saveDecision` still called exactly once at the end; generation is inline before persist (no second write). Keep `educator_summary` unchanged. Add an optional `generator?: ExplanationGenerator` param (default from factory) for DI in tests.
- **Depends on**: TASK-002, TASK-003, TASK-008
- **Verification**: Decision carries `educator_explanation`; exactly one `saveDecision`; `npm run typecheck` clean (callers updated in TASK-011); EXPL-002/004 pass.

### TASK-010: Integrate generator into async Lambda engine with parity
- **Files**: `src/decision/engine-async.ts`
- **Action**: Modify
- **Details**: Mirror TASK-009 in `evaluateStateAsync`: before building the Decision (`engine-async.ts:111`), `await generator.generate(...)` with the same `ExplanationInput`, set `trace.educator_explanation`, persist once via `port.saveDecision`. Accept an optional `generator?: ExplanationGenerator` (default `selectExplanationGenerator()`) for DI/parity tests. Behavior must equal the sync path (EXPL-010).
- **Depends on**: TASK-002, TASK-003, TASK-008
- **Verification**: Async path sets `educator_explanation` identically to sync; single `port.saveDecision`; EXPL-010 passes.

### TASK-011: Update ingestion call sites to await evaluation
- **Files**: `src/ingestion/handler-core.ts`
- **Action**: Modify
- **Details**: `evaluateState` is now async (TASK-009). Change `const decisionOutcome = evaluateState(evalRequest);` at `handler-core.ts:203` to `const decisionOutcome = await evaluateState(evalRequest);` (already inside an async handler + try/catch). `src/ingestion/handler-core-async.ts:213` already `await`s `evaluateStateAsync`, so no change there. Scan for any other `evaluateState(` callers (none found outside tests) and tests that call it synchronously — update those to `await` (TASK-014 owns test updates).
- **Depends on**: TASK-009
- **Verification**: `npm run typecheck` clean; ingestion flow still emits one decision; existing ingestion contract/integration tests pass.

### TASK-012: Add new log-only error codes for degraded and guardrail
- **Files**: `src/shared/error-codes.ts`
- **Action**: Modify
- **Details**: Add two **log-only** codes (Spec Literal § Error Codes): `explanation_generation_degraded` and `explanation_guardrail_tripped`. Mirror the existing `policy_dynamo_degraded` precedent (log-only; never returned to the API caller). These are used by `bedrock-generator.ts` warnings only; no caller-facing 4xx/5xx, no decision-response change.
- **Depends on**: none
- **Verification**: Codes exported; used by TASK-007; no route returns them.

### TASK-013: Document env vars and Bedrock IAM least-privilege
- **Files**: `.env.example`, `infra/` CDK docs (or `docs/specs/aws-deployment.md` if infra doc lives there)
- **Action**: Modify
- **Details**: Document the seven env vars verbatim from the Spec Literal § Env vars table (all optional; `BEDROCK_ENABLED` default `false`). Add an IAM note: the Lambda execution role and any host with `BEDROCK_ENABLED=true` need `bedrock:InvokeModel` scoped to the configured model/inference-profile ARN; local dev uses developer AWS credentials; pilot/SQLite host runs disabled and needs nothing.
- **Depends on**: none
- **Verification**: `.env.example` lists all seven vars with defaults; IAM least-privilege note present.

### TASK-014: Contract tests EXPL-001 through EXPL-010
- **Files**: `tests/contracts/ai-educator-explanations.test.ts`
- **Action**: Create
- **Details**: Implement all ten contract tests per spec § Contract Tests with a **mocked `ConverseCommand`** (no live Bedrock). Generator + guardrail tests (EXPL-001/003/004/005/006/007/008/009) exercise the generators/prompt/guardrails directly; EXPL-002/010 exercise the full evaluate->persist flow through `engine.ts`/`engine-async.ts` with the generator injected (DI param). Update any existing decision/ingestion tests that called `evaluateState` synchronously to `await` (TASK-011 fallout).
- **Depends on**: TASK-004, TASK-005, TASK-006, TASK-007, TASK-008, TASK-009, TASK-010
- **Verification**: `npm test` green; all EXPL-001..010 pass; no test calls live Bedrock.

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `src/decision/explanations/generator.ts` | TASK-003 | ExplanationGenerator port + ExplanationInput |
| `src/decision/explanations/template-generator.ts` | TASK-004 | Disabled/fallback generator (returns null) |
| `src/decision/explanations/prompt.ts` | TASK-005 | SYSTEM_PROMPT + buildUserPrompt (PII-safe) |
| `src/decision/explanations/guardrails.ts` | TASK-006 | Truncate + PII-echo + empty checks |
| `src/decision/explanations/bedrock-generator.ts` | TASK-007 | Bedrock Converse generator + timeout/throttle |
| `src/decision/explanations/factory.ts` | TASK-008 | selectExplanationGenerator(env) |
| `tests/contracts/ai-educator-explanations.test.ts` | TASK-014 | EXPL-001..010 |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `package.json` | TASK-001 | Add `@aws-sdk/client-bedrock-runtime` |
| `src/shared/types.ts` | TASK-002 | Optional `trace.educator_explanation` |
| `src/contracts/schemas/decision.json` | TASK-002 | Optional `educator_explanation` (not required) |
| `src/decision/engine.ts` | TASK-009 | Async + inject generator before trace |
| `src/decision/engine-async.ts` | TASK-010 | Inject generator (parity) |
| `src/ingestion/handler-core.ts` | TASK-011 | `await evaluateState(...)` |
| `src/shared/error-codes.ts` | TASK-012 | Two log-only codes |
| `.env.example` + infra docs | TASK-013 | Env vars + IAM note |

## Requirements Traceability

| Requirement (spec anchor) | Source | Task |
|---------------------------|--------|------|
| Add optional `trace.educator_explanation: string\|null` to type + schema (backward-compatible) | spec § Functional | TASK-002 |
| Define `ExplanationGenerator` port consumed by both decision paths | spec § Functional | TASK-003, TASK-009, TASK-010 |
| Implement `BedrockExplanationGenerator` (Converse API) | spec § Functional | TASK-007 |
| Implement `TemplateExplanationGenerator` (fallback identical to today) | spec § Functional | TASK-004 |
| Master toggle `BEDROCK_ENABLED` (default false); no client when off | spec § Functional | TASK-008 |
| Build prompt from PII-safe inputs only; no learner reference | spec § Functional | TASK-003, TASK-005 |
| Apply guardrails (length, no PII, framing, truncate at word boundary) | spec § Functional | TASK-005, TASK-006 |
| Fail-safe: error/throttle/timeout -> template fallback + log-only warning; never delay/fail decision | spec § Functional | TASK-007 |
| Exactly one persisted decision record (no second write) | spec § Functional | TASK-009, TASK-010 |
| AC: disabled -> explanation == disabled value (null); no Bedrock client | spec § Acceptance | TASK-004, TASK-008, TASK-014 |
| AC: enabled + reinforce/text_evidence declining -> non-empty, references skill+confidence, excludes learner ref | spec § Acceptance | TASK-005, TASK-007, TASK-014 |
| AC: error or > timeout -> template fallback, persisted once, degraded warning | spec § Acceptance | TASK-007, TASK-009, TASK-014 |
| AC: over-length -> truncated at word boundary | spec § Acceptance | TASK-006, TASK-014 |
| AC: output contains no canonical PII values (best-effort) | spec § Acceptance | TASK-006, TASK-014 |
| Local/pilot host runs disabled by default | spec § Constraints | TASK-008, TASK-013 |
| Bedrock IAM least-privilege (`bedrock:InvokeModel`) | spec § Production Correctness | TASK-013 |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| EXPL-001 | unit | Disabled mode byte-identical; no Bedrock client constructed | TASK-014 |
| EXPL-002 | integration | Happy path grounded explanation (reinforce/text_evidence/declining) | TASK-014 |
| EXPL-003 | unit | Prompt contains no PII / no learner_reference | TASK-014 |
| EXPL-004 | unit | Bedrock error -> template fallback, single write, degraded warning | TASK-014 |
| EXPL-005 | unit | Timeout (> BEDROCK_TIMEOUT_MS) -> fallback | TASK-014 |
| EXPL-006 | unit | ThrottlingException -> fallback | TASK-014 |
| EXPL-007 | unit | Over-length output truncated at word boundary | TASK-014 |
| EXPL-008 | unit | Guardrail trips on PII echo -> discarded + guardrail warning | TASK-014 |
| EXPL-009 | unit | Confidence-not-grade framing asserted via prompt contract | TASK-014 |
| EXPL-010 | integration | Async (Lambda) path parity with sync | TASK-014 |

## Deviations from Spec

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| § File Structure ("engine.ts — sync path") | Inject generator into the existing sync `engine.ts` | Converts `evaluateState` to **async** (`Promise<EvaluateDecisionOutcome>`) so the async generator can be awaited inline; updates the one ingestion call site to `await` | Implementation detail — spec silent on the function signature; required because `generate()` is async. Flagged as a Risk. |
| § Concrete Values (disabled-mode value) | `educator_explanation` = `null` when disabled | Template generator returns `null` | Reverted — plan matches spec (no deviation). |
| § Functional (schema field) | Optional, backward-compatible | Added to `trace` properties, omitted from `required` | None — literal-compatible. |
| § Dependencies | New `@aws-sdk/client-bedrock-runtime` | Added; dynamically imported only when enabled | None — literal-compatible (dynamic import strengthens "client never initialized"). |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `evaluateState` sync->async cascades to callers | Medium | Only one non-test caller (`handler-core.ts:203`) already in an async function; add `await`; sweep tests in TASK-014 |
| Bedrock latency added to decision path (inline) | Medium | Hard `AbortController` timeout `BEDROCK_TIMEOUT_MS` (4000); on exceed -> template fallback; decision never blocked beyond timeout |
| AWS SDK loaded when disabled (bundle/cold start) | Low | Dynamic import in factory; `BEDROCK_ENABLED=false` never imports the client |
| PII echo in model output | High | Guardrail best-effort PII-echo check discards output -> template fallback + `explanation_guardrail_tripped` |
| Double-write regression | High | Generation inline before the single `saveDecision`; EXPL-004 asserts exactly one write |
| Model/region not enabled in AWS | Medium | Bedrock error -> template fallback (degraded warning); cannot break decisions; verified in PREREQ-001 |

## Verification Checklist

- [ ] All tasks completed
- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] `BEDROCK_ENABLED=false` output byte-identical to pre-feature (EXPL-001)
- [ ] Exactly one decision write whether explanation succeeds or falls back
- [ ] No `learner_reference`/PII in prompt or output; no internal detail returned to callers
- [ ] No test invokes live Bedrock

## Implementation Order

```
TASK-001 (dep) ; TASK-002 (types/schema) ; TASK-012 (error codes)
TASK-003 (port)
  ├─ TASK-004 (template) ┐
  ├─ TASK-005 (prompt)   │
  ├─ TASK-006 (guardrails)│
  └─ TASK-007 (bedrock) ──┴─ TASK-008 (factory)
TASK-008 → TASK-009 (sync engine) → TASK-011 (call sites)
TASK-008 → TASK-010 (async engine)
TASK-013 (docs, anytime)
TASK-014 (tests last)
```

## Next Steps

After generating the plan:
- Review task ordering/dependencies (note the sync->async deviation).
- Confirm PREREQ-001/002 (Bedrock model access + IAM) — live-path only; not required for CI.
- Run `/implement-spec .cursor/plans/ai-educator-explanations.plan.md`.
