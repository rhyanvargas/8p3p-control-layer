import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { DecisionsStream } from '@/app/(dashboard)/decisions/_components/decisions-stream';
import { PageHeader } from '@/components/layout/page-header';
import { RefreshDataButton } from '@/components/shared/refresh-data-button';
import { LoadingState } from '@/components/states/loading-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getServerOrgId } from '@/lib/org-id';

type DecisionsPageProps = {
  searchParams: Promise<{ status?: string }>;
};

export default async function DecisionsPage({ searchParams }: DecisionsPageProps) {
  const { status } = await searchParams;
  if (status === 'pending') {
    redirect('/attention?from=pending');
  }

  const orgId = getServerOrgId();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Decisions"
        description="What decisions were emitted? Filter the audit stream and open a trace for full provenance."
      >
        <RefreshDataButton successMessage="Decision stream refreshed" />
      </PageHeader>

      {!orgId ? (
        <Alert>
          <AlertTitle>Organization not configured</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono text-xs">CONTROL_LAYER_ORG_ID</code> in{' '}
            <code className="font-mono text-xs">.env.local</code> to load the
            decision stream.
          </AlertDescription>
        </Alert>
      ) : (
        <Suspense fallback={<LoadingState variant="table" count={10} />}>
          <DecisionsStream orgId={orgId} />
        </Suspense>
      )}
    </div>
  );
}
