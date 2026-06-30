import { BookText, Boxes, LayoutDashboard, Network, Search, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

/** Primary navigation — shared by the sidebar and the command palette (single source). */
export const navItems: NavItem[] = [
  { title: 'Overview', href: '/', icon: LayoutDashboard },
  { title: 'Search', href: '/search', icon: Search },
  { title: 'Knowledge graph', href: '/graph', icon: Network },
  { title: 'Memory', href: '/memory', icon: BookText },
  { title: 'Sources', href: '/sources', icon: Boxes },
  { title: 'Settings', href: '/settings', icon: Settings },
];
