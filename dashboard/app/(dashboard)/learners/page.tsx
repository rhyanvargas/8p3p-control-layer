import { Suspense } from 'react';

import { LearnersRoster } from '@/app/(dashboard)/learners/_components/learners-roster';
import { PageHeader } from '@/components/layout/page-header';
import { RefreshDataButton } from '@/components/shared/refresh-data-button';
import { LoadingState } from '@/components/states/loading-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getServerOrgId } from '@/lib/org-id';

export default function LearnersPage() {
  const orgId = getServerOrgId();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Learners"
        description="Who is in the program and how are they trending?"
      >
        <RefreshDataButton successMessage="Learner roster refreshed" />
      </PageHeader>

      {!orgId ? (
        <Alert>
          <AlertTitle>Organization not configured</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono text-xs">CONTROL_LAYER_ORG_ID</code> in{' '}
            <code className="font-mono text-xs">.env.local</code> to load the learner
            roster.
          </AlertDescription>
        </Alert>
      ) : (
        <Suspense fallback={<LoadingState variant="table" count={8} />}>
          <LearnersRoster orgId={orgId} />
        </Suspense>
      )}
    </div>
  );
}
