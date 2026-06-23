'use client';

import { isUpstreamUnavailable } from '@/lib/api/errors';
import { useLearnerList } from '@/hooks/use-learner-list';

type ApiSmokeClientProps = {
  orgId: string;
  serverOrgId: string;
  serverLearnerCount: number | null;
  serverError: string | null;
};

export function ApiSmokeClient({
  orgId,
  serverOrgId,
  serverLearnerCount,
  serverError,
}: ApiSmokeClientProps) {
  const listQuery = useLearnerList(orgId);

  const clientError =
    listQuery.isError && listQuery.error
      ? isUpstreamUnavailable(listQuery.error)
        ? 'Service unavailable (proxy upstream down).'
        : listQuery.error instanceof Error
          ? listQuery.error.message
          : 'Client fetch failed.'
      : null;

  return (
    <section className="border-border bg-card text-card-foreground w-full max-w-lg rounded-lg border p-4 text-sm">
      <h2 className="mb-3 font-medium">API layer smoke (TASK-004)</h2>
      <dl className="grid gap-2">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Org</dt>
          <dd className="font-mono">{orgId || '(multi-org — set CONTROL_LAYER_ORG_ID)'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Server RSC fetch</dt>
          <dd>
            {serverError
              ? serverError
              : serverLearnerCount != null
                ? `${serverLearnerCount} learners (org ${serverOrgId})`
                : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Client proxy fetch</dt>
          <dd>
            {listQuery.isLoading
              ? 'Loading…'
              : clientError
                ? clientError
                : listQuery.data
                  ? `${listQuery.data.learners.length} learners via /api/control/v1/state/list`
                  : orgId
                    ? 'No data'
                    : 'Disabled — org id required'}
          </dd>
        </div>
      </dl>
      <p className="text-muted-foreground mt-3 text-xs">
        Browser requests use same-origin <code className="font-mono">/api/control/*</code> only; no{' '}
        <code className="font-mono">x-api-key</code> header is sent from the client.
      </p>
    </section>
  );
}
