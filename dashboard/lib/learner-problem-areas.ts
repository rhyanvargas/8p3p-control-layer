import type { LearnerSummaryResponse } from '@/lib/api/types';
import { formatSkillLabel } from '@/lib/state-skills';

export interface ProblemArea {
  label: string;
  detail: string;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function parseLearningGaps(
  breakdown: Record<string, unknown> | null
): ProblemArea[] {
  if (!breakdown) return [];
  const gaps = breakdown.learning_gaps;
  if (!Array.isArray(gaps)) return [];

  const areas: ProblemArea[] = [];
  for (const raw of gaps) {
    if (typeof raw !== 'object' || raw === null) continue;
    const gap = raw as Record<string, unknown>;
    const skill = typeof gap.skill === 'string' ? gap.skill : null;
    const mastery = typeof gap.masteryScore === 'number' ? gap.masteryScore : null;
    if (!skill) continue;

    const skillLabel = formatSkillLabel(skill);
    const subject = typeof gap.subject === 'string' ? gap.subject : null;
    const direction =
      gap.masteryScore_direction === 'declining' ? ' · declining' : '';

    if (mastery != null) {
      areas.push({
        label: skillLabel,
        detail: `${pct(mastery)} mastery${subject ? ` (${subject})` : ''}${direction}`,
      });
    } else {
      areas.push({ label: skillLabel, detail: 'Below subject average' });
    }
  }
  return areas;
}

function skillsFromBreakdown(
  breakdown: Record<string, unknown> | null
): ProblemArea[] {
  if (!breakdown || typeof breakdown.skills !== 'object' || !breakdown.skills) {
    return [];
  }

  const areas: ProblemArea[] = [];
  for (const [skillId, raw] of Object.entries(
    breakdown.skills as Record<string, unknown>
  )) {
    if (typeof raw !== 'object' || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    const score = typeof entry.masteryScore === 'number' ? entry.masteryScore : null;
    const direction = entry.masteryScore_direction;
    if (score == null) continue;
    if (score >= 0.6 && direction !== 'declining') continue;

    areas.push({
      label: formatSkillLabel(skillId),
      detail:
        direction === 'declining'
          ? `${pct(score)} mastery · declining`
          : `${pct(score)} mastery`,
    });
  }

  return areas.sort((a, b) => a.label.localeCompare(b.label));
}

function fieldStruggles(summary: LearnerSummaryResponse): ProblemArea[] {
  const fields = summary.current_state.fields;
  const trajectories = summary.field_trajectories;
  const areas: ProblemArea[] = [];

  const stability = fields.stabilityScore;
  const stabilityDir =
    fields.stabilityScore_direction ??
    trajectories.stabilityScore?.overall_direction;
  if (
    typeof stability === 'number' &&
    (stability < 0.5 || stabilityDir === 'declining')
  ) {
    areas.push({
      label: 'Retention',
      detail:
        stabilityDir === 'declining'
          ? `Declining · ${pct(stability)} stability`
          : `${pct(stability)} stability`,
    });
  }

  const risk = fields.riskSignal;
  const riskDir =
    fields.riskSignal_direction ?? trajectories.riskSignal?.overall_direction;
  if (typeof risk === 'number' && (risk >= 0.55 || riskDir === 'declining')) {
    areas.push({
      label: 'Regression risk',
      detail:
        riskDir === 'declining'
          ? `Elevated · trending worse (${pct(risk)})`
          : `Elevated (${pct(risk)})`,
    });
  }

  const mastery = fields.masteryScore;
  const masteryDir =
    fields.masteryScore_direction ??
    trajectories.masteryScore?.overall_direction;
  if (
    typeof mastery === 'number' &&
    mastery < 0.6 &&
    masteryDir !== 'improving'
  ) {
    areas.push({
      label: 'Proficiency',
      detail:
        masteryDir === 'declining'
          ? `Declining · ${pct(mastery)} mastery`
          : `${pct(mastery)} mastery`,
    });
  }

  const reinforcement = fields.timeSinceReinforcement;
  const reinforcementDir = fields.timeSinceReinforcement_direction;
  if (
    typeof reinforcement === 'number' &&
    reinforcement > 172_800 &&
    reinforcementDir !== 'improving'
  ) {
    const days = Math.round(reinforcement / 86_400);
    areas.push({
      label: 'Practice gap',
      detail: `No reinforcement in ${days} day${days === 1 ? '' : 's'}`,
    });
  }

  return areas;
}

/** Educator-facing struggle signals from summary projection (gaps, skills, or URS fields). */
export function extractProblemAreas(
  summary: LearnerSummaryResponse,
  maxItems = 4
): ProblemArea[] {
  const breakdown = summary.current_state.mastery_breakdown;

  const fromGaps = parseLearningGaps(breakdown);
  if (fromGaps.length > 0) return fromGaps.slice(0, maxItems);

  const fromSkills = skillsFromBreakdown(breakdown);
  if (fromSkills.length > 0) return fromSkills.slice(0, maxItems);

  return fieldStruggles(summary).slice(0, maxItems);
}

/** One-line summary for dense table rows. */
export function formatProblemAreasSummary(
  areas: ProblemArea[],
  maxLength = 56
): string {
  if (areas.length === 0) return '—';
  const primary = areas[0]!;
  let text = `${primary.label} — ${primary.detail}`;
  if (text.length > maxLength) {
    text = `${text.slice(0, maxLength - 1)}…`;
  }
  if (areas.length > 1) {
    text += ` (+${areas.length - 1})`;
  }
  return text;
}
