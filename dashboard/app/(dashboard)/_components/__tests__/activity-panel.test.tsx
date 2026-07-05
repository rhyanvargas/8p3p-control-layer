import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityPanel } from '@/components/dashboard/activity-panel';
import { SectionCards } from '@/components/dashboard/section-cards';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  OverviewSyncProvider,
  useOverviewFilter,
  type OverviewSyncData,
} from '@/app/(dashboard)/_components/overview-sync-provider';
import { PeriodBar } from '@/app/(dashboard)/_components/period-bar';
import type { Decision, IngestionLogEntry, LearnerStateResponse } from '@/lib/api/types';
import { computeOverviewKpis } from '@/lib/overview-metrics';

vi.mock('@/lib/overview/feature-flag', () => ({
  isOverviewCrossFilterEnabled: () => true,
}));

vi.mock('recharts', async () => {
  const React = await import('react');
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AreaChart: ({
      children,
      data,
    }: {
      children: React.ReactNode;
      data?: unknown[];
    }) => (
      <div data-testid="area-chart" data-point-count={data?.length ?? 0}>
        {children}
      </div>
    ),
    Area: ({ dataKey, name }: { dataKey?: string; name?: string }) => (
      <div data-testid="chart-area" data-series={dataKey} aria-label={name} />
    ),
    XAxis: () => null,
    YAxis: ({ label }: { label?: { value?: string } }) =>
      label?.value ? <span data-testid="y-axis-label">{label.value}</span> : null,
    CartesianGrid: () => null,
    ReferenceLine: () => null,
    Legend: () => null,
    Tooltip: () => null,
  };
});

const NOW = new Date(2026, 5, 26, 12, 0, 0);

function daysAgo(days: number, anchor = new Date()): string {
  const d = new Date(anchor);
  d.setDate(d.getDate() - days);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

function makeDecision(
  overrides: Partial<Decision> & Pick<Decision, 'decision_id' | 'learner_reference' | 'decision_type' | 'decided_at'>
): Decision {
  return {
    org_id: 'org-1',
    decision_context: {},
    trace: {
      state_id: 'state-1',
      state_version: 1,
      policy_id: 'policy-1',
      policy_version: '1.0.0',
      matched_rule_id: 'rule-1',
      state_snapshot: {},
      matched_rule: {
        rule_id: 'rule-1',
        condition: { field: 'riskSignal', op: 'gte', value: 0.5 },
        evaluated_fields: [],
      },
      rationale: 'test',
      educator_summary: 'Educator summary for testing.',
    },
    output_metadata: { priority: null },
    ...overrides,
  };
}

const MOCK_INGESTION: IngestionLogEntry[] = [];

function buildMockDecisions(): Decision[] {
  return [
    makeDecision({
      decision_id: 'd1',
      learner_reference: 'stu-40123',
      decision_type: 'intervene',
      decided_at: daysAgo(0),
    }),
    makeDecision({
      decision_id: 'd2',
      learner_reference: 'stu-50000',
      decision_type: 'reinforce',
      decided_at: daysAgo(1),
    }),
    makeDecision({
      decision_id: 'd3',
      learner_reference: 'stu-40123',
      decision_type: 'pause',
      decided_at: daysAgo(2),
    }),
  ];
}

function buildMockLearnerStates(decisions: Decision[]): LearnerStateResponse[] {
  return [
    {
      org_id: 'org-1',
      learner_reference: 'stu-40123',
      state_id: 'state-1',
      state_version: 1,
      updated_at: decisions[0]!.decided_at,
      state: { masteryScore: 0.8, masteryScore_direction: 'improving' },
      provenance: { last_signal_id: 'sig-1', last_signal_timestamp: decisions[0]!.decided_at },
    },
  ];
}

function buildMockOverviewData(): OverviewSyncData {
  const decisions = buildMockDecisions();
  const kpis = computeOverviewKpis(decisions, MOCK_INGESTION, buildMockLearnerStates(decisions));
  return {
    decisions,
    recentDecisions: [...decisions].sort((a, b) => b.decided_at.localeCompare(a.decided_at)),
    learnerStates: buildMockLearnerStates(decisions),
    ingestionToday: MOCK_INGESTION,
    kpis,
  };
}

function SyncOnBoot() {
  const { setSyncEnabled } = useOverviewFilter();
  useEffect(() => {
    setSyncEnabled(true);
  }, [setSyncEnabled]);
  return null;
}

function renderActivityPanel(options?: { syncOn?: boolean }) {
  const data = buildMockOverviewData();
  return render(
    <TooltipProvider>
      <OverviewSyncProvider data={data}>
        {options?.syncOn ? <SyncOnBoot /> : null}
        <ActivityPanel
          decisions={data.decisions}
          learnerStates={data.learnerStates}
          recentDecisions={data.recentDecisions}
          rangeDays={7}
        />
      </OverviewSyncProvider>
    </TooltipProvider>
  );
}

function renderOverviewKpiSections() {
  const data = buildMockOverviewData();
  return render(
    <TooltipProvider>
      <SectionCards kpis={data.kpis} />
    </TooltipProvider>
  );
}

async function selectMetric(label: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Metric' }));
  await user.click(await screen.findByRole('option', { name: label }));
}

function chartSeriesGroup() {
  return within(screen.getByRole('group', { name: 'Chart series' }));
}

describe('OVACT-007: period bar default 7d', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows 7d pressed with 7-day range label and 7 chart points', () => {
    render(
      <PeriodBar rangeDays={7} onRangeChange={() => {}} />
    );

    expect(screen.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '30d' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Jun 20 \u2013 Jun 26')).toBeInTheDocument();

    renderActivityPanel();
    expect(screen.getByTestId('area-chart')).toHaveAttribute('data-point-count', '7');
  });
});

describe('OVACT-008: KPI section labels', () => {
  it('shows Needs your action and Program health sections', () => {
    renderOverviewKpiSections();
    expect(screen.getByRole('region', { name: 'Needs your action' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Program health' })).toBeInTheDocument();
  });
});

describe('OVACT-009: recent activity inside activity panel', () => {
  it('renders Recent activity table within the Classroom activity card', () => {
    renderActivityPanel();

    const card = screen.getByText('Classroom activity').closest('[data-slot="card"]');
    expect(card).not.toBeNull();

    expect(within(card as HTMLElement).getByText('Recent activity')).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText('Summary')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recent decisions', level: 2 })).not.toBeInTheDocument();
  });
});

describe('OVACT-010: sync ON legend sets decision filter', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows Filtered: Intervene chip in panel header and filters table rows', async () => {
    renderActivityPanel({ syncOn: true });

    await waitFor(() => {
      expect(chartSeriesGroup().getByRole('button', { name: 'Intervene' })).toBeInTheDocument();
    });

    fireEvent.click(chartSeriesGroup().getByRole('button', { name: 'Intervene' }));

    const card = screen.getByText('Classroom activity').closest('[data-slot="card"]') as HTMLElement;

    await waitFor(() => {
      expect(screen.getByText('Filtered: Intervene')).toBeInTheDocument();
    });
    expect(screen.getByText(/Matching decisions/)).toBeInTheDocument();

    const tableSection = within(card).getByRole('region', { name: 'Recent decisions' });

    await waitFor(() => {
      expect(within(tableSection).getByText('stu-40123')).toBeInTheDocument();
    });
    expect(within(tableSection).queryByText('stu-50000')).not.toBeInTheDocument();
  });
});

describe('OVACT-011: avg mastery metric', () => {
  it('renders one mastery series and Y-axis Avg mastery % label', async () => {
    renderActivityPanel();

    await selectMetric('Avg mastery %');

    await waitFor(() => {
      expect(screen.getByTestId('y-axis-label')).toHaveTextContent('Avg mastery %');
    });

    const areas = screen.getAllByTestId('chart-area');
    expect(areas).toHaveLength(1);
    expect(areas[0]).toHaveAttribute('data-series', 'value');
  });
});
