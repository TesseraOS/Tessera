import {
  Boxes,
  FileSearch,
  LayoutGrid,
  Network,
  NotebookText,
  Search,
  Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/** Grouped primary navigation (efferd app-shell pattern), with section labels. */
export const navGroups: NavGroup[] = [
  { items: [{ title: 'Overview', href: '/', icon: LayoutGrid }] },
  {
    label: 'Explore',
    items: [
      { title: 'Search', href: '/search', icon: Search },
      { title: 'Inspector', href: '/inspector', icon: FileSearch },
      { title: 'Knowledge graph', href: '/graph', icon: Network },
      { title: 'Memory', href: '/memory', icon: NotebookText },
    ],
  },
  {
    label: 'Connect',
    items: [{ title: 'Sources', href: '/sources', icon: Boxes }],
  },
];

export const footerNav: NavItem[] = [{ title: 'Settings', href: '/settings', icon: Settings }];

/** Flat list (sidebar groups + footer) — consumed by the ⌘K command palette and breadcrumb. */
export const navItems: NavItem[] = [...navGroups.flatMap((g) => g.items), ...footerNav];
