import type { RecentDecisionItem } from '@/lib/api/types';
import { formatSkillLabel } from '@/lib/state-skills';

export const EDUCATOR_BODY_COPY_FALLBACK =
  'No rationale text was provided for this decision.';

/** Prefer AI explanation, then short label, then engineer rationale (Panels 2 & 3 body copy). */
export function educatorBodyCopy(fields: {
  educator_explanation?: string | null;
  educator_summary?: string | null;
  rationale?: string | null;
}): string {
  const explanation = fields.educator_explanation?.trim();
  if (explanation) return explanation;
  const summary = fields.educator_summary?.trim();
  if (summary) return summary;
  const rationale = fields.rationale?.trim();
  if (rationale) return rationale;
  return EDUCATOR_BODY_COPY_FALLBACK;
}

/** Newest recent decision whose skill matches the struggling skill, if any. */
export function findRecentDecisionForSkill(
  recentDecisions: RecentDecisionItem[],
  skillName: string
): RecentDecisionItem | undefined {
  const normalized = skillName.trim();
  if (!normalized) return undefined;
  return recentDecisions.find((d) => d.skill?.trim() === normalized);
}

/** Optional "Skill: …" line — omit when skill is absent (DPU-008 graceful degradation). */
export function skillDisplayLine(skill: unknown): string | null {
  if (typeof skill !== 'string') return null;
  const t = skill.trim();
  if (!t) return null;
  return `Skill: ${formatSkillLabel(t)}`;
}
