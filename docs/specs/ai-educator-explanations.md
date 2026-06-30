# AI Educator Explanations

## Overview

Today every decision carries a deterministic, auditable `trace.rationale` (which policy rule fired, on what field, against what threshold) and a static `trace.educator_summary` short label ("Needs more practice", "Needs stronger support now"). Per the CEO directive (2026-06-22 voice note), educators need more than a grade-like label: a short, plain-language explanation of **where** a learner is showing learning decay and **why**, framed as the system's *confidence in the learner's learning* (not a student grade).

This spec adds an **AI explanation layer** that turns the structured signals the engine already produces (decision type, skill, confidence/stability + mastery scores with directions and deltas, and the matched rule) into a short narrative explanation. The explanation is generated **at decision time** via the **[Vercel AI SDK](https://ai-sdk.dev)** (`generateText`) and stored on the decision record (new `trace.educator_explanation` field), so the Decision Panel reads a cached value with no live LLM cost or latency per page load.

The AI **only explains a decision the deterministic engine already made** — it does not make or alter decisions. If AI generation is disabled, errors, or times out, the system falls back to the existing static `educator_summary` and the decision is never blocked or lost. This keeps the control layer auditable and defensible for the SBIR narrative.

### Design refinement (vs. initial framing)

The first sketch proposed reusing the existing `educator_summary` field "with no schema change." This spec instead adds a **separate optional `trace.educator_explanation` field** and leaves `educator_summary` untouched. Justification: (1) `educator_summary` stays deterministic and always-present, giving a trivial, guaranteed fallback; (2) the addition is backward-compatible (optional field — existing decisions and consumers are unaffected); (3) it cleanly separates the short label (badge/title) from the narrative (body copy) the panel already renders separately.

### AI SDK architecture choice

This feature uses **AI SDK Core** (`generateText`) — not `streamText`, `useChat`, or `ToolLoopAgent`. Rationale:

- Generation is **non-interactive**: one-shot text at decision time, cached on the record.
- No streaming UI or tool loop is required in this phase.
- `generateText` provides a unified API across providers with built-in retry, timeout, and typed errors.

**Production default provider:** `@ai-sdk/amazon-bedrock` — keeps inference inside AWS (IAM credential chain on Lambda, no third-party egress). The AI SDK Bedrock provider uses the Bedrock Converse API under the hood.

**Optional local-dev provider:** Vercel AI Gateway (string model IDs + `AI_GATEWAY_API_KEY`) when developers lack Bedrock model access. Selected via `AI_PROVIDER=gateway`.

Swapping models or providers is an env/factory change behind the `ExplanationGenerator` port — no engine changes.

---

## Requirements

### Functional

- [x] Add optional `trace.educator_explanation: string | null` to the `Decision` type (`src/shared/types.ts`) and the decision JSON schema. Backward-compatible (optional).
- [x] Define an `ExplanationGenerator` port (interface) consumed by both decision paths (`src/decision/engine.ts` sync, `src/decision/engine-async.ts` Lambda).
- [x] Implement `AiSdkExplanationGenerator` using AI SDK Core **`generateText`** with a provider selected by `AI_PROVIDER` (default `amazon-bedrock`).
- [x] Implement `TemplateExplanationGenerator` (fallback) that returns `null` so behavior with the feature disabled is identical to today (panel falls back to `educator_summary`).
- [x] Master toggle `AI_EXPLANATIONS_ENABLED` (default `false`). When `false`, the engine uses the template generator and never imports/initializes an LLM provider.
- [x] Build the prompt from **PII-safe inputs only**: `decision_type`, `decision_context.skill`, `trace.rationale`, `trace.matched_rule.evaluated_fields`, and the canonical `trace.state_snapshot` (already PII-stripped per DEF-DEC-007). The learner reference must **not** be included in the prompt.
- [x] Apply guardrails (system `instructions` + post-processing): bounded length, no PII, no fabrication beyond provided signals, confidence-not-grade framing, neutral/supportive tone, plain reading level. Post-process truncates to `EDUCATOR_EXPLANATION_MAX_CHARS`.
- [x] Generation is **fail-safe**: any LLM error, rate limit, retry exhaustion, or timeout (`AI_TIMEOUT_MS`) results in fallback to `null` (panel uses template label), a single decision write, and a log-only `explanation_generation_degraded` warning. The decision response is never delayed beyond the timeout and never fails because of explanation generation.
- [x] Decision evaluation produces exactly one persisted decision record whether or not the explanation succeeds (no second write).

### Acceptance Criteria

- Given `AI_EXPLANATIONS_ENABLED=false`, when a decision is evaluated, then `trace.educator_explanation` is `null` and no LLM provider module is initialized.
- Given `AI_EXPLANATIONS_ENABLED=true` and a `reinforce` decision for skill `text_evidence` with `stabilityScore` declining, when the decision is evaluated, then `trace.educator_explanation` is a non-empty string that references the skill and a confidence/stability concept and does not contain the `learner_reference`.
- Given `AI_EXPLANATIONS_ENABLED=true` and `generateText` throws or exceeds `AI_TIMEOUT_MS`, when the decision is evaluated, then `trace.educator_explanation` is `null`, the decision is persisted once, and an `explanation_generation_degraded` warning is logged (never returned to the caller).
- Given a generated explanation longer than `EDUCATOR_EXPLANATION_MAX_CHARS`, when stored, then it is truncated to the limit at a word boundary.
- Given a generated explanation, when inspected, then it contains none of the canonical PII field values present in the source state (best-effort guardrail check).

---

## Constraints

- **AI explains, never decides.** The deterministic engine remains the sole source of `decision_type`. The explanation is presentational metadata only.
- **PII-safe prompt.** Only the canonical `state_snapshot` (already filtered to policy-evaluated fields) and non-PII trace fields are sent to the model. No `learner_reference`, no raw payloads.
- **Fail-safe and non-breaking.** Feature defaults OFF. With it off, output is byte-identical to today's behavior. Explanation failure can never block or fail a decision.
- **Single write per decision.** Explanation is generated inline before the decision is persisted; there is no post-write update path in this phase.
- **Local/pilot host has no LLM by default.** The SQLite pilot host and local dev run with `AI_EXPLANATIONS_ENABLED=false` unless explicitly configured with provider credentials.
- **Cost/latency bounded.** Default model is a low-cost, low-latency Haiku-class model with capped `maxOutputTokens` and a hard request timeout.
- **Use current AI SDK APIs.** Use `maxOutputTokens` (not deprecated `maxTokens`), `instructions` + `prompt` (or `messages`), and `generateText` with plain text output — not deprecated `generateObject` (use `Output.object` only if structured output is added later).

## Out of Scope

| Item | Rationale | Revisit |
|------|-----------|---------|
| On-demand / per-view generation | CEO chose at-decision generation; cached value avoids per-load cost | If freshness becomes a requirement |
| Streaming responses (`streamText`) | Explanations are short and stored, not streamed to a live UI | If a live "explain this" UX is added |
| Chat UI (`useChat`, `@ai-sdk/react`) | No interactive chat in this phase | If educator Q&A is added |
| Agent loops (`ToolLoopAgent`, tools) | Single-shot explanation only | If multi-step reasoning is needed |
| Post-write async regeneration / backfill of historical decisions | Single-write, forward-only in this phase | Separate backfill plan if needed |
| Educator-configurable prompt/tone per org | Pilot uses one global prompt + guardrails | Phase 2 (per-tenant policy) |
| Multi-language explanations | Pilot is English | Post-pilot |
| Streaming usage metering / per-explanation cost attribution | Cost tracked at the account/provider level for pilot | Phase 2 if needed |
| Bedrock Guardrails via `providerOptions.bedrock.guardrailConfig` | App-level guardrails sufficient for pilot | If AWS Guardrails become a compliance requirement |

---

## Dependencies

### Required from Other Specs

| Dependency | Source Document | Status |
|------------|-----------------|--------|
| `Decision` type + `trace` (incl. `state_snapshot`, `rationale`, `educator_summary`, `matched_rule`) | `docs/specs/decision-engine.md`, `src/shared/types.ts` | Defined ✓ |
| Canonical PII-stripped `state_snapshot` (DEF-DEC-007) | `docs/specs/decision-engine.md` | Defined ✓ |
| `DECISION_TYPE_TO_EDUCATOR_SUMMARY` template labels | `src/decision/educator-summaries.ts` | Defined ✓ |
| Per-skill `stabilityScore` / `masteryScore` + `_direction` / `_delta` | `docs/specs/skill-level-tracking.md` | Defined ✓ |
| Decision Panel "What Do They Need Help With" rendering | `docs/specs/decision-panel-ui.md` (Panel 2) | Defined ✓ |

### Provides to Other Specs

| Capability | Used By |
|------------|---------|
| `trace.educator_explanation` narrative | `docs/specs/decision-panel-ui.md` (Panels 2 & 3 body copy) |
| `ExplanationGenerator` port | Future per-tenant prompt policy (Phase 2) |

### External libraries / SDK (per `prefer-existing-solutions` rule)

| Need | Chosen solution | Why (vs. custom) |
|------|-----------------|------------------|
| Unified LLM invocation from Node | **`ai`** (AI SDK Core) — `generateText` | Official Vercel AI SDK; provider-agnostic; built-in retry, timeout, typed errors (`APICallError`, `RetryError`). Ref: [Generating Text](https://ai-sdk.dev/docs/ai-sdk-core/generating-text), [Settings](https://ai-sdk.dev/docs/ai-sdk-core/settings) |
| AWS Bedrock provider (production) | **`@ai-sdk/amazon-bedrock`** — `createAmazonBedrock` | First-party AI SDK provider; Converse API under the hood; IAM credential chain for Lambda. Ref: [Amazon Bedrock Provider](https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock) |
| Lambda IAM credentials | **`@aws-sdk/credential-providers`** — `fromNodeProviderChain()` | Already in the AWS SDK ecosystem; passed to `createAmazonBedrock({ credentialProvider })` |
| Local dev without AWS Bedrock access (optional) | **Vercel AI Gateway** via string model ID + `AI_GATEWAY_API_KEY` | AI SDK default global provider; simplest local setup. Ref: [AI Gateway](https://ai-sdk.dev/docs/ai-sdk-core/ai-gateway) |
| Request timeout | AI SDK `timeout` option on `generateText` | Native; preferred over manual `AbortController` wiring |
| Rate-limit / API failure detection | `APICallError.isInstance(error)` + `statusCode === 429`; `RetryError` when retries exhausted | Typed AI SDK errors; replaces raw AWS `ThrottlingException` checks |

> **AI SDK skill check performed:** Verified current APIs against bundled skill references and ai-sdk.dev docs (2026-06-25): `generateText` with `instructions`, `prompt`, `maxOutputTokens`, `temperature`, `timeout`, and `maxRetries`; deprecated `maxTokens` and `generateObject` avoided.

> **Provider model IDs:** Before implementation, fetch current model lists — do not hard-code from memory. For Gateway: `curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '[.data[] | select(.id | startswith("anthropic/")) | .id] | reverse | .[]'`. For Bedrock: use model IDs from the [Bedrock provider docs](https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock) model table; prefer Haiku-class for cost/latency.

---

## Error Codes

These are **log-only** warnings (never returned to the API caller), mirroring the `policy_dynamo_degraded` pattern. Explanation generation is non-blocking, so it produces no caller-facing 4xx/5xx.

### Existing (reuse pattern)

| Code | Source |
|------|--------|
| `policy_dynamo_degraded` (precedent for log-only degraded warning) | `src/shared/error-codes.ts` |

### Implemented (`src/shared/error-codes.ts`)

| Code | Surface | Description |
|------|---------|-------------|
| `explanation_generation_degraded` | log-only warning | `generateText` failed, threw, was rate-limited (429), retries exhausted (`RetryError`), or exceeded `AI_TIMEOUT_MS`; engine fell back to `null` (panel uses `educator_summary`). Never returned to the caller. |
| `explanation_guardrail_tripped` | log-only warning | Post-processing detected a PII value or empty/invalid output and discarded the model result in favor of the template fallback. Never returned to the caller. |

---

## Contract Tests

| Test ID | Type | Description | Input | Expected |
|---------|------|-------------|-------|----------|
| EXPL-001 | unit | Disabled mode is byte-identical to today | `AI_EXPLANATIONS_ENABLED=false`, any decision | `educator_explanation` == `null`; no LLM provider module loaded |
| EXPL-002 | integration | Happy path produces grounded explanation | `AI_EXPLANATIONS_ENABLED=true` (mocked `generateText`), `reinforce` / `text_evidence` / declining stability | non-empty string referencing skill + confidence concept; excludes `learner_reference` |
| EXPL-003 | unit | Prompt contains no PII | decision with PII in raw state | prompt body contains only canonical snapshot + non-PII trace fields; no `learner_reference` |
| EXPL-004 | unit | LLM error → null fallback, single write | `generateText` mock throws `APICallError` | `educator_explanation` == `null`; `saveDecision` called exactly once; `explanation_generation_degraded` logged |
| EXPL-005 | unit | Timeout → null fallback | `generateText` mock delays > `AI_TIMEOUT_MS` or aborts | `educator_explanation` == `null`; `explanation_generation_degraded` logged |
| EXPL-006 | unit | Rate limit (429) → null fallback | `generateText` mock throws `APICallError` with `statusCode: 429` | `educator_explanation` == `null`; degraded warning logged |
| EXPL-007 | unit | Over-length output truncated at word boundary | model returns > `EDUCATOR_EXPLANATION_MAX_CHARS` | stored value ≤ limit, no mid-word cut |
| EXPL-008 | unit | Guardrail trips on detected PII in output | model echoes a PII value | output discarded; `educator_explanation` == `null`; `explanation_guardrail_tripped` logged |
| EXPL-009 | unit | Confidence framing, not grade | mocked output asserted via prompt contract | `instructions` (system prompt) instructs confidence-not-grade; no letter/percentage grade vocabulary required of output |
| EXPL-010 | integration | Async (Lambda) path parity | `engine-async.ts` with mocked `generateText` | same `educator_explanation` behavior as sync path |

> **Test strategy note:** EXPL-001/003/004/005/006/007/008/009 exercise the generator + guardrails directly with **`generateText` mocked** via `vi.mock('ai')` or dependency injection (no live LLM). EXPL-002/010 exercise the full evaluate→persist flow through `engine.ts` / `engine-async.ts` with the generator injected. No test calls live Bedrock or AI Gateway. Place these in `tests/contracts/ai-educator-explanations.test.ts` per the document-traceability rule.

---

## Concrete Values Checklist

### Wire formats / model I/O

**AI SDK call shape** (`AiSdkExplanationGenerator.generate`):

```typescript
import { generateText } from 'ai';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

// Provider setup (amazon-bedrock path — lazy-init only when AI_EXPLANATIONS_ENABLED=true)
const bedrock = createAmazonBedrock({
  region: process.env.AI_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
  credentialProvider: fromNodeProviderChain(),
});

const { text } = await generateText({
  model: bedrock(process.env.AI_MODEL!), // e.g. 'us.anthropic.claude-3-5-haiku-20241022-v1:0'
  instructions: SYSTEM_PROMPT,
  prompt: buildUserPrompt(input),
  maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 256),
  temperature: Number(process.env.AI_TEMPERATURE ?? 0.2),
  timeout: Number(process.env.AI_TIMEOUT_MS ?? 4000),
  maxRetries: Number(process.env.AI_MAX_RETRIES ?? 2),
});
```

**Gateway path** (`AI_PROVIDER=gateway`):

```typescript
import { generateText } from 'ai';

const { text } = await generateText({
  model: process.env.AI_MODEL!, // e.g. 'anthropic/claude-haiku-4.5'
  instructions: SYSTEM_PROMPT,
  prompt: buildUserPrompt(input),
  maxOutputTokens: 256,
  temperature: 0.2,
  timeout: 4000,
});
// Requires AI_GATEWAY_API_KEY in environment (see AI Gateway docs)
```

- **Output extraction:** `result.text` (trim, then guardrail post-process via `postProcessExplanation`).
- **Disabled-mode value of `trace.educator_explanation`:** **`null`** (the panel falls back to `educator_summary` / `rationale`). Rationale: keeps "explanation present" a true signal of AI generation; avoids duplicating the label in two fields.

### HTTP behavior

| Transition | Status | Content-Type | Required headers |
|------------|--------|--------------|------------------|
| Decision evaluate (existing route) — explanation success or fallback | unchanged (existing decision response) | unchanged | unchanged |

> No new routes. Explanation generation is internal to decision evaluation; it never changes the decision endpoint's status codes or content type.

### Cookies (if applicable)

N/A — no cookies; internal server-side generation only.

### Env vars

| Variable | Required | Default | Type | Description |
|----------|----------|---------|------|-------------|
| `AI_EXPLANATIONS_ENABLED` | no | `false` | bool | Master toggle. `false` → template generator only; LLM provider never initialized. |
| `AI_PROVIDER` | no | `amazon-bedrock` | string | Provider backend: `amazon-bedrock` (Lambda/production) or `gateway` (local dev with AI Gateway). |
| `AI_MODEL` | when enabled | `us.anthropic.claude-3-5-haiku-20241022-v1:0` (bedrock) / `anthropic/claude-haiku-4.5` (gateway) | string | Model ID passed to the provider. Fetch current IDs before deploy — do not use stale IDs from memory. |
| `AI_REGION` | no | `AWS_REGION` then `us-east-1` | string | AWS region for `@ai-sdk/amazon-bedrock` (ignored when `AI_PROVIDER=gateway`). |
| `AI_MAX_OUTPUT_TOKENS` | no | `256` | number | `generateText` `maxOutputTokens` cap. |
| `AI_TEMPERATURE` | no | `0.2` | number | `generateText` `temperature` (low → consistent, grounded). |
| `AI_TIMEOUT_MS` | no | `4000` | number | `generateText` `timeout`; on exceed → null fallback. |
| `AI_MAX_RETRIES` | no | `2` | number | `generateText` `maxRetries`; exhausted retries → null fallback. |
| `AI_GATEWAY_API_KEY` | when `AI_PROVIDER=gateway` | — | string | Vercel AI Gateway API key. Not used in Lambda production path. |
| `EDUCATOR_EXPLANATION_MAX_CHARS` | no | `480` | number | Post-process truncation limit (word-boundary). |

### Constants / limits

- Explanation max length: `EDUCATOR_EXPLANATION_MAX_CHARS` (default 480 chars ≈ 3–4 sentences).
- Request timeout: `AI_TIMEOUT_MS` (default 4000 ms) via AI SDK `timeout`.
- Max output tokens: `AI_MAX_OUTPUT_TOKENS` (default 256) via AI SDK `maxOutputTokens`.
- Retries: AI SDK built-in retry via `maxRetries`; rate limits or exhausted retries → null fallback (no custom retry loop beyond SDK).

### Routes registered

| Method | Path | Auth exempt? |
|--------|------|--------------|
| — | none (no new routes) | — |

---

## Production Correctness Notes

- **Proxy / `trustProxy`**: N/A — feature does not read client IP or protocol.
- **CORS**: N/A — internal server-side LLM call; no browser origin involved.
- **CSP / security headers**: N/A — no new HTTP surface.
- **Cookie prefix vs Path scoping**: N/A — no cookies.
- **Content-type parsing**: N/A — no new request bodies parsed.
- **Body size limits**: N/A — no new inbound endpoint. Prompt size is bounded by the canonical snapshot (already small) and capped output tokens.
- **IAM / least privilege (amazon-bedrock path):** The Lambda execution role needs `bedrock:InvokeModel` scoped to the configured model / inference-profile ARN. Local dev uses developer AWS credentials or AI Gateway. Document in `infra/` CDK.
- **Model region availability:** `AI_MODEL` must be enabled and available in `AI_REGION`. A region/model mismatch surfaces as an `APICallError` → null fallback (degraded warning), so it cannot break decisions, but it must be verified during AWS enablement.
- **Throttling / rate-limit storage scope:** Provider-side quotas apply; on 429 or `RetryError` the engine falls back to null. No app-level rate-limit store needed; horizontal scaling is unaffected because there is no shared explanation state.
- **PII egress:** The only data leaving the VPC/account boundary is the canonical PII-stripped snapshot + non-PII trace fields (Bedrock path stays in AWS). A guardrail post-check (`explanation_guardrail_tripped`) defends against the model echoing any PII value that might appear in snapshot strings.
- **Error-code surface:** Both new codes are log-only; no internal detail (model IDs, stack traces, snapshot contents) is ever returned to API callers.
- **Cost:** Default Haiku-class model + 256-token cap keeps per-explanation cost minimal; generation runs once per decision (cached), not per dashboard load.
- **Bundle / cold start:** Dynamic-import the explanations module and provider packages only when `AI_EXPLANATIONS_ENABLED=true` so disabled deployments pay no LLM SDK cost at cold start.

---

## File Structure

```
services/explanation/                     # @8p3p/explanation — AI layer (sibling package, like dashboard/)
├── package.json                          # ai, @ai-sdk/amazon-bedrock live here only
├── tsconfig.json
├── Dockerfile                            # optional; not used in P0 deploy — future standalone image
└── src/
    ├── index.ts                          # public exports (factory, port, types, env helpers)
    ├── env-config.ts                     # parseExplanationEnv(env) + isExplanationsEnabled(env) — spec defaults
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

**Package boundary (2026-06-25):** All AI SDK code lives in `@8p3p/explanation` under `services/explanation/`. The control layer consumes it **in-process** via the `ExplanationGenerator` port through `explanation-client.ts`. P0 does **not** deploy a separate HTTP service — inline single-write and fail-safe null fallback are unchanged. An optional `services/explanation/Dockerfile` prepares for a future standalone deploy (`HttpExplanationGenerator` + env toggle) without rewriting the engine.

---

## Implementation Notes

> Post-implementation parity (2026-06-25). Literal behavior matches this spec; these notes capture TypeScript/module choices not spelled out above.

- **`env-config.ts`:** `parseExplanationEnv(env)` centralizes the env-var table defaults (`AI_MAX_OUTPUT_TOKENS` 256, `AI_TEMPERATURE` 0.2, `AI_TIMEOUT_MS` 4000, `AI_MAX_RETRIES` 2, `EDUCATOR_EXPLANATION_MAX_CHARS` 480, provider-specific default models). `isExplanationsEnabled(env)` treats `true` / `1` (case-insensitive) as enabled.
- **`evaluateState` is async:** Both `evaluateState` and `evaluateStateAsync` accept an optional `generator?: ExplanationGenerator` (defaults to `selectExplanationGenerator()`) for contract-test DI. The sole sync ingestion call site (`handler-core.ts`) `await`s evaluation.
- **Lazy AI SDK load:** `factory.ts` returns `TemplateExplanationGenerator` when disabled. When enabled, a `LazyAiSdkExplanationGenerator` wrapper dynamic-imports `./ai-sdk-generator.js` on first `generate()` so cold starts with `AI_EXPLANATIONS_ENABLED=false` never load `ai` or provider modules.
- **PII-echo guard:** `guardrails.ts` uses a minimum substring length of 4 characters when scanning `state_snapshot` string leaves (avoids numeric noise); empty output and PII echo both map to `explanation_guardrail_tripped` + `null`.
- **Package boundary:** `@8p3p/explanation` logs warning codes as string literals matching `src/shared/error-codes.ts`; it does not import core. `AiSdkExplanationGenerator` is not re-exported from `index.ts` (tests import compiled `dist/ai-sdk-generator.js` directly).
- **Dashboard consumption:** Backend persists `trace.educator_explanation`; dashboard Panels 2 & 3 consume it via `dashboard/lib/panel-helpers.ts` `educatorBodyCopy()`, which falls back to `educator_summary` and then `rationale`. Secondary compact surfaces may still render `educator_summary` intentionally where table/header UX needs a short label.
- **Hosted pilot enablement:** `AI_EXPLANATIONS_ENABLED=true`, `AI_PROVIDER=amazon-bedrock`, and Lambda `bedrock:InvokeModel` IAM are configured in the pilot stack (`pilot-charter-onboarding.plan.md` TASK-005). New decisions after enablement persist non-null `trace.educator_explanation` when the model responds; null fallback still applies on throttling/guardrail/region mismatch.

---

## Notes

- **Prompt/guardrail policy (the "policies it has to follow"):** the system `instructions` prompt instructs the model to: (1) explain only what the provided signals support, (2) name the specific skill and whether the system's *confidence/stability* in that skill is rising or falling and why (using the deltas), (3) avoid grades, scores-as-grades, letter grades, or judgmental language about the student, (4) keep to ≤ 3 short sentences at a general-audience reading level, (5) never include names, IDs, or any PII, (6) if signals are insufficient, return the short template-style statement rather than speculate.
- **Confidence-not-grade framing** directly answers the CEO's point: the engine already tracks `stabilityScore` as the system's confidence in the learner's mastery; the explanation verbalizes that confidence and its trend rather than reporting a grade.
- **Why inline (single write):** decision evaluation is triggered by signal ingestion / state updates, not an interactive learner request, so a bounded (≤ `AI_TIMEOUT_MS`) inline call is acceptable and keeps the record single-write and immediately complete for the panel. A post-write async generation path is intentionally deferred (Out of Scope) to avoid double writes and eventual-consistency in the panel.
- **Provider-agnostic by construction:** because `AiSdkExplanationGenerator` uses `generateText` behind the `ExplanationGenerator` port, swapping models (Haiku ↔ Sonnet) is an env change; swapping providers (Bedrock ↔ Gateway) is a factory change — no engine changes.
- **Why not raw `@aws-sdk/client-bedrock-runtime`:** the AI SDK Bedrock provider already wraps Converse; using `generateText` gives unified error handling, retry, timeout, and a single abstraction if the team later adds Gateway or other providers for dev/staging.
- **DevTools (optional):** AI SDK DevTools can be wired in local development only for prompt debugging — never in production Lambda. See [AI SDK DevTools](https://ai-sdk.dev/docs/ai-sdk-core/devtools).

---

*Spec created: 2026-06-22 | Updated: 2026-06-29 (hosted pilot Bedrock enablement — pilot-charter TASK-005) | Prior: 2026-06-26 (implemented — `@8p3p/explanation` package, engine integration, Panels 2 & 3 body-copy consumption) | Phase: v1.1 (Pilot Wave 2 enhancement) | Depends on: `decision-engine.md`, `skill-level-tracking.md`, `decision-panel-ui.md` | Feeds: `decision-panel-ui.md` (Panels 2 & 3).*
