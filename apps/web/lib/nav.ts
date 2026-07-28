import {
  Activity,
  Boxes,
  ChartNoAxesCombined,
  CreditCard,
  FileSearch,
  LayoutGrid,
  Network,
  NotebookText,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { t } from '@/lib/i18n';
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
  { items: [{ title: t('nav.overview'), href: '/', icon: LayoutGrid }] },
  {
    label: 'Explore',
    items: [
      { title: t('nav.search'), href: '/search', icon: Search },
      { title: t('nav.inspector'), href: '/inspector', icon: FileSearch },
      { title: t('nav.graph'), href: '/graph', icon: Network },
      { title: t('nav.memory'), href: '/memory', icon: NotebookText },
      { title: t('nav.timeline'), href: '/timeline', icon: Activity },
    ],
  },
  {
    label: 'Connect',
    items: [{ title: t('nav.sources'), href: '/sources', icon: Boxes }],
  },
  {
    label: 'Measure',
    items: [{ title: t('nav.analytics'), href: '/analytics', icon: ChartNoAxesCombined }],
  },
  {
    label: 'Govern',
    items: [
      { title: t('nav.audit'), href: '/audit', icon: ScrollText },
      { title: t('nav.governance'), href: '/governance', icon: ShieldCheck },
    ],
  },
];

export const footerNav: NavItem[] = [
  { title: t('nav.billing'), href: '/billing', icon: CreditCard },
  { title: t('nav.settings'), href: '/settings', icon: Settings },
];

/** Flat list (sidebar groups + footer) — consumed by the ⌘K command palette and breadcrumb. */
export const navItems: NavItem[] = [...navGroups.flatMap((g) => g.items), ...footerNav];
