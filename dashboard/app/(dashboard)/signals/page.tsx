import Link from 'next/link';
import { Upload } from 'lucide-react';

import { Suspense } from 'react';

import { IngestionLog } from '@/app/(dashboard)/signals/_components/ingestion-log';
import { PageHeader } from '@/components/layout/page-header';
import { RefreshDataButton } from '@/components/shared/refresh-data-button';
import { LoadingState } from '@/components/states/loading-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getServerOrgId } from '@/lib/org-id';

export default function SignalsPage() {
  const orgId = getServerOrgId();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Signals"
        description="Is ingestion healthy? Review acceptance outcomes and expand rejected rows for validation details."
      >
        <RefreshDataButton successMessage="Ingestion log refreshed" />
        <Button nativeButton={false} render={<Link href="/signals/upload" />} size="sm">
          <Upload className="size-4" aria-hidden="true" />
          Upload signals
        </Button>
      </PageHeader>

      {!orgId ? (
        <Alert>
          <AlertTitle>Organization not configured</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono text-xs">CONTROL_LAYER_ORG_ID</code> in{' '}
            <code className="font-mono text-xs">.env.local</code> to load the
            ingestion log.
          </AlertDescription>
        </Alert>
      ) : (
        <Suspense fallback={<LoadingState variant="table" count={10} />}>
          <IngestionLog orgId={orgId} />
        </Suspense>
      )}
    </div>
  );
}
