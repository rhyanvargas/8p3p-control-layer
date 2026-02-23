/**
 * Decision Engine
 * Core evaluateState() function: validates request, evaluates policy against
 * current learner state, constructs Decision, persists it, and returns outcome.
 *
 * Contract: never throws on rejection — returns discriminated outcome.
 * Follows src/state/engine.ts patterns.
 */

import * as crypto from 'crypto';
import type {
  Decision,
  EvaluateStateForDecisionRequest,
  EvaluateDecisionOutcome,
  PolicyDefinition,
  PolicyEvaluationResult,
} from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import { validateEvaluateRequest, validateDecisionContext } from './validator.js';
import { getLoadedPolicy, getLoadedPolicyVersion, evaluatePolicy } from './policy-loader.js';
import { getState } from '../state/store.js';
import { saveDecision } from './store.js';

/**
 * Build rationale string for trace.
 * Rule match: "Rule {rule_id} fired: {field} ({actual}) {op} {threshold} AND/OR ..."
 * Default: "No rules matched. Default decision: {default_decision_type}"
 */
function buildRationale(evalResult: PolicyEvaluationResult, policy: PolicyDefinition): string {
  if (evalResult.matched_rule_id && evalResult.evaluated_fields && evalResult.evaluated_fields.length > 0) {
    const parts = evalResult.evaluated_fields.map(
      (ef) => `${ef.field} (${JSON.stringify(ef.actual_value)}) ${ef.operator} ${JSON.stringify(ef.threshold)}`
    );
    return `Rule ${evalResult.matched_rule_id} fired: ${parts.join(' AND ')}`;
  }
  return `No rules matched. Default decision: ${policy.default_decision_type}`;
}

/**
 * Evaluate learner state against the loaded policy and produce a Decision.
 *
 * Steps:
 * 1. Validate request fields
 * 2. Fetch current learner state from STATE store
 * 3. Verify state_id and state_version match (staleness check)
 * 4. Load cached policy; reject if absent
 * 5. Evaluate policy rules against state
 * 6. Construct and validate Decision
 * 7. Persist Decision
 * 8. Return outcome
 *
 * @param request - EvaluateStateForDecisionRequest
 * @returns EvaluateDecisionOutcome — { ok: true, result: Decision } or { ok: false, errors }
 */
export function evaluateState(request: EvaluateStateForDecisionRequest): EvaluateDecisionOutcome {
  // Step 1: Validate request structure
  const validation = validateEvaluateRequest(request);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  // Step 2: Fetch current learner state
  const currentState = getState(request.org_id, request.learner_reference);
  if (currentState === null) {
    return {
      ok: false,
      errors: [
        {
          code: ErrorCodes.STATE_NOT_FOUND,
          message: `No state exists for learner '${request.learner_reference}' in org '${request.org_id}'`,
          field_path: 'learner_reference',
        },
      ],
    };
  }

  // Step 3: Verify state_id and state_version match (staleness guard)
  if (
    currentState.state_id !== request.state_id ||
    currentState.state_version !== request.state_version
  ) {
    return {
      ok: false,
      errors: [
        {
          code: ErrorCodes.TRACE_STATE_MISMATCH,
          message: `State mismatch: expected state_id='${request.state_id}' version=${request.state_version}, ` +
            `found state_id='${currentState.state_id}' version=${currentState.state_version}`,
          field_path: 'state_id',
        },
      ],
    };
  }

  // Step 4: Load cached policy
  const policy = getLoadedPolicy();
  if (policy === null) {
    return {
      ok: false,
      errors: [
        {
          code: ErrorCodes.POLICY_NOT_FOUND,
          message: 'No policy loaded. Call loadPolicy before evaluateState.',
          field_path: undefined,
        },
      ],
    };
  }

  let policyVersion: string;
  try {
    policyVersion = getLoadedPolicyVersion();
  } catch {
    return {
      ok: false,
      errors: [
        {
          code: ErrorCodes.POLICY_NOT_FOUND,
          message: 'No policy loaded. Call loadPolicy before evaluateState.',
          field_path: undefined,
        },
      ],
    };
  }

  // Step 5: Evaluate policy rules against state
  const evalResult = evaluatePolicy(currentState.state, policy);

  // Step 6: Build state_snapshot (frozen copy of state at evaluation time)
  const stateSnapshot = JSON.parse(JSON.stringify(currentState.state)) as Record<string, unknown>;

  // Step 7: Build rationale string
  const rationale = buildRationale(evalResult, policy);

  // Step 8: Build output_metadata (priority = 1-based rule index when rule matches)
  let priority: number | null = null;
  if (evalResult.matched_rule_id) {
    const idx = policy.rules.findIndex((r) => r.rule_id === evalResult.matched_rule_id);
    if (idx >= 0) priority = idx + 1;
  }

  // Step 9: Build decision_context (empty object for Phase 1)
  const decisionContext: Record<string, unknown> = {};

  // Step 10: Validate decision_context
  const contextValidation = validateDecisionContext(decisionContext);
  if (!contextValidation.valid) {
    return { ok: false, errors: contextValidation.errors };
  }

  // Step 11: Construct Decision
  const decision: Decision = {
    org_id: request.org_id,
    decision_id: crypto.randomUUID(),
    learner_reference: request.learner_reference,
    decision_type: evalResult.decision_type,
    decided_at: new Date().toISOString(),
    decision_context: decisionContext,
    trace: {
      state_id: currentState.state_id,
      state_version: currentState.state_version,
      policy_version: policyVersion,
      matched_rule_id: evalResult.matched_rule_id,
      state_snapshot: stateSnapshot,
      matched_rule: evalResult.matched_rule ?? null,
      rationale,
    },
    output_metadata: { priority },
  };

  // Step 12: Persist Decision
  saveDecision(decision);

  // Step 13: Return success
  return { ok: true, result: decision };
}
