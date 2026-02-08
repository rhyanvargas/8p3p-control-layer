> **SUPERSEDED (POC v1):** This document described the original 7-rule policy with non-canonical fields (`misconception_flag`, `mastery_level`, `decay_risk`, `confidence_level`). POC v1 has been scoped to a single REINFORCE rule using only `stabilityScore` (0.0–1.0) and `timeSinceReinforcement`. See `docs/specs/decision-engine.md` §4.7 and `src/decision/policies/default.json` for the current binding policy. This file is scheduled for deletion (TASK-018).

---

Default Policy Mapping for the Closed Set of 7 Decision Types (POC)

This section defines how the Decision Governance Engine (DGE) deterministically maps canonical STATE fields to the closed set of decision types:
	•	reinforce, advance, intervene, pause, escalate, recommend, reroute

Inputs (canonical STATE fields, POC):
	•	stability_score (0-100, integer)
	•	mastery_level (emerging | developing | stable)
	•	confidence_level (low | medium | high)
	•	misconception_flag (boolean)
	•	decay_risk (low | medium | high)

Policy evaluation model (deterministic):
	•	Evaluate rules in priority order (top to bottom).
	•	First matching rule returns the decision.
	•	Output includes decision_type, policy_version, and an internal trace_id.

⸻

1) Decision Governance Rule Set (POC v0)

Priority-ordered rules
	1.	escalate
	•	If confidence_level = low AND (stability_score < 40 OR misconception_flag = true)
	•	Rationale: low confidence + high risk requires human review rather than automated path change.
	2.	pause
	•	If confidence_level = low AND stability_score < 50
	•	Rationale: system is not confident enough to intervene or reroute; hold until more evidence.
	3.	reroute
	•	If misconception_flag = true AND stability_score < 60 AND confidence_level != low
	•	Rationale: persistent misconception implies current path is mismatched; change path.
	4.	intervene
	•	If stability_score < 40 AND confidence_level != low
	•	Rationale: learner is unstable; assistance required.
	5.	reinforce
	•	If stability_score >= 40 AND stability_score < 70
	•	Rationale: learner is improving but not stable; continue current path with reinforcement.
	6.	advance
	•	If stability_score >= 80 AND mastery_level = stable AND decay_risk = low AND confidence_level = high
	•	Rationale: only advance when stability is strong, mastery is stable, decay risk is low, and confidence is high.
	7.	recommend
	•	If decay_risk = high AND stability_score >= 70
	•	Rationale: learner is doing well but likely to regress; suggest targeted content without rerouting.
	8.	default
	•	Else reinforce
	•	Rationale: safe fallback that preserves continuity.

Notes:
	•	This rule set uses only the canonical fields already defined from the PDF-driven, non-AI deterministic approach.
	•	No workflows are encoded here. These are decision outputs only.

⸻

2) Canonical Mapping Table (Decision Type -> Minimal Conditions)

Decision Type	Minimal Deterministic Condition (POC)
reinforce	40 <= stability_score < 70 OR default fallback
advance	stability_score >= 80 AND mastery_level=stable AND decay_risk=low AND confidence_level=high
intervene	stability_score < 40 AND confidence_level != low
pause	confidence_level=low AND stability_score < 50
escalate	confidence_level=low AND (stability_score < 40 OR misconception_flag=true)
recommend	decay_risk=high AND stability_score >= 70
reroute	misconception_flag=true AND stability_score < 60 AND confidence_level != low


⸻

3) Implementation Guidance for Your Agentic Coding Assistant

What to implement now (minimal LOE)
	1.	Add a DGE evaluator function/module with a signature like:
	•	evaluate(state) -> { decision_type, policy_version, trace_id }
	2.	Encode the rule list above as:
	•	A priority-ordered array of predicates
	•	A deterministic first-match return

What NOT to implement now
	•	Any ML/GenAI mapping STATE -> decision
	•	Any workflow execution logic (approval flows, UI actions, LMS operations)
	•	Any new state fields beyond the canonical set (unless absolutely required by the POC demo)

Required traceability (internal)

For each decision:
	•	capture state_version (or snapshot hash)
	•	capture policy_version
	•	capture the rule ID that fired
	•	produce trace_id

⸻

If you want, paste your current policy JSON (or the existing decision logic file), and I’ll rewrite it into a drop-in deterministic evaluator that preserves your repo patterns (TypeScript, AJV/Zod, etc.) while matching this rule set.