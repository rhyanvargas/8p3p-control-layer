'use client';

import type { CSSProperties, ReactNode } from 'react';

import { AppSidebar } from '@/components/layout/app-sidebar';
import { SiteHeader } from '@/components/layout/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

export type DashboardShellProps = {
  children: ReactNode;
  defaultSidebarOpen?: boolean;
  orgId: string;
  appName: string;
  apiDocsUrl: string;
  environmentLabel?: string;
};

export function DashboardShell({
  children,
  defaultSidebarOpen = true,
  orgId,
  appName,
  apiDocsUrl,
  environmentLabel,
}: DashboardShellProps) {
  return (
    <TooltipProvider>
    <SidebarProvider
      defaultOpen={defaultSidebarOpen}
      style={
        {
          '--sidebar-width': '16rem',
          '--header-height': '3rem',
        } as CSSProperties
      }
    >
      <AppSidebar
        variant="inset"
        appName={appName}
        orgId={orgId}
        apiDocsUrl={apiDocsUrl}
        environmentLabel={environmentLabel}
      />
      <SidebarInset>
        <SiteHeader />
        <div className="mx-auto flex w-full max-w-(--content-max-width) flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
    </TooltipProvider>
  );
}
