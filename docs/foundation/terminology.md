# Terminology

Standard terms used across the 8P3P Control Layer codebase, specs, and external communications.

---

## Pipeline Terms

| Term | Definition | API / Code Usage |
|------|-----------|------------------|
| **Signal** | An external learning event accepted by the control layer. The canonical input unit. | `POST /v1/signals`, `SignalEnvelope`, `SignalRecord` |
| **State** | Accumulated learner state derived from one or more signals. Versioned and immutable per version. | `GET /v1/state`, `LearnerState` |
| **Decision** | A deterministic, advisory output produced by evaluating state against a policy. | `GET /v1/decisions`, `Decision` |
| **Receipt** | The audit artifact embedded in a decision's `trace` — frozen state snapshot, matched rule, evaluated thresholds, and rationale. Proves why a decision was made. | `Decision.trace` (exposed via `GET /v1/decisions` and Panel 4) |

### Pipeline in Narrative Form

> **Events (signals) → state → decisions → receipts**

"Events" is the investor/sales shorthand for **signals**. Externally, both terms are acceptable. Internally, "signal" is canonical — it appears in route names (`/v1/signals`), type names (`SignalEnvelope`), and all specs.

---

## Canonical State Fields

All score-like fields use a **0.0–1.0 scale**. See `docs/specs/decision-engine.md` §4.7 and `docs/guides/pilot-integration-guide.md` §5.

| Field | Type | Range | Meaning |
|-------|------|-------|---------|
| `stabilityScore` | number | 0.0–1.0 | Stability / retention in current learning path |
| `masteryScore` | number | 0.0–1.0 | Mastery / competency level |
| `timeSinceReinforcement` | number | ≥ 0 (seconds) | Elapsed time since last positive reinforcement |
| `confidenceInterval` | number | 0.0–1.0 | Confidence in the assessment |
| `riskSignal` | number | 0.0–1.0 | Risk of regression or struggle |

---

## Decision Types

Closed set of 4 values (see `src/contracts/schemas/decision.json`). Priority-ordered in the default policy (first match wins).

| Type | Meaning | Demo Anchor? |
|------|---------|-------------|
| `reinforce` | Prevent decay / prevent future failure before it happens | **Primary** |
| `advance` | Strong mastery and stability — progress to next level | |
| `intervene` | High-risk now; take action immediately | **Primary** |
| `pause` | Possible learning decay detected; monitor closely before advancing | |

The recommended demo narrative anchors on **reinforce** and **intervene** as the primary decision types.

---

## Architecture Terms

| Term | Definition |
|------|-----------|
| **Control Layer** | The 8P3P backend service. Decides but never enforces. |
| **Inspection Panels** | Read-only static UI at `/inspect` for debugging, compliance, and demos. Not product UI. |
| **Policy** | A versioned JSON rule set evaluated by the Decision Engine. Policy-as-data, not code. |
| **Tenant / Org** | An organization (`org_id`) with isolated data and (v1.1) its own API key and policy. |

---

## Connector Layer Terms

| Term | Definition | API / Code Usage |
|------|-----------|------------------|
| **Connector** | A configured integration between an LMS (e.g. Canvas) and 8P3P, activated from an integration template. One connector = one `(org_id, source_system)` pair in `FieldMappingsTable`. | `GET /v1/admin/connectors`, `POST /v1/admin/connectors/activate` |
| **Integration Template** | A pre-built, 8P3P-maintained mapping configuration for a known LMS platform. Contains envelope extraction paths, field transforms, event type definitions, and setup instructions. Bundled as JSON files in the deployment. Activation copies the template into `FieldMappingsTable` for a specific org. | `src/connector-templates/{source_system}.json`, `docs/specs/integration-templates.md` |
| **Connector Layer** | The three-layer stack that eliminates custom integration engineering: Layer 1 (Transform Engine — `tenant-field-mappings.md`), Layer 2 (Webhook Adapter — `webhook-adapters.md`), Layer 3 (Connector Activation UX — `integration-templates.md`). | See respective specs |

---

## Product Terms

| Term | Definition | API / Code Usage |
|------|-----------|------------------|
| **Living Student Record** | The composite of a learner's accumulated state, signal history, decisions, and trajectory — a longitudinal record that grows more valuable over time and persists even if source systems are replaced. The core product differentiator. Maps to the combination of `LearnerState` (current), signal log (history), decisions (outcomes), and trajectory (trends). | `GET /v1/learners/:ref/summary` (read interface), `GET /v1/state/trajectory` (trend view) |
| **Policy Lock** | Temporal immutability window on a policy, typically aligned to an academic year. When locked, the policy cannot be edited mid-year. New policies can be drafted alongside a locked one. Prevents mid-year rule changes that would undermine longitudinal data integrity. | Phase 1: `POST /v1/admin/policies/:org_id/:policy_key/lock` — see `docs/specs/policy-locking.md` (not yet written) |
| **Signal Type** | Reserved taxonomy for classifying signals by category (e.g. `assessment`, `attendance`, `observation`). Enables per-type policy evaluation and event routing. Not enforced in v1.1 — reserved as an optional `SignalEnvelope` field for v1.2 forward compatibility. | Phase 2: `SignalEnvelope.signal_type` (optional string) |
| **LIU (Learning Intelligence Unit)** | The core billing metric. 1 LIU = 1 governed learning decision (signal ingested → state updated → policy evaluated → decision produced). | `GET /v1/admin/usage`, `GET /v1/usage` — see `docs/specs/liu-usage-meter.md` |

---

*Updated: 2026-04-06 | Version: 2.0.0 — added Connector Layer terms (Connector, Integration Template, Connector Layer), Product terms (Living Student Record, Policy Lock, Signal Type, LIU). Original: 2026-02-24.*
