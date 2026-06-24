import { Suspense } from 'react';

import { OverviewFreshness } from '@/app/(dashboard)/_components/overview-freshness';
import { OverviewKpiSection } from '@/app/(dashboard)/_components/overview-kpi-section';
import { OverviewRecentDecisionsSection } from '@/app/(dashboard)/_components/overview-recent-decisions-section';
import { OverviewTrendSection } from '@/app/(dashboard)/_components/overview-trend-section';
import { PageHeader } from '@/components/layout/page-header';
import { LoadingState } from '@/components/states/loading-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getServerOrgId } from '@/lib/org-id';

export default function OverviewPage() {
  const orgId = getServerOrgId();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description="Is anything wrong right now? Scan KPIs, trends, and recent decisions."
      >
        {orgId ? (
          <Suspense fallback={null}>
            <OverviewFreshness orgId={orgId} />
          </Suspense>
        ) : null}
      </PageHeader>

      {!orgId ? (
        <Alert>
          <AlertTitle>Organization not configured</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono text-xs">CONTROL_LAYER_ORG_ID</code> in{' '}
            <code className="font-mono text-xs">.env.local</code> to load live overview data.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Suspense fallback={<LoadingState variant="cards" count={4} />}>
            <OverviewKpiSection orgId={orgId} />
          </Suspense>

          <Suspense fallback={<LoadingState variant="chart" />}>
            <OverviewTrendSection orgId={orgId} />
          </Suspense>

          <Suspense fallback={<LoadingState variant="table" count={8} />}>
            <OverviewRecentDecisionsSection orgId={orgId} />
          </Suspense>
        </>
      )}
    </div>
  );
}
