'use client';

import Link from 'next/link';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { NAV_SECONDARY_ITEMS } from '@/lib/navigation';

type NavSecondaryProps = {
  apiDocsUrl: string;
};

export function NavSecondary({ apiDocsUrl }: NavSecondaryProps) {
  return (
    <SidebarGroup className="mt-auto">
      <SidebarGroupContent>
        <SidebarMenu>
          {NAV_SECONDARY_ITEMS.map((item) => {
            const Icon = item.icon;
            const href = item.title === 'API Docs' ? apiDocsUrl : item.href;

            return (
              <SidebarMenuItem key={item.title}>
                {item.external ? (
                  <SidebarMenuButton
                    tooltip={item.title}
                    render={
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                  >
                    <Icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                ) : (
                  <SidebarMenuButton
                    tooltip={item.title}
                    render={<Link href={href} />}
                  >
                    <Icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
