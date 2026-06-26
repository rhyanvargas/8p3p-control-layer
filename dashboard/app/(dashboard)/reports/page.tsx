import { Suspense } from 'react';

import { ReportsView } from '@/app/(dashboard)/reports/_components/reports-view';
import { PageHeader } from '@/components/layout/page-header';
import { RefreshDataButton } from '@/components/shared/refresh-data-button';
import { LoadingState } from '@/components/states/loading-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getServerOrgId } from '@/lib/org-id';

export default function ReportsPage() {
  const orgId = getServerOrgId();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        description="What are program-level outcomes?"
      >
        <RefreshDataButton successMessage="Reports refreshed" />
      </PageHeader>

      {!orgId ? (
        <Alert>
          <AlertTitle>Organization not configured</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono text-xs">CONTROL_LAYER_ORG_ID</code> in{' '}
            <code className="font-mono text-xs">.env.local</code> to load program metrics.
          </AlertDescription>
        </Alert>
      ) : (
        <Suspense fallback={<LoadingState variant="cards" count={6} />}>
          <ReportsView orgId={orgId} />
        </Suspense>
      )}
    </div>
  );
}
