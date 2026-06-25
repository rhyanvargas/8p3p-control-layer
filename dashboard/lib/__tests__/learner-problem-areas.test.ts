import { describe, expect, it } from 'vitest';

import type { LearnerSummaryResponse } from '@/lib/api/types';
import { extractProblemAreas, formatProblemAreasSummary } from '@/lib/learner-problem-areas';

function baseSummary(
  overrides: Partial<LearnerSummaryResponse> = {}
): LearnerSummaryResponse {
  return {
    org_id: 'springs',
    learner_reference: 'stu-10042',
    generated_at: '2026-03-28T14:45:30Z',
    current_state: {
      state_id: 's1',
      state_version: 2,
      updated_at: '2026-03-28T14:45:30Z',
      fields: {},
      mastery_breakdown: null,
    },
    recent_decisions: [],
    field_trajectories: {},
    active_policy: null,
    signals_summary: {
      total_count: 0,
      first_signal_at: null,
      last_signal_at: null,
    },
    ...overrides,
  };
}

describe('extractProblemAreas', () => {
  it('prefers learning_gaps from mastery_breakdown', () => {
    const summary = baseSummary({
      current_state: {
        state_id: 's1',
        state_version: 2,
        updated_at: '2026-03-28T14:45:30Z',
        fields: {},
        mastery_breakdown: {
          learning_gaps: [
            {
              skill: 'ELA-201',
              subject: 'English',
              masteryScore: 0.28,
              subject_masteryScore: 0.55,
              gap: 0.27,
              masteryScore_direction: 'declining',
            },
          ],
        },
      },
    });

    expect(extractProblemAreas(summary)).toEqual([
      {
        label: 'ELA-201',
        detail: '28% mastery (English) · declining',
      },
    ]);
  });

  it('falls back to URS field struggles when breakdown is absent', () => {
    const summary = baseSummary({
      current_state: {
        state_id: 's1',
        state_version: 2,
        updated_at: '2026-03-28T14:45:30Z',
        fields: {
          stabilityScore: 0.22,
          stabilityScore_direction: 'declining',
          timeSinceReinforcement: 200_000,
        },
        mastery_breakdown: null,
      },
      field_trajectories: {
        stabilityScore: { overall_direction: 'declining' },
      },
    });

    expect(extractProblemAreas(summary)).toEqual(
      expect.arrayContaining([
        { label: 'Retention', detail: 'Declining · 22% stability' },
        { label: 'Practice gap', detail: 'No reinforcement in 2 days' },
      ])
    );
  });
});

describe('formatProblemAreasSummary', () => {
  it('summarizes the primary area and counts the rest', () => {
    expect(
      formatProblemAreasSummary([
        { label: 'Retention', detail: 'Declining · 22% stability' },
        { label: 'Practice gap', detail: 'No reinforcement in 2 days' },
      ])
    ).toBe('Retention — Declining · 22% stability (+1)');
  });

  it('returns em dash when empty', () => {
    expect(formatProblemAreasSummary([])).toBe('—');
  });
});
