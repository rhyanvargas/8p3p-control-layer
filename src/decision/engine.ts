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
} from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import { validateEvaluateRequest, validateDecisionContext } from './validator.js';
import { getLoadedPolicy, getLoadedPolicyVersion, evaluatePolicy } from './policy-loader.js';
import { getState } from '../state/store.js';
import { saveDecision } from './store.js';

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

  // Step 6: Build decision_context (empty object for Phase 1)
  const decisionContext: Record<string, unknown> = {};

  // Step 7: Validate decision_context
  const contextValidation = validateDecisionContext(decisionContext);
  if (!contextValidation.valid) {
    return { ok: false, errors: contextValidation.errors };
  }

  // Step 8: Construct Decision
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
    },
  };

  // Step 9: Persist Decision
  saveDecision(decision);

  // Step 10: Return success
  return { ok: true, result: decision };
}
