/**
 * URS skill → subject → overall aggregation and evidence counting.
 * Spec: docs/specs/urs-aggregation.md
 */

import type {
  AggregationOverall,
  AggregationSkillEntry,
  AggregationSubjectEntry,
  LearnerAggregation,
  MasteryScoreDirection,
  SignalRecord,
  SubjectConfig,
} from '../shared/types.js';
import { isRecord } from '../shared/dot-path.js';
import { roundNumeric } from './aggregation-constants.js';
import { resolveSubjectForSkill } from './subject-config.js';

function arithmeticMean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function extractDirection(entry: Record<string, unknown>): MasteryScoreDirection | null {
  const direction = entry.masteryScore_direction;
  if (direction === 'improving' || direction === 'declining' || direction === 'stable') {
    return direction;
  }
  return null;
}

function extractEvidenceCount(entry: Record<string, unknown>): number {
  const count = entry.evidenceCount;
  if (typeof count === 'number' && Number.isFinite(count)) {
    return Math.floor(count);
  }
  return 0;
}

/**
 * Pick strongest or weakest skill id in a subject group.
 * Ties break lexicographically ascending on skill id.
 */
function pickExtremeSkill(
  skillIds: string[],
  skillsObj: Record<string, unknown>,
  mode: 'max' | 'min'
): string {
  return skillIds.reduce((best, id) => {
    const score = (skillsObj[id] as Record<string, unknown>).masteryScore as number;
    const bestScore = (skillsObj[best] as Record<string, unknown>).masteryScore as number;
    if (mode === 'max') {
      if (score > bestScore) return id;
      if (score < bestScore) return best;
    } else {
      if (score < bestScore) return id;
      if (score > bestScore) return best;
    }
    return id < best ? id : best;
  });
}

/**
 * Increment per-skill evidenceCount for each signal carrying a finite masteryScore.
 * Spec: docs/specs/urs-aggregation.md § evidenceCount
 */
export function incrementSkillEvidenceCounts(
  _priorState: Record<string, unknown>,
  newState: Record<string, unknown>,
  signals: SignalRecord[]
): void {
  for (const signal of signals) {
    const payload = signal.payload;
    if (!isRecord(payload)) continue;

    const toIncrement = new Set<string>();

    if (isRecord(payload.skills)) {
      for (const [skillId, entry] of Object.entries(payload.skills)) {
        if (
          isRecord(entry) &&
          typeof entry.masteryScore === 'number' &&
          Number.isFinite(entry.masteryScore)
        ) {
          toIncrement.add(skillId);
        }
      }
    }

    if (typeof payload.masteryScore === 'number' && Number.isFinite(payload.masteryScore)) {
      const dominantSkill = typeof payload.skill === 'string' ? payload.skill : null;
      if (dominantSkill) {
        toIncrement.add(dominantSkill);
      }
    }

    if (toIncrement.size === 0) continue;

    if (!isRecord(newState.skills)) {
      newState.skills = {};
    }
    const skills = newState.skills as Record<string, unknown>;

    for (const skillId of toIncrement) {
      if (!isRecord(skills[skillId])) {
        skills[skillId] = {};
      }
      const entry = skills[skillId] as Record<string, unknown>;
      entry.evidenceCount = extractEvidenceCount(entry) + 1;
    }
  }
}

/**
 * Compute skill → subject → overall aggregation and write `state.aggregation`.
 * Omits `state.aggregation` when no skills have finite masteryScore.
 * Spec: docs/specs/urs-aggregation.md § Aggregation Formulas
 */
export function computeLearnerAggregation(
  state: Record<string, unknown>,
  subjectConfig: SubjectConfig | null,
  stateVersion: number
): void {
  const skillsObj = state.skills;
  if (!isRecord(skillsObj)) {
    delete state.aggregation;
    return;
  }

  const skillIdsInS: string[] = [];
  for (const [id, entry] of Object.entries(skillsObj)) {
    if (
      isRecord(entry) &&
      typeof entry.masteryScore === 'number' &&
      Number.isFinite(entry.masteryScore)
    ) {
      skillIdsInS.push(id);
    }
  }

  if (skillIdsInS.length === 0) {
    delete state.aggregation;
    return;
  }

  const bySubject = new Map<string, string[]>();
  for (const skillId of skillIdsInS) {
    const entry = skillsObj[skillId] as Record<string, unknown>;
    const subject = resolveSubjectForSkill(skillId, entry, subjectConfig);
    const list = bySubject.get(subject) ?? [];
    list.push(skillId);
    bySubject.set(subject, list);
  }

  const subjects: Record<string, AggregationSubjectEntry> = {};
  for (const [subj, skillIds] of bySubject.entries()) {
    if (skillIds.length === 0) continue;

    const sortedIds = [...skillIds].sort();
    const masteryScores = sortedIds.map(
      (id) => (skillsObj[id] as Record<string, unknown>).masteryScore as number
    );
    const subjMasteryMean = arithmeticMean(masteryScores);
    if (subjMasteryMean === undefined) continue;

    const stabilityValues = sortedIds
      .map((id) => (skillsObj[id] as Record<string, unknown>).stabilityScore)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    const subjectEntry: AggregationSubjectEntry = {
      masteryScore: roundNumeric(subjMasteryMean) as number,
      skill_count: sortedIds.length,
      strongest_skill: pickExtremeSkill(sortedIds, skillsObj, 'max'),
      weakest_skill: pickExtremeSkill(sortedIds, skillsObj, 'min'),
      skills: sortedIds,
    };

    const subjStabilityMean = arithmeticMean(stabilityValues);
    if (subjStabilityMean !== undefined) {
      subjectEntry.stabilityScore = roundNumeric(subjStabilityMean) as number;
    }

    subjects[subj] = subjectEntry;
  }

  const subjectKeys = Object.keys(subjects);
  const overallMasteryValues = subjectKeys.map((subj) => subjects[subj]!.masteryScore);
  const overallStabilityValues = subjectKeys
    .map((subj) => subjects[subj]!.stabilityScore)
    .filter((v): v is number => typeof v === 'number');

  const overallMasteryMean = arithmeticMean(overallMasteryValues);
  if (overallMasteryMean === undefined) {
    delete state.aggregation;
    return;
  }

  const overall: AggregationOverall = {
    masteryScore: roundNumeric(overallMasteryMean) as number,
    subject_count: subjectKeys.length,
    skill_count: skillIdsInS.length,
  };

  const overallStabilityMean = arithmeticMean(overallStabilityValues);
  if (overallStabilityMean !== undefined) {
    overall.stabilityScore = roundNumeric(overallStabilityMean) as number;
  }

  const aggSkills: Record<string, AggregationSkillEntry> = {};
  for (const skillId of [...skillIdsInS].sort()) {
    const entry = skillsObj[skillId] as Record<string, unknown>;
    const subject = resolveSubjectForSkill(skillId, entry, subjectConfig);

    const aggSkill: AggregationSkillEntry = {
      subject,
      masteryScore: roundNumeric(entry.masteryScore) as number,
      masteryScore_direction: extractDirection(entry),
      evidenceCount: extractEvidenceCount(entry),
    };

    if (typeof entry.stabilityScore === 'number' && Number.isFinite(entry.stabilityScore)) {
      aggSkill.stabilityScore = roundNumeric(entry.stabilityScore) as number;
    }

    aggSkills[skillId] = aggSkill;
  }

  const aggregation: LearnerAggregation = {
    computed_at_version: stateVersion,
    overall,
    subjects,
    skills: aggSkills,
  };

  state.aggregation = aggregation;
}
