/**
 * Policy Loader
 * Loads policy JSON, validates structure, and evaluates conditions against state.
 * Uses a module-level cached policy (singleton pattern).
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  ConditionAll,
  ConditionAny,
  ConditionLeaf,
  ConditionNode,
  PolicyDefinition,
  PolicyEvaluationResult,
  PolicyRule,
} from '../shared/types.js';
import { DECISION_TYPES } from '../shared/types.js';
import { ErrorCodes } from '../shared/error-codes.js';

const VALID_OPERATORS: readonly ConditionLeaf['operator'][] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
] as const;

let cachedPolicy: PolicyDefinition | null = null;

function isConditionLeaf(node: ConditionNode): node is ConditionLeaf {
  return 'field' in node && 'operator' in node && 'value' in node;
}

function isConditionAll(node: ConditionNode): node is ConditionAll {
  return 'all' in node && Array.isArray((node as ConditionAll).all);
}

function isConditionAny(node: ConditionNode): node is ConditionAny {
  return 'any' in node && Array.isArray((node as ConditionAny).any);
}

/**
 * Throws an Error with a canonical code property for loadPolicy validation failures.
 */
function throwPolicyError(code: string, message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  throw err;
}

/**
 * Validates a condition node (structure only). Throws on invalid structure.
 * - Leaf: must have field, operator in closed set, value.
 * - Compound (all/any): must have ≥2 children; no mixed leaf/compound (each child is one kind).
 */
function validateConditionNode(node: unknown, pathPrefix: string): void {
  if (node === null || typeof node !== 'object') {
    throwPolicyError(ErrorCodes.INVALID_TYPE, `${pathPrefix}: condition node must be an object`);
  }
  const obj = node as Record<string, unknown>;
  const hasField = 'field' in obj;
  const hasAll = 'all' in obj;
  const hasAny = 'any' in obj;
  const count = [hasField, hasAll, hasAny].filter(Boolean).length;
  if (count !== 1) {
    throwPolicyError(
      ErrorCodes.INVALID_TYPE,
      `${pathPrefix}: condition node must be exactly one of leaf (field/operator/value), all, or any`
    );
  }
  if (hasField) {
    const valueOk =
      typeof obj.value === 'string' || typeof obj.value === 'number' || typeof obj.value === 'boolean';
    if (
      typeof obj.field !== 'string' ||
      !VALID_OPERATORS.includes(obj.operator as ConditionLeaf['operator']) ||
      !valueOk
    ) {
      throwPolicyError(
        ErrorCodes.INVALID_TYPE,
        `${pathPrefix}: leaf must have field (string), operator (eq|neq|gt|gte|lt|lte), value (string|number|boolean)`
      );
    }
    return;
  }
  if (hasAll) {
    const children = obj.all as unknown[];
    if (!Array.isArray(children) || children.length < 2) {
      throwPolicyError(
        ErrorCodes.INVALID_TYPE,
        `${pathPrefix}: "all" must have at least 2 children`
      );
    }
    children.forEach((child, i) => validateConditionNode(child, `${pathPrefix}.all[${i}]`));
    return;
  }
  if (hasAny) {
    const children = obj.any as unknown[];
    if (!Array.isArray(children) || children.length < 2) {
      throwPolicyError(
        ErrorCodes.INVALID_TYPE,
        `${pathPrefix}: "any" must have at least 2 children`
      );
    }
    children.forEach((child, i) => validateConditionNode(child, `${pathPrefix}.any[${i}]`));
  }
}

/**
 * Validates a loaded policy structure. Throws on invalid structure.
 */
function validatePolicyStructure(raw: unknown): asserts raw is PolicyDefinition {
  if (raw === null || typeof raw !== 'object') {
    throwPolicyError(ErrorCodes.INVALID_TYPE, 'Policy must be a JSON object');
  }
  const policy = raw as Record<string, unknown>;
  if (
    typeof policy.policy_id !== 'string' ||
    typeof policy.policy_version !== 'string' ||
    typeof policy.description !== 'string' ||
    !Array.isArray(policy.rules) ||
    typeof policy.default_decision_type !== 'string'
  ) {
    throwPolicyError(
      ErrorCodes.INVALID_TYPE,
      'Policy must have policy_id, policy_version, description (strings), rules (array), default_decision_type (string)'
    );
  }
  if (!DECISION_TYPES.includes(policy.default_decision_type as Parameters<typeof DECISION_TYPES.includes>[0])) {
    throwPolicyError(
      ErrorCodes.INVALID_DECISION_TYPE,
      `default_decision_type must be one of: ${DECISION_TYPES.join(', ')}`
    );
  }
  const seenRuleIds = new Set<string>();
  policy.rules.forEach((rule: unknown, index: number) => {
    if (rule === null || typeof rule !== 'object') {
      throwPolicyError(ErrorCodes.INVALID_TYPE, `rules[${index}] must be an object`);
    }
    const r = rule as Record<string, unknown>;
    if (typeof r.rule_id !== 'string') {
      throwPolicyError(ErrorCodes.INVALID_TYPE, `rules[${index}].rule_id must be a string`);
    }
    if (seenRuleIds.has(r.rule_id)) {
      throwPolicyError(ErrorCodes.INVALID_TYPE, `Duplicate rule_id: ${r.rule_id}`);
    }
    seenRuleIds.add(r.rule_id);
    if (!DECISION_TYPES.includes(r.decision_type as Parameters<typeof DECISION_TYPES.includes>[0])) {
      throwPolicyError(
        ErrorCodes.INVALID_DECISION_TYPE,
        `rules[${index}].decision_type must be one of: ${DECISION_TYPES.join(', ')}`
      );
    }
    if (r.condition === undefined) {
      throwPolicyError(ErrorCodes.INVALID_TYPE, `rules[${index}].condition is required`);
    }
    validateConditionNode(r.condition, `rules[${index}].condition`);
  });
}

/**
 * Evaluates a single condition node against state (internal helper).
 * - Leaf: strict comparison; undefined field → false; non-numeric for gt/gte/lt/lte → false.
 * - all: every child true (short-circuit on false).
 * - any: at least one child true (short-circuit on true).
 */
export function evaluateCondition(state: Record<string, unknown>, node: ConditionNode): boolean {
  if (isConditionLeaf(node)) {
    const raw = state[node.field];
    if (raw === undefined) return false;
    const { operator, value } = node;
    switch (operator) {
      case 'eq':
        return raw === value;
      case 'neq':
        return raw !== value;
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        const numState = Number(raw);
        const numValue = Number(value);
        if (Number.isNaN(numState) || Number.isNaN(numValue)) return false;
        switch (operator) {
          case 'gt':
            return numState > numValue;
          case 'gte':
            return numState >= numValue;
          case 'lt':
            return numState < numValue;
          case 'lte':
            return numState <= numValue;
          default:
            return false;
        }
      }
      default:
        return false;
    }
  }
  if (isConditionAll(node)) {
    for (const child of node.all) {
      if (!evaluateCondition(state, child)) return false;
    }
    return true;
  }
  if (isConditionAny(node)) {
    for (const child of node.any) {
      if (evaluateCondition(state, child)) return true;
    }
    return false;
  }
  return false;
}

/**
 * Loads policy from JSON file, validates structure, and caches it.
 * Default path: DECISION_POLICY_PATH env or cwd/src/decision/policies/default.json.
 * @throws Error with code policy_not_found if file is missing
 * @throws Error with code invalid_decision_type if any decision_type is invalid
 * @throws Error (or SyntaxError from JSON.parse) on invalid JSON
 */
export function loadPolicy(policyPath?: string): PolicyDefinition {
  const pathToLoad =
    policyPath ?? process.env.DECISION_POLICY_PATH ?? path.join(process.cwd(), 'src/decision/policies/default.json');
  let content: string;
  try {
    content = fs.readFileSync(pathToLoad, 'utf-8');
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr?.code === 'ENOENT') {
      const e = new Error(`Policy file not found: ${pathToLoad}`) as Error & { code: string };
      e.code = ErrorCodes.POLICY_NOT_FOUND;
      throw e;
    }
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throwPolicyError(ErrorCodes.INVALID_FORMAT, 'Policy file is not valid JSON');
  }
  validatePolicyStructure(raw);
  cachedPolicy = raw;
  return cachedPolicy;
}

/**
 * Evaluates state against policy rules in order. First matching rule wins.
 * If no rule matches, returns default_decision_type with matched_rule_id null.
 */
export function evaluatePolicy(state: Record<string, unknown>, policy: PolicyDefinition): PolicyEvaluationResult {
  for (const rule of policy.rules) {
    if (evaluateCondition(state, rule.condition)) {
      return { decision_type: rule.decision_type, matched_rule_id: rule.rule_id };
    }
  }
  return {
    decision_type: policy.default_decision_type,
    matched_rule_id: null,
  };
}

/**
 * Returns the version string of the currently cached policy.
 * @throws Error if no policy has been loaded
 */
export function getLoadedPolicyVersion(): string {
  if (cachedPolicy === null) {
    const err = new Error('No policy loaded. Call loadPolicy first.') as Error & { code: string };
    err.code = ErrorCodes.POLICY_NOT_FOUND;
    throw err;
  }
  return cachedPolicy.policy_version;
}

/**
 * Returns the currently loaded policy (for tests). Null if not loaded.
 */
export function getLoadedPolicy(): PolicyDefinition | null {
  return cachedPolicy;
}
