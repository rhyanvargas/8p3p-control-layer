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

Closed set of 7 values. Priority-ordered in the default policy (first match wins).

| Type | Meaning | Demo Anchor? |
|------|---------|-------------|
| `escalate` | Extreme risk or low confidence — requires human review | |
| `pause` | Insufficient confidence to act — hold | |
| `reroute` | High risk with moderate confidence — change learning path | |
| `intervene` | High-risk now; take action immediately | **Primary** |
| `reinforce` | Prevent decay / prevent future failure before it happens | **Primary** |
| `advance` | Strong mastery and stability — progress to next level | |
| `recommend` | Moderate risk with stable performance — suggest supplementary content | |

Demo narrative anchors on **reinforce** and **intervene** per CEO approval (`docs/reports/2026-02-23-ceo-scope-approval.md`).

---

## Architecture Terms

| Term | Definition |
|------|-----------|
| **Control Layer** | The 8P3P backend service. Decides but never enforces. |
| **Inspection Panels** | Read-only static UI at `/inspect` for debugging, compliance, and demos. Not product UI. |
| **Policy** | A versioned JSON rule set evaluated by the Decision Engine. Policy-as-data, not code. |
| **Tenant / Org** | An organization (`org_id`) with isolated data and (v1.1) its own API key and policy. |

---

*Created: 2026-02-24 | Source: CEO fact-check action #1 (`docs/reports/2026-02-24-ceo-statement-fact-check.md`)*
