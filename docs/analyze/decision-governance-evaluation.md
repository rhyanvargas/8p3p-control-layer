> **SUPERSEDED (POC v1):** This document provided the architectural rationale for the Decision Governance Engine. Its binding decisions have been codified as ISS-DGE-001 through ISS-DGE-008 in `docs/specs/decision-engine.md`. POC v1 policy has been scoped to a single REINFORCE rule per CEO directive. This file is scheduled for deletion (TASK-018).

---

8P3P Decision Governance and STATE Evaluation Implementation Clarification (Final)

Purpose

This document consolidates binding doctrine (Constitution + PRD) and the attached implementation-oriented writeup (“How the System work without AI”) into a single, spec-first interpretation of where and how STATE evaluation and Decision Governance are implemented in 8P3P.

It is written to be consumed by an agentic coding assistant to:
	•	Cross-check current implementation vs doctrine
	•	Identify the “STATE evaluation” seam and its owner
	•	Minimize refactor effort while staying spec-first
	•	Keep determinism, traceability, and auditability intact

⸻

Binding doctrine: what is required

1) Decisions are derived exclusively from STATE evaluation

The PRD defines a Decision as “derived exclusively from STATE evaluation” and makes it part of the mandatory lifecycle.  ￼ ￼

This means:
	•	Signals do not directly produce decisions
	•	STATE storage does not directly produce decisions
	•	STATE evaluation is the only legitimate decision boundary

2) Decision Governance is a first-class required capability

The PRD explicitly includes Decision Governance requirements:
	•	Continuously evaluate STATE
	•	Determine what should happen next based on STATE alone
	•	Treat decisions as first-class outputs
	•	Emit via APIs and/or events, but never enforce downstream execution  ￼ ￼

The Constitution reinforces the same build principle: ingest signals, update STATE, govern decision, expose via API.  ￼

Conclusion: “STATE evaluation” is not optional or implied. It is mandated. What was missing in prior architecture diagrams was naming it as an explicit subsystem boundary.

⸻

Attached doc: what it reveals about the current methodology (no AI)

The attached document provides an explicit mental model and concrete artifacts:

Signals -> State -> Policy -> Decision -> Human governance (Approval) -> Intervention -> Audit/Trace  ￼

Key points that directly map to doctrine:

A) STATE update is deterministic math (not GenAI)

It states state changes are computed via “pure arithmetic on a rolling window” and are “deterministic and reproducible”.  ￼

B) Decisions are policy-threshold driven, with provenance

It defines decision outputs and traces:
	•	decisions records: immutable objects with type INTERVENE | REINFORCE | ADVANCE | PAUSE, plus status, urgency, TTL, expiry, bound to learner + skill  ￼
	•	decision_traces records: immutable provenance binding exact state snapshot + exact policy rule + decision output  ￼

This directly supports PRD requirements around determinism and infrastructure-grade behavior.  ￼

C) “Approval” is a governance gate, not execution

The doc includes “Human governance (Approval)” before creating interventions.  ￼

This is not in the PRD’s 4-step lifecycle, so it must be interpreted carefully:
	•	8P3P core emits decisions
	•	A downstream or adjacent governance workflow can approve/reject decisions before execution containers are created
	•	This preserves the PRD’s rule: 8P3P does not enforce decisions in downstream systems  ￼

Alignment interpretation: approval is not a “5th lifecycle step” inside the control layer. It is a consumer-side gate that sits between “Decision” and “Output execution”.

⸻

Final naming and ownership model

Decision Governance Engine (DGE)

Definition (doctrine-aligned): The Decision Governance Engine is the subsystem that evaluates canonical STATE against explicit, versioned policy and emits deterministic decisions plus trace/provenance.

This is exactly what the PRD describes as “Decision Governance”.  ￼

Ownership boundary

STATE Engine owns
	•	Canonical learner STATE
	•	Incremental STATE mutation from ingested signals
	•	Historical evolution for compounding intelligence  ￼

Decision Governance Engine owns
	•	Evaluate STATE continuously  ￼
	•	Apply policies (thresholds, constraints, temporal rules)
	•	Emit decisions as immutable outputs
	•	Emit decision traces (state snapshot + policy rule + decision)  ￼

Critical rule: DGE does not mutate STATE directly. STATE is the authority; decisions are derived outputs.

⸻

Is DGE “internal only” for IP reasons?

Practical answer
	•	Treat the policy logic and evaluation implementation as internal IP.
	•	Expose only decision outputs and (optionally) trace references via public APIs/events.

This is consistent with the doctrine: 8P3P is accessed via APIs/events and outputs decisions without enforcing UX or workflow.  ￼ ￼

What can be public vs internal

Public (safe):
	•	Decision schema and decision output endpoints/events
	•	Trace reference IDs (not necessarily full policy internals)
	•	Current state read endpoints (if required)

Internal (IP):
	•	Policy definitions and evaluation rules
	•	Policy authoring/management endpoints
	•	Full trace payload detail (exact rule expressions) if you want to protect methodology

⸻

Do core docs need to change?

No change required to remain aligned, if you treat this as a naming clarification

Reason: the PRD and Constitution already mandate:
	•	“State evaluation” and “govern decision” as core functions  ￼ ￼
	•	Decision Governance as an explicit functional requirement  ￼

So, “Decision Governance Engine” is not a scope expansion. It is a concrete component label for an already-binding requirement.

What you SHOULD update (non-binding artifacts)
	•	Architecture diagrams and spec set to explicitly show the DGE boundary
	•	OpenAPI contracts and internal interface docs to define the seam cleanly

Do NOT rewrite doctrine. Use doctrine text as justification.

⸻

Current methodology (Phase 0-1) and evolution path

Phase 0-1 methodology (today)

From the attached doc, the current approach is:
	•	Structured signals (append-only telemetry)
	•	Deterministic state update math
	•	Explicit policy thresholds
	•	Immutable decision records + provenance traces  ￼ ￼

This matches PRD “reliable and deterministic” requirements.  ￼

Where GenAI can fit later (without violating doctrine)

GenAI can help improve STATE fidelity, but cannot be the decision authority.

Doctrine constraints that matter:
	•	No chatbot product drift  ￼
	•	Decisions must be grounded in STATE and deterministic at the interface level (PRD quality attributes)  ￼

Safe evolution:
	•	Models produce scores/estimates that update STATE fields (confidence, decay_risk, etc.)
	•	DGE still deterministically maps STATE to decisions via explicit policies

⸻

Recommended architecture placement (minimal refactor, spec-first)

Component map to the mandatory lifecycle

flowchart LR
  S[Signal Ingestion] --> SL[(Signal Log - append-only)]
  SL --> SE[STATE Engine - deterministic mutation]
  SE --> ST[(Canonical STATE Store)]
  ST --> DGE[Decision Governance Engine - STATE evaluation + policy]
  DGE --> DR[(Decision Records - immutable)]
  DGE --> TR[(Decision Traces - immutable provenance)]
  DR --> O[Output Exposure - API/Event]
  TR --> O

Doctrine mapping:
	•	Signal ingestion + immutable signals  ￼
	•	STATE update and persistence  ￼
	•	Decision Governance (evaluate STATE)  ￼
	•	Output exposure via API/events  ￼

Modularization rule (LOE-friendly)
	•	Modular by contract first: DGE is an internal module behind an interface.
	•	Later, extract into a standalone service without breaking contracts.

This preserves IP separation while avoiding early distributed-systems overhead.

⸻

Spec-first artifacts to create next (focused on DGE seam)

1) Decision Governance Engine Interface Spec (internal)

Define a minimal interface (even if implemented in-process):
	•	Input:
	•	state_id + state_version OR full state_snapshot
	•	evaluation_context (optional: time, triggering event ref)
	•	Output:
	•	decision (type, status, urgency, TTL, expiry, learner_id, skill_id)
	•	policy_version
	•	trace_id (decision trace record ID)

The attached doc already implies these artifacts exist or should exist (decisions + decision_traces).  ￼

2) Decision and Trace Schemas (public for decision, internal depth for trace)
	•	Decision schema can be public and stable
	•	Trace schema can be internal or partially exposed via reference IDs

3) Policy packaging/versioning (internal)
	•	Externalized policy definitions
	•	Versioned policies tied to trace records (so decisions are reproducible)

⸻

Implementation reconciliation: “Interventions” and downstream ownership

The attached doc includes “interventions” as delivery containers derived from accepted decisions.  ￼

To stay doctrine-aligned:
	•	If “interventions” are created inside your repo today, treat them as output containers (derived from decisions) and ensure you do not drift into owning UX/workflow
	•	Downstream systems still own UI, rewards, dashboards, etc. (explicitly stated in the attached doc)  ￼

⸻

Gap-analysis checklist (for your coding assistant)

A) Doctrine alignment checks (hard pass/fail)
	•	Every component maps to one of: ingest signals, update STATE, govern decision, expose via API  ￼
	•	No decisions emitted without STATE grounding  ￼
	•	DGE does not enforce downstream execution  ￼
	•	No workflow engine semantics introduced (no predefined flows, no UI coupling)  ￼

B) DGE seam checks (architecture clarity)
	•	“STATE evaluation” exists as an explicit module/service boundary (not implicit code inside STATE)
	•	DGE consumes STATE snapshots/versions and produces decisions
	•	Decisions are immutable records with deterministic fields (type, TTL, expiry, etc.)  ￼
	•	Decision traces exist and bind state snapshot + policy rule + decision output  ￼

C) Spec-first checks (min refactor)
	•	STATE schema and mutation contract locked before expanding evaluation logic
	•	DGE interface stub exists even if decision logic is minimal
	•	Policies are versioned and referenced by decision_trace
	•	Replayability: same signal history produces same state; same state + policy version produces same decision

⸻

Bottom line
	1.	Doctrine already requires “STATE evaluation” and “Decision Governance”. The PRD explicitly mandates continuous STATE evaluation and decisions derived from STATE evaluation, with deterministic infrastructure-grade behavior.  ￼ ￼
	2.	The attached doc fills the missing seam with an executable model: Signals -> State -> Policy -> Decision -> (optional approval gate) -> Intervention container -> Audit/Trace, with immutable decisions and traces.  ￼ ￼
	3.	Name the subsystem Decision Governance Engine now. You do not need to change the Constitution/PRD. You only need to update architecture/spec artifacts to explicitly model the DGE boundary as the owner of STATE evaluation.
	4.	Keep DGE logic internal (IP), expose only decisions (and trace references as needed). This preserves patent separation while remaining doctrine-aligned.

If you want, I can convert the “DGE interface + schemas” into a minimal OpenAPI-first spec outline (paths + components) that matches the decision + trace artifacts described above.