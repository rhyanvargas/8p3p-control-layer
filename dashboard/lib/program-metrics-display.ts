import type { ProgramMetricValue, ProgramMetricsReport } from '@/lib/api/types';

/** Tenant-facing metrics shown on Reports (≤6 per design §8). */
export const REPORT_METRIC_IDS = [
  'MC-A01',
  'MC-A02',
  'MC-A03',
  'MC-B01',
  'MC-B02',
  'MC-B05',
] as const;

export type ReportMetricId = (typeof REPORT_METRIC_IDS)[number];

const METRIC_LABELS: Record<ReportMetricId, string> = {
  'MC-A01': 'Decision volume',
  'MC-A02': 'Trace completeness',
  'MC-A03': 'Policy-rule coverage',
  'MC-B01': 'Educator engagement',
  'MC-B02': 'Agreement rate',
  'MC-B05': 'Decision-to-action latency',
};

const METRIC_DESCRIPTIONS: Record<ReportMetricId, string> = {
  'MC-A01': 'Decisions per learner in the selected window',
  'MC-A02': 'Share of decisions with complete trace fields',
  'MC-A03': 'Share of evaluations matched by an active policy rule',
  'MC-B01': 'Decisions viewed by an educator within 7 days',
  'MC-B02': 'Approved reviews among educator-reviewed decisions',
  'MC-B05': 'Median hours from decision to first educator feedback',
};

export function metricLabel(id: ReportMetricId): string {
  return METRIC_LABELS[id];
}

export function metricDescription(id: ReportMetricId): string {
  return METRIC_DESCRIPTIONS[id];
}

function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

export function formatMetricValue(id: ReportMetricId, metric: ProgramMetricValue): string {
  if (metric.value == null) {
    return metric.source_note ? 'N/A' : '—';
  }

  switch (id) {
    case 'MC-A01':
      return metric.value.toFixed(2);
    case 'MC-A02':
    case 'MC-A03':
    case 'MC-B01':
    case 'MC-B02':
      return formatPercent(metric.value);
    case 'MC-B05':
      return `${Math.round(metric.value)}h`;
    default:
      return String(metric.value);
  }
}

export function pickReportMetrics(report: ProgramMetricsReport): Array<{
  id: ReportMetricId;
  metric: ProgramMetricValue;
}> {
  return REPORT_METRIC_IDS.flatMap((id) => {
    const metric = report.metrics[id];
    return metric ? [{ id, metric }] : [];
  });
}

export function defaultMetricsWindow(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function reportToCsv(report: ProgramMetricsReport): string {
  const header = 'metric_id,value,numerator,denominator,from,to,computed_at,source_note';
  const rows = Object.entries(report.metrics).map(([id, metric]) =>
    [
      id,
      metric.value ?? '',
      metric.numerator ?? '',
      metric.denominator ?? '',
      metric.window.from,
      metric.window.to,
      metric.computed_at,
      metric.source_note ?? '',
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(',')
  );
  return [header, ...rows].join('\n');
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
