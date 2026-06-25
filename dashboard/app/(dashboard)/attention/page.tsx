import { Suspense } from 'react';

import { AttentionQueue } from '@/app/(dashboard)/attention/_components/attention-queue';
import { LoadingState } from '@/components/states/loading-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getServerOrgId } from '@/lib/org-id';

export default function AttentionPage() {
  const orgId = getServerOrgId();

  return (
    <>
      {!orgId ? (
        <div className="flex flex-col gap-6">
          <Alert>
            <AlertTitle>Organization not configured</AlertTitle>
            <AlertDescription>
              Set <code className="font-mono text-xs">CONTROL_LAYER_ORG_ID</code> in{' '}
              <code className="font-mono text-xs">.env.local</code> to load the attention
              queue.
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <Suspense fallback={<LoadingState variant="list" count={4} />}>
          <AttentionQueue orgId={orgId} />
        </Suspense>
      )}
    </>
  );
}
