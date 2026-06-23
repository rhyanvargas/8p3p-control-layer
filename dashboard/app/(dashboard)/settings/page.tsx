import { SettingsView } from '@/app/(dashboard)/settings/_components/settings-view';
import { PageHeader } from '@/components/layout/page-header';
import { getServerEnv } from '@/lib/env';
import { getServerOrgId } from '@/lib/org-id';

export default function SettingsPage() {
  const orgId = getServerOrgId();
  const env = getServerEnv();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Organization, environment, and display preferences."
      />

      <SettingsView
        orgId={orgId}
        appName={env.NEXT_PUBLIC_APP_NAME}
        orgPinned={Boolean(env.CONTROL_LAYER_ORG_ID)}
      />
    </div>
  );
}
