# AI Educator Explanations

## Overview

Today every decision carries a deterministic, auditable `trace.rationale` (which policy rule fired, on what field, against what threshold) and a static `trace.educator_summary` short label ("Needs more practice", "Needs stronger support now"). Per the CEO directive (2026-06-22 voice note), educators need more than a grade-like label: a short, plain-language explanation of **where** a learner is showing learning decay and **why**, framed as the system's *confidence in the learner's learning* (not a student grade).

This spec adds an **AI explanation layer** that turns the structured signals the engine already produces (decision type, skill, confidence/stability + mastery scores with directions and deltas, and the matched rule) into a short narrative explanation. The explanation is generated **at decision time** via **AWS Bedrock** and stored on the decision record (new `trace.educator_explanation` field), so the Decision Panel reads a cached value with no live LLM cost or latency per page load.

The AI **only explains a decision the deterministic engine already made** — it does not make or alter decisions. If Bedrock is disabled, errors, or times out, the system falls back to the existing static `educator_summary` and the decision is never blocked or lost. This keeps the control layer auditable and defensible for the SBIR narrative.

### Design refinement (vs. initial framing)

The first sketch proposed reusing the existing `educator_summary` field "with no schema change." This spec instead adds a **separate optional `trace.educator_explanation` field** and leaves `educator_summary` untouched. Justification: (1) `educator_summary` stays deterministic and always-present, giving a trivial, guaranteed fallback; (2) the addition is backward-compatible (optional field — existing decisions and consumers are unaffected); (3) it cleanly separates the short label (badge/title) from the narrative (body copy) the panel already renders separately.

---

## Requirements

### Functional

- [ ] Add optional `trace.educator_explanation: string | null` to the `Decision` type (`src/shared/types.ts`) and the decision JSON schema. Backward-compatible (optional).
- [ ] Define an `ExplanationGenerator` port (interface) consumed by both decision paths (`src/decision/engine.ts` sync, `src/decision/engine-async.ts` Lambda).
- [ ] Implement `BedrockExplanationGenerator` using `@aws-sdk/client-bedrock-runtime` **Converse API** (`ConverseCommand`) — provider-agnostic across Claude/Nova/etc.
- [ ] Implement `TemplateExplanationGenerator` (fallback) that returns the existing `DECISION_TYPE_TO_EDUCATOR_SUMMARY` label so behavior with the feature disabled is identical to today.
- [ ] Master toggle `BEDROCK_ENABLED` (default `false`). When `false`, the engine uses the template generator and never imports/initializes the Bedrock client.
- [ ] Build the prompt from **PII-safe inputs only**: `decision_type`, `decision_context.skill`, `trace.rationale`, `trace.matched_rule.evaluated_fields`, and the canonical `trace.state_snapshot` (already PII-stripped per DEF-DEC-007). The learner reference must **not** be included in the prompt.
- [ ] Apply guardrails (system prompt + post-processing): bounded length, no PII, no fabrication beyond provided signals, confidence-not-grade framing, neutral/supportive tone, plain reading level. Post-process truncates to `EDUCATOR_EXPLANATION_MAX_CHARS`.
- [ ] Generation is **fail-safe**: any Bedrock error, throttle, or timeout (`BEDROCK_TIMEOUT_MS`) results in fallback to the template label, a single decision write, and a log-only `explanation_generation_degraded` warning. The decision response is never delayed beyond the timeout and never fails because of explanation generation.
- [ ] Decision evaluation produces exactly one persisted decision record whether or not the explanation succeeds (no second write).

### Acceptance Criteria

- Given `BEDROCK_ENABLED=false`, when a decision is evaluated, then `trace.educator_explanation` equals the static `educator_summary` value (or `null` per the chosen disabled-mode value — see Concrete Values) and no Bedrock client is initialized.
- Given `BEDROCK_ENABLED=true` and a `reinforce` decision for skill `text_evidence` with `stabilityScore` declining, when the decision is evaluated, then `trace.educator_explanation` is a non-empty string that references the skill and a confidence/stability concept and does not contain the `learner_reference`.
- Given `BEDROCK_ENABLED=true` and Bedrock returns an error or exceeds `BEDROCK_TIMEOUT_MS`, when the decision is evaluated, then `trace.educator_explanation` falls back to the template label, the decision is persisted once, and an `explanation_generation_degraded` warning is logged (never returned to the caller).
- Given a generated explanation longer than `EDUCATOR_EXPLANATION_MAX_CHARS`, when stored, then it is truncated to the limit at a word boundary.
- Given a generated explanation, when inspected, then it contains none of the canonical PII field values present in the source state (best-effort guardrail check).

---

## Constraints

- **AI explains, never decides.** The deterministic engine remains the sole source of `decision_type`. The explanation is presentational metadata only.
- **PII-safe prompt.** Only the canonical `state_snapshot` (already filtered to policy-evaluated fields) and non-PII trace fields are sent to Bedrock. No `learner_reference`, no raw payloads.
- **Fail-safe and non-breaking.** Feature defaults OFF. With it off, output is byte-identical to today's behavior. Explanation failure can never block or fail a decision.
- **Single write per decision.** Explanation is generated inline before the decision is persisted; there is no post-write update path in this phase.
- **Local/pilot host has no Bedrock by default.** The SQLite pilot host and local dev run with `BEDROCK_ENABLED=false` unless explicitly configured with AWS credentials + IAM access.
- **Cost/latency bounded.** Default model is a low-cost, low-latency model (Claude Haiku class) with capped `max_tokens` and a hard request timeout.

## Out of Scope

| Item | Rationale | Revisit |
|------|-----------|---------|
| On-demand / per-view generation | CEO chose at-decision generation; cached value avoids per-load cost | If freshness becomes a requirement |
| Streaming responses (`ConverseStream`) | Explanations are short and stored, not streamed to a live UI | If a live "explain this" UX is added |
| Post-write async regeneration / backfill of historical decisions | Single-write, forward-only in this phase | Separate backfill plan if needed |
| Educator-configurable prompt/tone per org | Pilot uses one global prompt + guardrails | Phase 2 (per-tenant policy) |
| Multi-language explanations | Pilot is English | Post-pilot |
| Streaming usage metering / per-explanation cost attribution | Bedrock cost tracked at the account level for pilot | Phase 2 if needed |

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
| Invoke a Bedrock foundation model from Node | `@aws-sdk/client-bedrock-runtime` (**new dependency**), `ConverseCommand` | Official AWS SDK; the **Converse API is model-agnostic** — a single request/response shape works across Claude, Amazon Nova, Mistral, etc. Avoids hand-written per-model JSON payloads that `InvokeModelCommand` requires. Aligns with the existing `@aws-sdk/*` stack already in `package.json`. Ref: [AWS SDK for JavaScript v3 — Bedrock Runtime Converse/Invoke examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_bedrock-runtime_code_examples.html) |
| Request timeout / abort | `AbortController` + SDK `requestHandler` timeout | Native; no extra library |
| Bedrock throttling detection | `ThrottlingException` instance check from the SDK | Typed SDK error, per rule's "use SDK error classes" guidance |

> **MCP check performed:** Queried `user-awslabs.aws-documentation-mcp-server` → `search_documentation` for "Bedrock Runtime Converse API InvokeModel Node.js SDK". Result confirms the Converse API as the recommended provider-agnostic path (`@aws-sdk/client-bedrock-runtime`, `ConverseCommand`).

---

## Error Codes

These are **log-only** warnings (never returned to the API caller), mirroring the `policy_dynamo_degraded` pattern. Explanation generation is non-blocking, so it produces no caller-facing 4xx/5xx.

### Existing (reuse pattern)

| Code | Source |
|------|--------|
| `policy_dynamo_degraded` (precedent for log-only degraded warning) | `src/shared/error-codes.ts` |

### New (add during implementation)

| Code | Surface | Description |
|------|---------|-------------|
| `explanation_generation_degraded` | log-only warning | Bedrock call failed, threw, was throttled, or exceeded `BEDROCK_TIMEOUT_MS`; engine fell back to the template `educator_summary`. Never returned to the caller. |
| `explanation_guardrail_tripped` | log-only warning | Post-processing detected a PII value or empty/invalid output and discarded the model result in favor of the template fallback. Never returned to the caller. |

---

## Contract Tests

| Test ID | Type | Description | Input | Expected |
|---------|------|-------------|-------|----------|
| EXPL-001 | unit | Disabled mode is byte-identical to today | `BEDROCK_ENABLED=false`, any decision | `educator_explanation` == disabled-mode value (see Concrete Values); no Bedrock client constructed |
| EXPL-002 | integration | Happy path produces grounded explanation | `BEDROCK_ENABLED=true` (mocked Converse), `reinforce` / `text_evidence` / declining stability | non-empty string referencing skill + confidence concept; excludes `learner_reference` |
| EXPL-003 | unit | Prompt contains no PII | decision with PII in raw state | prompt body contains only canonical snapshot + non-PII trace fields; no `learner_reference` |
| EXPL-004 | unit | Bedrock error → template fallback, single write | Converse mock throws | `educator_explanation` == template label; `saveDecision` called exactly once; `explanation_generation_degraded` logged |
| EXPL-005 | unit | Timeout → template fallback | Converse mock delays > `BEDROCK_TIMEOUT_MS` | aborted; template fallback; `explanation_generation_degraded` logged |
| EXPL-006 | unit | Throttling (`ThrottlingException`) → template fallback | Converse mock throws `ThrottlingException` | template fallback; degraded warning logged |
| EXPL-007 | unit | Over-length output truncated at word boundary | model returns > `EDUCATOR_EXPLANATION_MAX_CHARS` | stored value ≤ limit, no mid-word cut |
| EXPL-008 | unit | Guardrail trips on detected PII in output | model echoes a PII value | output discarded; template fallback; `explanation_guardrail_tripped` logged |
| EXPL-009 | unit | Confidence framing, not grade | mocked output asserted via prompt contract | system prompt instructs confidence-not-grade; no letter/percentage grade vocabulary required of output |
| EXPL-010 | integration | Async (Lambda) path parity | `engine-async.ts` with mocked Converse | same `educator_explanation` behavior as sync path |

> **Test strategy note:** EXPL-001/003/004/005/006/007/008/009 exercise the generator + guardrails directly with a mocked `ConverseCommand` (no live Bedrock). EXPL-002/010 exercise the full evaluate→persist flow through `engine.ts` / `engine-async.ts` with the generator injected. No test calls live Bedrock. Place these in `tests/contracts/ai-educator-explanations.test.ts` per the document-traceability rule.

---

## Concrete Values Checklist

### Wire formats / model I/O

- Bedrock call shape: `ConverseCommand` with `{ modelId, system: [{ text: <SYSTEM_PROMPT> }], messages: [{ role: "user", content: [{ text: <USER_PROMPT> }] }], inferenceConfig: { maxTokens, temperature } }`.
- Output extraction: `response.output.message.content[0].text` (trim, then guardrail post-process).
- Disabled-mode value of `trace.educator_explanation`: **`null`** (the panel falls back to `educator_summary` / `rationale`). Rationale: keeps "explanation present" a true signal of AI generation; avoids duplicating the label in two fields.

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
| `BEDROCK_ENABLED` | no | `false` | bool | Master toggle. `false` → template generator only; Bedrock client never initialized. |
| `BEDROCK_REGION` | no | `AWS_REGION` then `us-east-1` | string | Region for the Bedrock Runtime client. |
| `BEDROCK_MODEL_ID` | no | `us.anthropic.claude-3-5-haiku-20241022-v1:0` | string | Model or inference-profile ID passed to `ConverseCommand`. |
| `BEDROCK_MAX_TOKENS` | no | `256` | number | `inferenceConfig.maxTokens` cap. |
| `BEDROCK_TEMPERATURE` | no | `0.2` | number | `inferenceConfig.temperature` (low → consistent, grounded). |
| `BEDROCK_TIMEOUT_MS` | no | `4000` | number | Hard abort for the Converse call; on exceed → template fallback. |
| `EDUCATOR_EXPLANATION_MAX_CHARS` | no | `480` | number | Post-process truncation limit (word-boundary). |

### Constants / limits

- Explanation max length: `EDUCATOR_EXPLANATION_MAX_CHARS` (default 480 chars ≈ 3–4 sentences).
- Request timeout: `BEDROCK_TIMEOUT_MS` (default 4000 ms).
- Max output tokens: `BEDROCK_MAX_TOKENS` (default 256).
- Retries: rely on the AWS SDK's default retry/backoff; a throttle that survives retries → fallback (no custom retry loop).

### Routes registered

| Method | Path | Auth exempt? |
|--------|------|--------------|
| — | none (no new routes) | — |

---

## Production Correctness Notes

- **Proxy / `trustProxy`**: N/A — feature does not read client IP or protocol.
- **CORS**: N/A — internal server-side Bedrock call; no browser origin involved.
- **CSP / security headers**: N/A — no new HTTP surface.
- **Cookie prefix vs Path scoping**: N/A — no cookies.
- **Content-type parsing**: N/A — no new request bodies parsed.
- **Body size limits**: N/A — no new inbound endpoint. Prompt size is bounded by the canonical snapshot (already small) and capped output tokens.
- **IAM / least privilege**: The Lambda execution role (AWS path) and any host running with `BEDROCK_ENABLED=true` need `bedrock:InvokeModel` (Converse uses the same action) scoped to the configured model / inference-profile ARN. Document this in `infra/` CDK. Local dev uses the developer's AWS credentials.
- **Model region availability**: `BEDROCK_MODEL_ID` must be enabled and available in `BEDROCK_REGION` (Bedrock model access is per-account, per-region). A region/model mismatch surfaces as a Bedrock error → template fallback (degraded warning), so it cannot break decisions, but it must be verified during AWS enablement.
- **Throttling / rate-limit storage scope**: Bedrock-side account quotas apply; on `ThrottlingException` after SDK retries the engine falls back to the template. No app-level rate-limit store needed; horizontal scaling is unaffected because there is no shared explanation state.
- **PII egress**: The only data leaving the VPC/account boundary to Bedrock is the canonical PII-stripped snapshot + non-PII trace fields. A guardrail post-check (`explanation_guardrail_tripped`) defends against the model echoing any PII value that might appear in snapshot strings.
- **Error-code surface**: Both new codes are log-only; no internal detail (model IDs, stack traces, snapshot contents) is ever returned to API callers.
- **Cost**: Default Haiku-class model + 256-token cap keeps per-explanation cost minimal; generation runs once per decision (cached), not per dashboard load.

---

## File Structure

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

---

## Notes

- **Prompt/guardrail policy (the "policies it has to follow"):** the system prompt instructs the model to: (1) explain only what the provided signals support, (2) name the specific skill and whether the system's *confidence/stability* in that skill is rising or falling and why (using the deltas), (3) avoid grades, scores-as-grades, letter grades, or judgmental language about the student, (4) keep to ≤ 3 short sentences at a general-audience reading level, (5) never include names, IDs, or any PII, (6) if signals are insufficient, return the short template-style statement rather than speculate.
- **Confidence-not-grade framing** directly answers the CEO's point: the engine already tracks `stabilityScore` as the system's confidence in the learner's mastery; the explanation verbalizes that confidence and its trend rather than reporting a grade.
- **Why inline (single write):** decision evaluation is triggered by signal ingestion / state updates, not an interactive learner request, so a bounded (≤ `BEDROCK_TIMEOUT_MS`) inline call is acceptable and keeps the record single-write and immediately complete for the panel. A post-write async generation path is intentionally deferred (Out of Scope) to avoid double writes and eventual-consistency in the panel.
- **Provider-agnostic by construction:** because `BedrockExplanationGenerator` uses the Converse API behind the `ExplanationGenerator` port, swapping models (Haiku ↔ Nova ↔ Claude Sonnet) is an env change, and swapping providers entirely is a new adapter — no engine changes.

---

*Spec created: 2026-06-22 | Phase: v1.1 (Pilot Wave 2 enhancement) | Depends on: `decision-engine.md`, `skill-level-tracking.md`, `decision-panel-ui.md` | Feeds: `decision-panel-ui.md` (Panels 2 & 3). Recommended next: `/plan-impl docs/specs/ai-educator-explanations.md`.*
