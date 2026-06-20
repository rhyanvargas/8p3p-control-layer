import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  GitBranch,
  LayoutDashboard,
  LifeBuoy,
  Radio,
  Settings,
  Users,
} from 'lucide-react';

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
};

export const NAV_MAIN_ITEMS: NavItem[] = [
  { title: 'Overview', href: '/', icon: LayoutDashboard },
  { title: 'Attention', href: '/attention', icon: AlertCircle },
  { title: 'Learners', href: '/learners', icon: Users },
  { title: 'Decisions', href: '/decisions', icon: GitBranch },
  { title: 'Signals', href: '/signals', icon: Radio },
  { title: 'Reports', href: '/reports', icon: BarChart3 },
];

export const NAV_SECONDARY_ITEMS: NavItem[] = [
  { title: 'API Docs', href: '/docs', icon: BookOpen, external: true },
  { title: 'Settings', href: '/settings', icon: Settings },
  { title: 'Help', href: '/settings', icon: LifeBuoy },
];

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Overview',
  '/attention': 'Attention',
  '/learners': 'Learners',
  '/decisions': 'Decisions',
  '/signals': 'Signals',
  '/reports': 'Reports',
  '/settings': 'Settings',
};

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  if (pathname === '/') {
    return [{ label: 'Overview' }];
  }

  const segments = pathname.split('/').filter(Boolean);
  const rootPath = `/${segments[0]}`;
  const rootLabel = ROUTE_LABELS[rootPath];

  if (!rootLabel) {
    return [{ label: 'Dashboard' }];
  }

  if (segments.length === 1) {
    return [{ label: rootLabel }];
  }

  const detailLabel = decodeURIComponent(segments[segments.length - 1] ?? rootLabel);

  return [
    { label: rootLabel, href: rootPath },
    { label: detailLabel },
  ];
}
