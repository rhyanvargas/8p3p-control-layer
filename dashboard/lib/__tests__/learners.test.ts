import { describe, expect, it } from 'vitest';

import {
  filterRosterRows,
  parseRosterTrendFilter,
  trendRank,
  type LearnerRosterRow,
} from '@/lib/learners';

function row(
  ref: string,
  trend: LearnerRosterRow['trend'],
  skill: string | null = null
): LearnerRosterRow {
  return {
    learner_reference: ref,
    state_version: 1,
    updated_at: '2026-06-12T00:00:00.000Z',
    level: 'proficient',
    trend,
    status: 'On track',
    skill,
  };
}

describe('trendRank', () => {
  it('orders declining before stable before improving', () => {
    expect(trendRank('declining')).toBeLessThan(trendRank('stable'));
    expect(trendRank('stable')).toBeLessThan(trendRank('improving'));
  });
});

describe('parseRosterTrendFilter', () => {
  it('accepts improving, declining, and stable', () => {
    expect(parseRosterTrendFilter('improving')).toBe('improving');
    expect(parseRosterTrendFilter('declining')).toBe('declining');
    expect(parseRosterTrendFilter('stable')).toBe('stable');
  });

  it('treats all, empty, and unknown values as no filter', () => {
    expect(parseRosterTrendFilter('all')).toBeNull();
    expect(parseRosterTrendFilter(null)).toBeNull();
    expect(parseRosterTrendFilter('')).toBeNull();
    expect(parseRosterTrendFilter('unknown')).toBeNull();
  });
});

describe('filterRosterRows', () => {
  const rows = [
    row('a', 'improving', 'Main idea'),
    row('b', 'declining', 'Main idea'),
    row('c', 'stable', 'Inference'),
  ];

  it('filters by trend', () => {
    expect(filterRosterRows(rows, { trend: 'improving' })).toEqual([rows[0]]);
    expect(filterRosterRows(rows, { trend: 'declining' })).toEqual([rows[1]]);
    expect(filterRosterRows(rows, { trend: 'stable' })).toEqual([rows[2]]);
    expect(filterRosterRows(rows, { trend: null })).toEqual(rows);
  });

  it('filters by skill', () => {
    expect(filterRosterRows(rows, { skill: 'Main idea' })).toEqual([
      rows[0],
      rows[1],
    ]);
  });

  it('combines trend and skill filters', () => {
    expect(
      filterRosterRows(rows, { trend: 'improving', skill: 'Main idea' })
    ).toEqual([rows[0]]);
    expect(
      filterRosterRows(rows, { trend: 'improving', skill: 'Inference' })
    ).toEqual([]);
  });
});
