/**
 * Unit tests for Policy Loader
 * Condition evaluation, policy loading, validation, and caching
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  loadPolicy,
  evaluateCondition,
  evaluatePolicy,
  getLoadedPolicyVersion,
  getLoadedPolicy,
} from '../../src/decision/policy-loader.js';
import type {
  ConditionNode,
  PolicyDefinition,
} from '../../src/shared/types.js';
import { ErrorCodes } from '../../src/shared/error-codes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write a temporary JSON policy file and return its path */
function writeTempPolicy(content: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-test-'));
  const filePath = path.join(dir, 'policy.json');
  fs.writeFileSync(filePath, JSON.stringify(content), 'utf-8');
  return filePath;
}

function validPolicy(overrides: Partial<PolicyDefinition> = {}): PolicyDefinition {
  return {
    policy_id: 'test',
    policy_version: '1',
    description: 'Test policy',
    rules: [],
    default_decision_type: 'reinforce',
    ...overrides,
  } as PolicyDefinition;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Policy Loader', () => {
  // -----------------------------------------------------------------------
  // loadPolicy
  // -----------------------------------------------------------------------
  describe('loadPolicy', () => {
    it('should load default.json successfully and return a valid PolicyDefinition', () => {
      const defaultPath = path.join(process.cwd(), 'src/decision/policies/default.json');
      const policy = loadPolicy(defaultPath);
      expect(policy).toBeDefined();
      expect(policy.policy_id).toBe('default');
      expect(policy.policy_version).toBe('1');
      expect(policy.rules).toBeInstanceOf(Array);
      expect(policy.rules.length).toBeGreaterThan(0);
      expect(policy.default_decision_type).toBe('reinforce');
    });

    it('should throw with policy_not_found when file does not exist', () => {
      try {
        loadPolicy('/nonexistent/path/no-policy.json');
        expect.unreachable('should have thrown');
      } catch (err) {
        const e = err as Error & { code: string };
        expect(e.code).toBe(ErrorCodes.POLICY_NOT_FOUND);
      }
    });

    it('should throw on invalid JSON', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-test-'));
      const filePath = path.join(dir, 'bad.json');
      fs.writeFileSync(filePath, '{ not valid json !!!', 'utf-8');

      expect(() => loadPolicy(filePath)).toThrow();
    });

    it('should throw with invalid_decision_type when a rule has invalid decision_type', () => {
      const policyPath = writeTempPolicy({
        policy_id: 'test',
        policy_version: '1',
        description: 'bad rule',
        rules: [
          {
            rule_id: 'r1',
            condition: { field: 'x', operator: 'eq', value: 1 },
            decision_type: 'promote', // invalid
          },
        ],
        default_decision_type: 'reinforce',
      });

      try {
        loadPolicy(policyPath);
        expect.unreachable('should have thrown');
      } catch (err) {
        const e = err as Error & { code: string };
        expect(e.code).toBe(ErrorCodes.INVALID_DECISION_TYPE);
      }
    });

    it('should throw with invalid_decision_type when default_decision_type is invalid', () => {
      const policyPath = writeTempPolicy({
        policy_id: 'test',
        policy_version: '1',
        description: 'bad default',
        rules: [],
        default_decision_type: 'nope',
      });

      try {
        loadPolicy(policyPath);
        expect.unreachable('should have thrown');
      } catch (err) {
        const e = err as Error & { code: string };
        expect(e.code).toBe(ErrorCodes.INVALID_DECISION_TYPE);
      }
    });

    it('should throw when rule_ids are duplicated', () => {
      const policyPath = writeTempPolicy({
        policy_id: 'test',
        policy_version: '1',
        description: 'dupe rules',
        rules: [
          {
            rule_id: 'same-id',
            condition: { field: 'x', operator: 'eq', value: 1 },
            decision_type: 'reinforce',
          },
          {
            rule_id: 'same-id',
            condition: { field: 'y', operator: 'eq', value: 2 },
            decision_type: 'advance',
          },
        ],
        default_decision_type: 'reinforce',
      });

      expect(() => loadPolicy(policyPath)).toThrow(/Duplicate rule_id/);
    });

    it('should cache the loaded policy', () => {
      const defaultPath = path.join(process.cwd(), 'src/decision/policies/default.json');
      loadPolicy(defaultPath);
      const cached = getLoadedPolicy();
      expect(cached).not.toBeNull();
      expect(cached!.policy_id).toBe('default');
    });
  });

  // -----------------------------------------------------------------------
  // getLoadedPolicyVersion
  // -----------------------------------------------------------------------
  describe('getLoadedPolicyVersion', () => {
    it('should return cached version after loadPolicy', () => {
      const defaultPath = path.join(process.cwd(), 'src/decision/policies/default.json');
      loadPolicy(defaultPath);
      expect(getLoadedPolicyVersion()).toBe('1');
    });
  });

  // -----------------------------------------------------------------------
  // evaluateCondition — leaf
  // -----------------------------------------------------------------------
  describe('evaluateCondition — leaf', () => {
    it('eq: returns true when values match (number)', () => {
      const node: ConditionNode = { field: 'score', operator: 'eq', value: 10 };
      expect(evaluateCondition({ score: 10 }, node)).toBe(true);
    });

    it('eq: returns false when values differ', () => {
      const node: ConditionNode = { field: 'score', operator: 'eq', value: 10 };
      expect(evaluateCondition({ score: 11 }, node)).toBe(false);
    });

    it('eq: strict comparison (string vs number)', () => {
      const node: ConditionNode = { field: 'score', operator: 'eq', value: '10' };
      expect(evaluateCondition({ score: 10 }, node)).toBe(false);
    });

    it('eq: works with strings', () => {
      const node: ConditionNode = { field: 'status', operator: 'eq', value: 'active' };
      expect(evaluateCondition({ status: 'active' }, node)).toBe(true);
      expect(evaluateCondition({ status: 'inactive' }, node)).toBe(false);
    });

    it('eq: works with booleans', () => {
      const node: ConditionNode = { field: 'enrolled', operator: 'eq', value: true };
      expect(evaluateCondition({ enrolled: true }, node)).toBe(true);
      expect(evaluateCondition({ enrolled: false }, node)).toBe(false);
    });

    it('neq: returns true when values differ', () => {
      const node: ConditionNode = { field: 'level', operator: 'neq', value: 5 };
      expect(evaluateCondition({ level: 3 }, node)).toBe(true);
    });

    it('neq: returns false when values match', () => {
      const node: ConditionNode = { field: 'level', operator: 'neq', value: 5 };
      expect(evaluateCondition({ level: 5 }, node)).toBe(false);
    });

    it('gt: returns true when state > value', () => {
      const node: ConditionNode = { field: 'score', operator: 'gt', value: 50 };
      expect(evaluateCondition({ score: 51 }, node)).toBe(true);
    });

    it('gt: returns false when state <= value', () => {
      const node: ConditionNode = { field: 'score', operator: 'gt', value: 50 };
      expect(evaluateCondition({ score: 50 }, node)).toBe(false);
      expect(evaluateCondition({ score: 49 }, node)).toBe(false);
    });

    it('gte: returns true when state >= value', () => {
      const node: ConditionNode = { field: 'score', operator: 'gte', value: 50 };
      expect(evaluateCondition({ score: 50 }, node)).toBe(true);
      expect(evaluateCondition({ score: 51 }, node)).toBe(true);
    });

    it('gte: returns false when state < value', () => {
      const node: ConditionNode = { field: 'score', operator: 'gte', value: 50 };
      expect(evaluateCondition({ score: 49 }, node)).toBe(false);
    });

    it('lt: returns true when state < value', () => {
      const node: ConditionNode = { field: 'score', operator: 'lt', value: 50 };
      expect(evaluateCondition({ score: 49 }, node)).toBe(true);
    });

    it('lt: returns false when state >= value', () => {
      const node: ConditionNode = { field: 'score', operator: 'lt', value: 50 };
      expect(evaluateCondition({ score: 50 }, node)).toBe(false);
    });

    it('lte: returns true when state <= value', () => {
      const node: ConditionNode = { field: 'score', operator: 'lte', value: 50 };
      expect(evaluateCondition({ score: 50 }, node)).toBe(true);
      expect(evaluateCondition({ score: 49 }, node)).toBe(true);
    });

    it('lte: returns false when state > value', () => {
      const node: ConditionNode = { field: 'score', operator: 'lte', value: 50 };
      expect(evaluateCondition({ score: 51 }, node)).toBe(false);
    });

    it('returns false when field is undefined in state', () => {
      const node: ConditionNode = { field: 'missing', operator: 'eq', value: 1 };
      expect(evaluateCondition({}, node)).toBe(false);
    });

    it('returns false for non-numeric operand with gt', () => {
      const node: ConditionNode = { field: 'name', operator: 'gt', value: 5 };
      expect(evaluateCondition({ name: 'alice' }, node)).toBe(false);
    });

    it('returns false for non-numeric operand with gte', () => {
      const node: ConditionNode = { field: 'name', operator: 'gte', value: 5 };
      expect(evaluateCondition({ name: 'bob' }, node)).toBe(false);
    });

    it('returns false for non-numeric operand with lt', () => {
      const node: ConditionNode = { field: 'name', operator: 'lt', value: 5 };
      expect(evaluateCondition({ name: 'charlie' }, node)).toBe(false);
    });

    it('returns false for non-numeric operand with lte', () => {
      const node: ConditionNode = { field: 'name', operator: 'lte', value: 5 };
      expect(evaluateCondition({ name: 'dave' }, node)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // evaluateCondition — all (compound AND)
  // -----------------------------------------------------------------------
  describe('evaluateCondition — all (compound AND)', () => {
    it('returns true when all children match', () => {
      const node: ConditionNode = {
        all: [
          { field: 'a', operator: 'eq', value: 1 },
          { field: 'b', operator: 'eq', value: 2 },
        ],
      };
      expect(evaluateCondition({ a: 1, b: 2 }, node)).toBe(true);
    });

    it('returns false when one child fails', () => {
      const node: ConditionNode = {
        all: [
          { field: 'a', operator: 'eq', value: 1 },
          { field: 'b', operator: 'eq', value: 99 },
        ],
      };
      expect(evaluateCondition({ a: 1, b: 2 }, node)).toBe(false);
    });

    it('short-circuits on first false child', () => {
      // The second child references an undefined field, but the first should fail first
      const node: ConditionNode = {
        all: [
          { field: 'x', operator: 'eq', value: 999 },
          { field: 'undefined_field', operator: 'eq', value: 1 },
        ],
      };
      // First child fails → false (doesn't even evaluate second)
      expect(evaluateCondition({ x: 0 }, node)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // evaluateCondition — any (compound OR)
  // -----------------------------------------------------------------------
  describe('evaluateCondition — any (compound OR)', () => {
    it('returns true when at least one child matches', () => {
      const node: ConditionNode = {
        any: [
          { field: 'a', operator: 'eq', value: 1 },
          { field: 'b', operator: 'eq', value: 99 },
        ],
      };
      expect(evaluateCondition({ a: 1, b: 2 }, node)).toBe(true);
    });

    it('returns false when no children match', () => {
      const node: ConditionNode = {
        any: [
          { field: 'a', operator: 'eq', value: 99 },
          { field: 'b', operator: 'eq', value: 99 },
        ],
      };
      expect(evaluateCondition({ a: 1, b: 2 }, node)).toBe(false);
    });

    it('short-circuits on first true child', () => {
      const node: ConditionNode = {
        any: [
          { field: 'a', operator: 'eq', value: 1 },
          { field: 'undefined_field', operator: 'eq', value: 1 },
        ],
      };
      // First child matches → true immediately
      expect(evaluateCondition({ a: 1 }, node)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // evaluateCondition — nested compound
  // -----------------------------------------------------------------------
  describe('evaluateCondition — nested compound', () => {
    it('all containing any: true when outer all holds and inner any has a match', () => {
      const node: ConditionNode = {
        all: [
          { field: 'score', operator: 'gte', value: 50 },
          {
            any: [
              { field: 'level', operator: 'eq', value: 3 },
              { field: 'level', operator: 'eq', value: 5 },
            ],
          },
        ],
      };
      expect(evaluateCondition({ score: 60, level: 5 }, node)).toBe(true);
    });

    it('all containing any: false when inner any has no match', () => {
      const node: ConditionNode = {
        all: [
          { field: 'score', operator: 'gte', value: 50 },
          {
            any: [
              { field: 'level', operator: 'eq', value: 3 },
              { field: 'level', operator: 'eq', value: 5 },
            ],
          },
        ],
      };
      expect(evaluateCondition({ score: 60, level: 7 }, node)).toBe(false);
    });

    it('any containing all: true when at least one inner all matches', () => {
      const node: ConditionNode = {
        any: [
          {
            all: [
              { field: 'a', operator: 'eq', value: 1 },
              { field: 'b', operator: 'eq', value: 2 },
            ],
          },
          {
            all: [
              { field: 'c', operator: 'eq', value: 3 },
              { field: 'd', operator: 'eq', value: 4 },
            ],
          },
        ],
      };
      // Only second inner-all matches
      expect(evaluateCondition({ a: 99, b: 99, c: 3, d: 4 }, node)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // evaluatePolicy
  // -----------------------------------------------------------------------
  describe('evaluatePolicy', () => {
    it('first matching rule wins (ordering matters)', () => {
      const policy: PolicyDefinition = {
        policy_id: 'p',
        policy_version: '1',
        description: 'test',
        rules: [
          {
            rule_id: 'rule-A',
            condition: { field: 'score', operator: 'lt', value: 50 },
            decision_type: 'intervene',
          },
          {
            rule_id: 'rule-B',
            condition: { field: 'score', operator: 'lt', value: 80 },
            decision_type: 'reinforce',
          },
        ],
        default_decision_type: 'advance',
      };

      // score=30 matches both rules; first one (rule-A) should win
      const result = evaluatePolicy({ score: 30 }, policy);
      expect(result.decision_type).toBe('intervene');
      expect(result.matched_rule_id).toBe('rule-A');
    });

    it('returns default_decision_type with null matched_rule_id when no rule matches', () => {
      const policy: PolicyDefinition = {
        policy_id: 'p',
        policy_version: '1',
        description: 'test',
        rules: [
          {
            rule_id: 'rule-A',
            condition: { field: 'score', operator: 'lt', value: 10 },
            decision_type: 'intervene',
          },
        ],
        default_decision_type: 'advance',
      };

      const result = evaluatePolicy({ score: 100 }, policy);
      expect(result.decision_type).toBe('advance');
      expect(result.matched_rule_id).toBeNull();
    });

    it('returns correct matched_rule_id on match', () => {
      const policy: PolicyDefinition = {
        policy_id: 'p',
        policy_version: '1',
        description: 'test',
        rules: [
          {
            rule_id: 'specific-rule',
            condition: { field: 'flag', operator: 'eq', value: true },
            decision_type: 'pause',
          },
        ],
        default_decision_type: 'reinforce',
      };

      const result = evaluatePolicy({ flag: true }, policy);
      expect(result.decision_type).toBe('pause');
      expect(result.matched_rule_id).toBe('specific-rule');
    });

    it('evaluates default.json policy correctly with matching state', () => {
      const defaultPath = path.join(process.cwd(), 'src/decision/policies/default.json');
      const policy = loadPolicy(defaultPath);

      // stabilityScore < 0.7 AND timeSinceReinforcement > 86400 → reinforce (rule-reinforce)
      const result = evaluatePolicy(
        { stabilityScore: 0.5, timeSinceReinforcement: 100000 },
        policy
      );
      expect(result.decision_type).toBe('reinforce');
      expect(result.matched_rule_id).toBe('rule-reinforce');
    });

    it('evaluates default.json policy correctly with non-matching state (falls to default)', () => {
      const defaultPath = path.join(process.cwd(), 'src/decision/policies/default.json');
      const policy = loadPolicy(defaultPath);

      // stabilityScore >= 0.7 → no rule matches → default_decision_type (reinforce)
      const result = evaluatePolicy(
        { stabilityScore: 0.9, timeSinceReinforcement: 100000 },
        policy
      );
      expect(result.decision_type).toBe('reinforce');
      expect(result.matched_rule_id).toBeNull();
    });
  });
});
