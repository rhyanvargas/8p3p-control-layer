'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { JsonViewer } from '@/components/shared/json-viewer';
import { SheetSection } from '@/components/shared/sheet-section';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { Button } from '@/components/ui/button';
import { useLearnerState } from '@/hooks/use-learner-states';
import { formatRelativeActivity } from '@/lib/learners';
import { cn } from '@/lib/utils';

type LearnerStateTabProps = {
  orgId: string;
  learnerRef: string;
  version?: number;
};

function formatFieldValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'number') return String(Math.round(value * 100) / 100);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return JSON.stringify(value);
}

export function LearnerStateTab({
  orgId,
  learnerRef,
  version,
}: LearnerStateTabProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentQuery = useLearnerState(orgId, learnerRef);
  const needsHistorical =
    version != null &&
    (currentQuery.data == null || version !== currentQuery.data.state_version);
  const historicalQuery = useLearnerState(
    orgId,
    learnerRef,
    needsHistorical ? version : undefined
  );

  const activeQuery = needsHistorical ? historicalQuery : currentQuery;

  const isLoading =
    currentQuery.isLoading || (needsHistorical && historicalQuery.isLoading);
  const isError = currentQuery.isError || historicalQuery.isError;
  const error = currentQuery.error ?? historicalQuery.error;

  const refetch = () => {
    void currentQuery.refetch();
    if (needsHistorical) void historicalQuery.refetch();
  };

  const canonicalFields = useMemo(() => {
    const state = activeQuery.data?.state;
    if (!state || typeof state !== 'object') return [];

    const hidden = new Set(['skills']);
    return Object.entries(state as Record<string, unknown>)
      .filter(([key]) => !hidden.has(key) && !key.endsWith('_delta') && !key.endsWith('_direction'))
      .map(([key, value]) => ({
        label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
        value: formatFieldValue(value),
      }));
  }, [activeQuery.data?.state]);

  if (isLoading) {
    return <LoadingState variant="list" count={5} />;
  }

  if (isError) {
    return <ErrorState error={error} onRetry={refetch} />;
  }

  const body = activeQuery.data;
  if (!body) {
    return <LoadingState variant="list" count={3} />;
  }

  const latestVersion = currentQuery.data?.state_version ?? body.state_version;
  const selectedVersion = version ?? latestVersion;
  const versions = Array.from({ length: latestVersion }, (_, i) => i + 1);

  function selectVersion(nextVersion: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextVersion === latestVersion) {
      params.delete('version');
    } else {
      params.set('version', String(nextVersion));
    }
    const query = params.toString();
    router.push(
      `/learners/${encodeURIComponent(learnerRef)}${query ? `?${query}` : ''}`
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium">Version selector</h2>
          <p className="text-muted-foreground text-sm">
            View historical state snapshots. Raw JSON is available at L3 expand only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {versions.map((v) => (
            <Button
              key={v}
              type="button"
              size="sm"
              variant={v === selectedVersion ? 'default' : 'outline'}
              className={cn('font-mono')}
              onClick={() => selectVersion(v)}
              aria-pressed={v === selectedVersion}
            >
              v{v}
            </Button>
          ))}
        </div>
      </section>

      <SheetSection
        title="Canonical fields"
        fields={[
          {
            label: 'State ID',
            value: <span className="font-mono text-xs">{body.state_id}</span>,
          },
          {
            label: 'Version',
            value: String(body.state_version),
          },
          {
            label: 'Updated',
            value: formatRelativeActivity(body.updated_at),
          },
          {
            label: 'Last signal',
            value: body.provenance.last_signal_id ? (
              <span className="font-mono text-xs">
                {body.provenance.last_signal_id}
              </span>
            ) : (
              '—'
            ),
          },
          ...canonicalFields.slice(0, 12),
        ]}
      />

      <JsonViewer
        title="Raw state payload (L3)"
        data={body.state}
        defaultOpen={false}
      />
    </div>
  );
}
