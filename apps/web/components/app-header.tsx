'use client';

import { usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';
import { navItems } from '@/lib/nav';
import { useCommandMenu } from '@/lib/store/command';

export function AppHeader() {
  const pathname = usePathname();
  const setOpen = useCommandMenu((state) => state.setOpen);
  const current =
    navItems.find((item) => (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)))
      ?.title ?? 'Tessera';

  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/65 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur md:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <span className="text-sm font-medium">{current}</span>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          aria-label="Open command palette"
          className="text-muted-foreground gap-2 font-normal"
        >
          <Search className="size-4" />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="bg-muted text-muted-foreground ml-1 hidden rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline">
            ⌘K
          </kbd>
        </Button>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
