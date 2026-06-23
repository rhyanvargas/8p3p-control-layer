'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

import { ThemeToggle } from '@/components/shared/theme-toggle';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useRefreshQueries } from '@/hooks/use-refresh-queries';
import { getBreadcrumbs } from '@/lib/navigation';

type SiteHeaderProps = {
  orgId: string;
  isOrgPinned: boolean;
};

export function SiteHeader({ orgId, isOrgPinned }: SiteHeaderProps) {
  const pathname = usePathname();
  const refresh = useRefreshQueries();
  const breadcrumbs = getBreadcrumbs(pathname);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-4 transition-[width,height] ease-linear group-has-data-[variant=inset]/sidebar-wrapper:h-(--header-height)">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mx-2 h-4 data-vertical:self-auto"
      />
      <Breadcrumb className="hidden min-w-0 sm:block">
        <BreadcrumbList>
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <span key={`${crumb.label}-${index}`} className="contents">
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  {isLast || !crumb.href ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink render={<Link href={crumb.href} />}>
                      {crumb.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </span>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-2">
        {!isOrgPinned ? (
          <Select defaultValue={orgId || 'all'}>
            <SelectTrigger size="sm" className="hidden w-40 md:flex">
              <SelectValue placeholder="Organization" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All organizations</SelectItem>
              {orgId ? <SelectItem value={orgId}>{orgId}</SelectItem> : null}
            </SelectContent>
          </Select>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={refresh}
          aria-label="Refresh data"
        >
          <RefreshCw />
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
