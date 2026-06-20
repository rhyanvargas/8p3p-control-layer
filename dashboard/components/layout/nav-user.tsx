'use client';

import { LogOut } from 'lucide-react';

import { ThemeToggle } from '@/components/shared/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

type NavUserProps = {
  appName: string;
  orgId: string;
  environmentLabel?: string;
};

export function NavUser({ appName, orgId, environmentLabel = 'Local' }: NavUserProps) {
  const orgLabel = orgId || 'All organizations';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div
          className={cn(
            'flex w-full flex-col gap-3 rounded-md p-2',
            'group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-2',
          )}
        >
          <div className="flex min-w-0 flex-col gap-1 group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{appName}</span>
              <Badge variant="secondary" className="shrink-0 text-xs">
                {environmentLabel}
              </Badge>
            </div>
            <span className="text-muted-foreground truncate font-mono text-xs">
              {orgLabel}
            </span>
          </div>
          <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
            <ThemeToggle />
            <form action="/logout" method="POST">
              <Button
                type="submit"
                variant="ghost"
                size="icon-sm"
                aria-label="Log out"
              >
                <LogOut />
              </Button>
            </form>
          </div>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
