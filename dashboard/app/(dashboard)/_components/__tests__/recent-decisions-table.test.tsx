import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RecentDecisionsTable } from '@/app/(dashboard)/_components/recent-decisions-table';
import type { Decision } from '@/lib/api/types';

const decision: Decision = {
  org_id: 'org-1',
  decision_id: 'dec-1',
  learner_reference: 'learner-1',
  decision_type: 'intervene',
  decided_at: '2026-06-23T10:00:00Z',
  decision_context: {},
  trace: {
    state_id: 'state-1',
    state_version: 1,
    policy_id: 'p1',
    policy_version: '1.0.0',
    matched_rule_id: 'rule-risk-threshold',
    state_snapshot: {},
    matched_rule: {},
    rationale: 'Risk exceeded threshold.',
    educator_summary: 'Learner shows elevated risk — consider a check-in.',
  },
};

describe('DEC-TBL-001: educator-first L0 columns', () => {
  it('shows Summary column with educator_summary and no Rule column', () => {
    render(<RecentDecisionsTable decisions={[decision]} />);
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText(/Learner shows elevated risk/)).toBeInTheDocument();
    expect(screen.queryByText('Rule')).not.toBeInTheDocument();
    expect(screen.queryByText('rule-risk-threshold')).not.toBeInTheDocument();
  });

  it('opens Sheet with rule id and rationale under Technical detail', () => {
    render(<RecentDecisionsTable decisions={[decision]} />);

    fireEvent.click(screen.getByRole('button', { name: /learner-1/i }));

    expect(screen.getByText('Technical detail')).toBeInTheDocument();
    expect(screen.getByText('Matched rule')).toBeInTheDocument();
    expect(screen.getByText('rule-risk-threshold')).toBeInTheDocument();
    expect(screen.getByText('Rationale excerpt')).toBeInTheDocument();
    expect(screen.getByText('Risk exceeded threshold.')).toBeInTheDocument();
  });

  it('falls back to humanized decision type when educator_summary is empty', () => {
    const noSummary: Decision = {
      ...decision,
      trace: { ...decision.trace, educator_summary: '' },
    };
    render(<RecentDecisionsTable decisions={[noSummary]} />);
    const row = screen.getByRole('button', { name: /learner-1/i });
    const fallbackSummary = within(row)
      .getAllByText('Intervene')
      .find((el) => el.classList.contains('text-muted-foreground'));
    expect(fallbackSummary).toBeDefined();
  });
});
