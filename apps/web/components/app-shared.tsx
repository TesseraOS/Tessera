import type { ReactNode } from 'react';
import {
  Boxes,
  FileSearch,
  LayoutGrid,
  Network,
  NotebookText,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
} from 'lucide-react';

export type SidebarNavItem = {
  title: string;
  path?: string;
  icon?: ReactNode;
  isActive?: boolean;
  subItems?: SidebarNavItem[];
};

export type SidebarNavGroup = {
  label?: string;
  items: SidebarNavItem[];
};

function makeIsActive(pathname: string) {
  return (path?: string) => {
    if (!path) return false;
    return path === '/' ? pathname === '/' : pathname.startsWith(path);
  };
}

/** Grouped primary navigation (efferd app-shell pattern), with Tessera routes + section labels. */
export function buildNavGroups(pathname: string): SidebarNavGroup[] {
  const isActive = makeIsActive(pathname);
  return [
    { items: [{ title: 'Overview', path: '/', icon: <LayoutGrid />, isActive: isActive('/') }] },
    {
      label: 'Explore',
      items: [
        { title: 'Search', path: '/search', icon: <Search />, isActive: isActive('/search') },
        {
          title: 'Inspector',
          path: '/inspector',
          icon: <FileSearch />,
          isActive: isActive('/inspector'),
        },
        {
          title: 'Knowledge graph',
          path: '/graph',
          icon: <Network />,
          isActive: isActive('/graph'),
        },
        { title: 'Memory', path: '/memory', icon: <NotebookText />, isActive: isActive('/memory') },
      ],
    },
    {
      label: 'Connect',
      items: [
        { title: 'Sources', path: '/sources', icon: <Boxes />, isActive: isActive('/sources') },
      ],
    },
    {
      label: 'Govern',
      items: [
        { title: 'Audit log', path: '/audit', icon: <ScrollText />, isActive: isActive('/audit') },
        {
          title: 'Governance',
          path: '/governance',
          icon: <ShieldCheck />,
          isActive: isActive('/governance'),
        },
      ],
    },
  ];
}

export function buildFooterNavLinks(pathname: string): SidebarNavItem[] {
  const isActive = makeIsActive(pathname);
  return [
    { title: 'Settings', path: '/settings', icon: <Settings />, isActive: isActive('/settings') },
  ];
}

/** Flat list (groups + footer) — consumed by the header breadcrumb and the ⌘K palette. */
export function buildFlatNavLinks(pathname: string): SidebarNavItem[] {
  const groups = buildNavGroups(pathname);
  const footer = buildFooterNavLinks(pathname);
  return [
    ...groups.flatMap((group) =>
      group.items.flatMap((item) => (item.subItems?.length ? [item, ...item.subItems] : [item])),
    ),
    ...footer,
  ];
}
