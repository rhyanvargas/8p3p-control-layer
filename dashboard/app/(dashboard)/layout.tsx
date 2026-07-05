import { DashboardShell } from '@/components/layout/dashboard-shell';
import { getServerEnv } from '@/lib/env';
import { getServerOrgId } from '@/lib/org-id';
import { getDashboardPersona } from '@/lib/session.server';
import { getSidebarDefaultOpen } from '@/lib/sidebar.server';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [defaultSidebarOpen, orgId, persona] = await Promise.all([
    getSidebarDefaultOpen(),
    Promise.resolve(getServerOrgId()),
    getDashboardPersona(),
  ]);

  const env = getServerEnv();
  const apiDocsUrl = new URL('/docs', env.CONTROL_LAYER_API_BASE_URL).href;
  const environmentLabel =
    process.env.NODE_ENV === 'production' ? 'Production' : 'Local';

  return (
    <DashboardShell
      defaultSidebarOpen={defaultSidebarOpen}
      orgId={orgId}
      appName={env.NEXT_PUBLIC_APP_NAME}
      apiDocsUrl={apiDocsUrl}
      environmentLabel={environmentLabel}
      persona={persona}
    >
      {children}
    </DashboardShell>
  );
}
