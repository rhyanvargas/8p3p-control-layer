export type Level = 'emerging' | 'novice' | 'proficient' | 'mastery';

const THRESHOLDS: [number, Level][] = [
  [0.25, 'emerging'],
  [0.5, 'novice'],
  [0.75, 'proficient'],
  [1.0, 'mastery'],
];

const LEVEL_ORDER: Record<Level, number> = {
  emerging: 1,
  novice: 2,
  proficient: 3,
  mastery: 4,
};

/** Ordinal rank for comparing level transitions (higher = more proficient). */
export function levelRank(level: Level): number {
  return LEVEL_ORDER[level];
}

export function scoreToLevel(score: number): Level {
  for (const [threshold, level] of THRESHOLDS) {
    if (score <= threshold) return level;
  }
  return 'mastery';
}
