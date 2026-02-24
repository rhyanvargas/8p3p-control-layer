# CEO Statement Fact-Check Report

**Date:** 2026-02-24  
**Purpose:** Evidence-based assessment of CEO concerns (naming, schema strictness, receipts) against current implementation. Shareable with CEO.

---

## Executive Summary

A line-by-line audit of the codebase and specs shows that several of the CEO’s claims are **not accurate** as stated: the ingestion contract is not “any object,” STATE/Decision schemas and score scales are already consistent, and receipts/traceability are first-class in `Decision.trace`. The **valid** concerns are: (1) aligning public narrative (“events” vs “signals”) via a glossary, and (2) optionally tightening payload semantics via Phase 2 tenant field mappings and/or a dedicated `/receipts` surface.

---

## Claim 1: “We expose `/v1/signals` and call everything ‘signals’ — diverges from Foundation Memo / patent framing (events → state → decisions → receipts)”

**Verdict: Partially valid — narrative alignment needed; API rename not required.**

**Facts:**

- The API does expose `POST /v1/signals` and `GET /v1/signals` (see `src/ingestion/routes.ts`, `src/signalLog/routes.ts`).
- Our **own** foundation and spec docs use **“signal”** as the canonical input term:
  - `docs/specs/signal-ingestion.md`: “Stage 1 of 5 (Ingestion → Signal Log → STATE Engine → Decision Engine → Output)”.
  - `docs/foundation/ip-defensibility-and-value-proposition.md`: “A business receiving **signals** with canonical fields…”
- “Event” in our docs refers to **output** events (e.g. AsyncAPI: `signal.ingested`, `decision.emitted`), not the input contract.

So we do not have a second source of truth **in the codebase** — the code and specs are consistent with “signals” as inputs. The gap is between that and the **investor/sales** language (“events → state → decisions → receipts”).

**Recommendation:** Add a short **terminology glossary** in foundation docs: e.g. “A **Signal** is the canonical term for an external learning event accepted by the control layer; the pipeline is: events (signals) → state → decisions → receipts.” No route rename; avoids breaking integrations while aligning narrative.

---

## Claim 2: “SignalRecord is ‘any object’ — we’ve made the ingestion layer a blob collector”

**Verdict: False. This is the most inaccurate claim.**

**Evidence:**

`SignalRecord` extends `SignalEnvelope`, which has **eight required fields** and is not “any object”:

```ts
// src/shared/types.ts (lines 32–41, 133–136)
export interface SignalEnvelope {
  org_id: string;
  signal_id: string;
  source_system: string;
  learner_reference: string;
  timestamp: string;
  schema_version: string;
  payload: Record<string, unknown>;
  metadata?: SignalMetadata;
}

export interface SignalRecord extends SignalEnvelope {
  accepted_at: string;
}
```

Runtime contract is strict:

- **JSON Schema** `src/contracts/schemas/signal-envelope.json`: `required` list for all envelope fields, root and `metadata` use `additionalProperties: false`.
- **Forbidden-key checks** (`src/ingestion/forbidden-keys.ts`): payloads are rejected if they contain semantic keys such as `ui`, `workflow`, `course`, `score`, etc.

So the **envelope** is strict; the only “open” part is **`payload`**, which is intentionally an object of unknown shape. That is by design per our IP doc: the **business** computes canonical fields; we do **structural** validation, not semantic interpretation of payload content.

**Recommendation:** If the CEO wants stricter payload semantics, implement **Phase 2: Tenant-Scoped Field Mappings (DEF-DEC-006)** from the IP defensibility doc — declarative per-tenant field schemas without breaking vendor-agnosticism.

---

## Claim 3: “STATE and Decision schemas [must] match the canonical model (consistent score scales)”

**Verdict: Already implemented.**

- **Canonical state fields** use a **0.0–1.0** scale in policy and docs; `timeSinceReinforcement` is in seconds (e.g. 86400).
- **Default policy** `src/decision/policies/default.json` uses only those scales.
- **Decision type** is a closed set of 7 values in both TypeScript and JSON Schema: `reinforce`, `advance`, `intervene`, `pause`, `escalate`, `recommend`, `reroute`.
- **Pilot integration guide** documents 0.0–1.0 and normalization (e.g. percent → /100, rubric 0–4 → /4).

No inconsistency found; claim does not match current implementation.

---

## Claim 4: “Receipts/traceability [must be] first-class (frozen state snapshot + matched rule tree + thresholds + rationale)”

**Verdict: Already implemented.**

`Decision.trace` includes exactly what was asked for:

```ts
// src/shared/types.ts (324–335)
trace: {
  state_id: string;
  state_version: number;
  policy_version: string;
  matched_rule_id: string | null;
  state_snapshot?: Record<string, unknown>;   // Frozen state at evaluation time
  matched_rule?: MatchedRule | null;          // Full rule + evaluated_fields
  rationale?: string;                         // Human-readable rationale
}
```

`MatchedRule` includes `evaluated_fields` (field, operator, threshold, actual_value). So: frozen state snapshot, matched rule tree, thresholds vs actuals, and rationale are all present.

**Optional hardening:** Make `state_snapshot`, `matched_rule`, and `rationale` **required** in the schema if the CEO wants a guarantee they are never omitted.

---

## Claim 5: “No `/receipts` endpoint”

**Verdict: Valid — by design.**

There is no `GET /v1/receipts` route. Receipt data lives inside `Decision.trace` and is exposed via `GET /v1/decisions` and the Decision Trace inspection panel at `/inspect`. Adding a **`/v1/receipts`** (or equivalent) query surface is a reasonable v1.1 enhancement for enterprises that want “receipts” as a first-class API concept.

---

## Summary Scorecard

| CEO Claim | Accurate? | Evidence |
|-----------|-----------|----------|
| `/v1/signals` diverges from docs | **No** — docs use “signal” for inputs | signal-ingestion.md, ip-defensibility.md, type names |
| SignalRecord is “any object” | **No** — 8 required fields, strict schema, forbidden keys | signal-envelope.json, types.ts, forbidden-keys.ts |
| Payload is unconstrained blob | **Partially** — open by design; Phase 2 planned | ip-defensibility.md § Canonical Fields, DEF-DEC-006 |
| Score scales inconsistent | **No** — all 0.0–1.0, documented | default.json, pilot integration guide |
| Receipts/traceability missing | **No** — full trace in Decision | types.ts trace, decision.json |
| Need `/receipts` endpoint | **Valid** — data exists, no dedicated route | server.ts, inspection panel |

---

## Recommended Actions

1. **Add terminology glossary** (foundation docs): define “Signal = external learning event” and map to “events → state → decisions → receipts” for investor/sales. No API change.
2. **Optional:** Make trace fields `state_snapshot`, `matched_rule`, `rationale` **required** in the Decision schema so receipts are guaranteed on every decision.
3. **Prioritize Phase 2 tenant field mappings (DEF-DEC-006)** to add per-tenant payload schema enforcement if stricter payload semantics are desired.
4. **Consider** a `GET /v1/receipts` (or equivalent) endpoint that returns decision trace data for compliance/audit use cases.

---

*Report generated from codebase audit. File references and line numbers correspond to the repo as of 2026-02-24.*
