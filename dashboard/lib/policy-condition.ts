import type { PolicyConditionNode } from '@/lib/api/types';

const OP_SYMBOLS: Record<string, string> = {
  lt: '<',
  lte: '≤',
  gt: '>',
  gte: '≥',
  eq: '=',
  neq: '≠',
};

export function formatConditionValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return `"${value}"`;
  if (value == null) return '—';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatPolicyCondition(node: PolicyConditionNode, depth = 0): string {
  if ('field' in node && 'operator' in node) {
    const op = OP_SYMBOLS[node.operator] ?? node.operator;
    return `${node.field} ${op} ${formatConditionValue(node.value)}`;
  }

  if ('all' in node && Array.isArray(node.all)) {
    const parts = node.all.map((child) => formatPolicyCondition(child, depth + 1));
    const joined = parts.join(' AND ');
    return depth > 0 ? `(${joined})` : joined;
  }

  if ('any' in node && Array.isArray(node.any)) {
    const parts = node.any.map((child) => formatPolicyCondition(child, depth + 1));
    const joined = parts.join(' OR ');
    return depth > 0 ? `(${joined})` : joined;
  }

  return '—';
}
