import { Suspense } from 'react';

import { OverviewSurfaces } from '@/app/(dashboard)/_components/overview-surfaces';
import { PageHeader } from '@/components/layout/page-header';
import { LoadingState } from '@/components/states/loading-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getServerOrgId } from '@/lib/org-id';

export default function OverviewPage() {
  const orgId = getServerOrgId();

  return (
    <div className="flex flex-col gap-6">
      {!orgId ? (
        <>
          <PageHeader
            title="Overview"
            description="Is anything wrong right now? Scan KPIs, trends, and recent decisions."
          />
          <Alert>
            <AlertTitle>Organization not configured</AlertTitle>
            <AlertDescription>
              Set <code className="font-mono text-xs">CONTROL_LAYER_ORG_ID</code> in{' '}
              <code className="font-mono text-xs">.env.local</code> to load live overview data.
            </AlertDescription>
          </Alert>
        </>
      ) : (
        <Suspense
          fallback={
            <>
              <LoadingState variant="cards" count={4} />
              <LoadingState variant="chart" />
              <LoadingState variant="table" count={8} />
            </>
          }
        >
          <OverviewSurfaces orgId={orgId} />
        </Suspense>
      )}
    </div>
  );
}
