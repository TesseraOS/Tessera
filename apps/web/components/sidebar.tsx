'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Hexagon } from 'lucide-react';
import { navItems } from '@/lib/nav';
import { cn } from '@/lib/utils';

/** Sidebar contents — reused by the desktop rail and the mobile drawer (Sheet). */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="from-primary to-primary/70 text-primary-foreground grid size-8 place-items-center rounded-lg bg-gradient-to-br shadow-sm">
          <Hexagon className="size-4" aria-hidden="true" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Tessera</span>
      </div>

      <div className="flex-1 px-3">
        <p className="text-muted-foreground px-3 pt-3 pb-1.5 text-[11px] font-medium tracking-wider uppercase">
          Platform
        </p>
        <nav className="space-y-0.5" aria-label="Primary">
          {navItems.map(({ title, href, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => onNavigate?.()}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                )}
              >
                <Icon
                  className={cn(
                    'size-4 shrink-0 transition-colors',
                    active
                      ? 'text-sidebar-primary'
                      : 'text-muted-foreground group-hover:text-sidebar-accent-foreground',
                  )}
                  aria-hidden="true"
                />
                {title}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-3">
        <div className="bg-card/50 rounded-lg border px-3 py-2.5">
          <p className="text-xs font-medium">Local profile</p>
          <p className="text-muted-foreground text-xs">Running with no external services</p>
        </div>
      </div>
    </div>
  );
}
