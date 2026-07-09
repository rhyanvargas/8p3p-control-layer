'use client';

import type { CSSProperties, ReactNode } from 'react';

import { CsatPrompt } from '@/components/feedback/csat-prompt';
import { SendFeedbackSheet } from '@/components/feedback/send-feedback-sheet';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SiteHeader } from '@/components/layout/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

import { DashboardPersonaProvider } from '@/lib/persona-context';
import type { DashboardPersona } from '@/lib/persona';

export type DashboardShellProps = {
  children: ReactNode;
  defaultSidebarOpen?: boolean;
  orgId: string;
  appName: string;
  apiDocsUrl: string;
  environmentLabel?: string;
  persona: DashboardPersona;
};

export function DashboardShell({
  children,
  defaultSidebarOpen = true,
  orgId,
  appName,
  apiDocsUrl,
  environmentLabel,
  persona,
}: DashboardShellProps) {
  return (
    <DashboardPersonaProvider persona={persona}>
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
        persona={persona}
      />
      <SidebarInset>
        <SiteHeader />
        <div className="mx-auto flex w-full min-w-0 max-w-(--content-max-width) flex-1 flex-col">
          <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
            {children}
          </div>
          <footer className="border-border flex items-center justify-end border-t px-4 py-2 md:px-6">
            <SendFeedbackSheet />
          </footer>
          <CsatPrompt />
        </div>
      </SidebarInset>
    </SidebarProvider>
    </TooltipProvider>
    </DashboardPersonaProvider>
  );
}
