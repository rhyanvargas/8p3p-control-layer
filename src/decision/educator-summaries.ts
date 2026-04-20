import type { DecisionType } from '../shared/types.js';

/**
 * Teacher-facing short labels for each decision type.
 * Source: internal-docs/pilot-operations/pilot-runbook.md
 *         § Teacher-friendly decision definitions (Shortest version column).
 *
 * These strings land in Decision.trace.educator_summary and are what a
 * school sees. Never describe "pause" as idleness, an open-ended hold, or "do nothing"
 * — runbook internal note is explicit on this.
 */
export const DECISION_TYPE_TO_EDUCATOR_SUMMARY: Record<DecisionType, string> = {
  advance: 'Ready to move on',
  reinforce: 'Needs more practice',
  intervene: 'Needs stronger support now',
  pause: 'Possible learning decay detected; watch closely',
};
