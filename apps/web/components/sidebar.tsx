'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boxes } from 'lucide-react';
import { navItems } from '@/lib/nav';
import { cn } from '@/lib/utils';

/** Sidebar contents — reused by the desktop rail and the mobile drawer (Sheet). */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 px-4 text-sm font-semibold">
        <span className="bg-sidebar-primary text-sidebar-primary-foreground flex size-7 items-center justify-center rounded-md">
          <Boxes className="size-4" aria-hidden="true" />
        </span>
        Tessera
      </div>
      <nav className="flex-1 space-y-1 px-2 py-2" aria-label="Primary">
        {navItems.map(({ title, href, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => onNavigate?.()}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {title}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
