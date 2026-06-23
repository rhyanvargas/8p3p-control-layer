'use client';

import type { ComponentProps } from 'react';
import Link from 'next/link';

import { NavMain } from '@/components/layout/nav-main';
import { NavSecondary } from '@/components/layout/nav-secondary';
import { NavUser } from '@/components/layout/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Layers } from 'lucide-react';

type AppSidebarProps = ComponentProps<typeof Sidebar> & {
  appName: string;
  orgId: string;
  apiDocsUrl: string;
  environmentLabel?: string;
};

export function AppSidebar({
  appName,
  orgId,
  apiDocsUrl,
  environmentLabel,
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href="/" />}
            >
              <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <Layers />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">8P3P</span>
                <span className="text-muted-foreground text-xs">{appName}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain />
        <NavSecondary apiDocsUrl={apiDocsUrl} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          appName={appName}
          orgId={orgId}
          environmentLabel={environmentLabel}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
