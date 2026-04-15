/**
 * Unit tests for the restricted transform expression engine.
 * @see src/config/transform-expression.ts
 * @see docs/specs/tenant-field-mappings.md §Restricted Transform Expression Grammar
 */

import { describe, it, expect } from 'vitest';
import { validateTransformExpression, evaluateTransform } from '../../src/config/transform-expression.js';

// ---------------------------------------------------------------------------
// validateTransformExpression
// ---------------------------------------------------------------------------

describe('validateTransformExpression — allowed forms', () => {
  it('accepts a numeric literal', () => {
    expect(validateTransformExpression('42').ok).toBe(true);
  });

  it('accepts `value` variable', () => {
    expect(validateTransformExpression('value').ok).toBe(true);
  });

  it('accepts simple division', () => {
    expect(validateTransformExpression('value / 100').ok).toBe(true);
  });

  it('accepts addition', () => {
    expect(validateTransformExpression('value + 10').ok).toBe(true);
  });

  it('accepts subtraction', () => {
    expect(validateTransformExpression('value - 5').ok).toBe(true);
  });

  it('accepts multiplication', () => {
    expect(validateTransformExpression('value * 2').ok).toBe(true);
  });

  it('accepts parenthesised expression', () => {
    expect(validateTransformExpression('(value + 1) * 2').ok).toBe(true);
  });

  it('accepts Math.round', () => {
    expect(validateTransformExpression('Math.round(value)').ok).toBe(true);
  });

  it('accepts Math.min', () => {
    expect(validateTransformExpression('Math.min(value, 1)').ok).toBe(true);
  });

  it('accepts Math.max', () => {
    expect(validateTransformExpression('Math.max(value, 0)').ok).toBe(true);
  });

  it('accepts chained Math.min/max clamp', () => {
    expect(validateTransformExpression('Math.min(Math.max(value / 100, 0), 1)').ok).toBe(true);
  });

  it('accepts unary negation', () => {
    expect(validateTransformExpression('-value').ok).toBe(true);
  });

  it('accepts decimal numeric literal', () => {
    expect(validateTransformExpression('value * 0.01').ok).toBe(true);
  });
});

describe('validateTransformExpression — forbidden forms', () => {
  it('rejects eval(...)', () => {
    const result = validateTransformExpression("eval('process')");
    expect(result.ok).toBe(false);
  });

  it('rejects unknown identifier "score" (default allowedVariables is value only)', () => {
    const result = validateTransformExpression('score / 100');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('score');
    }
  });

  it('accepts score/total when allowedVariables includes both (multi-source)', () => {
    expect(validateTransformExpression('score / total', ['score', 'total']).ok).toBe(true);
  });

  it('rejects value in expression when multi-source allowedVariables omit value', () => {
    const result = validateTransformExpression('value / total', ['total']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('value');
    }
  });

  it('rejects bracket access', () => {
    const result = validateTransformExpression('value[0]');
    expect(result.ok).toBe(false);
  });

  it('rejects template literal', () => {
    const result = validateTransformExpression('`${value}`');
    expect(result.ok).toBe(false);
  });

  it('rejects string literal', () => {
    const result = validateTransformExpression('"hello"');
    expect(result.ok).toBe(false);
  });

  it('rejects new keyword', () => {
    const result = validateTransformExpression('new Date()');
    expect(result.ok).toBe(false);
  });

  it('rejects process access', () => {
    const result = validateTransformExpression('process.env.SECRET');
    expect(result.ok).toBe(false);
  });

  it('rejects arrow function', () => {
    const result = validateTransformExpression('x => x');
    expect(result.ok).toBe(false);
  });

  it('rejects Math.abs (not in whitelist)', () => {
    const result = validateTransformExpression('Math.abs(value)');
    expect(result.ok).toBe(false);
  });

  it('returns a descriptive message on failure', () => {
    const result = validateTransformExpression("eval('x')");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBeDefined();
      expect(typeof result.message).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// evaluateTransform
// ---------------------------------------------------------------------------

describe('evaluateTransform — correctness', () => {
  it('divides value by 100', () => {
    expect(evaluateTransform('value / 100', 65)).toBe(0.65);
  });

  it('multiplies value by 2', () => {
    expect(evaluateTransform('value * 2', 5)).toBe(10);
  });

  it('adds constant', () => {
    expect(evaluateTransform('value + 10', 5)).toBe(15);
  });

  it('subtracts constant', () => {
    expect(evaluateTransform('value - 3', 10)).toBe(7);
  });

  it('returns numeric literal (ignores value)', () => {
    expect(evaluateTransform('42', 0)).toBe(42);
  });

  it('Math.round rounds down', () => {
    expect(evaluateTransform('Math.round(value)', 1.4)).toBe(1);
  });

  it('Math.round rounds up', () => {
    expect(evaluateTransform('Math.round(value)', 1.6)).toBe(2);
  });

  it('Math.min clamps at upper bound', () => {
    expect(evaluateTransform('Math.min(value, 1)', 1.5)).toBe(1);
  });

  it('Math.max clamps at lower bound', () => {
    expect(evaluateTransform('Math.max(value, 0)', -0.5)).toBe(0);
  });

  it('clamp 0–1 expression', () => {
    expect(evaluateTransform('Math.min(Math.max(value / 100, 0), 1)', 65)).toBeCloseTo(0.65);
    expect(evaluateTransform('Math.min(Math.max(value / 100, 0), 1)', 150)).toBe(1);
    expect(evaluateTransform('Math.min(Math.max(value / 100, 0), 1)', -10)).toBe(0);
  });

  it('unary negation', () => {
    expect(evaluateTransform('-value', 5)).toBe(-5);
  });

  it('respects operator precedence (* before +)', () => {
    expect(evaluateTransform('value * 2 + 3', 4)).toBe(11);
  });

  it('parentheses override precedence', () => {
    expect(evaluateTransform('(value + 1) * 2', 4)).toBe(10);
  });

  it('throws on division by zero', () => {
    expect(() => evaluateTransform('value / 0', 5)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Multi-source (v1.1.1) — contract IDs MST-001, MST-002, MST-010, MST-012
// ---------------------------------------------------------------------------

describe('multi-source evaluateTransform(Map)', () => {
  it('MST-001: score / total with two payload paths', () => {
    expect(
      evaluateTransform(
        'score / total',
        new Map<string, number>([
          ['score', 68],
          ['total', 100],
        ]),
      ),
    ).toBe(0.68);
  });

  it('MST-002: Math.min(score / Math.max(total, 1), 1) clamps', () => {
    expect(
      evaluateTransform(
        'Math.min(score / Math.max(total, 1), 1)',
        new Map<string, number>([
          ['score', 150],
          ['total', 100],
        ]),
      ),
    ).toBe(1);
  });

  it('MST-010: single-source numeric overload unchanged after tokenizer refactor', () => {
    expect(evaluateTransform('value / 100', 65)).toBe(0.65);
    expect(evaluateTransform('Math.min(value, 1)', 1.5)).toBe(1);
  });

  it('MST-012: division by zero in multi-source', () => {
    expect(() =>
      evaluateTransform(
        'score / total',
        new Map<string, number>([
          ['score', 5],
          ['total', 0],
        ]),
      ),
    ).toThrow(/Division by zero/);
  });
});
