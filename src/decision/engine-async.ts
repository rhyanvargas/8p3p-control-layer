/**
 * Async decision evaluation for Lambda (DynamoDB state + decision stores).
 */

import * as crypto from 'crypto';
import type {
  Decision,
  EvaluateStateForDecisionRequest,
  EvaluateDecisionOutcome,
  LearnerState,
} from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';
import { validateEvaluateRequest, validateDecisionContext } from './validator.js';
import { loadPolicyForContext, evaluatePolicy } from './policy-loader.js';
import { extractCanonicalSnapshot, buildRationale } from './engine.js';
import { DECISION_TYPE_TO_EDUCATOR_SUMMARY } from './educator-summaries.js';

export interface EvaluateStateAsyncPort {
  getState(orgId: string, learnerReference: string): Promise<LearnerState | null>;
  saveDecision(decision: Decision): Promise<void>;
}

export async function evaluateStateAsync(
  request: EvaluateStateForDecisionRequest,
  port: EvaluateStateAsyncPort
): Promise<EvaluateDecisionOutcome> {
  const validation = validateEvaluateRequest(request);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const currentState = await port.getState(request.org_id, request.learner_reference);
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

  if (
    currentState.state_id !== request.state_id ||
    currentState.state_version !== request.state_version
  ) {
    return {
      ok: false,
      errors: [
        {
          code: ErrorCodes.TRACE_STATE_MISMATCH,
          message:
            `State mismatch: expected state_id='${request.state_id}' version=${request.state_version}, ` +
            `found state_id='${currentState.state_id}' version=${currentState.state_version}`,
          field_path: 'state_id',
        },
      ],
    };
  }

  const userType = request.user_type ?? 'learner';
  let policy;
  let policyVersion: string;
  try {
    policy = loadPolicyForContext(request.org_id, userType);
    policyVersion = policy.policy_version;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return {
      ok: false,
      errors: [
        {
          code: e.code ?? ErrorCodes.POLICY_NOT_FOUND,
          message: e.message ?? 'Policy could not be loaded for this context.',
          field_path: undefined,
        },
      ],
    };
  }

  const evalResult = evaluatePolicy(currentState.state, policy);

  if (evalResult.decision_type === null) {
    return { ok: true, matched: false };
  }

  const stateSnapshot = extractCanonicalSnapshot(currentState.state, policy);
  const rationale = buildRationale(evalResult);

  let priority: number | null = null;
  if (evalResult.matched_rule_id) {
    const idx = policy.rules.findIndex((r) => r.rule_id === evalResult.matched_rule_id);
    if (idx >= 0) priority = idx + 1;
  }

  const decisionContext: Record<string, unknown> = {};
  if (request.signal_context?.skill) decisionContext['skill'] = request.signal_context.skill;
  if (request.signal_context?.assessment_type) {
    decisionContext['assessment_type'] = request.signal_context.assessment_type;
  }
  if (request.signal_context?.school_id) decisionContext['school_id'] = request.signal_context.school_id;

  const contextValidation = validateDecisionContext(decisionContext);
  if (!contextValidation.valid) {
    return { ok: false, errors: contextValidation.errors };
  }

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
      policy_id: policy.policy_id,
      policy_version: policyVersion,
      matched_rule_id: evalResult.matched_rule_id,
      state_snapshot: stateSnapshot,
      matched_rule: evalResult.matched_rule ?? null,
      rationale,
      educator_summary: DECISION_TYPE_TO_EDUCATOR_SUMMARY[evalResult.decision_type],
    },
    output_metadata: { priority },
  };

  await port.saveDecision(decision);
  return { ok: true, matched: true, result: decision };
}
