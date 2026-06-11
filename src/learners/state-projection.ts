import type {
  AggregationSkillEntry,
  GiftedInterest,
  LearnerAggregation,
  LearnerState,
  LearningGapEntry,
  MasteryBreakdown,
  MasteryBreakdownSubjectEntry,
} from '../shared/types.js';
import type { DecisionTypeSummary } from '../decision/repository.js';
import {
  GIFTED_INTEREST_LABEL,
  GIFTED_MASTERY_THRESHOLD,
  GIFTED_MIN_EVIDENCE_COUNT,
  LEARNING_GAP_ABSOLUTE_THRESHOLD,
  LEARNING_GAP_THRESHOLD,
  LEARNING_GAPS_MAX,
  MIN_ADVANCE_DECISIONS,
  MIN_SKILLS_FOR_GIFTED,
} from '../state/aggregation-constants.js';
import { isRecord } from '../shared/dot-path.js';
import type { URSAllowedKey } from './urs-allowlist.js';
import { isAllowedURSKey } from './urs-allowlist.js';

type LearnerStateProjectionScalar = number | string | null;

export type LearnerStateProjection = Partial<Record<URSAllowedKey, LearnerStateProjectionScalar>>;

export const FLOAT_PRECISION = 4;

export function roundNumeric(value: unknown): unknown {
  if (typeof value !== 'number') return value;
  if (!Number.isFinite(value)) return value;
  if (Number.isInteger(value)) return value;
  return Math.round(value * 10 ** FLOAT_PRECISION) / 10 ** FLOAT_PRECISION;
}

export function projectLearnerState(state: LearnerState['state']): LearnerStateProjection {
  const out: LearnerStateProjection = {};
  for (const [k, v] of Object.entries(state)) {
    if (!isAllowedURSKey(k)) continue;
    if (typeof v === 'number' || typeof v === 'string' || v === null) {
      out[k as URSAllowedKey] =
        typeof v === 'number' ? (roundNumeric(v) as number) : v;
    }
    // Reject non-scalar values (objects, arrays) — allowlist is scalars-only
  }
  return out;
}

function hasNonEmptySkills(state: LearnerState['state']): boolean {
  const skills = state.skills;
  if (!isRecord(skills)) return false;
  return Object.keys(skills).length > 0;
}

function readLearnerAggregation(state: LearnerState['state']): LearnerAggregation | null {
  const raw = state.aggregation;
  if (!isRecord(raw)) return null;
  if (!isRecord(raw.overall)) return null;
  if (!isRecord(raw.subjects)) return null;
  if (!isRecord(raw.skills)) return null;
  if (typeof raw.computed_at_version !== 'number') return null;
  return raw as unknown as LearnerAggregation;
}

/**
 * Project educator-facing mastery hierarchy from stored `state.aggregation`.
 * Spec: docs/specs/urs-aggregation.md § Summary response extension
 */
export function projectMasteryBreakdown(state: LearnerState['state']): MasteryBreakdown | null {
  if (!hasNonEmptySkills(state)) return null;

  const aggregation = readLearnerAggregation(state);
  if (!aggregation) return null;

  const overall = {
    masteryScore: roundNumeric(aggregation.overall.masteryScore) as number,
    subject_count: aggregation.overall.subject_count,
    skill_count: aggregation.overall.skill_count,
    ...(aggregation.overall.stabilityScore !== undefined && {
      stabilityScore: roundNumeric(aggregation.overall.stabilityScore) as number,
    }),
  };

  const subjects: Record<string, MasteryBreakdownSubjectEntry> = {};
  for (const [subject, entry] of Object.entries(aggregation.subjects)) {
    subjects[subject] = {
      masteryScore: roundNumeric(entry.masteryScore) as number,
      skill_count: entry.skill_count,
      strongest_skill: entry.strongest_skill,
      weakest_skill: entry.weakest_skill,
      ...(entry.stabilityScore !== undefined && {
        stabilityScore: roundNumeric(entry.stabilityScore) as number,
      }),
    };
  }

  const skills: Record<string, AggregationSkillEntry> = {};
  for (const [skillId, entry] of Object.entries(aggregation.skills)) {
    if (!Number.isFinite(entry.masteryScore)) continue;
    skills[skillId] = {
      subject: entry.subject,
      masteryScore: roundNumeric(entry.masteryScore) as number,
      masteryScore_direction: entry.masteryScore_direction,
      evidenceCount: entry.evidenceCount,
      ...(entry.stabilityScore !== undefined &&
        Number.isFinite(entry.stabilityScore) && {
          stabilityScore: roundNumeric(entry.stabilityScore) as number,
        }),
    };
  }

  return {
    overall,
    subjects,
    skills,
    learning_gaps: [],
    gifted_interest: { flagged: false, label: null },
  };
}

/**
 * Learning gaps from stored aggregation (summary assembly time).
 * Spec: docs/specs/urs-aggregation.md § Learning Gaps
 */
export function computeLearningGaps(aggregation: LearnerAggregation): LearningGapEntry[] {
  const gaps: LearningGapEntry[] = [];

  for (const [skillId, skill] of Object.entries(aggregation.skills)) {
    if (!Number.isFinite(skill.masteryScore)) continue;

    const subjectEntry = aggregation.subjects[skill.subject];
    if (!subjectEntry) continue;

    const subjectMasteryScore = subjectEntry.masteryScore;
    const masteryScore = skill.masteryScore;

    if (masteryScore >= subjectMasteryScore - LEARNING_GAP_THRESHOLD) continue;
    if (masteryScore >= LEARNING_GAP_ABSOLUTE_THRESHOLD) continue;

    gaps.push({
      skill: skillId,
      subject: skill.subject,
      masteryScore: roundNumeric(masteryScore) as number,
      subject_masteryScore: roundNumeric(subjectMasteryScore) as number,
      gap: roundNumeric(subjectMasteryScore - masteryScore) as number,
      masteryScore_direction: skill.masteryScore_direction,
    });
  }

  return gaps.sort((a, b) => b.gap - a.gap).slice(0, LEARNING_GAPS_MAX);
}

/**
 * Gifted-interest flag from aggregation + full decision history (summary assembly time).
 * Spec: docs/specs/urs-aggregation.md § Gifted-Interest Flag
 */
export function evaluateGiftedInterest(
  aggregation: LearnerAggregation,
  decisionSummary: DecisionTypeSummary
): GiftedInterest {
  const skillEntries = Object.entries(aggregation.skills).filter(([, entry]) =>
    Number.isFinite(entry.masteryScore)
  );
  const failures: string[] = [];

  if (skillEntries.length < MIN_SKILLS_FOR_GIFTED) {
    failures.push(`G1: ${skillEntries.length} skills < ${MIN_SKILLS_FOR_GIFTED}`);
  }

  for (const [skillId, entry] of skillEntries) {
    if (entry.masteryScore < GIFTED_MASTERY_THRESHOLD) {
      failures.push(`G2: ${skillId} masteryScore ${entry.masteryScore} < ${GIFTED_MASTERY_THRESHOLD}`);
    }
  }

  if (decisionSummary.total < 1) {
    failures.push('G5: no decisions');
  }

  if (decisionSummary.types.advance < MIN_ADVANCE_DECISIONS) {
    failures.push(
      `G3: advance count ${decisionSummary.types.advance} < ${MIN_ADVANCE_DECISIONS}`
    );
  }

  const nonAdvance = decisionSummary.total - decisionSummary.types.advance;
  if (nonAdvance > 0) {
    failures.push(`G4: ${nonAdvance} non-advance decision(s)`);
  }

  for (const [skillId, entry] of skillEntries) {
    const evidenceCount =
      typeof entry.evidenceCount === 'number' && Number.isFinite(entry.evidenceCount)
        ? Math.floor(entry.evidenceCount)
        : 0;
    if (evidenceCount < GIFTED_MIN_EVIDENCE_COUNT) {
      failures.push(
        `G6: ${skillId} evidenceCount ${evidenceCount} < ${GIFTED_MIN_EVIDENCE_COUNT}`
      );
    }
  }

  if (failures.length > 0) {
    console.debug('[gifted_interest] not flagged:', failures.join('; '));
    return { flagged: false, label: null };
  }

  return { flagged: true, label: GIFTED_INTEREST_LABEL };
}

/**
 * Full educator-facing mastery breakdown including gaps and gifted-interest.
 * Spec: docs/specs/urs-aggregation.md § Summary response extension
 */
export function completeMasteryBreakdown(
  state: LearnerState['state'],
  decisionSummary: DecisionTypeSummary
): MasteryBreakdown | null {
  const breakdown = projectMasteryBreakdown(state);
  if (!breakdown) return null;

  const aggregation = readLearnerAggregation(state);
  if (!aggregation) return null;

  return {
    ...breakdown,
    learning_gaps: computeLearningGaps(aggregation),
    gifted_interest: evaluateGiftedInterest(aggregation, decisionSummary),
  };
}
