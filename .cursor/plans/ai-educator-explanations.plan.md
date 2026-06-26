---
name: AI Educator Explanations
overview: Add an optional AI SDK-generated trace.educator_explanation to every decision via an ExplanationGenerator port, fail-safe to null (panel uses educator_summary), feature-flagged off by default, with one persisted decision write per evaluation.
todos:
  - id: TASK-001
    content: Scaffold services/explanation package and add AI SDK deps
    status: completed
  - id: TASK-002
    content: Add optional trace.educator_explanation to types and decision schema
    status: completed
  - id: TASK-003
    content: Define ExplanationGenerator port and ExplanationInput type
    status: completed
  - id: TASK-004
    content: Implement TemplateExplanationGenerator fallback
    status: completed
  - id: TASK-005
    content: Build system prompt and PII-safe user prompt
    status: completed
  - id: TASK-006
    content: Implement guardrails truncate and PII echo and empty checks
    status: completed
  - id: TASK-007
    content: Implement AiSdkExplanationGenerator with providers and error handling
    status: completed
  - id: TASK-008
    content: Implement selectExplanationGenerator factory from env
    status: completed
  - id: TASK-009
    content: Integrate generator into sync engine and make evaluateState async
    status: completed
  - id: TASK-010
    content: Integrate generator into async Lambda engine with parity
    status: completed
  - id: TASK-011
    content: Update ingestion call sites to await evaluation
    status: completed
  - id: TASK-012
    content: Add new log-only error codes for degraded and guardrail
    status: completed
  - id: TASK-013
    content: Document env vars and Bedrock IAM least-privilege
    status: completed
  - id: TASK-014
    content: Contract tests EXPL-001 through EXPL-010
    status: completed
isProject: false
---

# AI Educator Explanations

**Spec**: `docs/specs/ai-educator-explanations.md`

## Spec Literals

> Verbatim copies of normative blocks from the spec. TASK details MUST quote from this section rather than paraphrase.

### From spec § Concrete Values — Wire formats / model I/O

```
AI SDK call shape (amazon-bedrock path): generateText({ model: bedrock(AI_MODEL), instructions: SYSTEM_PROMPT, prompt: buildUserPrompt(input), maxOutputTokens, temperature, timeout, maxRetries }).
AI SDK call shape (gateway path): generateText({ model: AI_MODEL (string, e.g. 'anthropic/claude-haiku-4.5'), instructions, prompt, maxOutputTokens, temperature, timeout }) with AI_GATEWAY_API_KEY set.
Output extraction: result.text (trim, then guardrail post-process).
Disabled-mode value of trace.educator_explanation: null (the panel falls back to educator_summary / rationale).
Use maxOutputTokens (not deprecated maxTokens). Use instructions + prompt (not deprecated generateObject).
```

### From spec § Concrete Values — Env vars

```
| Variable | Required | Default | Type | Description |
| AI_EXPLANATIONS_ENABLED | no | false | bool | Master toggle. false -> template generator only; LLM provider never initialized. |
| AI_PROVIDER | no | amazon-bedrock | string | Provider backend: amazon-bedrock (Lambda/production) or gateway (local dev). |
| AI_MODEL | when enabled | us.anthropic.claude-3-5-haiku-20241022-v1:0 (bedrock) / anthropic/claude-haiku-4.5 (gateway) | string | Model ID passed to the provider. |
| AI_REGION | no | AWS_REGION then us-east-1 | string | AWS region for @ai-sdk/amazon-bedrock (ignored when AI_PROVIDER=gateway). |
| AI_MAX_OUTPUT_TOKENS | no | 256 | number | generateText maxOutputTokens cap. |
| AI_TEMPERATURE | no | 0.2 | number | generateText temperature (low -> consistent, grounded). |
| AI_TIMEOUT_MS | no | 4000 | number | generateText timeout; on exceed -> null fallback. |
| AI_MAX_RETRIES | no | 2 | number | generateText maxRetries; exhausted retries -> null fallback. |
| AI_GATEWAY_API_KEY | when AI_PROVIDER=gateway | — | string | Vercel AI Gateway API key. Not used in Lambda production path. |
| EDUCATOR_EXPLANATION_MAX_CHARS | no | 480 | number | Post-process truncation limit (word-boundary). |
```

### From spec § Concrete Values — Constants / limits

```
- Explanation max length: EDUCATOR_EXPLANATION_MAX_CHARS (default 480 chars ~ 3-4 sentences).
- Request timeout: AI_TIMEOUT_MS (default 4000 ms) via AI SDK timeout.
- Max output tokens: AI_MAX_OUTPUT_TOKENS (default 256) via AI SDK maxOutputTokens.
- Retries: AI SDK built-in retry via maxRetries; rate limits (429) or RetryError -> null fallback (no custom retry loop beyond SDK).
```

### From spec § Error Codes (new)

```
| explanation_generation_degraded | log-only warning | generateText failed, threw, was rate-limited (429), retries exhausted (RetryError), or exceeded AI_TIMEOUT_MS; engine fell back to null (panel uses educator_summary). Never returned to the caller. |
| explanation_guardrail_tripped | log-only warning | Post-processing detected a PII value or empty/invalid output and discarded the model result in favor of null fallback. Never returned to the caller. |
```

### From spec § File Structure

```
services/explanation/                     # @8p3p/explanation — AI layer (sibling package, like dashboard/)
├── package.json                          # ai, @ai-sdk/amazon-bedrock live here only
├── tsconfig.json
├── Dockerfile                            # optional; not used in P0 deploy — future standalone image
└── src/
    ├── index.ts                          # public exports (factory, port, types, env helpers)
    ├── env-config.ts                     # parseExplanationEnv(env) + isExplanationsEnabled(env)
    ├── generator.ts                      # ExplanationGenerator port + ExplanationInput type
    ├── ai-sdk-generator.ts               # AiSdkExplanationGenerator (generateText + provider + timeout + error handling)
    ├── template-generator.ts             # TemplateExplanationGenerator (returns null — panel uses educator_summary)
    ├── prompt.ts                         # SYSTEM_PROMPT (guardrails/policies) + buildUserPrompt(input)
    ├── guardrails.ts                     # post-process: truncate, PII echo check, empty/invalid check
    ├── providers/
    │   ├── amazon-bedrock.ts             # createBedrockModel(env) — IAM credential chain
    │   └── gateway.ts                    # resolveGatewayModel(env) for AI_PROVIDER=gateway
    └── factory.ts                        # selectExplanationGenerator(env) → lazy AiSdk when enabled, else Template

src/decision/
├── explanation-client.ts                 # thin re-export from @8p3p/explanation (engine import surface)
├── engine.ts                             # async evaluateState(..., generator?) — inject before trace build
└── engine-async.ts                       # evaluateStateAsync(..., generator?) — Lambda parity
```

### From spec § Notes — prompt/guardrail policy

```
(1) explain only what the provided signals support, (2) name the specific skill and whether the system's confidence/stability in that skill is rising or falling and why (using the deltas), (3) avoid grades, scores-as-grades, letter grades, or judgmental language about the student, (4) keep to <= 3 short sentences at a general-audience reading level, (5) never include names, IDs, or any PII, (6) if signals are insufficient, return the short template-style statement rather than speculate.
```

### From spec § Constraints — PII-safe prompt inputs (functional requirement)

```
Build the prompt from PII-safe inputs only: decision_type, decision_context.skill, trace.rationale, trace.matched_rule.evaluated_fields, and the canonical trace.state_snapshot (already PII-stripped per DEF-DEC-007). The learner reference must NOT be included in the prompt.
```

## Ground-Truth Notes (post-implementation)

> Verified against merged code on branch (2026-06-25).

- `evaluateState()` is **async** `(src/decision/engine.ts:103)` with optional `generator?: ExplanationGenerator` DI; sets `trace.educator_explanation` before the single `saveDecision`.
- `evaluateStateAsync()` mirrors the same path `(src/decision/engine-async.ts:27)` with identical generator injection.
- Sole sync call site: `src/ingestion/handler-core.ts:203` — `await evaluateState(evalRequest)`.
- Sole async call site: `src/ingestion/handler-core-async.ts:213` — `await evaluateStateAsync(...)`.
- `Decision.trace.educator_explanation?: string | null` at `src/shared/types.ts:459`; optional in `decision.json` schema (not in `trace.required`).
- `@8p3p/explanation` lives at `services/explanation/`; env parsing in `env-config.ts`; factory uses `LazyAiSdkExplanationGenerator` for deferred AI SDK load when enabled.
- Log-only codes in `src/shared/error-codes.ts`: `EXPLANATION_GENERATION_DEGRADED`, `EXPLANATION_GUARDRAIL_TRIPPED`.
- Env vars documented in `.env.example` and `docs/specs/aws-deployment.md` § AI Educator Explanations.
- Contract tests: `tests/contracts/ai-educator-explanations.test.ts` (EXPL-001..010).
- Dashboard Panels 2 & 3 consume `trace.educator_explanation` via `dashboard/lib/panel-helpers.ts` `educatorBodyCopy()`; it falls back to `educator_summary`, then `rationale`. The helper is used by `dashboard/components/panels/WhyAreTheyStuck.tsx` and `dashboard/components/panels/WhatToDo.tsx`.

## Package Architecture (logical separation, in-process P0 deploy)

> **Decision (2026-06-25):** Move all AI SDK code into `services/explanation/` (`@8p3p/explanation`). The control layer consumes it **in-process** via the `ExplanationGenerator` port through `src/decision/explanation-client.ts`. **Do not** deploy a separate HTTP service for P0 — inline single-write and fail-safe null fallback stay as spec'd. The sibling package + optional `Dockerfile` prepare for a future HTTP adapter without changing engine integration.

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **AI package** | `services/explanation/` | Port, generators, prompts, guardrails, providers, factory; owns `ai` deps |
| **Core adapter** | `src/decision/explanation-client.ts` | Re-exports `@8p3p/explanation` so engines import from a stable local path |
| **Decision engine** | `src/decision/engine.ts`, `engine-async.ts` | Build `ExplanationInput`, `await generator.generate(...)`, set `trace.educator_explanation` |
| **Shared contract** | `src/shared/types.ts` | `Decision.trace.educator_explanation`; `DecisionType` / `EvaluatedField` shapes (engine side) |

**Type boundary:** `ExplanationInput` is defined in the AI package. Its `decision_type` union and `evaluated_fields` shape **must align** with `src/shared/types.ts` (same literal members). EXPL-003 guards PII; a type-alignment assertion in TASK-014 is optional but recommended.

**Root wiring:** Root `package.json` adds `"@8p3p/explanation": "file:services/explanation"`. Root `npm ci` installs AI deps (hoisted); dynamic import in the factory still prevents runtime load when `AI_EXPLANATIONS_ENABLED=false`. Root `Dockerfile` unchanged for P0 — same single image; optional `services/explanation/Dockerfile` is a build artifact for a future standalone deploy.

**Future extraction (out of P0 scope):** Add `HttpExplanationGenerator` in the AI package + `AI_EXPLANATION_TRANSPORT=http` env; engine keeps the same port injection — no engine rewrite.

## Evidence / Tooling Provenance

- **AI SDK skill (primary doc source)**: `.agents/skills/ai-sdk/SKILL.md` + references (`common-errors.md`, `ai-gateway.md`). Use bundled `node_modules/ai/docs/` after install; verify `generateText` API (`maxOutputTokens`, `timeout`, `instructions`, `APICallError`, `RetryError`) — never rely on training-data memory.
- **External doc refs**: [Generating Text](https://ai-sdk.dev/docs/ai-sdk-core/generating-text), [Settings](https://ai-sdk.dev/docs/ai-sdk-core/settings), [Amazon Bedrock Provider](https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock), [AI Gateway](https://ai-sdk.dev/docs/ai-sdk-core/ai-gateway).
- **MCP to re-check before implementation if IAM details are touched**: AWS Documentation MCP (`user-awslabs.aws-documentation-mcp-server`) for `bedrock:InvokeModel` IAM confirmation; AWS IaC MCP (`user-awslabs.aws-iac-mcp-server`) if TASK-013 modifies CDK/CloudFormation in `infra/`.
- **Relevant agent skills for execution**: use `ai-sdk` skill during implementation; use `test-driven-development` before EXPL contract coverage; use `systematic-debugging` for failing tests or `generateText` mocking issues.
- **Not required for CI**: no live Bedrock/Gateway call or AWS account access required for tests; EXPL-001..010 mock `generateText`; PREREQ-001/002 are live-path enablement checks only.

## Prerequisites

- [ ] PREREQ-001: Confirm Bedrock model access — `AI_MODEL` (default `us.anthropic.claude-3-5-haiku-20241022-v1:0`) is enabled in `AI_REGION` for the target AWS account when `AI_PROVIDER=amazon-bedrock`. **Live-path only**; all contract tests mock `generateText`, so this does not gate implementation or CI.
- [ ] PREREQ-002: Confirm the Lambda execution role can be granted `bedrock:InvokeModel` scoped to the model/inference-profile ARN (documented in `infra/` CDK — TASK-013). Pilot/local run `AI_EXPLANATIONS_ENABLED=false` and need nothing.
- [ ] PREREQ-003 (optional, local dev): For `AI_PROVIDER=gateway`, obtain `AI_GATEWAY_API_KEY` and fetch current model IDs via `curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '[.data[] | select(.id | startswith("anthropic/")) | .id] | reverse | .[]'`.

## Tasks

> Status tracking lives only in the YAML frontmatter `todos`.

### TASK-001: Scaffold services/explanation package and add AI SDK dependencies
- **Files**: `services/explanation/package.json`, `services/explanation/tsconfig.json`, `services/explanation/src/index.ts` (stub), `services/explanation/Dockerfile` (optional scaffold), `package.json` (root)
- **Action**: Create + Modify
- **Details**: Create sibling package **`@8p3p/explanation`** under `services/explanation/` (same monorepo pattern as `dashboard/`). In **`services/explanation/package.json`**: set `"name": "@8p3p/explanation"`, `"type": "module"`, `"main"` / `"exports"` pointing to compiled `dist/index.js`, and add **`ai`**, **`@ai-sdk/amazon-bedrock`**, and **`@aws-sdk/credential-providers`** only if not already transitive (for `fromNodeProviderChain()`). Add **`services/explanation/tsconfig.json`** (`outDir: dist`, `rootDir: src`, `module: NodeNext`). Stub **`src/index.ts`** (re-export surface filled in TASK-008). Add optional **`services/explanation/Dockerfile`** (Node 22 slim, `npm ci`, `npm run build`, `CMD node dist/index.js` placeholder — not wired to prod deploy in P0). In **root `package.json`**: add `"@8p3p/explanation": "file:services/explanation"` to `dependencies`; add script `"build:explanation": "cd services/explanation && npm ci --quiet && npm run build"`; extend root `"build"` to run `build:explanation` before `tsc`. Do **not** add `ai` or `@ai-sdk/amazon-bedrock` to root `dependencies` directly. Do **not** add `@aws-sdk/client-bedrock-runtime`. AI SDK is used only inside `@8p3p/explanation`; never loaded at runtime when `AI_EXPLANATIONS_ENABLED=false` (dynamic import in factory — TASK-008).
- **Depends on**: none
- **Verification**: `npm install` at repo root succeeds; `npm run build` compiles both packages; root `package.json` has no direct `ai` dependency; `@8p3p/explanation` resolves from `services/explanation`.

### TASK-002: Add optional trace.educator_explanation to types and decision schema
- **Files**: `src/shared/types.ts`, `src/contracts/schemas/decision.json`
- **Action**: Modify
- **Details**: In `src/shared/types.ts` add to `Decision.trace` (after `educator_summary: string;` at line 457) an **optional** field: `educator_explanation?: string | null;` with a comment "AI narrative explanation (AI SDK); null when disabled/degraded — see ai-educator-explanations.md". In `src/contracts/schemas/decision.json`, add `educator_explanation` to the `trace` properties as `{ "type": ["string","null"] }` and **leave it out of `trace.required`** (backward-compatible — existing decisions/consumers unaffected). Do not touch `educator_summary` (stays deterministic + required).
- **Depends on**: none
- **Verification**: `npm run typecheck` clean; existing decision contract tests still pass (optional field, no breakage); schema validator accepts decisions with and without the field.

### TASK-003: Define ExplanationGenerator port and ExplanationInput type
- **Files**: `services/explanation/src/generator.ts`, `src/decision/explanation-client.ts`
- **Action**: Create
- **Details**: In **`services/explanation/src/generator.ts`**, export `interface ExplanationGenerator { generate(input: ExplanationInput): Promise<string | null>; }` (async to support `generateText`; template impl resolves immediately). Define `ExplanationInput` carrying **PII-safe inputs only** per Spec Literal § Constraints: `{ decision_type: DecisionType; skill?: string; rationale: string; evaluated_fields: EvaluatedField[]; state_snapshot: Record<string, unknown>; }`. Define `DecisionType` and `EvaluatedField` in the AI package with the **same members/shapes as `src/shared/types.ts`** (package boundary — do not import from core `src/`; keep aligned manually; optional sync test in TASK-014). The input MUST NOT include `learner_reference`. Create **`src/decision/explanation-client.ts`** as a thin re-export: `export { selectExplanationGenerator, type ExplanationGenerator, type ExplanationInput } from '@8p3p/explanation'` (factory export added in TASK-008; stub re-export types only until then).
- **Depends on**: TASK-001
- **Verification**: Type compiles in both packages; `ExplanationInput` exposes no `learner_reference`; both generators (TASK-004/007) implement the port; engines can import from `./explanation-client.js`.

### TASK-004: Implement TemplateExplanationGenerator fallback
- **Files**: `services/explanation/src/template-generator.ts`
- **Action**: Create
- **Details**: `TemplateExplanationGenerator implements ExplanationGenerator`. Per spec EXPL-001 disabled-mode behavior, `generate()` returns the disabled-mode value. **Disabled-mode value of `trace.educator_explanation` is `null`** (Spec Literal § Wire formats). So the template generator returns `null` (the panel falls back to `educator_summary`/`rationale`). No AI SDK import. Pure/synchronous body wrapped in a resolved Promise.
- **Depends on**: TASK-003
- **Verification**: Returns `null`; constructs no LLM provider; covered by EXPL-001.

### TASK-005: Build system prompt and PII-safe user prompt
- **Files**: `services/explanation/src/prompt.ts`
- **Action**: Create
- **Details**: Export `SYSTEM_PROMPT` encoding the six guardrail policies verbatim-in-spirit (Spec Literal § Notes — prompt/guardrail policy): explain only supported signals; name the skill + whether confidence/stability is rising/falling and why (use deltas); no grades/letter-grades/judgmental language; <= 3 short sentences, general-audience reading level; never include names/IDs/PII; insufficient signals -> short template-style statement. Export `buildUserPrompt(input: ExplanationInput): string` assembling **only** PII-safe inputs (Spec Literal § Constraints): `decision_type`, `decision_context.skill`, `trace.rationale`, `trace.matched_rule.evaluated_fields`, canonical `trace.state_snapshot`. Never interpolate `learner_reference`. `SYSTEM_PROMPT` is passed to `generateText` as `instructions` (Spec Literal § Wire formats).
- **Depends on**: TASK-003
- **Verification**: `buildUserPrompt` output contains no `learner_reference`; system prompt asserts confidence-not-grade framing; covered by EXPL-003, EXPL-009.

### TASK-006: Implement guardrails truncate and PII echo and empty checks
- **Files**: `services/explanation/src/guardrails.ts`
- **Action**: Create
- **Details**: Export `postProcessExplanation(text: string, input: ExplanationInput, maxChars: number): { ok: true; value: string } | { ok: false; reason: 'empty' | 'pii_echo' }`. Steps: trim; if empty/whitespace -> `{ ok:false, reason:'empty' }`; PII-echo best-effort check — if the output contains any canonical PII-ish value present in the source state strings (best-effort per spec EXPL-008) -> `{ ok:false, reason:'pii_echo' }`; otherwise truncate to `maxChars` (default `EDUCATOR_EXPLANATION_MAX_CHARS` = 480) **at a word boundary** (no mid-word cut) and return `{ ok:true, value }`. Caller maps `empty`/`pii_echo` to `explanation_guardrail_tripped` + null fallback.
- **Depends on**: TASK-003
- **Verification**: Over-length truncates at word boundary (EXPL-007); PII echo discarded (EXPL-008); empty discarded.

### TASK-007: Implement AiSdkExplanationGenerator with providers and error handling
- **Files**: `services/explanation/src/ai-sdk-generator.ts`, `services/explanation/src/providers/amazon-bedrock.ts`, `services/explanation/src/providers/gateway.ts`
- **Action**: Create
- **Details**: `AiSdkExplanationGenerator implements ExplanationGenerator` using AI SDK **`generateText`** with the exact shape (Spec Literal § Wire formats). **`providers/amazon-bedrock.ts`**: export `createBedrockModel(env)` using `createAmazonBedrock({ region: AI_REGION, credentialProvider: fromNodeProviderChain() })` and return `bedrock(AI_MODEL)`. **`providers/gateway.ts`**: export `resolveGatewayModel(env)` returning the string model ID for `AI_PROVIDER=gateway` (requires `AI_GATEWAY_API_KEY`). Call:
  ```typescript
  const { text } = await generateText({
    model: resolvedModel,
    instructions: SYSTEM_PROMPT,
    prompt: buildUserPrompt(input),
    maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
    temperature: AI_TEMPERATURE,
    timeout: AI_TIMEOUT_MS,
    maxRetries: AI_MAX_RETRIES,
  });
  ```
  Extract `text`, then run `postProcessExplanation` (TASK-006). On any error: use `APICallError.isInstance(error)` (429 -> degraded), `RetryError` (exhausted retries -> degraded), timeout/abort -> degraded; guardrail-trip -> `explanation_guardrail_tripped`. Log warning codes as **string literals** matching `src/shared/error-codes.ts` (TASK-012) — do not import from core into `@8p3p/explanation` (keeps package boundary clean). All failure paths return `null`. Never throw to the caller. Do **not** use deprecated `maxTokens`, `generateObject`, or raw `ConverseCommand`.
- **Depends on**: TASK-001, TASK-005, TASK-006, TASK-012
- **Verification**: Happy path returns grounded text (EXPL-002); APICallError/timeout/429 each return `null` + degraded warning (EXPL-004/005/006).

### TASK-008: Implement selectExplanationGenerator factory from env
- **Files**: `services/explanation/src/factory.ts`, `services/explanation/src/index.ts`, `src/decision/explanation-client.ts`
- **Action**: Create + Modify
- **Details**: In **`services/explanation/src/factory.ts`**, export `selectExplanationGenerator(env = process.env): ExplanationGenerator`. When `AI_EXPLANATIONS_ENABLED` is truthy, return an `AiSdkExplanationGenerator` (use a **dynamic import** of `./ai-sdk-generator.js` / provider modules / `ai` package so nothing is loaded when disabled — satisfies "LLM provider never initialized", Spec Literal § Env vars). Otherwise return `TemplateExplanationGenerator`. Parse numeric/string env per the Spec Literal env table (defaults: provider `amazon-bedrock`, model `us.anthropic.claude-3-5-haiku-20241022-v1:0`, region `AWS_REGION` then `us-east-1`, maxOutputTokens 256, temperature 0.2, timeout 4000, maxRetries 2, maxChars 480). Export factory + types from **`services/explanation/src/index.ts`**. Update **`src/decision/explanation-client.ts`** to re-export the factory.
- **Depends on**: TASK-004, TASK-007
- **Verification**: `AI_EXPLANATIONS_ENABLED=false` -> Template, no AI SDK import (EXPL-001); `AI_EXPLANATIONS_ENABLED=true` -> AiSdk generator; `import { selectExplanationGenerator } from './explanation-client.js'` works from `engine.ts`.

### TASK-009: Integrate generator into sync engine and make evaluateState async
- **Files**: `src/decision/engine.ts`
- **Action**: Modify
- **Details**: Convert `evaluateState` to **async** (`export async function evaluateState(...): Promise<EvaluateDecisionOutcome>`). Import `selectExplanationGenerator` and `ExplanationGenerator` from **`./explanation-client.js`** (not from `@8p3p/explanation` directly). After Step 7 (rationale) and before constructing the Decision (Step 11, `engine.ts:194`), obtain a generator via `selectExplanationGenerator()` (default param injectable for tests) and call `const educatorExplanation = await generator.generate({ decision_type: evalResult.decision_type, skill: decisionContext['skill'] as string | undefined, rationale, evaluated_fields: evalResult.evaluated_fields ?? [], state_snapshot: stateSnapshot });`. Set `trace.educator_explanation: educatorExplanation` in the constructed Decision. **Single write preserved** — `saveDecision` still called exactly once at the end; generation is inline before persist (no second write). Keep `educator_summary` unchanged. Add an optional `generator?: ExplanationGenerator` param (default from factory) for DI in tests.
- **Depends on**: TASK-002, TASK-003, TASK-008
- **Verification**: Decision carries `educator_explanation`; exactly one `saveDecision`; `npm run typecheck` clean (callers updated in TASK-011); EXPL-002/004 pass.

### TASK-010: Integrate generator into async Lambda engine with parity
- **Files**: `src/decision/engine-async.ts`
- **Action**: Modify
- **Details**: Mirror TASK-009 in `evaluateStateAsync`: import from **`./explanation-client.js`**. Before building the Decision (`engine-async.ts:111`), `await generator.generate(...)` with the same `ExplanationInput`, set `trace.educator_explanation`, persist once via `port.saveDecision`. Accept an optional `generator?: ExplanationGenerator` (default `selectExplanationGenerator()`) for DI/parity tests. Behavior must equal the sync path (EXPL-010).
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
- **Details**: Add two **log-only** codes (Spec Literal § Error Codes): `explanation_generation_degraded` and `explanation_guardrail_tripped`. Mirror the existing `policy_dynamo_degraded` precedent (log-only; never returned to the API caller). These are used by `services/explanation/src/ai-sdk-generator.ts` as **string literals** (canonical registry lives here; AI package does not import core). No caller-facing 4xx/5xx, no decision-response change.
- **Depends on**: none
- **Verification**: Codes exported; used by TASK-007; no route returns them.

### TASK-013: Document env vars and Bedrock IAM least-privilege
- **Files**: `.env.example`, `infra/` CDK docs (or `docs/specs/aws-deployment.md` if infra doc lives there)
- **Action**: Modify
- **Details**: Document all ten env vars verbatim from the Spec Literal § Env vars table (all optional; `AI_EXPLANATIONS_ENABLED` default `false`). Add an IAM note: the Lambda execution role and any host with `AI_EXPLANATIONS_ENABLED=true` and `AI_PROVIDER=amazon-bedrock` need `bedrock:InvokeModel` scoped to the configured model/inference-profile ARN; local dev may use developer AWS credentials or `AI_PROVIDER=gateway` with `AI_GATEWAY_API_KEY`; pilot/SQLite host runs disabled and needs nothing.
- **Depends on**: none
- **Verification**: `.env.example` lists all AI_* vars with defaults; IAM least-privilege note present.

### TASK-014: Contract tests EXPL-001 through EXPL-010
- **Files**: `tests/contracts/ai-educator-explanations.test.ts`
- **Action**: Create
- **Details**: Implement all ten contract tests per spec § Contract Tests with **mocked `generateText`** via `vi.mock('ai')` or generator DI (no live LLM). Import generators/prompt/guardrails from **`@8p3p/explanation`** (or `services/explanation/src/...` paths). Generator + guardrail tests (EXPL-001/003/004/005/006/007/008/009) exercise the AI package directly; EXPL-002/010 exercise the full evaluate->persist flow through `engine.ts`/`engine-async.ts` with the generator injected (DI param). EXPL-004: mock throws `APICallError`; EXPL-006: mock throws `APICallError` with `statusCode: 429`. Update any existing decision/ingestion tests that called `evaluateState` synchronously to `await` (TASK-011 fallout).
- **Depends on**: TASK-004, TASK-005, TASK-006, TASK-007, TASK-008, TASK-009, TASK-010
- **Verification**: `npm test` green; all EXPL-001..010 pass; no test calls live Bedrock or AI Gateway.

## Files Summary

### To Create
| File | Task | Purpose |
|------|------|---------|
| `services/explanation/package.json` | TASK-001 | `@8p3p/explanation` package manifest + AI SDK deps |
| `services/explanation/tsconfig.json` | TASK-001 | Package TypeScript config |
| `services/explanation/Dockerfile` | TASK-001 | Optional future standalone image (not P0 deploy) |
| `services/explanation/src/env-config.ts` | TASK-001, TASK-008 | parseExplanationEnv + isExplanationsEnabled |
| `services/explanation/src/index.ts` | TASK-001, TASK-008 | Public export surface |
| `services/explanation/src/generator.ts` | TASK-003 | ExplanationGenerator port + ExplanationInput |
| `services/explanation/src/template-generator.ts` | TASK-004 | Disabled/fallback generator (returns null) |
| `services/explanation/src/prompt.ts` | TASK-005 | SYSTEM_PROMPT + buildUserPrompt (PII-safe) |
| `services/explanation/src/guardrails.ts` | TASK-006 | Truncate + PII-echo + empty checks |
| `services/explanation/src/ai-sdk-generator.ts` | TASK-007 | AiSdkExplanationGenerator (generateText + errors) |
| `services/explanation/src/providers/amazon-bedrock.ts` | TASK-007 | createAmazonBedrock + IAM credential chain |
| `services/explanation/src/providers/gateway.ts` | TASK-007 | Gateway model resolver for local dev |
| `services/explanation/src/factory.ts` | TASK-008 | selectExplanationGenerator(env) |
| `src/decision/explanation-client.ts` | TASK-003, TASK-008 | Thin re-export from `@8p3p/explanation` for engines |
| `tests/contracts/ai-educator-explanations.test.ts` | TASK-014 | EXPL-001..010 |

### To Modify
| File | Task | Changes |
|------|------|---------|
| `package.json` (root) | TASK-001 | `"@8p3p/explanation": "file:services/explanation"`, `build:explanation` script |
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
| Implement `AiSdkExplanationGenerator` (`generateText`) | spec § Functional | TASK-007 |
| Implement `TemplateExplanationGenerator` (returns null when disabled) | spec § Functional | TASK-004 |
| Master toggle `AI_EXPLANATIONS_ENABLED` (default false); no provider when off | spec § Functional | TASK-008 |
| Provider selection via `AI_PROVIDER` (amazon-bedrock / gateway) | spec § Functional | TASK-007, TASK-008 |
| Build prompt from PII-safe inputs only; no learner reference | spec § Functional | TASK-003, TASK-005 |
| Apply guardrails (length, no PII, framing, truncate at word boundary) | spec § Functional | TASK-005, TASK-006 |
| Fail-safe: error/429/timeout/RetryError -> null fallback + log-only warning | spec § Functional | TASK-007 |
| Exactly one persisted decision record (no second write) | spec § Functional | TASK-009, TASK-010 |
| AC: disabled -> explanation == null; no LLM provider loaded | spec § Acceptance | TASK-004, TASK-008, TASK-014 |
| AC: enabled + reinforce/text_evidence declining -> non-empty, references skill+confidence, excludes learner ref | spec § Acceptance | TASK-005, TASK-007, TASK-014 |
| AC: error or > timeout -> null fallback, persisted once, degraded warning | spec § Acceptance | TASK-007, TASK-009, TASK-014 |
| AC: over-length -> truncated at word boundary | spec § Acceptance | TASK-006, TASK-014 |
| AC: output contains no canonical PII values (best-effort) | spec § Acceptance | TASK-006, TASK-014 |
| Local/pilot host runs disabled by default | spec § Constraints | TASK-008, TASK-013 |
| Bedrock IAM least-privilege (`bedrock:InvokeModel`) for amazon-bedrock path | spec § Production Correctness | TASK-013 |
| Use current AI SDK APIs (`maxOutputTokens`, not `maxTokens`) | spec § Constraints | TASK-007 |

## Test Plan

| Test ID | Type | Description | Task |
|---------|------|-------------|------|
| EXPL-001 | unit | Disabled mode byte-identical; no LLM provider module loaded | TASK-014 |
| EXPL-002 | integration | Happy path grounded explanation (reinforce/text_evidence/declining) | TASK-014 |
| EXPL-003 | unit | Prompt contains no PII / no learner_reference | TASK-014 |
| EXPL-004 | unit | APICallError -> null fallback, single write, degraded warning | TASK-014 |
| EXPL-005 | unit | Timeout (> AI_TIMEOUT_MS) -> null fallback | TASK-014 |
| EXPL-006 | unit | APICallError statusCode 429 -> null fallback | TASK-014 |
| EXPL-007 | unit | Over-length output truncated at word boundary | TASK-014 |
| EXPL-008 | unit | Guardrail trips on PII echo -> discarded + guardrail warning | TASK-014 |
| EXPL-009 | unit | Confidence-not-grade framing asserted via instructions contract | TASK-014 |
| EXPL-010 | integration | Async (Lambda) path parity with sync | TASK-014 |

## Deviations from Spec

| Spec section | Spec says | Plan does | Resolution |
|--------------|-----------|-----------|------------|
| § File Structure ("engine.ts — sync path") | Inject generator into the existing sync `engine.ts` | Converts `evaluateState` to **async** (`Promise<EvaluateDecisionOutcome>`) so the async generator can be awaited inline; updates the one ingestion call site to `await` | **Resolved in implementation** — documented in spec § Implementation Notes. |
| § File Structure (`src/decision/explanations/`) | AI module under `src/decision/explanations/` | Elevated to repo-root sibling `services/explanation/` + thin `explanation-client.ts` adapter | Plan deviation — logical separation + optional Docker; P0 deploy stays in-process (see Package Architecture) |
| § File Structure (env parsing inline in factory) | Env vars parsed at call sites | Centralized in `env-config.ts` (`parseExplanationEnv`, `isExplanationsEnabled`) | Implementation detail — spec silent; documented in spec § Implementation Notes |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `evaluateState` sync->async cascades to callers | Medium | Only one non-test caller (`handler-core.ts:203`) already in an async function; add `await`; sweep tests in TASK-014 |
| LLM latency added to decision path (inline) | Medium | AI SDK `timeout: AI_TIMEOUT_MS` (4000); on exceed -> null fallback; decision never blocked beyond timeout |
| AI SDK loaded when disabled (bundle/cold start) | Low | Dynamic import in factory; `AI_EXPLANATIONS_ENABLED=false` never imports `ai` or providers |
| PII echo in model output | High | Guardrail best-effort PII-echo check discards output -> null fallback + `explanation_guardrail_tripped` |
| Double-write regression | High | Generation inline before the single `saveDecision`; EXPL-004 asserts exactly one write |
| Model/region not enabled in AWS | Medium | APICallError -> null fallback (degraded warning); cannot break decisions; verified in PREREQ-001 |
| Deprecated AI SDK API usage | Medium | Follow `.agents/skills/ai-sdk` skill; use `maxOutputTokens`, `instructions`, `APICallError.isInstance`; run typecheck after TASK-007 |
| `DecisionType` drift between core and AI package | Low | Same literal union in `services/explanation/src/generator.ts`; optional sync test in TASK-014 |
| Two-package build order | Low | Root `build` runs `build:explanation` before `tsc`; CI `check` unchanged |

## Verification Checklist

- [x] All tasks completed
- [x] Contract tests implemented (EXPL-001..010 in `tests/contracts/ai-educator-explanations.test.ts`)
- [x] Type check passes (`npm run typecheck`)
- [x] `AI_EXPLANATIONS_ENABLED=false` returns `null` explanation (EXPL-001)
- [x] Exactly one decision write whether explanation succeeds or falls back (EXPL-004)
- [x] No `learner_reference`/PII in prompt (EXPL-003); guardrail on echo (EXPL-008)
- [x] No test invokes live Bedrock or AI Gateway
- [x] No deprecated AI SDK APIs (`maxOutputTokens`, not `maxTokens`)
- [x] Root `package.json` has no direct `ai` dependency (only `@8p3p/explanation` link)
- [x] Env vars + IAM documented (`.env.example`, `docs/specs/aws-deployment.md`)
- [ ] Full `npm test` green locally (requires `npm rebuild better-sqlite3` if Node ABI mismatched)
- [ ] `npm run lint` verified on CI/merge branch

## Implementation Order

```
TASK-001 (package scaffold + deps) ; TASK-002 (types/schema) ; TASK-012 (error codes)
TASK-003 (port + explanation-client) — depends on TASK-001
  ├─ TASK-004 (template) ┐
  ├─ TASK-005 (prompt)   │
  ├─ TASK-006 (guardrails)│
  └─ TASK-007 (ai-sdk + providers) ──┴─ TASK-008 (factory + index exports)
TASK-008 → TASK-009 (sync engine) → TASK-011 (call sites)
TASK-008 → TASK-010 (async engine)
TASK-013 (docs, anytime)
TASK-014 (tests last)
```

## Next Steps

Backend implementation and Panels 2 & 3 body-copy wiring are **complete on branch**. Remaining work:

1. **Live-path enablement (when turning on in AWS):** PREREQ-001 — confirm `AI_MODEL` enabled in `AI_REGION`; PREREQ-002 — grant Lambda `bedrock:InvokeModel` scoped to model ARN (documented in `docs/specs/aws-deployment.md` and tracked in `pilot-charter-onboarding.plan.md` TASK-005).
2. **Hosted-pilot verification:** Re-ingest or seed data after enablement and confirm a new decision has non-null `trace.educator_explanation`; verify Panels 2 & 3 show that narrative through `educatorBodyCopy()`.
3. **Local dev with LLM (optional):** PREREQ-003 — set `AI_PROVIDER=gateway` + `AI_GATEWAY_API_KEY`.
4. **Secondary dashboard surfaces (optional polish):** Some non-Panel-2/3 surfaces still intentionally show `educator_summary` for compact table/header copy. Update them only when their UX calls for richer narrative text.
5. **SBIR track resumes:** Track 6 (`liu-usage-meter`, `decision-outcomes`, `program-metrics`, `pilot-research-export`) per pilot roadmap — independent of dashboard AI wiring.
