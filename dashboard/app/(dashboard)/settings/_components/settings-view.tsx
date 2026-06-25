'use client';

import { ThemeToggle } from '@/components/shared/theme-toggle';
import { EmptyState } from '@/components/states/empty-state';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Settings } from 'lucide-react';

import { PoliciesTable } from '@/app/(dashboard)/settings/_components/policies-table';

type SettingsViewProps = {
  orgId: string;
  appName: string;
  orgPinned: boolean;
};

export function SettingsView({ orgId, appName, orgPinned }: SettingsViewProps) {
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
            Read-only policy definitions — click a row to inspect rules for that access
            role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!orgId ? (
            <EmptyState
              icon={Settings}
              message="Set CONTROL_LAYER_ORG_ID to load active policies."
            />
          ) : (
            <PoliciesTable orgId={orgId} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
