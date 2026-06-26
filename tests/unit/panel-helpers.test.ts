import { describe, expect, it } from 'vitest';

import {
  EDUCATOR_BODY_COPY_FALLBACK,
  educatorBodyCopy,
  findRecentDecisionForSkill,
} from '@/lib/panel-helpers';
import type { RecentDecisionItem } from '@/lib/api/types';

describe('educatorBodyCopy', () => {
  it('prefers educator_explanation over summary and rationale', () => {
    expect(
      educatorBodyCopy({
        educator_explanation: ' AI narrative ',
        educator_summary: 'Short label',
        rationale: 'Rule fired',
      })
    ).toBe('AI narrative');
  });

  it('falls back to educator_summary when explanation is empty', () => {
    expect(
      educatorBodyCopy({
        educator_explanation: '   ',
        educator_summary: 'Short label',
        rationale: 'Rule fired',
      })
    ).toBe('Short label');
  });

  it('falls back to rationale when explanation and summary are empty', () => {
    expect(
      educatorBodyCopy({
        educator_explanation: null,
        educator_summary: '',
        rationale: 'Rule fired',
      })
    ).toBe('Rule fired');
  });

  it('returns fallback when all fields are empty', () => {
    expect(
      educatorBodyCopy({
        educator_explanation: null,
        educator_summary: '',
        rationale: '',
      })
    ).toBe(EDUCATOR_BODY_COPY_FALLBACK);
  });
});

describe('findRecentDecisionForSkill', () => {
  const decisions: RecentDecisionItem[] = [
    {
      decision_id: 'd-2',
      decision_type: 'intervene',
      decided_at: '2026-03-02T10:00:00Z',
      matched_rule_id: 'rule-2',
      educator_summary: 'Needs support',
      educator_explanation: 'Recent explanation',
      rationale: 'r2',
      policy_version: '1.0.0',
      skill: 'text_evidence',
    },
    {
      decision_id: 'd-1',
      decision_type: 'reinforce',
      decided_at: '2026-03-01T10:00:00Z',
      matched_rule_id: 'rule-1',
      educator_summary: 'Practice more',
      rationale: 'r1',
      policy_version: '1.0.0',
      skill: 'central_idea',
    },
  ];

  it('returns the first decision matching the skill', () => {
    expect(findRecentDecisionForSkill(decisions, 'text_evidence')?.decision_id).toBe('d-2');
  });

  it('returns undefined when no decision matches the skill', () => {
    expect(findRecentDecisionForSkill(decisions, 'inference')).toBeUndefined();
  });
});
