'use client';

import { ThemeToggle } from '@/components/shared/theme-toggle';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { usePolicies } from '@/hooks/use-policies';
import { Settings } from 'lucide-react';

type SettingsViewProps = {
  orgId: string;
  appName: string;
  orgPinned: boolean;
};

export function SettingsView({ orgId, appName, orgPinned }: SettingsViewProps) {
  const policiesQuery = usePolicies(orgId);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Environment</CardTitle>
          <CardDescription>Local dashboard configuration (no secrets shown).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Application</dt>
              <dd className="font-medium">{appName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Organization</dt>
              <dd className="font-medium">{orgId || 'Not pinned (multi-org mode)'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Org pin</dt>
              <dd className="font-medium">{orgPinned ? 'CONTROL_LAYER_ORG_ID set' : 'Unset'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">API transport</dt>
              <dd className="font-medium">Same-origin proxy (/api/control)</dd>
            </div>
          </dl>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-muted-foreground text-sm">
                Light by default; preference stored in a cookie.
              </p>
            </div>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active policies</CardTitle>
          <CardDescription>
            Read-only policy summaries for this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!orgId ? (
            <EmptyState
              icon={Settings}
              message="Set CONTROL_LAYER_ORG_ID to load active policies."
            />
          ) : policiesQuery.isLoading ? (
            <LoadingState variant="list" count={2} />
          ) : policiesQuery.isError ? (
            <ErrorState
              error={policiesQuery.error}
              onRetry={() => void policiesQuery.refetch()}
            />
          ) : policiesQuery.data?.policies.length === 0 ? (
            <EmptyState message="No active policies found for this organization." />
          ) : (
            <ul className="flex flex-col gap-3">
              {policiesQuery.data?.policies.map((policy) => (
                <li
                  key={policy.policy_id}
                  className="rounded-lg border border-border p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{policy.policy_key}</p>
                      <p className="text-muted-foreground font-mono text-xs">
                        {policy.policy_id} · v{policy.policy_version}
                      </p>
                    </div>
                    <span className="text-muted-foreground text-sm">
                      {policy.rule_count} rules
                    </span>
                  </div>
                  {policy.description ? (
                    <p className="text-muted-foreground mt-2 text-sm line-clamp-2">
                      {policy.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {policiesQuery.data?.routing ? (
            <>
              <Separator className="my-4" />
              <div>
                <p className="text-sm font-medium">Routing</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Default policy:{' '}
                  <span className="font-mono">
                    {policiesQuery.data.routing.default_policy_key ?? '—'}
                  </span>
                </p>
                {policiesQuery.data.routing.source_system_map ? (
                  <ul className="text-muted-foreground mt-2 space-y-1 font-mono text-xs">
                    {Object.entries(policiesQuery.data.routing.source_system_map).map(
                      ([source, key]) => (
                        <li key={source}>
                          {source} → {key}
                        </li>
                      )
                    )}
                  </ul>
                ) : null}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
