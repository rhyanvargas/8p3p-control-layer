import { Suspense } from 'react';

import { AttentionQueue } from '@/app/(dashboard)/attention/_components/attention-queue';
import { PageHeader } from '@/components/layout/page-header';
import { LoadingState } from '@/components/states/loading-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getServerOrgId } from '@/lib/org-id';

export default function AttentionPage() {
  const orgId = getServerOrgId();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attention"
        description="Who do I act on, and what should I do?"
      />

      {!orgId ? (
        <Alert>
          <AlertTitle>Organization not configured</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono text-xs">CONTROL_LAYER_ORG_ID</code> in{' '}
            <code className="font-mono text-xs">.env.local</code> to load the attention
            queue.
          </AlertDescription>
        </Alert>
      ) : (
        <Suspense fallback={<LoadingState variant="list" count={4} />}>
          <AttentionQueue orgId={orgId} />
        </Suspense>
      )}
    </div>
  );
}
