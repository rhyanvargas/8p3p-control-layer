'use client';

import { Info } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isOverviewCrossFilterEnabled } from '@/lib/overview/feature-flag';

import { useOverviewFilter } from './overview-sync-provider';

function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export function SyncFilterToggle() {
  const mounted = useMounted();
  const { syncEnabled, setSyncEnabled } = useOverviewFilter();

  if (!isOverviewCrossFilterEnabled()) {
    return null;
  }

  const checked = mounted ? syncEnabled : false;

  return (
    <div className="flex items-center gap-2">
      <Switch
        id="overview-sync-filters"
        checked={checked}
        onCheckedChange={setSyncEnabled}
        aria-describedby="overview-sync-filters-label"
      />
      <Label
        id="overview-sync-filters-label"
        htmlFor="overview-sync-filters"
        className="text-sm font-normal"
      >
        Sync filters
      </Label>
      <Tooltip>
        <TooltipTrigger
          type="button"
          className="text-muted-foreground hover:text-foreground inline-flex shrink-0 rounded-sm"
          aria-label="About sync filters"
        >
          <Info className="size-3.5" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>
          Link the trend chart and recent decisions table. When on, changing the chart range,
          decision type, or table learner filter updates both surfaces and narrows Needs attention
          and Pending decisions counts.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
