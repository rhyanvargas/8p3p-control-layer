'use client';

import { Button } from '@/components/ui/button';
import { formatPeriodRangeLabel } from '@/lib/overview-activity';
import type { TrendRangeDays } from '@/lib/overview-metrics';

const PERIOD_OPTIONS: { label: string; days: TrendRangeDays }[] = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

type PeriodBarProps = {
  rangeDays: TrendRangeDays;
  onRangeChange: (days: TrendRangeDays) => void;
};

export function PeriodBar({ rangeDays, onRangeChange }: PeriodBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div role="group" aria-label="Time period" className="flex items-center gap-1">
        {PERIOD_OPTIONS.map(({ label, days }) => (
          <Button
            key={days}
            type="button"
            variant={rangeDays === days ? 'default' : 'outline'}
            size="sm"
            aria-pressed={rangeDays === days}
            onClick={() => onRangeChange(days)}
          >
            {label}
          </Button>
        ))}
      </div>
      <span className="text-muted-foreground text-sm">{formatPeriodRangeLabel(rangeDays)}</span>
    </div>
  );
}
