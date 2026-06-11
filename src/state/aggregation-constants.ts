/**
 * Pinned aggregation and gifted-interest constants (Plane 3 code defaults).
 * Canonical source for CODE_DEFAULTS.aggregation (tenant-config.plan.md).
 * Spec: docs/specs/urs-aggregation.md § Concrete Values Checklist
 */

export { FLOAT_PRECISION, roundNumeric } from '../learners/state-projection.js';

export const LEARNING_GAP_THRESHOLD = 0.10;
export const LEARNING_GAP_ABSOLUTE_THRESHOLD = 0.60;
export const LEARNING_GAPS_MAX = 10;
export const GIFTED_MASTERY_THRESHOLD = 0.95;
export const MIN_SKILLS_FOR_GIFTED = 2;
export const MIN_ADVANCE_DECISIONS = 1;
export const GIFTED_MIN_EVIDENCE_COUNT = 3;
export const GIFTED_INTEREST_LABEL = 'Person of interest';
export const DEFAULT_SUBJECT = 'General';
