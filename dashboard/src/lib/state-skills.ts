import type { LearnerStateResponse } from '@/api/types';

/** 9th Grade Literacy Pilot skill IDs → educator-facing labels. */
const PILOT_SKILL_LABELS: Record<string, string> = {
  main_idea: 'Main Idea',
  text_evidence: 'Text Evidence',
  written_response: 'Written Response',
  academic_vocabulary: 'Academic Vocabulary',
  reading_stamina: 'Reading Stamina',
  basic_comprehension: 'Basic Comprehension',
  cross_subject_literacy: 'Cross-Subject Literacy',
};

export function formatSkillLabel(skillId: string): string {
  const mapped = PILOT_SKILL_LABELS[skillId];
  if (mapped) return mapped;
  return skillId
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export type Direction = 'improving' | 'declining' | 'stable';

export interface SkillRow {
  skillName: string;
  stabilityScore?: number;
  stabilityScore_direction?: Direction;
  masteryScore?: number;
  masteryScore_direction?: Direction;
  masteryScore_delta?: number;
}

function isDirection(v: unknown): v is Direction {
  return v === 'improving' || v === 'declining' || v === 'stable';
}

function rowsFromSkillsMap(skills: Record<string, unknown>): SkillRow[] {
  const rows: SkillRow[] = [];
  for (const [skillName, raw] of Object.entries(skills)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
    rows.push({
      skillName: formatSkillLabel(skillName),
      stabilityScore: typeof o.stabilityScore === 'number' ? o.stabilityScore : undefined,
      stabilityScore_direction: isDirection(o.stabilityScore_direction)
        ? o.stabilityScore_direction
        : undefined,
      masteryScore: typeof o.masteryScore === 'number' ? o.masteryScore : undefined,
      masteryScore_direction: isDirection(o.masteryScore_direction)
        ? o.masteryScore_direction
        : undefined,
      masteryScore_delta: typeof o.masteryScore_delta === 'number' ? o.masteryScore_delta : undefined,
    });
  }
  return rows;
}

/** Normalize nested `skills` or flat STATE fields into comparable skill rows. */
export function extractSkillRows(state: LearnerStateResponse['state']): SkillRow[] {
  const skills = state.skills;
  if (skills !== null && typeof skills === 'object' && !Array.isArray(skills)) {
    return rowsFromSkillsMap(skills as Record<string, unknown>);
  }
  if (typeof state.stabilityScore === 'number' || typeof state.masteryScore === 'number') {
    return [
      {
        skillName: 'Overall',
        stabilityScore: typeof state.stabilityScore === 'number' ? state.stabilityScore : undefined,
        stabilityScore_direction: isDirection(state.stabilityScore_direction)
          ? state.stabilityScore_direction
          : undefined,
        masteryScore: typeof state.masteryScore === 'number' ? state.masteryScore : undefined,
        masteryScore_direction: isDirection(state.masteryScore_direction)
          ? state.masteryScore_direction
          : undefined,
        masteryScore_delta:
          typeof state.masteryScore_delta === 'number' ? state.masteryScore_delta : undefined,
      },
    ];
  }
  return [];
}
