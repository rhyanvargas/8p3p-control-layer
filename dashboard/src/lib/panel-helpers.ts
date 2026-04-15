/** Optional "Skill: …" line — omit when skill is absent (DPU-008 graceful degradation). */
export function skillDisplayLine(skill: unknown): string | null {
  if (typeof skill !== 'string') return null;
  const t = skill.trim();
  if (!t) return null;
  return `Skill: ${t}`;
}
