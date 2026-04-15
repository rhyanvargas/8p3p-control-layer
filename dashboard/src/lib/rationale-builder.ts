export function buildStabilityRationale(stabilityScore: number, skillName: string): string {
  const pct = Math.round(stabilityScore * 100);
  return `Understanding of ${skillName} is unstable (${pct}% stability). May need reinforcement.`;
}
