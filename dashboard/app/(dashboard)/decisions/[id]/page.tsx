import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { DecisionTraceView } from '@/app/(dashboard)/decisions/[id]/_components/decision-trace-view';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { fetchDecisionByIdServer } from '@/lib/api/fetch-decision-by-id.server';
import { getServerOrgId } from '@/lib/org-id';

type DecisionDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DecisionDetailPage({ params }: DecisionDetailPageProps) {
  const { id } = await params;
  const decisionId = decodeURIComponent(id);
  const orgId = getServerOrgId();

  if (!orgId) {
    return (
      <Alert>
        <AlertTitle>Organization not configured</AlertTitle>
        <AlertDescription>
          Set <code className="font-mono text-xs">CONTROL_LAYER_ORG_ID</code> in{' '}
          <code className="font-mono text-xs">.env.local</code> to load decision
          traces.
        </AlertDescription>
      </Alert>
    );
  }

  const decision = await fetchDecisionByIdServer(orgId, decisionId);

  if (!decision) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Decision not found"
          description={`No decision with ID "${decisionId}" was found for this organization.`}
        >
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/decisions" />}
          >
            <ArrowLeft data-icon="inline-start" aria-hidden="true" />
            Back to stream
          </Button>
        </PageHeader>
        <Alert>
          <AlertTitle>Trace unavailable</AlertTitle>
          <AlertDescription>
            The decision may be outside the lookback window or belong to another
            organization. Return to the stream and select a decision from the
            table.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <DecisionTraceView decision={decision} />;
}
